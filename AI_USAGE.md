- Tools and Models
    Sonnet 5 with claude code (high effort)
    Planning and Architecting With Opus 4.8 (high effort)


-what did you set up before writing any code, and
why?

- i started planning with opus 4.8 and achitecting in my notebook and once i understood the full process along with the actual experimental formulas, then i moved to implementing the project.

why? 
- because this i what i do when i get assigned to something new, even if its a gameplay system in unity (which is my current tech stack), i like to plan it thoroughly beforehand, by asking a friend who made something similar or planing it with ai by using descriptive and clear prompts, and  i make sure that i understand everything ranging from the whole architecture to the interactions between each subsystem or script (as much as possible ofcourse without taking too much time). then i start implementing the actual task.

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



2- I want you to create the registry.js.
This file will contain a list of all available experiments.
The "Framework" will use this file to answer one question: What can i run ? 
This means that any new experiment must be added to this list.
This Class MUST not contain any experiment Logic.

3- Create Graph.js 
it will read the getMeasurement() and plot time/value points on a 2d canvas overlay 
and exports csv
it must read the labeled structure from getMeasurements() ({label, points: [{t,value}]})
it will plot whatever quantity its handed and uses label for the axis 
it pllots value vs a time as a line 
csv export button dumps the recorded points to a file 
no experiment- specific logic, it must work with any measurement it receives 
the graph can plot data every frame and it can plot the full history of the whole experiment


4- now create the projectile.js 
same as the other experiment structures
ensure the following 
Physics: 2D position (x, y), velocity, gravity pulling y down, optional drag force opposing velocity. Semi-implicit Euler.
The analytic prediction: compute the drag-free parabola + landing range from a formula, draw as dotted curve.
On launch: simulate actual flight (with drag if enabled), mark landing point, compare predicted vs actual range.
Params/schema: launch angle, initial speed, gravity, drag coefficient (the brief's four).|



- what I wrote/edited by hand

1- Deleted the Throwaway Experiment and removed its physics test and registry entry.