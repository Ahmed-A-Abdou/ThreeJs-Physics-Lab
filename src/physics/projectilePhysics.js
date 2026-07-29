/**
 * Pure physics for the Projectile experiment: a point mass launched at an
 * angle in a 2D vertical plane (x = horizontal, y = vertical, y increases
 * upward), under constant gravity plus optional quadratic ("air resistance")
 * drag. No three.js import here - numbers in, numbers out, unit-testable
 * without a browser (CLAUDE.md rule 1).
 *
 * Drag model: QUADRATIC drag, a_drag = -dragCoefficient * speed * velocity,
 * i.e. proportional to speed squared and opposing the current velocity
 * direction. This is the standard "air resistance" model for macroscopic
 * projectiles (thrown balls, cannonballs) - unlike linear ("Stokes") drag,
 * a_drag = -k*velocity, which really models a small particle moving slowly
 * through a viscous fluid and is the wrong intuition for "throw a ball
 * through air." CLAUDE.md rule 7: this is the REAL equation of motion
 * actually integrated below for the simulated flight - the separate,
 * deliberately-idealized DRAG-FREE formulas (analyticRange/analyticTrajectory,
 * further down) are a different, correct thing: a fixed comparison baseline,
 * not a description of the simulated flight.
 */

/**
 * @typedef {Object} ProjectileState
 * @property {number} x  - Horizontal position, in meters, relative to the launch point (x0 = 0).
 * @property {number} y  - Vertical position, in meters, relative to the launch point (y0 = 0; positive = above launch height).
 * @property {number} vx - Horizontal velocity, in m/s.
 * @property {number} vy - Vertical velocity, in m/s.
 * @property {number} t  - Elapsed simulation time, in seconds, since this state was created.
 */

/**
 * Build the initial state for a fresh run (called from both setup() and
 * reset() in Projectile.js). Position always starts at the launch point,
 * (0, 0) in this state's own local coordinates - Projectile.js is
 * responsible for offsetting by the world-space launch origin when
 * positioning meshes (CLAUDE.md rule 2: physics stays origin-agnostic,
 * rendering applies the world offset).
 *
 * @param {number} vx - Initial horizontal velocity, in m/s (from launchVelocityFromAngle).
 * @param {number} vy - Initial vertical velocity, in m/s (from launchVelocityFromAngle).
 * @returns {ProjectileState}
 */
export function createInitialState(vx, vy) {
  return { x: 0, y: 0, vx, vy, t: 0 };
}

/**
 * Advance the projectile by exactly one fixed timestep, using semi-implicit
 * (symplectic) Euler - CLAUDE.md rule 6: velocity is updated FIRST, from the
 * acceleration computed at the OLD vx/vy, and position is updated SECOND
 * using that NEW velocity (never the old one). Never reorder these two
 * steps - doing so would silently turn this into explicit Euler.
 *
 * Acceleration, from the OLD state only:
 *   speed = sqrt(vx^2 + vy^2)
 *   ax = -dragCoefficient * speed * vx        (drag opposing horizontal velocity)
 *   ay = -gravity - dragCoefficient * speed * vy  (gravity, plus drag opposing vertical velocity)
 *
 * dragCoefficient = 0 recovers plain projectile motion (ax = 0, ay = -gravity).
 *
 * Pure function: never mutates `state`, always returns a new object.
 *
 * @param {ProjectileState} state
 * @param {number} gravity        - Gravitational acceleration magnitude, in m/s^2 (positive).
 * @param {number} dragCoefficient - Quadratic drag coefficient, in 1/m (>= 0; 0 = no drag).
 * @param {number} dt             - Fixed timestep, in seconds.
 * @returns {ProjectileState}
 */
export function stepProjectile(state, gravity, dragCoefficient, dt) {
  const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy);
  const ax = -dragCoefficient * speed * state.vx;
  const ay = -gravity - dragCoefficient * speed * state.vy;

  // 1. Velocity FIRST, from the old velocity and the acceleration above.
  const vx = state.vx + ax * dt;
  const vy = state.vy + ay * dt;
  // 2. Position SECOND, using the just-computed NEW velocity (not state.vx/vy).
  const x = state.x + vx * dt;
  const y = state.y + vy * dt;
  // 3. Time advances by the same fixed step.
  const t = state.t + dt;

  return { x, y, vx, vy, t };
}

/**
 * Decompose a launch speed/angle into horizontal/vertical velocity
 * components. Kept as a small separate helper (rather than folded into
 * createInitialState) so the one degrees->radians conversion for this
 * experiment lives in exactly one well-tested place, and stepProjectile()
 * itself stays unit-agnostic (plain numbers, no notion of "degrees").
 *
 * Angle is in DEGREES (the natural unit for a user-facing "launch angle"
 * slider - unlike Pendulum's initialAngle, which is a live ODE state variable
 * best left in radians). 0 deg = straight along +x (horizontal); 90 deg =
 * straight up (+y).
 *
 * @param {number} speed        - Launch speed, in m/s (positive).
 * @param {number} angleDegrees - Launch angle above horizontal, in degrees.
 * @returns {{vx: number, vy: number}}
 */
export function launchVelocityFromAngle(speed, angleDegrees) {
  const angleRad = (angleDegrees * Math.PI) / 180;
  return { vx: speed * Math.cos(angleRad), vy: speed * Math.sin(angleRad) };
}

/**
 * Standard closed-form (DRAG-FREE) projectile range:
 *   range = speed^2 * sin(2*angleRad) / gravity
 *
 * IMPORTANT - this is a comparison target, not a claim about the simulated
 * flight. stepProjectile() above always integrates the REAL equation
 * (CLAUDE.md rule 7), including drag when dragCoefficient > 0. This formula
 * is only exact in the no-drag case, and is used deliberately as the ALWAYS
 * drag-free baseline that the actual (possibly dragged) simulated range gets
 * compared against - see Projectile.js's console.log. If dragCoefficient > 0,
 * the actual simulated range will genuinely be shorter than this prediction:
 * that is correct physics (drag removes energy from the flight), not a bug
 * in either this formula or the simulation. With dragCoefficient = 0 the two
 * are expected to closely agree (small integration error only).
 *
 * @param {number} speed        - Launch speed, in m/s (positive).
 * @param {number} angleDegrees - Launch angle above horizontal, in degrees.
 * @param {number} gravity      - Gravitational acceleration magnitude, in m/s^2 (positive).
 * @returns {number} Drag-free range, in meters.
 */
export function analyticRange(speed, angleDegrees, gravity) {
  const angleRad = (angleDegrees * Math.PI) / 180;
  return (speed * speed * Math.sin(2 * angleRad)) / gravity;
}

/**
 * Sample points along the ideal, DRAG-FREE parabola, for drawing the dotted
 * prediction curve. Only depends on speed/angleDegrees/gravity - never on
 * runtime physics state - so Projectile.js rebuilds this curve once per
 * setup()/reset() and never touches it again in update().
 *
 * Sampled by TIME (t from 0 to timeOfFlight), NOT by x. x-parameterized
 * sampling (stepping x from 0 to range and solving for y) breaks down as
 * angleDegrees approaches 90 deg: vx = speed*cos(angleRad) -> 0, so x stays
 * near 0 for the entire flight and there is no usable x range to step
 * through (a division-by-zero/degenerate-sampling hazard). Time-parameterized
 * sampling has no such singularity anywhere in the valid 0-90 deg range,
 * including the near-vertical case.
 *
 * @param {number} speed
 * @param {number} angleDegrees
 * @param {number} gravity
 * @param {number} [numPoints=60] - Number of sample intervals (returns numPoints+1 points).
 * @returns {{x: number, y: number}[]}
 */
export function analyticTrajectory(speed, angleDegrees, gravity, numPoints = 60) {
  const angleRad = (angleDegrees * Math.PI) / 180;
  const vx = speed * Math.cos(angleRad);
  const vy = speed * Math.sin(angleRad);
  const timeOfFlight = (2 * speed * Math.sin(angleRad)) / gravity;

  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = (timeOfFlight * i) / numPoints;
    points.push({ x: vx * t, y: vy * t - 0.5 * gravity * t * t });
  }
  return points;
}

/**
 * Signed percent difference of `measured` relative to `theoretical`:
 * (measured - theoretical) / theoretical * 100.
 *
 * Used to compare the actual simulated range against the (always drag-free)
 * analyticRange prediction - see Projectile.js. Expected to read negative
 * when drag is enabled (actual range falls short of the drag-free
 * prediction - correct physics), and near 0 when dragCoefficient = 0.
 *
 * @param {number} measured
 * @param {number} theoretical
 * @returns {number}
 */
export function percentDifference(measured, theoretical) {
  return ((measured - theoretical) / theoretical) * 100;
}

/**
 * @typedef {Object} LandingDetectorState
 * @property {number|null} prevX    - x from the previous update() call, or null before the first call.
 * @property {number|null} prevY    - y from the previous update() call, or null before the first call.
 * @property {number|null} prevT    - t from the previous update() call, or null before the first call.
 * @property {number|null} landingX - Interpolated x at the moment y crossed back to <= 0, or null until landing is recorded.
 * @property {number|null} landingT - Interpolated t at that same moment, or null until landing is recorded.
 */

/**
 * Detects the first moment the projectile's height y crosses from positive
 * back to <= 0 (i.e. lands), interpolating the exact x/t of landing between
 * the two straddling samples - same linear-interpolation technique
 * Pendulum's crossing tracker uses for zero-crossings.
 *
 * Only the FIRST landing is ever recorded: once landingX is non-null, this
 * function becomes a no-op with respect to landing (only prevX/prevY/prevT
 * keep advancing) - it is a total, pure function that is always safe to
 * keep calling. It is the EXPERIMENT's job (see Projectile.js) to actually
 * stop simulating once a landing has been recorded, not this tracker's.
 *
 * The check is `prevY > 0 && y <= 0` (strictly positive previous y) rather
 * than `prevY >= 0`, specifically so the very first sample - launch, where
 * y starts at exactly 0 - can never itself be mistaken for a landing.
 *
 * Pure-function style, matching updateCrossingTracker: createLandingDetector()
 * returns a fresh detector; updateLandingDetector() never mutates its input,
 * it returns a new detector object every call.
 *
 * @returns {LandingDetectorState}
 */
export function createLandingDetector() {
  return { prevX: null, prevY: null, prevT: null, landingX: null, landingT: null };
}

/**
 * Feed one more (x, y, t) sample into the detector. Call this once per
 * simulation step, in order, with strictly increasing t.
 *
 * @param {LandingDetectorState} detector
 * @param {number} x
 * @param {number} y
 * @param {number} t
 * @returns {LandingDetectorState} A new detector state (input is never mutated).
 */
export function updateLandingDetector(detector, x, y, t) {
  // Nothing to compare against yet on the very first sample.
  if (detector.prevY === null) {
    return { ...detector, prevX: x, prevY: y, prevT: t };
  }

  const justLanded = detector.landingX === null && detector.prevY > 0 && y <= 0;

  if (!justLanded) {
    // Either already landed (no-op past this point) or no crossing this step.
    return { ...detector, prevX: x, prevY: y, prevT: t };
  }

  // Linear interpolation of the exact moment y == 0 between the two
  // straddling samples. prevY > 0 and y <= 0 here, so the denominator
  // (y - prevY) is always strictly negative, never zero.
  const frac = (0 - detector.prevY) / (y - detector.prevY);
  const landingX = detector.prevX + frac * (x - detector.prevX);
  const landingT = detector.prevT + frac * (t - detector.prevT);

  return { ...detector, prevX: x, prevY: y, prevT: t, landingX, landingT };
}
