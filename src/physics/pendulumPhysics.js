/**
 * Pure physics for the Pendulum experiment: a point mass (the "bob") on a
 * massless, rigid rod of fixed length, swinging under gravity with optional
 * linear (velocity-proportional) damping. No three.js import here - numbers
 * in, numbers out, unit-testable without a browser (CLAUDE.md rule 1).
 *
 * Equation of motion (CLAUDE.md rule 7 - the REAL equation, not the
 * small-angle linearization):
 *
 *   theta'' = -(gravity / length) * Math.sin(theta) - damping * theta'
 *
 * This uses the actual Math.sin(theta), never the small-angle approximation
 * theta'' ~= -(gravity/length) * theta. That approximation is only used
 * later, as the COMPARISON formula (theoreticalPeriod, below) that the
 * measured period gets checked against - see its doc comment for why the
 * two are expected to diverge at large amplitude/damping, and why that's
 * correct physics rather than a bug.
 */

/**
 * @typedef {Object} PendulumState
 * @property {number} theta - Angle from vertical (rest position), in radians.
 *   Positive = displaced toward +x (see Pendulum.js for the 3D bob-position mapping).
 * @property {number} omega - Angular velocity, in radians/second.
 * @property {number} t     - Elapsed simulation time, in seconds, since this state was created.
 */

/**
 * Build the initial state for a fresh run (called from both setup() and
 * reset() in Pendulum.js). The pendulum always starts at rest (omega = 0) -
 * there is no initial-angular-velocity parameter in the schema, so omega0 = 0
 * is not a simplification, it's the actual spec: released from rest at the
 * given angle, not given a push.
 *
 * @param {number} initialAngle - Starting angle, in radians, from vertical.
 * @returns {PendulumState}
 */
export function createInitialState(initialAngle) {
  return { theta: initialAngle, omega: 0, t: 0 };
}

/**
 * Advance the pendulum by exactly one fixed timestep, using semi-implicit
 * (symplectic) Euler - CLAUDE.md rule 6: angular velocity is updated FIRST,
 * from the angular acceleration computed at the OLD theta/omega, and angle
 * is updated SECOND using that NEW angular velocity (never the old one).
 * Never reorder these two lines - doing so silently turns this into explicit
 * Euler, which injects energy into the swing (visibly growing amplitude over
 * time even with damping = 0) and would defeat the whole point of using a
 * symplectic integrator here.
 *
 * Real (non-linearized) equation of motion (CLAUDE.md rule 7): acceleration
 * uses Math.sin(theta), the actual restoring force, never the small-angle
 * approximation "theta" alone. This matters most at large initial angles,
 * where the true period is measurably longer than the small-angle formula
 * predicts - see theoreticalPeriod()/percentDifference() below.
 *
 * Pure function: never mutates `state`, always returns a new object.
 *
 * @param {PendulumState} state
 * @param {number} gravity - Gravitational acceleration magnitude, in m/s^2 (positive).
 * @param {number} length  - Rod length, in meters (positive).
 * @param {number} damping - Linear (velocity-proportional) damping coefficient,
 *   in 1/s (>= 0; 0 = no damping).
 * @param {number} dt      - Fixed timestep, in seconds.
 * @returns {PendulumState}
 */
export function stepPendulum(state, gravity, length, damping, dt) {
  // Angular acceleration from the OLD theta/omega - the real equation
  // (Math.sin(theta), not theta), plus linear damping opposing the OLD
  // angular velocity.
  const alpha = -(gravity / length) * Math.sin(state.theta) - damping * state.omega;

  // 1. Angular velocity FIRST, from the old velocity and the acceleration above.
  const omega = state.omega + alpha * dt;
  // 2. Angle SECOND, using the just-computed NEW angular velocity (not state.omega).
  const theta = state.theta + omega * dt;
  // 3. Time advances by the same fixed step.
  const t = state.t + dt;

  return { theta, omega, t };
}

/**
 * Small-angle (linearized) approximate period of a simple pendulum:
 * T = 2*pi*sqrt(length / gravity).
 *
 * IMPORTANT - this is a comparison target, not a claim about the simulation.
 * stepPendulum() above always integrates the REAL equation (Math.sin(theta),
 * CLAUDE.md rule 7), so the simulated motion is exact for whatever angle/
 * damping it's run at. This formula is only exact in the theta -> 0 limit
 * with zero damping.
 *
 * Two effects LEGITIMATELY make the measured (simulated) period diverge from
 * this formula - both are correct physics, not a bug in the simulation or in
 * this formula:
 *   - Larger initial angle: the true nonlinear period is always >= the
 *     small-angle period, growing without bound as amplitude approaches the
 *     unstable equilibrium at +/- pi.
 *   - Damping: energy loss lowers the oscillation's effective (damped)
 *     angular frequency below the undamped small-angle value, which also
 *     lengthens the period.
 * At small initial angle and zero damping, expect the two to agree closely
 * (percentDifference() near 0%); moving either slider up should visibly grow
 * the difference. That growing difference is the feature working as
 * intended, not a discrepancy to chase down.
 *
 * @param {number} length  - Rod length, in meters (positive).
 * @param {number} gravity - Gravitational acceleration magnitude, in m/s^2 (positive).
 * @returns {number} Theoretical (small-angle) period, in seconds.
 */
export function theoreticalPeriod(length, gravity) {
  return 2 * Math.PI * Math.sqrt(length / gravity);
}

/**
 * Percent difference of `measured` relative to `theoretical`:
 * (measured - theoretical) / theoretical * 100.
 *
 * Signed (not absolute value): under the two conditions described in
 * theoreticalPeriod()'s doc comment above (larger amplitude, damping
 * present), the measured period is always >= the theoretical one, so this
 * is expected to read positive - a sign flip would actually indicate a bug.
 *
 * @param {number} measured    - Measured (simulated) period, in seconds.
 * @param {number} theoretical - Theoretical (small-angle) period, in seconds.
 * @returns {number} Percent difference.
 */
export function percentDifference(measured, theoretical) {
  return ((measured - theoretical) / theoretical) * 100;
}

/**
 * @typedef {Object} CrossingTrackerState
 * @property {'up'|'down'} direction - Which zero-crossing direction this
 *   tracker records: 'down' = theta going from positive to negative/zero
 *   (descending through rest); 'up' = negative/zero to positive (ascending).
 *   Fixed for the tracker's lifetime.
 * @property {number|null} prevTheta - theta from the previous update() call, or null before the first call.
 * @property {number|null} prevT     - t from the previous update() call, or null before the first call.
 * @property {number|null} lastCrossingT - Interpolated time of the most
 *   recently recorded (same-direction) crossing, or null until the first is recorded.
 * @property {number|null} lastPeriod - Time between the two most recent
 *   recorded (same-direction) crossings - this IS one full period already,
 *   no further x2/÷2 correction needed anywhere. Null until a second
 *   same-direction crossing has been recorded.
 */

/**
 * A pendulum released from a positive angle crosses theta = 0 twice per full
 * swing: once descending (toward the negative extreme) and once ascending
 * (back toward the positive extreme) - but the ascending crossing only marks
 * the HALF-way point of one period, not a full period. Recording every raw
 * zero-crossing and taking the time between successive ones would measure
 * the HALF period - the classic x2 bug this design avoids.
 *
 * This tracker only ever records crossings in ONE direction (fixed at
 * creation), so "time between the two most recently recorded crossings" is
 * already a full period by construction, with nothing left to double or
 * halve afterward. See pendulumPhysics.test.js for a synthetic (non-
 * simulated) trajectory test that would fail if this direction filtering
 * were removed or wrong.
 *
 * Crossing times are linearly interpolated between the two straddling
 * samples (rather than snapped to a sample's own t) - cheap, and
 * meaningfully more accurate than the fixed dt (1/120s by convention) would
 * allow on its own, which matters when comparing the measured period against
 * theory.
 *
 * Pure-function style, matching stepPendulum() above: createCrossingTracker()
 * returns a fresh tracker; updateCrossingTracker() never mutates its input,
 * it returns a new tracker object every call.
 *
 * @param {'up'|'down'} [direction='down'] - Which crossing direction to record.
 * @returns {CrossingTrackerState}
 */
export function createCrossingTracker(direction = 'down') {
  return { direction, prevTheta: null, prevT: null, lastCrossingT: null, lastPeriod: null };
}

/**
 * Feed one more (theta, t) sample into the tracker. Call this once per
 * simulation step, in order, with strictly increasing t.
 *
 * @param {CrossingTrackerState} tracker
 * @param {number} theta - Current angle, in radians.
 * @param {number} t     - Current simulation time, in seconds.
 * @returns {CrossingTrackerState} A new tracker state (input is never mutated).
 */
export function updateCrossingTracker(tracker, theta, t) {
  // Nothing to compare against yet on the very first sample.
  if (tracker.prevTheta === null) {
    return { ...tracker, prevTheta: theta, prevT: t };
  }

  const crossedDown = tracker.prevTheta > 0 && theta <= 0;
  const crossedUp = tracker.prevTheta < 0 && theta >= 0;
  const isTrackedDirection =
    (tracker.direction === 'down' && crossedDown) ||
    (tracker.direction === 'up' && crossedUp);

  if (!isTrackedDirection) {
    // Not a crossing in the direction this tracker records (either no
    // crossing this step, or a crossing belonging to the OTHER half of the
    // swing) - only prevTheta/prevT advance.
    return { ...tracker, prevTheta: theta, prevT: t };
  }

  // Linear interpolation of the exact time theta == 0 between the two
  // straddling samples. prevTheta and theta always have opposite signs here
  // (that's what makes this a crossing), so the denominator is never zero.
  const crossingT =
    tracker.prevT + (t - tracker.prevT) * (0 - tracker.prevTheta) / (theta - tracker.prevTheta);

  const lastPeriod = tracker.lastCrossingT === null ? null : crossingT - tracker.lastCrossingT;

  return { ...tracker, prevTheta: theta, prevT: t, lastCrossingT: crossingT, lastPeriod };
}
