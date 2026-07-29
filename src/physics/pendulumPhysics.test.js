import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  stepPendulum,
  theoreticalPeriod,
  percentDifference,
  createCrossingTracker,
  updateCrossingTracker,
} from './pendulumPhysics.js';

describe('pendulumPhysics - createInitialState', () => {
  it('starts at the given angle, at rest, at t=0', () => {
    expect(createInitialState(0.5)).toEqual({ theta: 0.5, omega: 0, t: 0 });
  });
});

describe('pendulumPhysics - stepPendulum (semi-implicit/symplectic Euler, real sin(theta))', () => {
  it('one step matches a hand-calculated angular velocity and angle (theta0 = pi/6, sin = 0.5)', () => {
    const state = createInitialState(Math.PI / 6);
    const gravity = 10;
    const length = 2;
    const damping = 0;
    const dt = 0.1;

    const next = stepPendulum(state, gravity, length, damping, dt);

    // alpha = -(g/L)*sin(pi/6) = -(10/2)*0.5 = -2.5
    // omega1 updates FIRST: omega1 = 0 + alpha*dt = -0.25
    expect(next.omega).toBeCloseTo(-0.25, 10);
    // theta1 updates using the NEW omega: theta1 = pi/6 + (-0.25)*0.1
    expect(next.theta).toBeCloseTo(Math.PI / 6 - 0.025, 10);
    expect(next.t).toBeCloseTo(0.1, 10);
  });

  it('would fail if angle used the OLD angular velocity instead of the new one (catches explicit Euler)', () => {
    // From rest (omega0 = 0) at a nonzero angle, explicit Euler's angle
    // update (theta + omega0*dt) would leave theta completely UNCHANGED
    // after the very first step, since the old omega is zero. Symplectic
    // Euler must use the already-updated (now nonzero) omega, so theta must
    // strictly change even on step one.
    const state = createInitialState(0.5);
    const next = stepPendulum(state, 9.8, 1.5, 0, 1 / 120);

    expect(next.theta).not.toBe(0.5);
    expect(next.theta).toBeLessThan(0.5); // positive theta -> negative alpha -> theta decreases
  });

  it('damping reduces angular-velocity growth compared to the undamped case, once omega is nonzero', () => {
    // Damping (-damping*omega) has NO effect on the very first step from
    // rest, since omega0 = 0 - that's correct physics (a velocity-
    // proportional force vanishes at zero velocity), not a bug. So this
    // test takes a second step, by which point omega is nonzero and
    // damping's effect is actually observable.
    const gravity = 9.8;
    const length = 1.5;
    const dt = 1 / 120;

    let undamped = createInitialState(0.6);
    let damped = createInitialState(0.6);
    for (let i = 0; i < 2; i++) {
      undamped = stepPendulum(undamped, gravity, length, 0, dt);
      damped = stepPendulum(damped, gravity, length, 1.5, dt);
    }

    expect(Math.abs(damped.omega)).toBeLessThan(Math.abs(undamped.omega));
  });

  it('is a pure function: never mutates the state object passed in', () => {
    const state = createInitialState(0.5);
    const snapshot = { ...state };

    stepPendulum(state, 9.8, 1.5, 0.2, 0.1);

    expect(state).toEqual(snapshot);
  });
});

describe('pendulumPhysics - theoreticalPeriod / percentDifference', () => {
  it('theoreticalPeriod matches 2*pi*sqrt(L/g)', () => {
    expect(theoreticalPeriod(1, 9.8)).toBeCloseTo(2 * Math.PI * Math.sqrt(1 / 9.8), 10);
  });

  it('percentDifference is signed, positive when measured exceeds theoretical', () => {
    expect(percentDifference(11, 10)).toBeCloseTo(10, 10);
    expect(percentDifference(9, 10)).toBeCloseTo(-10, 10);
    expect(percentDifference(10, 10)).toBeCloseTo(0, 10);
  });
});

describe('createCrossingTracker/updateCrossingTracker - direction filtering (the x2 bug guard)', () => {
  // Hand-constructed trajectory (NOT a real pendulum simulation) with exactly
  // known zero-crossing times, alternating descending/ascending like a real
  // swing: descending crossing at t=1.5, ascending at t=4.5, descending again
  // at t=7.5. A full period is descending-to-descending: 7.5 - 1.5 = 6.0.
  // The classic x2 bug (treating ANY consecutive crossing pair as a period)
  // would instead report 4.5 - 1.5 = 3.0 - exactly HALF the true period.
  const trajectory = [
    { t: 0, theta: 2 }, { t: 1, theta: 1 }, { t: 2, theta: -1 }, { t: 3, theta: -2 },
    { t: 4, theta: -1 }, { t: 5, theta: 1 }, { t: 6, theta: 2 }, { t: 7, theta: 1 },
    { t: 8, theta: -1 },
  ];

  it('only recording "down" crossings measures the FULL period (6.0), not the half-period (3.0)', () => {
    let tracker = createCrossingTracker('down');
    for (const { t, theta } of trajectory) {
      tracker = updateCrossingTracker(tracker, theta, t);
    }

    expect(tracker.lastCrossingT).toBeCloseTo(7.5, 10);
    expect(tracker.lastPeriod).toBeCloseTo(6.0, 10);
    expect(tracker.lastPeriod).not.toBeCloseTo(3.0, 1); // explicit guard against the x2 bug's half-period value
  });

  it('only recording "up" crossings ignores the "down" ones entirely', () => {
    let tracker = createCrossingTracker('up');
    for (const { t, theta } of trajectory) {
      tracker = updateCrossingTracker(tracker, theta, t);
    }

    // Only one "up" crossing occurs in this trajectory (at t=4.5) - a second
    // would need more samples, so no period is measurable yet.
    expect(tracker.lastCrossingT).toBeCloseTo(4.5, 10);
    expect(tracker.lastPeriod).toBeNull();
  });

  it('naive "any consecutive crossing" logic would produce the half-period (3.0) - what this tracker avoids', () => {
    // Inline, deliberately-naive reference implementation: records EVERY
    // zero-crossing regardless of direction. This is the bug the real
    // tracker is designed not to have.
    let prevTheta = trajectory[0].theta;
    let prevT = trajectory[0].t;
    const rawCrossingTimes = [];
    for (const { t, theta } of trajectory.slice(1)) {
      if ((prevTheta > 0 && theta <= 0) || (prevTheta < 0 && theta >= 0)) {
        rawCrossingTimes.push(prevT + (t - prevT) * (0 - prevTheta) / (theta - prevTheta));
      }
      prevTheta = theta;
      prevT = t;
    }
    const rawIntervals = rawCrossingTimes.slice(1).map((ct, i) => ct - rawCrossingTimes[i]);

    expect(rawCrossingTimes).toEqual([1.5, 4.5, 7.5]);
    expect(rawIntervals).toEqual([3.0, 3.0]); // half the true period, every time
  });
});

describe('pendulumPhysics - measured period vs theory (small angle, zero damping)', () => {
  it('two consecutive same-direction crossings measure a period close to 2*pi*sqrt(L/g)', () => {
    const length = 1.5;
    const gravity = 9.8;
    const damping = 0;
    const dt = 1 / 120; // matches simLoop's default fixedDt
    const initialAngle = 0.05; // small enough for the linearized formula to be a fair comparison

    let state = createInitialState(initialAngle);
    let tracker = createCrossingTracker('down'); // starts positive -> first crossing is descending
    const theoretical = theoreticalPeriod(length, gravity);
    const maxSteps = Math.ceil((3 * theoretical) / dt); // comfortably past two full periods

    for (let i = 0; i < maxSteps && tracker.lastPeriod === null; i++) {
      state = stepPendulum(state, gravity, length, damping, dt);
      tracker = updateCrossingTracker(tracker, state.theta, state.t);
    }

    expect(tracker.lastPeriod).not.toBeNull();
    // 1% is generous relative to the actual error sources here (symplectic-
    // Euler frequency shift ~O((omega0*dt)^2) and small-angle residual are
    // both several orders of magnitude smaller at this dt/angle), so this
    // catches a genuinely broken integrator or crossing tracker without
    // being flaky over discretization noise.
    expect(Math.abs(percentDifference(tracker.lastPeriod, theoretical))).toBeLessThan(1);
  });

  it('a large initial angle measures a period clearly LONGER than theory (real sin(theta), not a bug)', () => {
    // This protects CLAUDE.md rule 7: if stepPendulum ever silently used
    // "theta" instead of "Math.sin(theta)", this gap would vanish.
    const length = 1.5;
    const gravity = 9.8;
    const damping = 0;
    const dt = 1 / 120;
    const initialAngle = 2.5; // large amplitude, well outside small-angle validity

    let state = createInitialState(initialAngle);
    let tracker = createCrossingTracker('down');
    const theoretical = theoreticalPeriod(length, gravity);
    const maxSteps = Math.ceil((5 * theoretical) / dt); // large-angle period is longer; extra headroom

    for (let i = 0; i < maxSteps && tracker.lastPeriod === null; i++) {
      state = stepPendulum(state, gravity, length, damping, dt);
      tracker = updateCrossingTracker(tracker, state.theta, state.t);
    }

    expect(tracker.lastPeriod).not.toBeNull();
    // Expected, correct physics (see theoreticalPeriod()'s doc comment) -
    // not a discrepancy to fix.
    expect(percentDifference(tracker.lastPeriod, theoretical)).toBeGreaterThan(10);
  });
});
