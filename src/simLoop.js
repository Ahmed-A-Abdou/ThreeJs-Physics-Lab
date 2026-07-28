/**
 * Generic fixed-timestep accumulator loop.
 *
 * Physics must advance in identical, fixed-size chunks regardless of how
 * fast or slow the browser is rendering frames (CLAUDE.md rule 5) - a slow
 * frame must never hand physics one big dt (that would make the symplectic
 * integrator behave differently, and make the sim itself frame-rate
 * dependent), and a fast frame must never be starved of physics steps.
 *
 * This module knows nothing about Experiment, three.js, or which experiment
 * is currently active - it only calls two plain callbacks, `update(dt)` and
 * `render()`, supplied by whoever creates the loop. That keeps simLoop a
 * framework file that never has to change when experiments are added
 * (CLAUDE.md rule 4): main.js is the only place that will ever write
 * `createSimLoop(dt => activeExperiment.update(dt), () => renderer.render(scene, camera))`.
 */

/**
 * @param {(dt: number) => void} update
 *   Called once per fixed timestep, always with exactly `fixedDt` - never a
 *   variable amount, and never the raw frame time.
 * @param {() => void} render
 *   Called exactly once per `step()` call (i.e. once per animation frame),
 *   after every update() call for that frame has run - even if zero
 *   update() calls happened.
 * @param {Object} [options]
 * @param {number} [options.fixedDt=1/120] - Fixed physics timestep, in seconds.
 * @param {number} [options.maxFrameTime=0.25] - Upper bound on elapsed time
 *   accepted per frame, in seconds. Without this, a backgrounded tab (or a
 *   debugger pause) that resumes after e.g. 5 real seconds would otherwise
 *   queue ~5/fixedDt catch-up update() calls before the next render - a
 *   "spiral of death" where each frame takes even longer to catch up.
 * @returns {{
 *   start: () => void,
 *   stop: () => void,
 *   step: (elapsedSeconds: number) => { updateCount: number, accumulator: number },
 * }}
 */
export function createSimLoop(update, render, { fixedDt = 1 / 120, maxFrameTime = 0.25 } = {}) {
  // Banked leftover time that hasn't yet added up to one full fixed step.
  // Lives in this closure - step()'s return value is the only sanctioned
  // way to observe it (used by the tests in simLoop.test.js).
  let accumulator = 0;

  // requestAnimationFrame handle, so stop() can cancel it. null = not running.
  let rafId = null;

  // Timestamp (ms) of the previous frame, from performance.now()/rAF.
  // null means "no previous frame yet" - used to skip computing an elapsed
  // time on the very first frame after start().
  let lastTime = null;

  /**
   * Advance the simulation by exactly `elapsedSeconds` of real time.
   *
   * This is the pure, synchronous core of the loop: given the same starting
   * accumulator and the same elapsedSeconds, it always produces the same
   * number of update() calls and the same leftover accumulator - regardless
   * of whether that elapsedSeconds came from one long frame or the sum of
   * several short ones fed in as separate step() calls. That's what makes
   * the loop frame-rate independent, and it needs no requestAnimationFrame
   * or clock, so it's directly callable from a plain test.
   */
  function step(elapsedSeconds) {
    // Clamp BEFORE adding to the accumulator, so a huge elapsed time can
    // never queue more than `maxFrameTime / fixedDt` catch-up steps.
    const clamped = Math.min(elapsedSeconds, maxFrameTime);
    accumulator += clamped;

    let updateCount = 0;
    while (accumulator >= fixedDt) {
      update(fixedDt); // always the fixed step - never a variable amount
      accumulator -= fixedDt;
      updateCount++;
    }

    // Render once per frame, after physics has caught up - even if zero
    // update() calls happened this frame (accumulator hadn't reached a
    // full step yet).
    render();

    return { updateCount, accumulator };
  }

  /** requestAnimationFrame callback: turns the real clock into elapsedSeconds for step(). */
  function frame(now) {
    if (lastTime === null) {
      // First frame after start(): no previous timestamp to diff against,
      // so record `now` and wait for the next frame instead of stepping
      // with a meaningless elapsed time.
      lastTime = now;
      rafId = requestAnimationFrame(frame);
      return;
    }

    const elapsedSeconds = (now - lastTime) / 1000; // rAF timestamps are milliseconds
    lastTime = now;
    step(elapsedSeconds);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (rafId !== null) return; // already running - don't stack a second rAF chain
    lastTime = null;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    lastTime = null; // so a later start() doesn't diff against a stale timestamp
  }

  return { start, stop, step };
}
