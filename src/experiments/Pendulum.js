import * as THREE from 'three';
import { Experiment } from '../Experiment.js';
import {
  createInitialState,
  stepPendulum,
  createCrossingTracker,
  updateCrossingTracker,
  theoreticalPeriod,
  percentDifference,
} from '../physics/pendulumPhysics.js';

/**
 * A simple pendulum: pivot (fixed anchor), rod (rigid, massless), and bob
 * (point mass), swinging under gravity with optional damping. Uses the real
 * equation of motion (Math.sin(theta), CLAUDE.md rule 7) integrated with
 * semi-implicit Euler (CLAUDE.md rule 6) - see pendulumPhysics.js.
 *
 * Pivot world position is fixed at (0, 12, 0) - chosen to sit within
 * main.js's existing (unmodified) camera framing, which looks at roughly
 * (0, 10, 0); with the schema's max length of 3m the bob can hang down to
 * about y=9, staying inside that existing view without needing camera
 * changes (out of scope for this task).
 *
 * Also logs a measured-vs-theoretical period comparison to the console each
 * time a full period completes (CLAUDE.md rule 3 - no per-experiment UI,
 * confirmed with the user as console-only).
 */
export class Pendulum extends Experiment {
  static get parameterSchema() {
    return [
      { key: 'length', label: 'Length (m)', min: 0.5, max: 3, step: 0.1, default: 1.5 },
      { key: 'gravity', label: 'Gravity (m/s²)', min: 1, max: 20, step: 0.5, default: 9.8 },
      // Radians directly (matches the physics) - kept small enough by
      // default that the small-angle theory comparison starts near 0%, but
      // rangeable well into clearly-nonlinear territory. Avoids landing
      // exactly on the unstable equilibrium at +/- pi (~3.1416).
      { key: 'initialAngle', label: 'Initial Angle (rad)', min: -3, max: 3, step: 0.05, default: 0.3 },
      // Default 0 so the very first period measurement cleanly matches
      // theory - a nice sanity-check demo default.
      { key: 'damping', label: 'Damping (1/s)', min: 0, max: 2, step: 0.05, default: 0 },
    ];
  }

  setup(scene, params) {
    this._scene = scene;
    this._pivotPosition = new THREE.Vector3(0, 12, 0); // fixed anchor - never repositioned in reset()

    this._pivotGeometry = new THREE.SphereGeometry(0.15, 16, 12);
    this._pivotMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    this._pivotMesh = new THREE.Mesh(this._pivotGeometry, this._pivotMaterial);
    this._pivotMesh.position.copy(this._pivotPosition);
    scene.add(this._pivotMesh);

    // Unit-height cylinder along local +Y - scaled/rotated per-frame in
    // _applyPose() to stretch from the pivot to the bob's current position.
    // Never rebuilt in reset(); only its scale/position/quaternion change.
    this._rodGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1, 12);
    this._rodMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
    this._rodMesh = new THREE.Mesh(this._rodGeometry, this._rodMaterial);
    scene.add(this._rodMesh);

    this._bobGeometry = new THREE.SphereGeometry(0.35, 32, 16);
    this._bobMaterial = new THREE.MeshStandardMaterial({ color: 0x0d6efd });
    this._bobMesh = new THREE.Mesh(this._bobGeometry, this._bobMaterial);
    scene.add(this._bobMesh);

    // Scratch vector reused every frame instead of allocated fresh each call.
    this._rodDirection = new THREE.Vector3();
    this._rodUp = new THREE.Vector3(0, 1, 0); // cylinder's local long axis

    // Meshes exist now, so the shared helper (which also positions them) is safe to call.
    this._initState(params);
  }

  update(dt) {
    // gravity/length/damping are read fresh from this.params rather than
    // stored in physics state - safe because any slider change goes through
    // reset() first (see UIPanel._buildControl), so all three are constant
    // for the lifetime of one run between resets. Same convention as FallingBall.
    this._state = stepPendulum(
      this._state,
      this.params.gravity,
      this.params.length,
      this.params.damping,
      dt
    );

    // Physics -> rendering, one-directional (CLAUDE.md rule 2).
    this._applyPose(this.params.length, this._state.theta);

    // Full cumulative history - never truncated. Graph.js re-reads this
    // array fresh every frame and redraws the whole series each time.
    this._history.push({ t: this._state.t, value: this._state.theta });

    // --- Period measurement: console-only (CLAUDE.md rule 3, confirmed) ---
    const previousLastPeriod = this._crossingTracker.lastPeriod;
    this._crossingTracker = updateCrossingTracker(this._crossingTracker, this._state.theta, this._state.t);

    if (this._crossingTracker.lastPeriod !== null && this._crossingTracker.lastPeriod !== previousLastPeriod) {
      const measured = this._crossingTracker.lastPeriod;
      const theoretical = theoreticalPeriod(this.params.length, this.params.gravity);
      const diffPct = percentDifference(measured, theoretical);
      // Expected to grow away from 0% at larger initialAngle/damping - real
      // nonlinear/damped-pendulum physics, not a discrepancy (see
      // theoreticalPeriod()'s doc comment in pendulumPhysics.js).
      console.log(
        `[Pendulum] measured period: ${measured.toFixed(4)}s | ` +
        `theoretical 2π√(L/g): ${theoretical.toFixed(4)}s | diff: ${diffPct.toFixed(2)}%`
      );
    }
  }

  getMeasurements() {
    return { label: 'Angle (rad)', points: this._history };
  }

  reset(params) {
    // Meshes/geometries/materials already exist from setup() - reset() only
    // re-initializes physics state and mesh pose, never rebuilds them.
    this._initState(params);
  }

  dispose() {
    this._scene.remove(this._pivotMesh, this._rodMesh, this._bobMesh);
    this._pivotGeometry.dispose();
    this._pivotMaterial.dispose();
    this._rodGeometry.dispose();
    this._rodMaterial.dispose();
    this._bobGeometry.dispose();
    this._bobMaterial.dispose();
  }

  /**
   * Shared by setup() and reset(): re-derive physics state and the period
   * tracker from params, reposition the (already-existing) meshes, and clear
   * the measurement history. Kept as one small private method so setup() and
   * reset() can never drift apart on how a "fresh run" is initialized.
   *
   * @param {Object} params
   * @param {number} params.length
   * @param {number} params.gravity
   * @param {number} params.initialAngle
   * @param {number} params.damping
   */
  _initState(params) {
    this.params = params;
    this._state = createInitialState(params.initialAngle);
    // Pendulum swings from a (generally nonzero) starting angle toward
    // theta=0 first in the descending direction - see pendulumPhysics.js's
    // doc comment on createCrossingTracker for why a single fixed direction
    // is enough to measure whole periods.
    this._crossingTracker = createCrossingTracker('down');
    this._history = [];

    this._applyPose(params.length, this._state.theta);
  }

  /**
   * Position the bob and orient/scale the rod for the given length/theta.
   * Shared by update() and _initState() so the pose math can't drift between
   * "mid-run" and "just reset" frames.
   *
   * Bob position, LOCAL to the pivot: x = L*sin(theta), y = -L*cos(theta).
   * At theta=0 this is (0, -L) - hanging straight down - the correct rest position.
   *
   * @param {number} length
   * @param {number} theta
   */
  _applyPose(length, theta) {
    this._bobMesh.position.set(
      this._pivotPosition.x + length * Math.sin(theta),
      this._pivotPosition.y - length * Math.cos(theta),
      this._pivotPosition.z
    );

    // Rod: a unit-height cylinder stretched/rotated to span pivot -> bob.
    this._rodDirection.subVectors(this._bobMesh.position, this._pivotPosition); // length == `length` by construction above
    const rodLength = this._rodDirection.length();
    this._rodDirection.normalize();

    this._rodMesh.position.copy(this._pivotPosition).addScaledVector(this._rodDirection, rodLength / 2);
    this._rodMesh.scale.set(1, rodLength, 1);
    this._rodMesh.quaternion.setFromUnitVectors(this._rodUp, this._rodDirection);
  }
}
