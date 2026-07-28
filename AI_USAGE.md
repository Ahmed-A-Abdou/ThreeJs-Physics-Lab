
- Representative prompts

1- Make an interface (a base contract) that every experiment implements. The framework calls experiments only through this contract, so it never needs to know which specific experiment is running.

The contract has five methods plus a parameter schema.

Methods:

setup(scene, params) — builds the geometry and materials (meshes) for this experiment's objects and adds them to the scene, and initializes the physics state from the starting params. It does NOT start the sim loop and does NOT build any UI — those are the framework's job.

update(dt) — called by the sim loop in fixed time steps (physics decoupled from frame rate). It calls this experiment's pure physics module (a separate file that imports no three.js) to advance the numbers, then copies those new numbers onto the meshes.

getMeasurements() — returns the recorded data for the graph to display, as a labeled structure (a label plus time/value points), so the graph works without knowing which experiment produced it.

reset(params) — called when the user changes a UI control; it restarts the experiment from the current (changed) parameter values, re-initializing both physics state and mesh positions.

dispose() — frees this experiment's geometries and materials and removes its meshes from the scene, so switching experiments causes no memory leaks.

Parameter schema:

Each experiment also exposes a parameter schema: a list of entries, one per adjustable parameter, every entry having the same six fields — key, label, min, max, step, default. The framework's UI panel reads this schema to auto-generate sliders. No experiment builds its own UI.