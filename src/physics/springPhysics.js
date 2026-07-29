/**
 * Pure physics for the Spring experiment: a point mass attached to a fixed
 * anchor by an ideal (massless) linear spring, obeying Hooke's law, with
 * optional linear (velocity-proportional) damping. No three.js import here -
 * numbers in, numbers out, unit-testable without a browser (CLAUDE.md rule 1).
 *
 * Equation of motion:
 *
 *   x'' = -(springConstant / mass) * x - (damping / mass) * v
 *
 * UNLIKE Pendulum's sin(theta) (CLAUDE.md rule 7 - the real equation vs. the
 * small-angle approximation), Hooke's law (-k*x) is not an approximation of
 * anything here: it IS the exact, defining equation of an ideal linear
 * spring. There is no "real vs. simplified" distinction to make for this
 * experiment - the model is exactly linear by construction, so there is
 * nothing analogous to rule 7's sin(theta) vs. theta concern.
 */

/**
 * @typedef {Object} SpringState
 * @property {number} x - Displacement from equilibrium (x=0 = spring at its
 *   natural/rest length), in meters. Positive = stretched/extended; negative
 *   = compressed. See Spring.js for the 3D mass-position mapping.
 * @property {number} v - Velocity, in meters/second.
 * @property {number} t - Elapsed simulation time, in seconds, since this state was created.
 */

/**
 * Build the initial state for a fresh run (called from both setup() and
 * reset() in Spring.js). The mass always starts at rest (v = 0) - there is
 * no initial-velocity parameter in the schema, so v0 = 0 is not a
 * simplification, it's the actual spec: released from rest at the given
 * displacement, not given a push.
 *
 * @param {number} initialDisplacement - Starting displacement, in meters, from equilibrium.
 * @returns {SpringState}
 */
export function createInitialState(initialDisplacement) {
  return { x: initialDisplacement, v: 0, t: 0 };
}

/**
 * Advance the spring-mass system by exactly one fixed timestep, using
 * semi-implicit (symplectic) Euler - CLAUDE.md rule 6: velocity is updated
 * FIRST, from the acceleration computed at the OLD x/v, and position is
 * updated SECOND using that NEW velocity (never the old one). Never reorder
 * these two lines - doing so silently turns this into explicit Euler, which
 * injects energy into the oscillation (visibly growing amplitude over time
 * even with damping = 0) and would defeat the whole point of using a
 * symplectic integrator here.
 *
 * Acceleration, from the OLD state only:
 *   a = -(springConstant / mass) * x - (damping / mass) * v
 * (Hooke's restoring force, plus a velocity-proportional damping force,
 * both divided by mass to get acceleration - F = ma.) damping = 0 recovers
 * the ideal undamped harmonic oscillator.
 *
 * Pure function: never mutates `state`, always returns a new object.
 *
 * @param {SpringState} state
 * @param {number} springConstant - Hooke's-law spring constant k, in N/m (positive).
 * @param {number} mass           - Mass, in kg (positive).
 * @param {number} damping        - Linear (velocity-proportional) damping coefficient,
 *   in kg/s (N·s/m) (>= 0; 0 = no damping).
 * @param {number} dt              - Fixed timestep, in seconds.
 * @returns {SpringState}
 */
export function stepSpring(state, springConstant, mass, damping, dt) {
  // Acceleration from the OLD x/v - Hooke's law restoring force plus linear
  // damping opposing the OLD velocity, both divided by mass.
  const acceleration = -(springConstant / mass) * state.x - (damping / mass) * state.v;

  // 1. Velocity FIRST, from the old velocity and the acceleration above.
  const v = state.v + acceleration * dt;
  // 2. Position SECOND, using the just-computed NEW velocity (not state.v).
  const x = state.x + v * dt;
  // 3. Time advances by the same fixed step.
  const t = state.t + dt;

  return { x, v, t };
}

/**
 * Undamped natural frequency of an ideal linear spring-mass system:
 * f = sqrt(springConstant / mass) / (2*pi).
 *
 * IMPORTANT - this is a comparison target, not a claim about the simulation.
 * stepSpring() above always integrates the (damped, when damping > 0)
 * equation, so this formula is only exact when damping = 0.
 *
 * KEY PHYSICAL DIFFERENCE FROM PENDULUM: this frequency does NOT depend on
 * amplitude/initialDisplacement. A linear oscillator's period is amplitude-
 * independent ("isochronism") - unlike Pendulum, where a LARGER initial
 * angle genuinely lengthens the real (non-linearized) period because that
 * equation is nonlinear (sin(theta)). Here, Hooke's law is exactly linear by
 * construction (see this file's header comment), so both a small-amplitude
 * and a large-amplitude run at damping = 0 are expected to closely match
 * this formula - see springPhysics.test.js's dedicated amplitude-
 * independence test, which is structurally the OPPOSITE of Pendulum's
 * large-angle-divergence test.
 *
 * The ONLY thing that legitimately shifts the measured frequency away from
 * this value is DAMPING: a damped oscillator's true oscillation frequency
 * is sqrt(w0^2 - (damping/(2*mass))^2) / (2*pi), which is always <= this
 * undamped value - so damping > 0 is expected to measure a frequency
 * strictly LOWER than theoreticalFrequency. That is correct physics (energy
 * loss slows the oscillation), not a bug in the simulation or this formula.
 * At very high damping (relative to springConstant/mass), the system can
 * become critically damped or overdamped and never oscillate again - in
 * that regime no period will ever be measured at all (the crossing tracker
 * below simply never completes a second same-direction crossing), which is
 * also correct, not a bug.
 *
 * @param {number} springConstant - Spring constant k, in N/m (positive).
 * @param {number} mass           - Mass, in kg (positive).
 * @returns {number} Theoretical (undamped) natural frequency, in Hz.
 */
export function theoreticalFrequency(springConstant, mass) {
  return Math.sqrt(springConstant / mass) / (2 * Math.PI);
}

/**
 * Signed percent difference of `measured` relative to `theoretical`:
 * (measured - theoretical) / theoretical * 100.
 *
 * Expected near 0% when damping = 0 (regardless of amplitude - see
 * theoreticalFrequency()'s doc comment above), and expected NEGATIVE when
 * damping > 0 (measured frequency reads lower than the undamped natural
 * frequency - correct physics, not a bug).
 *
 * @param {number} measured    - Measured (simulated) frequency, in Hz.
 * @param {number} theoretical - Theoretical (undamped) frequency, in Hz.
 * @returns {number} Percent difference.
 */
export function percentDifference(measured, theoretical) {
  return ((measured - theoretical) / theoretical) * 100;
}

/**
 * @typedef {Object} CrossingTrackerState
 * @property {'up'|'down'} direction - Which zero-crossing direction this
 *   tracker records: 'down' = x going from positive to negative/zero
 *   (descending through equilibrium); 'up' = negative/zero to positive
 *   (ascending). Fixed for the tracker's lifetime.
 * @property {number|null} prevX - x from the previous update() call, or null before the first call.
 * @property {number|null} prevT - t from the previous update() call, or null before the first call.
 * @property {number|null} lastCrossingT - Interpolated time of the most
 *   recently recorded (same-direction) crossing, or null until the first is recorded.
 * @property {number|null} lastPeriod - Time between the two most recent
 *   recorded (same-direction) crossings - this IS one full period already,
 *   no further x2/÷2 correction needed anywhere. Null until a second
 *   same-direction crossing has been recorded.
 */

/**
 * A mass released from a nonzero displacement crosses x = 0 twice per full
 * oscillation: once descending (toward the opposite extreme) and once
 * ascending (back toward the starting extreme) - but the ascending crossing
 * only marks the HALF-way point of one period, not a full period. Recording
 * every raw zero-crossing and taking the time between successive ones would
 * measure the HALF period - the classic x2 bug this design avoids.
 *
 * This tracker only ever records crossings in ONE direction (fixed at
 * creation), so "time between the two most recently recorded crossings" is
 * already a full period by construction, with nothing left to double or
 * halve afterward. See springPhysics.test.js for a synthetic (non-simulated)
 * trajectory test that would fail if this direction filtering were removed
 * or wrong.
 *
 * Crossing times are linearly interpolated between the two straddling
 * samples (rather than snapped to a sample's own t) - cheap, and
 * meaningfully more accurate than the fixed dt (1/120s by convention) would
 * allow on its own, which matters when comparing the measured frequency
 * against theory.
 *
 * Pure-function style, matching stepSpring() above: createCrossingTracker()
 * returns a fresh tracker; updateCrossingTracker() never mutates its input,
 * it returns a new tracker object every call.
 *
 * Deliberately re-implemented here rather than imported from
 * pendulumPhysics.js, even though the underlying zero-crossing math is
 * conceptually identical - each experiment's physics module is fully
 * self-contained (see also projectilePhysics.js's landing detector, which
 * likewise doesn't import from pendulumPhysics.js despite similar math),
 * consistent with CLAUDE.md rule 4 (one new experiment touches exactly one
 * new physics file).
 *
 * @param {'up'|'down'} [direction='down'] - Which crossing direction to record.
 * @returns {CrossingTrackerState}
 */
export function createCrossingTracker(direction = 'down') {
  return { direction, prevX: null, prevT: null, lastCrossingT: null, lastPeriod: null };
}

/**
 * Feed one more (x, t) sample into the tracker. Call this once per
 * simulation step, in order, with strictly increasing t.
 *
 * @param {CrossingTrackerState} tracker
 * @param {number} x - Current displacement, in meters.
 * @param {number} t - Current simulation time, in seconds.
 * @returns {CrossingTrackerState} A new tracker state (input is never mutated).
 */
export function updateCrossingTracker(tracker, x, t) {
  // Nothing to compare against yet on the very first sample.
  if (tracker.prevX === null) {
    return { ...tracker, prevX: x, prevT: t };
  }

  const crossedDown = tracker.prevX > 0 && x <= 0;
  const crossedUp = tracker.prevX < 0 && x >= 0;
  const isTrackedDirection =
    (tracker.direction === 'down' && crossedDown) ||
    (tracker.direction === 'up' && crossedUp);

  if (!isTrackedDirection) {
    // Not a crossing in the direction this tracker records (either no
    // crossing this step, or a crossing belonging to the OTHER half of the
    // oscillation) - only prevX/prevT advance.
    return { ...tracker, prevX: x, prevT: t };
  }

  // Linear interpolation of the exact time x == 0 between the two
  // straddling samples. prevX and x always have opposite signs here (that's
  // what makes this a crossing), so the denominator is never zero.
  const crossingT =
    tracker.prevT + (t - tracker.prevT) * (0 - tracker.prevX) / (x - tracker.prevX);

  const lastPeriod = tracker.lastCrossingT === null ? null : crossingT - tracker.lastCrossingT;

  return { ...tracker, prevX: x, prevT: t, lastCrossingT: crossingT, lastPeriod };
}
