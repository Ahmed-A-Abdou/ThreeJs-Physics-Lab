/**
 * Pure physics for the throwaway "falling ball" experiment: a point mass
 * falling under constant gravity along the y-axis. No three.js import here -
 * numbers in, numbers out, unit-testable without a browser (CLAUDE.md rule 1).
 *
 * THROWAWAY MODULE: this experiment exists only to prove the framework
 * (Experiment contract, registry, simLoop, UIPanel, Graph) works end-to-end.
 * The physics is deliberately as simple as it gets - safe to delete once
 * real experiments (pendulum/projectile/spring) exist.
 *
 * Deliberate scope decision: this ball free-falls forever. There is no
 * ground collision, bounce, or floor clamp - the parameter schema (gravity,
 * startHeight) has no restitution/floor parameter, and inventing one would be
 * scope creep beyond what was asked. Height is allowed to go negative.
 */

/**
 * @typedef {Object} FallingBallState
 * @property {number} height   - Y position, in meters (y-up: larger is higher).
 * @property {number} velocity - Y velocity, in meters/second (negative = falling).
 * @property {number} t        - Elapsed simulation time, in seconds, since this state was created.
 */

/**
 * Build the initial state for a fresh run (called from both setup() and
 * reset() in FallingBall.js). The ball always starts at rest - there is no
 * initial-velocity parameter in the schema, so v0 = 0 is not a simplification,
 * it's the actual spec: a dropped ball, not a thrown one.
 *
 * @param {number} startHeight - Starting y position, in meters.
 * @returns {FallingBallState}
 */
export function createInitialState(startHeight) {
  return { height: startHeight, velocity: 0, t: 0 };
}

/**
 * Advance the ball by exactly one fixed timestep, using semi-implicit
 * (symplectic) Euler - CLAUDE.md rule 6: velocity is updated FIRST from the
 * constant downward acceleration, and position is updated SECOND using that
 * new velocity (never the old one). Never reorder these two lines - doing so
 * silently turns this into explicit Euler, which injects energy and would
 * defeat the whole point of using a symplectic integrator here.
 *
 * Sign convention: y-up, so gravity (a positive magnitude, e.g. 9.8) pulls
 * the ball toward negative acceleration - falling means velocity becomes
 * increasingly negative and height decreases.
 *
 * Pure function: never mutates `state`, always returns a new object.
 *
 * @param {FallingBallState} state
 * @param {number} gravity - Gravitational acceleration magnitude, in m/s^2 (positive).
 * @param {number} dt      - Fixed timestep, in seconds.
 * @returns {FallingBallState}
 */
export function stepFallingBall(state, gravity, dt) {
  // 1. Velocity FIRST, from the old velocity and constant acceleration.
  const velocity = state.velocity - gravity * dt;
  // 2. Position SECOND, using the just-computed NEW velocity (not state.velocity).
  const height = state.height + velocity * dt;
  // 3. Time advances by the same fixed step.
  const t = state.t + dt;

  return { height, velocity, t };
}
