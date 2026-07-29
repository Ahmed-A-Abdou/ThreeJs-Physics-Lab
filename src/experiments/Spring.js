import * as THREE from 'three';
import { Experiment } from '../Experiment.js';
import {
  createInitialState,
  stepSpring,
  createCrossingTracker,
  updateCrossingTracker,
  theoreticalFrequency,
  percentDifference,
} from '../physics/springPhysics.js';

// Visual-only constants - never read by springPhysics.js (CLAUDE.md rule 1/2:
// physics stays in meters of displacement, unaware of world-space geometry).
const REST_LENGTH = 3; // world-space anchor-to-mass distance when x = 0 (meters)
const COIL_COUNT = 10; // number of zigzag segments in the spring's "coil" line
const ZIGZAG_AMPLITUDE = 0.3; // perpendicular offset of each interior zigzag vertex, in meters

/**
 * A spring-mass (damped harmonic) oscillator: fixed anchor, an ideal
 * (massless) linear spring obeying Hooke's law, and a point mass hanging
 * below it, with optional linear damping. Uses semi-implicit Euler
 * (CLAUDE.md rule 6) - see springPhysics.js.
 *
 * Anchor world position is fixed at (8, 12, 0) - chosen to sit within
 * main.js's existing (unmodified) camera framing (camera at (0,10,30)
 * looking at (0,10,0), fov 50, aspect 960/540; visible window at z=0 is
 * roughly x in [-24.9,24.9], world y in [-4.0,24.0]). x=8 keeps this
 * experiment's meshes distinct from Pendulum's pivot (x=0) and Projectile's
 * launch origin (x=-8). With the schema's displacement range (-2..2m) and
 * REST_LENGTH=3, the mass's world Y stays in [7,13] - comfortably inside
 * that window without needing camera changes (out of scope for this task).
 *
 * The one new visual piece: a zigzag "coil" line (THREE.Line over a
 * BufferGeometry) connecting anchor to mass, rebuilt every update() call
 * since the spring's length changes continuously as the mass oscillates -
 * unlike Projectile's dotted analytic curve, which only depends on fixed
 * launch parameters and is rebuilt once per setup()/reset(). A full 3D
 * procedural coil (TubeGeometry over a CatmullRomCurve3) would be a
 * reasonable enhancement but is disproportionate 3D-modeling effort for
 * what's fundamentally a physics-correctness assessment.
 *
 * Also logs a measured-vs-theoretical frequency comparison to the console
 * each time a full oscillation period completes (CLAUDE.md rule 3 - no
 * per-experiment UI, confirmed console-only, same precedent as
 * Pendulum/Projectile).
 */
export class Spring extends Experiment {
  static get parameterSchema() {
    return [
      { key: 'springConstant', label: 'Spring Constant k (N/m)', min: 1, max: 50, step: 1, default: 10 },
      { key: 'mass', label: 'Mass (kg)', min: 0.5, max: 5, step: 0.1, default: 1 },
      // Default 0 so the very first oscillation cleanly matches theory - a
      // nice sanity-check demo default, same reasoning Pendulum used.
      { key: 'damping', label: 'Damping (kg/s)', min: 0, max: 3, step: 0.1, default: 0 },
      // Nonzero default so motion is visible immediately without requiring
      // the user to touch a slider first. Range (-2..2) against
      // REST_LENGTH=3 keeps the anchor-to-mass distance in [1,5] - always
      // strictly positive, never degenerate (see _applyPose below).
      { key: 'initialDisplacement', label: 'Initial Displacement (m)', min: -2, max: 2, step: 0.1, default: 1 },
    ];
  }

  setup(scene, params) {
    this._scene = scene;
    this._anchorPosition = new THREE.Vector3(8, 12, 0); // fixed - never repositioned in reset()

    this._anchorGeometry = new THREE.SphereGeometry(0.15, 16, 12);
    this._anchorMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    this._anchorMesh = new THREE.Mesh(this._anchorGeometry, this._anchorMaterial);
    this._anchorMesh.position.copy(this._anchorPosition);
    scene.add(this._anchorMesh);

    this._massGeometry = new THREE.SphereGeometry(0.35, 32, 16);
    this._massMaterial = new THREE.MeshStandardMaterial({ color: 0xdc3545 });
    this._massMesh = new THREE.Mesh(this._massGeometry, this._massMaterial);
    scene.add(this._massMesh);

    // Zigzag coil line. Vertex COUNT never changes at runtime (always
    // 2*COIL_COUNT+1), so the Float32Array/BufferAttribute are allocated
    // once here and their contents overwritten in place every frame by
    // _updateSpringLine() - cheaper than replacing the BufferGeometry each
    // frame, and necessary (unlike Projectile's curve) because this line's
    // shape changes every single update().
    this._springPositions = new Float32Array((2 * COIL_COUNT + 1) * 3);
    this._springGeometry = new THREE.BufferGeometry();
    this._springGeometry.setAttribute('position', new THREE.BufferAttribute(this._springPositions, 3));
    this._springMaterial = new THREE.LineBasicMaterial({ color: 0x888888 });
    this._springLine = new THREE.Line(this._springGeometry, this._springMaterial);
    scene.add(this._springLine);

    // Scratch vectors reused every frame instead of allocated fresh each call.
    this._massWorldPosition = new THREE.Vector3();
    this._springDirection = new THREE.Vector3();
    // The spring's axis is always vertical for this experiment's entire
    // lifetime (anchor and mass always share x/z - only the mass's world Y
    // changes with displacement, see _applyPose below), so a single
    // hardcoded perpendicular axis (world +X) is sufficient for a visually
    // correct zigzag, and simpler than a general cross-product-derived
    // perpendicular that would only be needed if the spring's axis could tilt.
    this._zigzagPerpendicular = new THREE.Vector3(1, 0, 0);

    // Meshes exist now, so the shared helper (which also positions them) is safe to call.
    this._initState(params);
  }

  update(dt) {
    // springConstant/mass/damping are read fresh from this.params rather
    // than stored in physics state - safe because any slider change goes
    // through reset() first (see UIPanel._buildControl), same convention as
    // Pendulum/Projectile.
    this._state = stepSpring(
      this._state,
      this.params.springConstant,
      this.params.mass,
      this.params.damping,
      dt
    );

    // Physics -> rendering, one-directional (CLAUDE.md rule 2).
    this._applyPose(this._state.x);

    // Full cumulative history - never truncated. Graph.js re-reads this
    // array fresh every frame and redraws the whole series each time. This
    // oscillator runs indefinitely (no terminal "landing" event like
    // Projectile), so no stop-simulating logic is needed here.
    this._history.push({ t: this._state.t, value: this._state.x });

    // --- Frequency measurement: console-only (CLAUDE.md rule 3, confirmed) ---
    const previousLastPeriod = this._crossingTracker.lastPeriod;
    this._crossingTracker = updateCrossingTracker(this._crossingTracker, this._state.x, this._state.t);

    if (this._crossingTracker.lastPeriod !== null && this._crossingTracker.lastPeriod !== previousLastPeriod) {
      const measuredFrequency = 1 / this._crossingTracker.lastPeriod;
      const theoretical = theoreticalFrequency(this.params.springConstant, this.params.mass);
      const diffPct = percentDifference(measuredFrequency, theoretical);
      // Expected near 0% at damping=0 REGARDLESS of initialDisplacement (a
      // linear spring is isochronous - unlike Pendulum, see
      // theoreticalFrequency()'s doc comment in springPhysics.js). Expected
      // NEGATIVE when damping > 0 (measured frequency reads lower than the
      // undamped natural frequency - real damped-oscillator physics, not a bug).
      console.log(
        `[Spring] measured frequency: ${measuredFrequency.toFixed(4)}Hz | ` +
        `theoretical √(k/m)/2π: ${theoretical.toFixed(4)}Hz | diff: ${diffPct.toFixed(2)}%`
      );
    }
  }

  getMeasurements() {
    return { label: 'Displacement (m)', points: this._history };
  }

  reset(params) {
    // Meshes/geometries/materials already exist from setup() - reset() only
    // re-initializes physics state and mesh pose, never rebuilds them.
    this._initState(params);
  }

  dispose() {
    this._scene.remove(this._anchorMesh, this._massMesh, this._springLine);
    this._anchorGeometry.dispose();
    this._anchorMaterial.dispose();
    this._massGeometry.dispose();
    this._massMaterial.dispose();
    this._springGeometry.dispose();
    this._springMaterial.dispose();
  }

  /**
   * Shared by setup() and reset(): re-derive physics state and the period
   * tracker from params, reposition the (already-existing) meshes, and clear
   * the measurement history. Kept as one small private method so setup() and
   * reset() can never drift apart on how a "fresh run" is initialized.
   *
   * @param {Object} params
   * @param {number} params.springConstant
   * @param {number} params.mass
   * @param {number} params.damping
   * @param {number} params.initialDisplacement
   */
  _initState(params) {
    this.params = params;
    this._state = createInitialState(params.initialDisplacement);
    // Positive initialDisplacement -> the mass first swings back toward and
    // through equilibrium in the descending direction - see springPhysics.js's
    // doc comment on createCrossingTracker for why a single fixed direction
    // is enough to measure whole periods.
    this._crossingTracker = createCrossingTracker('down');
    this._history = [];

    this._applyPose(this._state.x);
  }

  /**
   * Position the mass and rebuild the zigzag spring line for the given
   * displacement. Shared by update() and _initState() so the pose math
   * can't drift between "mid-run" and "just reset" frames.
   *
   * Positive x = spring stretched further (longer) -> mass hangs LOWER;
   * negative x = compressed (shorter) -> mass sits HIGHER, closer to the
   * anchor. REST_LENGTH + x is the anchor-to-mass world-space distance; the
   * schema's initialDisplacement range (-2..2) against REST_LENGTH=3 keeps
   * this in [1,5] - always strictly positive, so the mass never crosses
   * through or above the anchor.
   *
   * @param {number} x - Current displacement, in meters.
   */
  _applyPose(x) {
    this._massWorldPosition.set(
      this._anchorPosition.x,
      this._anchorPosition.y - (REST_LENGTH + x),
      this._anchorPosition.z
    );
    this._massMesh.position.copy(this._massWorldPosition);

    this._updateSpringLine();
  }

  /**
   * Rebuild the zigzag coil line's vertex positions in place from the
   * current anchor/mass world positions. Called every update() (and by
   * _initState()) since the spring's length changes continuously - unlike
   * Projectile's analytic curve, which only depends on fixed launch params
   * and is rebuilt once per setup()/reset().
   *
   * Generates 2*COIL_COUNT+1 points along the straight anchor->mass line:
   * the first (i=0) and last (i=totalPoints-1) exactly ON that line (no
   * perpendicular offset), so the spring visually anchors cleanly at both
   * ends; interior points alternate +ZIGZAG_AMPLITUDE/-ZIGZAG_AMPLITUDE
   * perpendicular offset (along the fixed world +X axis - see setup()'s
   * comment on _zigzagPerpendicular) at evenly spaced fractions of the
   * current length.
   */
  _updateSpringLine() {
    const totalPoints = 2 * COIL_COUNT + 1;
    this._springDirection.subVectors(this._massWorldPosition, this._anchorPosition);
    const length = this._springDirection.length();
    this._springDirection.normalize();

    for (let i = 0; i < totalPoints; i++) {
      const frac = i / (totalPoints - 1);
      // Point on the straight anchor->mass line at this fraction of the
      // current length...
      const px = this._anchorPosition.x + this._springDirection.x * length * frac;
      const py = this._anchorPosition.y + this._springDirection.y * length * frac;
      const pz = this._anchorPosition.z + this._springDirection.z * length * frac;

      // ...offset perpendicular to it, alternating sign, EXCEPT at the two
      // endpoints (i=0, i=totalPoints-1), which stay exactly on the line.
      let offset = 0;
      if (i !== 0 && i !== totalPoints - 1) {
        offset = i % 2 === 1 ? ZIGZAG_AMPLITUDE : -ZIGZAG_AMPLITUDE;
      }

      this._springPositions[i * 3] = px + this._zigzagPerpendicular.x * offset;
      this._springPositions[i * 3 + 1] = py + this._zigzagPerpendicular.y * offset;
      this._springPositions[i * 3 + 2] = pz + this._zigzagPerpendicular.z * offset;
    }

    this._springGeometry.attributes.position.needsUpdate = true;
    // Keep the bounding sphere current so the line doesn't get frustum-culled
    // as it stretches/compresses well outside its initial bounds.
    this._springGeometry.computeBoundingSphere();
  }
}
