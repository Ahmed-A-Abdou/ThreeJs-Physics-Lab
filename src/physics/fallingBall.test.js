import { describe, it, expect } from 'vitest';
import { createInitialState, stepFallingBall } from './fallingBall.js';

describe('fallingBall physics - createInitialState', () => {
  it('starts at the given height, at rest, at t=0', () => {
    expect(createInitialState(10)).toEqual({ height: 10, velocity: 0, t: 0 });
  });
});

describe('fallingBall physics - stepFallingBall (semi-implicit/symplectic Euler)', () => {
  it('one step matches a hand-calculated velocity and height', () => {
    const state = createInitialState(10);
    const gravity = 10;
    const dt = 0.1;

    const next = stepFallingBall(state, gravity, dt);

    // velocity updates FIRST: v1 = v0 - gravity*dt = 0 - 10*0.1 = -1
    expect(next.velocity).toBeCloseTo(-1, 10);
    // position updates using the NEW velocity: h1 = h0 + v1*dt = 10 + (-1*0.1) = 9.9
    expect(next.height).toBeCloseTo(9.9, 10);
    expect(next.t).toBeCloseTo(0.1, 10);
  });

  it('would fail if position used the OLD velocity instead of the new one (catches explicit Euler)', () => {
    // From rest (v0 = 0), explicit Euler's position update (h + v0*dt) would
    // leave height completely UNCHANGED after the very first step, since the
    // old velocity is zero. Symplectic Euler must use the already-updated
    // (now negative) velocity, so height strictly decreases even on step one.
    const state = createInitialState(10);
    const next = stepFallingBall(state, 10, 0.1);

    expect(next.height).not.toBe(10);
    expect(next.height).toBeLessThan(10);
  });

  it('accumulates velocity linearly: after N steps, velocity == -gravity * N * dt (exact, power-of-two dt)', () => {
    // dt and gravity chosen as exact binary values (same precedent as
    // simLoop.test.js) so equality can be exact instead of approximate.
    const gravity = 8;
    const dt = 0.125; // 1/8 - exact in IEEE-754
    let state = createInitialState(20);

    const N = 6;
    for (let i = 0; i < N; i++) {
      state = stepFallingBall(state, gravity, dt);
    }

    expect(state.velocity).toBe(-gravity * N * dt); // -6
    expect(state.t).toBe(N * dt); // 0.75
  });

  it('height decreases monotonically every step while gravity is positive', () => {
    const gravity = 9.8;
    const dt = 1 / 120; // matches simLoop's default fixedDt
    let state = createInitialState(15);

    for (let i = 0; i < 200; i++) {
      const prev = state;
      state = stepFallingBall(state, gravity, dt);
      expect(state.height).toBeLessThan(prev.height);
    }
  });

  it('is a pure function: never mutates the state object passed in', () => {
    const state = createInitialState(10);
    const snapshot = { ...state };

    stepFallingBall(state, 9.8, 0.1);

    expect(state).toEqual(snapshot);
  });
});
