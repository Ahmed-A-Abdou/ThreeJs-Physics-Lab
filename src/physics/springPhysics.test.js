import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  stepSpring,
  theoreticalFrequency,
  percentDifference,
  createCrossingTracker,
  updateCrossingTracker,
} from './springPhysics.js';

describe('springPhysics - createInitialState', () => {
  it('starts at the given displacement, at rest, at t=0', () => {
    expect(createInitialState(0.5)).toEqual({ x: 0.5, v: 0, t: 0 });
  });
});

describe("springPhysics - stepSpring (semi-implicit/symplectic Euler, Hooke's law)", () => {
  it('one step matches a hand-calculated velocity and displacement (k=10, m=1, x0=0.5)', () => {
    const state = createInitialState(0.5);
    const springConstant = 10;
    const mass = 1;
    const damping = 0;
    const dt = 0.1;

    const next = stepSpring(state, springConstant, mass, damping, dt);

    // acceleration = -(10/1)*0.5 - 0 = -5
    // v1 updates FIRST: v1 = 0 + (-5)*0.1 = -0.5
    expect(next.v).toBeCloseTo(-0.5, 10);
    // x1 updates using the NEW v: x1 = 0.5 + (-0.5)*0.1 = 0.45
    expect(next.x).toBeCloseTo(0.45, 10);
    expect(next.t).toBeCloseTo(0.1, 10);
  });

  it('would fail if x used the OLD velocity instead of the new one (catches explicit Euler)', () => {
    // From rest (v0 = 0) at a nonzero displacement, explicit Euler's position
    // update (x + v0*dt) would leave x completely UNCHANGED after the very
    // first step, since the old velocity is zero. Symplectic Euler must use
    // the already-updated (now nonzero) v, so x must strictly change even on
    // step one.
    const state = createInitialState(0.5);
    const next = stepSpring(state, 10, 1, 0, 1 / 120);

    expect(next.x).not.toBe(0.5);
    expect(next.x).toBeLessThan(0.5); // positive x -> negative acceleration -> x decreases
  });

  it('damping reduces velocity growth compared to the undamped case, once v is nonzero', () => {
    // Damping (-(damping/mass)*v) has NO effect on the very first step from
    // rest, since v0 = 0 - that's correct physics (a velocity-proportional
    // force vanishes at zero velocity), not a bug. So this test takes a
    // second step, by which point v is nonzero and damping's effect is
    // actually observable.
    const springConstant = 10;
    const mass = 1;
    const dt = 1 / 120;

    let undamped = createInitialState(0.6);
    let damped = createInitialState(0.6);
    for (let i = 0; i < 2; i++) {
      undamped = stepSpring(undamped, springConstant, mass, 0, dt);
      damped = stepSpring(damped, springConstant, mass, 1.0, dt);
    }

    expect(Math.abs(damped.v)).toBeLessThan(Math.abs(undamped.v));
  });

  it('is a pure function: never mutates the state object passed in', () => {
    const state = createInitialState(0.5);
    const snapshot = { ...state };

    stepSpring(state, 10, 1, 0.2, 0.1);

    expect(state).toEqual(snapshot);
  });
});

describe('springPhysics - theoreticalFrequency / percentDifference', () => {
  it('theoreticalFrequency matches sqrt(k/m)/(2*pi)', () => {
    expect(theoreticalFrequency(10, 1)).toBeCloseTo(Math.sqrt(10 / 1) / (2 * Math.PI), 10);
  });

  it('percentDifference is signed, positive when measured exceeds theoretical', () => {
    expect(percentDifference(11, 10)).toBeCloseTo(10, 10);
    expect(percentDifference(9, 10)).toBeCloseTo(-10, 10);
    expect(percentDifference(10, 10)).toBeCloseTo(0, 10);
  });
});

describe('createCrossingTracker/updateCrossingTracker - direction filtering (the x2 bug guard)', () => {
  // Hand-constructed trajectory (NOT a real spring simulation) with exactly
  // known zero-crossing times, alternating descending/ascending like a real
  // oscillation: descending crossing at t=1.5, ascending at t=4.5, descending
  // again at t=7.5. A full period is descending-to-descending: 7.5-1.5=6.0.
  // The classic x2 bug (treating ANY consecutive crossing pair as a period)
  // would instead report 4.5-1.5=3.0 - exactly HALF the true period.
  const trajectory = [
    { t: 0, x: 2 }, { t: 1, x: 1 }, { t: 2, x: -1 }, { t: 3, x: -2 },
    { t: 4, x: -1 }, { t: 5, x: 1 }, { t: 6, x: 2 }, { t: 7, x: 1 },
    { t: 8, x: -1 },
  ];

  it('only recording "down" crossings measures the FULL period (6.0), not the half-period (3.0)', () => {
    let tracker = createCrossingTracker('down');
    for (const { t, x } of trajectory) {
      tracker = updateCrossingTracker(tracker, x, t);
    }

    expect(tracker.lastCrossingT).toBeCloseTo(7.5, 10);
    expect(tracker.lastPeriod).toBeCloseTo(6.0, 10);
    expect(tracker.lastPeriod).not.toBeCloseTo(3.0, 1); // explicit guard against the x2 bug's half-period value
  });

  it('only recording "up" crossings ignores the "down" ones entirely', () => {
    let tracker = createCrossingTracker('up');
    for (const { t, x } of trajectory) {
      tracker = updateCrossingTracker(tracker, x, t);
    }

    // Only one "up" crossing occurs in this trajectory (at t=4.5) - a second
    // would need more samples, so no period is measurable yet.
    expect(tracker.lastCrossingT).toBeCloseTo(4.5, 10);
    expect(tracker.lastPeriod).toBeNull();
  });
});

describe('springPhysics - measured frequency vs theory (zero damping - amplitude independence)', () => {
  // Both tests below use damping=0 and are expected to CLOSELY match theory
  // regardless of amplitude - a linear spring is isochronous (see
  // theoreticalFrequency()'s doc comment). This is the structural OPPOSITE
  // of Pendulum's large-angle test, which specifically expects and asserts
  // LARGE divergence at large initial angle - do not conflate the two.

  function measureFrequency(initialDisplacement, springConstant, mass, damping, dt) {
    let state = createInitialState(initialDisplacement);
    // initialDisplacement > 0 -> first crossing is descending.
    let tracker = createCrossingTracker('down');
    const theoreticalPeriod = 1 / theoreticalFrequency(springConstant, mass);
    const maxSteps = Math.ceil((3 * theoreticalPeriod) / dt); // comfortably past two full periods

    for (let i = 0; i < maxSteps && tracker.lastPeriod === null; i++) {
      state = stepSpring(state, springConstant, mass, damping, dt);
      tracker = updateCrossingTracker(tracker, state.x, state.t);
    }

    expect(tracker.lastPeriod).not.toBeNull();
    return 1 / tracker.lastPeriod;
  }

  it('SMALL initial displacement, zero damping: measured frequency closely matches theory', () => {
    const springConstant = 10;
    const mass = 1;
    const dt = 1 / 120; // matches simLoop's default fixedDt
    const theoretical = theoreticalFrequency(springConstant, mass);

    const measured = measureFrequency(0.05, springConstant, mass, 0, dt);

    // 1% is generous relative to the actual error sources here (symplectic-
    // Euler frequency shift and interpolation residual are both orders of
    // magnitude smaller at this dt), so this catches a genuinely broken
    // integrator or crossing tracker without being flaky over discretization noise.
    expect(Math.abs(percentDifference(measured, theoretical))).toBeLessThan(1);
  });

  it('LARGE initial displacement, zero damping: measured frequency STILL closely matches theory (isochronism)', () => {
    // This is the key physical-difference-from-Pendulum test: unlike a
    // pendulum's real (sin(theta)) equation, Hooke's law is EXACTLY linear,
    // so amplitude must not measurably affect frequency. If this ever failed
    // while the small-displacement test passed, that would indicate a
    // non-linear term accidentally introduced into stepSpring().
    const springConstant = 10;
    const mass = 1;
    const dt = 1 / 120;
    const theoretical = theoreticalFrequency(springConstant, mass);

    const measured = measureFrequency(1.8, springConstant, mass, 0, dt);

    expect(Math.abs(percentDifference(measured, theoretical))).toBeLessThan(1);
  });

  it('with damping > 0: measured frequency reads LOWER than the undamped theoretical frequency', () => {
    // Real damped-oscillator physics (see theoreticalFrequency()'s doc
    // comment): energy loss lowers the effective oscillation frequency below
    // the undamped natural frequency - not a bug. damping=1 here stays well
    // underdamped for k=10/m=1 (critical damping would be 2*sqrt(k*m)=6.32),
    // so the system still oscillates and a period is still measurable.
    const springConstant = 10;
    const mass = 1;
    const dt = 1 / 120;
    const theoretical = theoreticalFrequency(springConstant, mass);

    const measured = measureFrequency(1, springConstant, mass, 1, dt);

    expect(percentDifference(measured, theoretical)).toBeLessThan(0);
  });
});
