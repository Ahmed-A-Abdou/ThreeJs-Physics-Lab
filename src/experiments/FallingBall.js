import * as THREE from 'three';
import { Experiment } from '../Experiment.js';
import { createInitialState, stepFallingBall } from '../physics/fallingBall.js';

/**
 * THROWAWAY experiment: a ball falling under constant gravity along the
 * y-axis. Its only purpose is to prove the framework (Experiment contract,
 * registry, simLoop, UIPanel, Graph) works end-to-end - the physics is
 * intentionally as simple as possible. Safe to delete once a real experiment
 * (pendulum/projectile/spring) exists.
 *
 * Uses a lit MeshStandardMaterial (not MeshBasicMaterial) - this relies on
 * main.js providing at least one light in the scene, same as any ordinary
 * three.js setup. This file never imports main.js or knows how it's wired;
 * it only assumes a normal lit scene, same as every other lit mesh would.
 */
export class FallingBall extends Experiment {
  static get parameterSchema() {
    return [
      { key: 'gravity', label: 'Gravity (m/s²)', min: 1, max: 20, step: 0.5, default: 9.8 },
      { key: 'startHeight', label: 'Start Height (m)', min: 1, max: 20, step: 0.5, default: 10 },
    ];
  }

  setup(scene, params) {
    this._scene = scene;

    this._geometry = new THREE.SphereGeometry(0.5, 32, 16);
    this._material = new THREE.MeshStandardMaterial({ color: 0xdc3545 });
    this._mesh = new THREE.Mesh(this._geometry, this._material);
    scene.add(this._mesh);

    // Mesh exists now, so the shared helper (which also positions it) is safe to call.
    this._initState(params);
  }

  update(dt) {
    // Gravity is read fresh from this.params rather than stored in the
    // physics state - safe because any parameter change (including gravity)
    // goes through reset() first (see UIPanel._buildControl), so gravity is
    // always constant for the lifetime of one run between resets.
    this._state = stepFallingBall(this._state, this.params.gravity, dt);

    // Physics -> rendering, one-directional (CLAUDE.md rule 2): copy the
    // computed number onto the mesh, never the other way around.
    this._mesh.position.y = this._state.height;

    // Full cumulative history - never truncated. Graph.js re-reads this
    // array fresh every frame and redraws the whole series each time.
    this._history.push({ t: this._state.t, value: this._state.height });
  }

  getMeasurements() {
    return { label: 'Height (m)', points: this._history };
  }

  reset(params) {
    // Mesh/geometry/material already exist from setup() - reset() only
    // re-initializes physics state and mesh position, never rebuilds them.
    this._initState(params);
  }

  dispose() {
    this._scene.remove(this._mesh);
    this._geometry.dispose();
    this._material.dispose();
  }

  /**
   * Shared by setup() and reset(): re-derive physics state from params,
   * reposition the (already-existing) mesh, and clear the measurement
   * history. Kept as one small private method so setup() and reset() can
   * never drift apart on how a "fresh run" is initialized.
   *
   * @param {Object} params
   * @param {number} params.gravity
   * @param {number} params.startHeight
   */
  _initState(params) {
    this.params = params;
    this._state = createInitialState(params.startHeight);
    this._mesh.position.set(0, params.startHeight, 0);
    this._history = [];
  }
}
