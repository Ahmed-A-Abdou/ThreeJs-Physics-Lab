# Project: Three.js Physics Experiments Suite

## What this is
A physics-lab platform: three experiments (pendulum, projectile, spring)
running on one shared framework. The architecture is the point — experiments
are interchangeable modules sharing a common interface. Assessment for a
mid-level 3D dev role; graded on architecture, physics correctness, and
AI-extensibility.

## Hard architectural rules (do not violate)

1. Physics modules must import NOTHING from three.js. They are pure math:
   numbers in, numbers out, unit-testable without a browser. If a physics
   file imports three, that is a bug.

2. Rendering reads from physics state; physics never reaches into rendering.
   The experiment class calls its physics module, then copies results onto
   meshes. One-directional.

3. Never build per-experiment UI. The UIPanel reads a parameter schema and
   auto-generates sliders. If you find yourself writing UI code specific to
   one experiment, stop — that is wrong.

4. Adding a new experiment must touch only: one new experiment file, one new
   physics file, and one line in the registry. If a change requires editing
   any framework file (simLoop, UIPanel, Graph, main, Experiment), flag it —
   that means the architecture is leaking.

5. The simulation uses a fixed-timestep accumulator loop, decoupled from
   render. Physics steps at a fixed dt regardless of frame rate. Never couple
   physics dt to frame time.

6. Integrator: semi-implicit (symplectic) Euler — update velocity first, then
   position using the NEW velocity. Never explicit Euler (position before
   velocity) for oscillators; it injects energy and breaks conservation.

7. Use the real equation of motion (e.g. sin(theta) for the pendulum), never
   the small-angle approximation.

## Working style
- Build one file at a time. Explain what each file does as you write it.
- I must understand every line — there is a live review where I defend the
  code. Do not build things without explaining them.
- Commit after each meaningful piece with a message explaining WHY, not just
  what.

## Rules added during the build

- registry.test.js must NOT hardcode the experiment count (e.g.
  `expect(EXPERIMENTS.length).toBe(3)`). Every time an experiment was added
  or removed, this assertion went stale and had to be manually bumped.
  Derive expectations from the registry itself, or assert on specific
  entries by key, so the test survives adding/removing experiments without
  a manual edit.