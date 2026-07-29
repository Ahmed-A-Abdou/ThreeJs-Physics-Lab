/**
 * @typedef {import('./Experiment.js').ParameterSchemaEntry} ParameterSchemaEntry
 * @typedef {import('./registry.js').ExperimentRegistryEntry} ExperimentRegistryEntry
 */

/**
 * Schema-driven control panel: one labeled <input type="range"> per entry in
 * an experiment's parameterSchema, auto-generated - never hand-built per
 * experiment (CLAUDE.md rule 3). This file contains no experiment-specific
 * logic and never imports a concrete Experiment subclass; it only knows the
 * generic ParameterSchemaEntry/ExperimentRegistryEntry shapes (type-only,
 * via JSDoc - same precedent as registry.js).
 *
 * Lifecycle (owned by a future main.js, not built here):
 *
 *   const entry = getExperiment(key);             // registry.js
 *   const params = uiPanel.loadExperiment(entry);  // build sliders + params
 *   const experiment = new entry.ExperimentClass();
 *   experiment.setup(scene, params);               // params existed before this instance did
 *   uiPanel.bindExperiment(experiment);             // now sliders can call reset()
 *
 * loadExperiment() and bindExperiment() are deliberately two calls, not one:
 * params must exist before the experiment instance is constructed (params is
 * an input to setup()), but the instance doesn't exist until after that -
 * there is no single moment where both a schema and an instance are
 * simultaneously available as inputs to one method.
 */
export class UIPanel {
  /**
   * @param {HTMLElement} container - Element this panel renders into. Owned
   *   by the caller (future main.js) - this file never touches index.html.
   */
  constructor(container) {
    this.container = container;

    // Built once, up front, so "clear and rebuild" only ever touches
    // controlsWrapper's children - never the heading, never container itself.
    this.heading = document.createElement('h2');
    this.heading.className = 'ui-panel__heading';

    this.controlsWrapper = document.createElement('div');
    this.controlsWrapper.className = 'ui-panel__controls';

    this.container.append(this.heading, this.controlsWrapper);

    /** Keyed by each schema entry's `key`; empty until loadExperiment() runs. */
    this.params = {};

    /** The instance reset() is called on. Null until bindExperiment() runs. */
    this.activeExperiment = null;
  }

  /**
   * Rebuild this panel for a newly-selected experiment. Reads the schema
   * from the registry entry's ExperimentClass (a static getter - no
   * instance needed yet), replaces every old control, and seeds a fresh
   * params object from each entry's default.
   *
   * @param {ExperimentRegistryEntry} entry
   * @returns {Object} params - to be passed into `new entry.ExperimentClass().setup(scene, params)`.
   */
  loadExperiment(entry) {
    // The old binding belongs to whatever experiment was active before this
    // call - it's about to be replaced, so drop it now rather than risk a
    // slider (somehow) firing reset() on a stale/disposed instance.
    this.activeExperiment = null;

    this.heading.textContent = entry.label;

    // One call clears every old control - no manually-tracked element list.
    this.controlsWrapper.replaceChildren();

    const schema = entry.ExperimentClass.parameterSchema;
    this.params = {};

    for (const schemaEntry of schema) {
      this.params[schemaEntry.key] = schemaEntry.default;
      this.controlsWrapper.appendChild(this._buildControl(schemaEntry));
    }

    return this.params;
  }

  /**
   * Bind the now-constructed experiment instance so future slider changes
   * call its reset(). Called after setup(), once the instance exists.
   *
   * @param {import('./Experiment.js').Experiment} experiment
   */
  bindExperiment(experiment) {
    this.activeExperiment = experiment;
  }

  /**
   * Build one labeled range input (+ live value readout) for a single
   * schema entry, wired to update params and call reset() on change.
   *
   * @param {ParameterSchemaEntry} schemaEntry
   * @returns {HTMLElement}
   */
  _buildControl(schemaEntry) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ui-panel__control';

    const label = document.createElement('label');
    label.className = 'ui-panel__control-label';
    label.textContent = schemaEntry.label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(schemaEntry.min);
    input.max = String(schemaEntry.max);
    input.step = String(schemaEntry.step);
    input.value = String(schemaEntry.default);

    // A range input shows no value on its own - this is the standard,
    // generic (not experiment-specific) fix: a live numeric readout.
    const readout = document.createElement('output');
    readout.className = 'ui-panel__control-value';
    readout.textContent = String(schemaEntry.default);

    label.appendChild(input);

    input.addEventListener('input', () => {
      // input.value is always a string - the params object must hold numbers.
      const value = Number(input.value);
      this.params[schemaEntry.key] = value;
      readout.textContent = String(value);

      if (!this.activeExperiment) {
        // Shouldn't happen in the normal load -> setup -> bind flow, but if
        // a caller forgets bindExperiment(), surface it loudly instead of
        // silently dropping the change - console.warn (not a thrown error:
        // an exception here wouldn't propagate to the caller of
        // dispatchEvent anyway, so it would only be noisy, not useful).
        console.warn(
          `UIPanel: slider "${schemaEntry.key}" changed but no experiment is bound - ` +
          'call bindExperiment(experiment) after setup(). Ignoring this change.'
        );
        return;
      }

      this.activeExperiment.reset(this.params);
    });

    wrapper.append(label, readout);
    return wrapper;
  }
}
