import { FallingBall } from './experiments/FallingBall.js';
import { Pendulum } from './experiments/Pendulum.js';
import { Projectile } from './experiments/Projectile.js';
import { Spring } from './experiments/Spring.js';

/**
 * @typedef {Object} ExperimentRegistryEntry
 * @property {string} key
 *   Stable machine identifier - e.g. the value of a picker dropdown option,
 *   or a key saved to a URL hash/localStorage. Never shown to the user, and
 *   must never change once assigned - renaming it would silently break
 *   anyone's saved selection.
 * @property {string} label
 *   Human-readable name shown in the experiment picker. UIPanel reads this
 *   to build the dropdown text - it never hardcodes an experiment's name
 *   (CLAUDE.md rule 3).
 * @property {typeof import('./Experiment.js').Experiment} ExperimentClass
 *   The class itself, not an instance. The framework decides when to
 *   `new ExperimentClass()` - only once this entry is actually selected -
 *   and reads `ExperimentClass.parameterSchema` (a static getter) to build
 *   sliders and seed initial `params` before any instance exists.
 */

/**
 * Every experiment the framework can run, in the order the picker should
 * list them.
 *
 * This is the single place a new experiment is registered - CLAUDE.md rule
 * 4: adding an experiment touches one experiment file, one physics file,
 * and one line here. No other framework file (simLoop, UIPanel, Graph,
 * main, Experiment) should ever need to change to support it.
 *
 * Registering a new experiment is exactly two lines:
 *
 *   1. import { Name } from './experiments/Name.js';
 *   2. add { key: 'name', label: 'Name', ExperimentClass: Name } to the array below.
 *
 * Frozen so nothing downstream can push/splice this list at runtime - the
 * only way to add an experiment is to edit this source file.
 *
 * @type {ExperimentRegistryEntry[]}
 */
export const EXPERIMENTS = Object.freeze([
  // THROWAWAY: proves the framework (Experiment contract, registry, simLoop,
  // UIPanel, Graph) works end-to-end. Safe to delete now that a real
  // experiment (Pendulum) exists.
  { key: 'falling-ball', label: 'Falling Ball (throwaway)', ExperimentClass: FallingBall },
  { key: 'pendulum', label: 'Pendulum', ExperimentClass: Pendulum },
  { key: 'projectile', label: 'Projectile', ExperimentClass: Projectile },
  { key: 'spring', label: 'Spring', ExperimentClass: Spring },
]);

/**
 * Look up one experiment's registry entry by its key.
 *
 * Mirrors Array.prototype.find / Map.prototype.get: returns undefined for
 * an unknown key instead of throwing, so the caller decides what an
 * unknown key means (e.g. a stale key left in localStorage, or a bad URL
 * hash) - registry.js has no opinion on that, it only looks things up.
 *
 * @param {string} key
 * @returns {ExperimentRegistryEntry | undefined}
 */
export function getExperiment(key) {
  return EXPERIMENTS.find((entry) => entry.key === key);
}
