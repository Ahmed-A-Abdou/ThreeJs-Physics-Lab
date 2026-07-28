import { describe, it, expect, vi } from 'vitest';
import { createSimLoop } from './simLoop.js';

describe('createSimLoop - step()', () => {
  it('always calls update with exactly the fixed dt, never a variable amount', () => {
    const fixedDt = 0.1;
    const update = vi.fn();
    const render = vi.fn();
    const { step } = createSimLoop(update, render, { fixedDt, maxFrameTime: 10 });

    // Deliberately irregular elapsed times - a fixed dt must come out the
    // other side regardless of how uneven the input frame times are.
    step(0.34);
    step(0.07);
    step(1.29);

    expect(update.mock.calls.length).toBeGreaterThan(0);
    for (const args of update.mock.calls) {
      expect(args).toEqual([fixedDt]);
    }
  });

  it('calls render exactly once per step(), whether zero or many update() calls happened', () => {
    const fixedDt = 0.1;
    const update = vi.fn();
    const render = vi.fn();
    const { step } = createSimLoop(update, render, { fixedDt, maxFrameTime: 10 });

    step(0.05); // < fixedDt: zero update() calls this frame
    expect(update).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);

    step(0.5); // several update() calls this frame
    expect(update.mock.calls.length).toBeGreaterThan(0);
    expect(render).toHaveBeenCalledTimes(2); // still exactly one more render call

    step(0); // zero elapsed time -> zero additional update() calls
    expect(render).toHaveBeenCalledTimes(3); // still exactly one more render call
  });

  it('clamps a huge elapsed time: at most maxFrameTime/fixedDt updates run, never floor(elapsed/fixedDt)', () => {
    const fixedDt = 0.0625; // 1/16 s - a power of two, exact in floating point
    const maxFrameTime = 0.25; // spec's example clamp
    const update = vi.fn();
    const render = vi.fn();
    const { step } = createSimLoop(update, render, { fixedDt, maxFrameTime });

    const { updateCount, accumulator } = step(5); // e.g. tab was backgrounded for 5s

    const expectedMax = Math.floor(maxFrameTime / fixedDt); // 4
    const unclamped = Math.floor(5 / fixedDt); // 80 - what an unclamped loop would run

    expect(expectedMax).toBe(4);
    expect(updateCount).toBe(expectedMax);
    expect(updateCount).not.toBe(unclamped);
    expect(accumulator).toBe(0); // 0.25 divides fixedDt evenly - nothing left over
    expect(render).toHaveBeenCalledTimes(1); // still exactly one render for this one step() call
  });
});

describe('createSimLoop - frame-rate independence', () => {
  // fixedDt and every increment below are exact negative powers of two
  // (0.125 = 1/8, 0.5 = 1/2, 0.0625 = 1/16), so they're exactly
  // representable in IEEE-754 floating point. That removes floating-point
  // rounding as a variable and lets these tests use exact equality instead
  // of an approximate/epsilon comparison.
  const fixedDt = 0.125;
  const maxFrameTime = 10; // far above every increment below, so the clamp never interferes here

  function run(frameSizes) {
    const update = vi.fn();
    const render = vi.fn();
    const { step } = createSimLoop(update, render, { fixedDt, maxFrameTime });
    let last;
    for (const size of frameSizes) last = step(size);
    return { totalUpdates: update.mock.calls.length, finalAccumulator: last.accumulator };
  }

  it('same total elapsed time -> same update count and leftover accumulator (evenly divisible case)', () => {
    // Both scenarios total exactly 2.0s of elapsed real time.
    const manySmallFrames = Array(16).fill(0.125); // a fast machine: 16 tiny frames
    const fewLargeFrames = Array(4).fill(0.5);      // a slow/janky machine: 4 big frames

    const resultA = run(manySmallFrames);
    const resultB = run(fewLargeFrames);

    expect(resultA.totalUpdates).toBe(16);
    expect(resultB.totalUpdates).toBe(16);
    expect(resultA.totalUpdates).toBe(resultB.totalUpdates);
    expect(resultA.finalAccumulator).toBe(0);
    expect(resultA.finalAccumulator).toBe(resultB.finalAccumulator);
  });

  it('same total elapsed time -> same update count and leftover accumulator (with a remainder)', () => {
    // Both scenarios total exactly 2.0625s of elapsed real time.
    const manySmallFrames = [...Array(16).fill(0.125), 0.0625];
    const fewLargeFrames = [...Array(4).fill(0.5), 0.0625];

    const resultA = run(manySmallFrames);
    const resultB = run(fewLargeFrames);

    expect(resultA.totalUpdates).toBe(16); // 2.0625 / 0.125 = 16.5 -> 16 full steps
    expect(resultA.totalUpdates).toBe(resultB.totalUpdates);
    expect(resultA.finalAccumulator).toBe(0.0625);
    expect(resultA.finalAccumulator).toBe(resultB.finalAccumulator);
  });
});
