import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  stepProjectile,
  launchVelocityFromAngle,
  analyticRange,
  analyticTrajectory,
  percentDifference,
  createLandingDetector,
  updateLandingDetector,
} from './projectilePhysics.js';

describe('projectilePhysics - createInitialState', () => {
  it('starts at the launch point, with the given velocity, at t=0', () => {
    expect(createInitialState(3, 4)).toEqual({ x: 0, y: 0, vx: 3, vy: 4, t: 0 });
  });
});

describe('projectilePhysics - stepProjectile (semi-implicit/symplectic Euler, quadratic drag)', () => {
  it('one step matches a hand-calculated velocity/position (vx=3, vy=4, speed=5)', () => {
    const state = createInitialState(3, 4);
    const gravity = 10;
    const dragCoefficient = 0.1;
    const dt = 0.1;

    const next = stepProjectile(state, gravity, dragCoefficient, dt);

    // speed = 5
    // ax = -0.1*5*3 = -1.5; ay = -10 - 0.1*5*4 = -12
    // vx1 = 3 + (-1.5)*0.1 = 2.85 ; vy1 = 4 + (-12)*0.1 = 2.8   (velocity FIRST)
    expect(next.vx).toBeCloseTo(2.85, 10);
    expect(next.vy).toBeCloseTo(2.8, 10);
    // x1 = 0 + 2.85*0.1 = 0.285 ; y1 = 0 + 2.8*0.1 = 0.28       (position using NEW velocity)
    expect(next.x).toBeCloseTo(0.285, 10);
    expect(next.y).toBeCloseTo(0.28, 10);
    expect(next.t).toBeCloseTo(0.1, 10);
  });

  it('would fail if y used the OLD vertical velocity instead of the new one (catches explicit Euler)', () => {
    // Horizontal-only launch (vy0 = 0): explicit Euler's y update (y + vy0*dt)
    // would leave y completely UNCHANGED after the very first step, since the
    // old vertical velocity is zero. Symplectic Euler must use the
    // already-updated (now nonzero, gravity-pulled) vy, so y must strictly
    // change - negative - even on step one, despite the overall velocity
    // vector being nonzero (vx = 10).
    const state = createInitialState(10, 0);
    const next = stepProjectile(state, 9.8, 0, 1 / 120);

    expect(next.y).not.toBe(0);
    expect(next.y).toBeLessThan(0);
  });

  it('drag reduces speed growth compared to the undragged case - visible on the very FIRST step', () => {
    // Unlike Pendulum's damping term (-damping*omega), which needs omega
    // already nonzero to have any effect, quadratic drag here
    // (-dragCoefficient*speed*vx / vy) depends directly on the CURRENT
    // velocity. Since this state starts with a nonzero velocity (vx=10),
    // drag's effect is observable immediately, on step one - no second step
    // needed.
    const gravity = 9.8;
    const dt = 1 / 120;

    const undragged = stepProjectile(createInitialState(10, 0), gravity, 0, dt);
    const dragged = stepProjectile(createInitialState(10, 0), gravity, 0.05, dt);

    const speedOf = (s) => Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    expect(speedOf(dragged)).toBeLessThan(speedOf(undragged));
  });

  it('is a pure function: never mutates the state object passed in', () => {
    const state = createInitialState(3, 4);
    const snapshot = { ...state };

    stepProjectile(state, 9.8, 0.1, 0.1);

    expect(state).toEqual(snapshot);
  });
});

describe('projectilePhysics - launchVelocityFromAngle', () => {
  it('0 deg: all horizontal', () => {
    const { vx, vy } = launchVelocityFromAngle(20, 0);
    expect(vx).toBeCloseTo(20, 10);
    expect(vy).toBeCloseTo(0, 10);
  });

  it('90 deg: all vertical', () => {
    const { vx, vy } = launchVelocityFromAngle(20, 90);
    expect(vx).toBeCloseTo(0, 10);
    expect(vy).toBeCloseTo(20, 10);
  });

  it('45 deg: horizontal and vertical components are equal', () => {
    const { vx, vy } = launchVelocityFromAngle(20, 45);
    expect(vx).toBeCloseTo(vy, 10);
    expect(vx).toBeCloseTo(20 * Math.SQRT1_2, 10);
  });
});

describe('projectilePhysics - analyticRange / analyticTrajectory', () => {
  it('analyticRange matches speed^2*sin(2*angleRad)/gravity (hand-calculated: 10, 45deg, 10 -> 10)', () => {
    expect(analyticRange(10, 45, 10)).toBeCloseTo(10, 10);
  });

  it('analyticTrajectory starts at the launch point, apexes at the midpoint, lands at (range, 0)', () => {
    const speed = 10;
    const angleDegrees = 45;
    const gravity = 10;
    const points = analyticTrajectory(speed, angleDegrees, gravity, 2); // 3 points: start, apex, landing

    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ x: 0, y: 0 });

    // Apex: x = range/2 = 5, y = (v*sin)^2/(2g) = 2.5
    expect(points[1].x).toBeCloseTo(5, 8);
    expect(points[1].y).toBeCloseTo(2.5, 8);

    // Landing: x = analyticRange(...) = 10, y = 0
    expect(points[2].x).toBeCloseTo(analyticRange(speed, angleDegrees, gravity), 8);
    expect(points[2].y).toBeCloseTo(0, 8);
  });
});

describe('projectilePhysics - percentDifference', () => {
  it('is signed, positive when measured exceeds theoretical', () => {
    expect(percentDifference(11, 10)).toBeCloseTo(10, 10);
    expect(percentDifference(9, 10)).toBeCloseTo(-10, 10);
    expect(percentDifference(10, 10)).toBeCloseTo(0, 10);
  });
});

describe('createLandingDetector/updateLandingDetector - synthetic (non-simulated) trajectory', () => {
  // Hand-built (x, y, t) samples with an exactly known landing crossing
  // between t=3 (y=1) and t=4 (y=-1): frac = (0-1)/(-1-1) = 0.5, so
  // landingT = 3.5, landingX = 3.5 (x also happens to be 3 -> 4 over that step).
  const trajectory = [
    { t: 0, x: 0, y: 0 },
    { t: 1, x: 1, y: 2 },
    { t: 2, x: 2, y: 3 },
    { t: 3, x: 3, y: 1 },
    { t: 4, x: 4, y: -1 },
    { t: 5, x: 5, y: -3 }, // further samples after landing must NOT change landingX/landingT
  ];

  it('interpolates the exact landing x/t between the two straddling samples', () => {
    let detector = createLandingDetector();
    for (const { t, x, y } of trajectory) {
      detector = updateLandingDetector(detector, x, y, t);
    }

    expect(detector.landingX).toBeCloseTo(3.5, 10);
    expect(detector.landingT).toBeCloseTo(3.5, 10);
  });

  it('does not re-trigger or change landingX/landingT once already recorded', () => {
    let detector = createLandingDetector();
    let landingXAfterFirstLanding = null;
    for (const { t, x, y } of trajectory) {
      detector = updateLandingDetector(detector, x, y, t);
      if (detector.landingX !== null && landingXAfterFirstLanding === null) {
        landingXAfterFirstLanding = detector.landingX;
      }
    }

    expect(detector.landingX).toBe(landingXAfterFirstLanding);
  });

  it('the t=0 sample (y=0 exactly) never itself counts as a landing', () => {
    let detector = createLandingDetector();
    detector = updateLandingDetector(detector, 0, 0, 0);
    expect(detector.landingX).toBeNull();
  });

  it('is a pure function: never mutates the detector object passed in', () => {
    let detector = createLandingDetector();
    detector = updateLandingDetector(detector, 1, 2, 1);
    const snapshot = { ...detector };

    updateLandingDetector(detector, 2, -1, 2);

    expect(detector).toEqual(snapshot);
  });
});

describe('projectilePhysics - simulated range vs analytic formula', () => {
  it('zero drag: simulated range matches analyticRange within 1%', () => {
    const speed = 15;
    const angleDegrees = 45;
    const gravity = 9.8;
    const dt = 1 / 120; // matches simLoop's default fixedDt

    const { vx, vy } = launchVelocityFromAngle(speed, angleDegrees);
    let state = createInitialState(vx, vy);
    let detector = createLandingDetector();

    const predicted = analyticRange(speed, angleDegrees, gravity);
    const maxSteps = Math.ceil((10 * speed) / gravity / dt); // comfortably past landing

    for (let i = 0; i < maxSteps && detector.landingX === null; i++) {
      state = stepProjectile(state, gravity, 0, dt);
      detector = updateLandingDetector(detector, state.x, state.y, state.t);
    }

    expect(detector.landingX).not.toBeNull();
    // 1% tolerance, same discretization-error reasoning as Pendulum's period
    // test at the same dt=1/120s (small systematic symplectic-Euler position
    // offset, several orders of magnitude below 1% at this timestep).
    expect(Math.abs(percentDifference(detector.landingX, predicted))).toBeLessThan(1);
  });

  it('with drag: simulated range is measurably SHORTER than the (still drag-free) analytic prediction', () => {
    const speed = 15;
    const angleDegrees = 45;
    const gravity = 9.8;
    const dragCoefficient = 0.1;
    const dt = 1 / 120;

    const { vx, vy } = launchVelocityFromAngle(speed, angleDegrees);
    let state = createInitialState(vx, vy);
    let detector = createLandingDetector();

    const predicted = analyticRange(speed, angleDegrees, gravity);
    const maxSteps = Math.ceil((10 * speed) / gravity / dt);

    for (let i = 0; i < maxSteps && detector.landingX === null; i++) {
      state = stepProjectile(state, gravity, dragCoefficient, dt);
      detector = updateLandingDetector(detector, state.x, state.y, state.t);
    }

    expect(detector.landingX).not.toBeNull();
    // Protects against a regression where drag silently does nothing (which
    // would leave landingX ~= predicted, i.e. this assertion would fail).
    expect(detector.landingX).toBeLessThan(predicted * 0.95);
  });
});
