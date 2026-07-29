import * as THREE from 'three';
import { Experiment } from '../Experiment.js';
import {
  createInitialState,
  stepProjectile,
  launchVelocityFromAngle,
  analyticRange,
  analyticTrajectory,
  percentDifference,
  createLandingDetector,
  updateLandingDetector,
} from '../physics/projectilePhysics.js';

// Number of samples along the dotted, drag-free analytic curve. Purely
// visual - independent of the simulation's own fixed timestep.
const TRAJECTORY_SAMPLE_COUNT = 60;

/**
 * A projectile launched at an angle in a 2D vertical plane, under gravity
 * plus optional quadratic ("air resistance") drag. Uses the real equation of
 * motion (CLAUDE.md rule 7, including drag when enabled) integrated with
 * semi-implicit Euler (CLAUDE.md rule 6) - see projectilePhysics.js.
 *
 * Draws a dotted curve of the IDEALIZED (always drag-free) analytic parabola
 * for comparison, alongside the actual simulated flight (which uses drag if
 * dragCoefficient > 0) - these are deliberately different things, not a bug;
 * see projectilePhysics.js's analyticRange doc comment.
 *
 * Launch origin world position is fixed at (-8, 10, 0) - chosen to sit
 * within main.js's existing (unmodified) camera framing (camera at
 * (0,10,30) looking at (0,10,0), fov 50, aspect 960/540). At the z=0 plane
 * (distance 30 from the camera) that framing shows roughly x in
 * [-24.9, 24.9] and world y in [-4.0, 24.0]. With the schema's default
 * parameters (speed=15, angle=45deg, gravity=9.8) the drag-free range is
 * ~22.96m and peak height ~5.74m, landing around world x ~= 14.96 and
 * peaking around world y ~= 15.74 - comfortably inside that window without
 * needing camera changes (out of scope for this task). Extreme slider
 * combinations can still fly off-screen; that's an accepted, best-effort
 * limitation, same caveat Pendulum's pivot placement used.
 *
 * Also logs a predicted-vs-actual range comparison to the console the moment
 * the projectile lands (CLAUDE.md rule 3 - no per-experiment UI, confirmed
 * console-only, same precedent as Pendulum).
 */
export class Projectile extends Experiment {
  static get parameterSchema() {
    return [
      // Degrees (natural for a user-facing "launch angle" slider, unlike
      // Pendulum's initialAngle which is a live ODE state variable kept in
      // radians). 5-85 avoids the degenerate 0/90 edges (both are
      // mathematically fine, but 45 deg - the range-maximizing angle - makes
      // a nicer default demo for the predicted-vs-actual comparison).
      { key: 'launchAngle', label: 'Launch Angle (°)', min: 5, max: 85, step: 1, default: 45 },
      { key: 'initialSpeed', label: 'Initial Speed (m/s)', min: 5, max: 30, step: 0.5, default: 15 },
      { key: 'gravity', label: 'Gravity (m/s²)', min: 1, max: 20, step: 0.5, default: 9.8 },
      // Default 0 so the very first launch cleanly matches the (always
      // drag-free) analytic prediction - a nice sanity-check demo default,
      // same reasoning Pendulum used for its damping default.
      { key: 'dragCoefficient', label: 'Drag Coefficient (1/m)', min: 0, max: 0.5, step: 0.01, default: 0 },
    ];
  }

  setup(scene, params) {
    this._scene = scene;
    this._launchOrigin = new THREE.Vector3(-8, 10, 0); // fixed - never repositioned in reset()

    this._ballGeometry = new THREE.SphereGeometry(0.4, 32, 16);
    this._ballMaterial = new THREE.MeshStandardMaterial({ color: 0x28a745 });
    this._ballMesh = new THREE.Mesh(this._ballGeometry, this._ballMaterial);
    scene.add(this._ballMesh);

    this._landingMarkerGeometry = new THREE.SphereGeometry(0.3, 24, 12);
    this._landingMarkerMaterial = new THREE.MeshStandardMaterial({ color: 0xffc107 });
    this._landingMarkerMesh = new THREE.Mesh(this._landingMarkerGeometry, this._landingMarkerMaterial);
    this._landingMarkerMesh.visible = false; // hidden until landing is detected
    scene.add(this._landingMarkerMesh);

    // Dotted drag-free prediction curve. Material is built once and reused;
    // its geometry is rebuilt per setup()/reset() in _rebuildTrajectoryLine()
    // since (unlike the ball/marker) its vertex data depends on
    // speed/angle/gravity. IMPORTANT three.js gotcha: LineDashedMaterial
    // renders SOLID (no dashes) unless geometry.computeLineDistances() is
    // called after the geometry's positions are set - _rebuildTrajectoryLine()
    // below calls it every time; do not drop that call.
    this._trajectoryMaterial = new THREE.LineDashedMaterial({ color: 0x888888, dashSize: 0.4, gapSize: 0.25 });
    this._trajectoryLine = new THREE.Line(new THREE.BufferGeometry(), this._trajectoryMaterial);
    scene.add(this._trajectoryLine);

    // Meshes exist now, so the shared helper (which also positions them) is safe to call.
    this._initState(params);
  }

  update(dt) {
    if (this._landed) {
      // Frozen at the landing point - stop simulating and stop recording
      // measurements (see _initState/landing-handling below for why).
      return;
    }

    // gravity/dragCoefficient are read fresh from this.params rather than
    // stored in physics state - safe because any slider change goes through
    // reset() first (see UIPanel._buildControl), same convention as
    // Pendulum/FallingBall.
    this._state = stepProjectile(this._state, this.params.gravity, this.params.dragCoefficient, dt);

    const previousLandingX = this._landingDetector.landingX;
    this._landingDetector = updateLandingDetector(this._landingDetector, this._state.x, this._state.y, this._state.t);
    const justLanded = this._landingDetector.landingX !== null && this._landingDetector.landingX !== previousLandingX;

    if (justLanded) {
      this._landed = true;
      const landingX = this._landingDetector.landingX;
      const landingT = this._landingDetector.landingT;

      // Snap to the exact interpolated landing point (y=0 locally) instead
      // of the last discrete (slightly below-ground) simulated sample.
      this._ballMesh.position.set(
        this._launchOrigin.x + landingX,
        this._launchOrigin.y,
        this._launchOrigin.z
      );
      this._landingMarkerMesh.position.copy(this._ballMesh.position);
      this._landingMarkerMesh.visible = true;

      // Final measurement point at the exact landing instant/height, then
      // stop growing the history - the graph should show the flight up to
      // landing and then stop, which is the physically meaningful picture.
      this._history.push({ t: landingT, value: 0 });

      // --- Predicted vs actual range: console-only (CLAUDE.md rule 3, confirmed) ---
      const predictedRange = analyticRange(this.params.initialSpeed, this.params.launchAngle, this.params.gravity);
      const actualRange = landingX; // local x0 = 0 at launch, so landingX IS the horizontal distance traveled
      const diffPct = percentDifference(actualRange, predictedRange);
      // Expected to read negative when dragCoefficient > 0 (drag shortens the
      // actual range below the always-drag-free prediction - real physics,
      // not a bug; see analyticRange()'s doc comment in projectilePhysics.js).
      console.log(
        `[Projectile] predicted range (drag-free): ${predictedRange.toFixed(3)}m | ` +
        `actual range: ${actualRange.toFixed(3)}m | diff: ${diffPct.toFixed(2)}%`
      );
      return;
    }

    // Still in flight - physics -> rendering, one-directional (CLAUDE.md rule 2).
    this._ballMesh.position.set(
      this._launchOrigin.x + this._state.x,
      this._launchOrigin.y + this._state.y,
      this._launchOrigin.z
    );

    // Full cumulative history (up to landing) - never truncated mid-flight.
    this._history.push({ t: this._state.t, value: this._state.y });
  }

  getMeasurements() {
    // Local height above launch height vs time - the direct analog of
    // FallingBall's height-vs-time and Pendulum's angle-vs-time: a single,
    // visually obvious quantity (should trace a clean parabola-ish rise/fall)
    // that also makes drag's effect (steeper, shorter-lived arc) visible.
    return { label: 'Height (m)', points: this._history };
  }

  reset(params) {
    // Meshes/geometries/materials already exist from setup() - reset() only
    // re-initializes physics state, the analytic curve, and mesh positions,
    // never rebuilds the ball/marker geometry or either material.
    this._initState(params);
  }

  dispose() {
    this._scene.remove(this._ballMesh, this._landingMarkerMesh, this._trajectoryLine);
    this._ballGeometry.dispose();
    this._ballMaterial.dispose();
    this._landingMarkerGeometry.dispose();
    this._landingMarkerMaterial.dispose();
    this._trajectoryLine.geometry.dispose();
    this._trajectoryMaterial.dispose();
  }

  /**
   * Shared by setup() and reset(): re-derive physics state and the landing
   * detector from params, rebuild the (parameter-dependent) analytic
   * trajectory curve, reposition/hide the already-existing meshes, and clear
   * the measurement history. Kept as one small private method so setup()
   * and reset() can never drift apart on how a "fresh run" is initialized.
   *
   * @param {Object} params
   * @param {number} params.launchAngle
   * @param {number} params.initialSpeed
   * @param {number} params.gravity
   * @param {number} params.dragCoefficient
   */
  _initState(params) {
    this.params = params;

    const { vx, vy } = launchVelocityFromAngle(params.initialSpeed, params.launchAngle);
    this._state = createInitialState(vx, vy);
    this._landingDetector = createLandingDetector();
    this._landed = false;
    this._history = [];

    this._ballMesh.position.copy(this._launchOrigin);
    this._landingMarkerMesh.visible = false;

    this._rebuildTrajectoryLine(params);
  }

  /**
   * Rebuild the dotted analytic (drag-free) curve's geometry from the
   * current speed/angle/gravity. This curve never depends on runtime
   * physics state, so it is only ever rebuilt here (setup()/reset(), via
   * _initState) and never touched inside update().
   *
   * @param {Object} params
   * @param {number} params.launchAngle
   * @param {number} params.initialSpeed
   * @param {number} params.gravity
   */
  _rebuildTrajectoryLine(params) {
    const samples = analyticTrajectory(params.initialSpeed, params.launchAngle, params.gravity, TRAJECTORY_SAMPLE_COUNT);

    const positions = new Float32Array(samples.length * 3);
    samples.forEach((p, i) => {
      positions[i * 3] = this._launchOrigin.x + p.x;
      positions[i * 3 + 1] = this._launchOrigin.y + p.y;
      positions[i * 3 + 2] = this._launchOrigin.z;
    });

    this._trajectoryLine.geometry.dispose();
    this._trajectoryLine.geometry = new THREE.BufferGeometry();
    this._trajectoryLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // REQUIRED for LineDashedMaterial to actually render dashes instead of a
    // solid line - easy to forget, called explicitly every rebuild.
    this._trajectoryLine.computeLineDistances();
  }
}
