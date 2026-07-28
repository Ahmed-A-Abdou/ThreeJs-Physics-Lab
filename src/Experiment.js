/**
 * @typedef {Object} ParameterSchemaEntry
 * @property {string} key     - Property name on the params object this entry controls.
 * @property {string} label   - Human-readable name shown next to the slider.
 * @property {number} min     - Minimum slider value.
 * @property {number} max     - Maximum slider value.
 * @property {number} step    - Slider increment.
 * @property {number} default - Starting value; also what the slider is initialized to.
 */

/**
 * @typedef {Object} MeasurementPoint
 * @property {number} t     - Simulation time, in seconds, when this sample was taken.
 * @property {number} value - The recorded quantity (angle, height, displacement, ...).
 */

/**
 * @typedef {Object} Measurements
 * @property {string} label             - Series name for the graph's legend/axis.
 * @property {MeasurementPoint[]} points - Recorded (time, value) samples to plot.
 */

/**
 * Abstract base class for every experiment (Pendulum, Projectile, Spring, ...).
 *
 * The framework (simLoop, UIPanel, Graph, registry) only ever talks to an
 * experiment through this contract - it calls setup(), update(), reset(),
 * dispose(), getMeasurements(), and reads parameterSchema, without knowing
 * which concrete experiment it's holding. That polymorphism is what lets a
 * new experiment be added with one experiment file, one physics file, and
 * one registry line, without touching this file or any other framework file.
 *
 * Experiment describes the shape every experiment must have; it is never
 * instantiated on its own.
 */
export class Experiment {
  /** Instance methods every subclass must override. Used by the constructor
   *  guard below to fail fast at construction time instead of waiting for
   *  the framework to call whichever method happens to be missing. */
  static REQUIRED_METHODS = ['setup', 'update', 'getMeasurements', 'reset', 'dispose'];

  /**
   * This experiment's adjustable parameters. Every subclass must override
   * this with its own `static get parameterSchema()`.
   *
   * Static (not an instance getter) because the framework needs default
   * values before any instance exists - to build the initial `params`
   * object passed into setup(), and to render sliders for an experiment
   * that may not even be the active one yet.
   *
   * @returns {ParameterSchemaEntry[]}
   */
  static get parameterSchema() {
    throw new Error(`${this.name} must implement a static "parameterSchema" getter.`);
  }

  constructor() {
    // Experiment is a contract, not a usable object - block `new Experiment()`.
    // new.target is the subclass being constructed (e.g. Pendulum) for
    // `new Pendulum()`, and Experiment itself for `new Experiment()`.
    if (new.target === Experiment) {
      throw new Error(
        'Experiment is abstract and cannot be instantiated directly - ' +
        'subclass it instead (e.g. class Pendulum extends Experiment).'
      );
    }

    // Catch a subclass that forgot one of the five required methods right
    // now, at construction, instead of later when simLoop happens to call
    // the missing one. If a method was never overridden, `this[method]`
    // still resolves to the throwing stub on Experiment.prototype.
    for (const method of Experiment.REQUIRED_METHODS) {
      if (this[method] === Experiment.prototype[method]) {
        throw new Error(`${this.constructor.name} must implement "${method}(...)".`);
      }
    }
  }

  /**
   * Build this experiment's geometry/materials/meshes and add them to the
   * scene. Initialize physics state from the starting params. Called once,
   * when the experiment is selected. Must NOT start the sim loop and must
   * NOT build any UI - the framework owns both of those.
   *
   * @param {import('three').Scene} scene
   * @param {Object} params - Initial parameter values (from parameterSchema defaults).
   */
  setup(scene, params) {
    throw new Error(`${this.constructor.name} must implement setup(scene, params).`);
  }

  /**
   * Advance the simulation by one fixed timestep. Delegates the math to
   * this experiment's physics module (plain numbers in, plain numbers out -
   * no three.js in that module), then copies the resulting numbers onto the
   * meshes created in setup(). Called by simLoop at a fixed dt, decoupled
   * from render rate - never pass frame delta time in here.
   *
   * @param {number} dt - Fixed timestep in seconds.
   */
  update(dt) {
    throw new Error(`${this.constructor.name} must implement update(dt).`);
  }

  /**
   * Recorded data for the Graph to plot. The framework never knows what
   * quantity this is - only that it gets a label and a series of (t, value)
   * points.
   *
   * @returns {Measurements}
   */
  getMeasurements() {
    throw new Error(`${this.constructor.name} must implement getMeasurements().`);
  }

  /**
   * Restart the experiment from new parameter values (e.g. after the user
   * moves a slider). Meshes already exist from setup() - reset() only
   * re-initializes physics state and mesh positions/orientations, it never
   * rebuilds geometry or materials.
   *
   * @param {Object} params - Updated parameter values.
   */
  reset(params) {
    throw new Error(`${this.constructor.name} must implement reset(params).`);
  }

  /**
   * Free this experiment's geometries/materials and remove its meshes from
   * the scene. Called when switching away from this experiment, so nothing
   * it created is left behind.
   */
  dispose() {
    throw new Error(`${this.constructor.name} must implement dispose().`);
  }
}
