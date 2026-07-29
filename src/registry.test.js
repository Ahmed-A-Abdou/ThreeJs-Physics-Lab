import { describe, it, expect } from 'vitest';
import { EXPERIMENTS, getExperiment } from './registry.js';
import { Experiment } from './Experiment.js';

describe('registry - shape', () => {
  it('exports EXPERIMENTS as an array (one throwaway placeholder + Pendulum)', () => {
    expect(Array.isArray(EXPERIMENTS)).toBe(true);
    expect(EXPERIMENTS.length).toBe(2);
  });

  it('freezes EXPERIMENTS so nothing can push/splice it at runtime', () => {
    // Registering an experiment must only ever happen by editing this
    // source file, never by mutating the list from elsewhere.
    expect(() => EXPERIMENTS.push({})).toThrow();
    expect(() => EXPERIMENTS.splice(0, 0, {})).toThrow();
  });
});

describe('registry - getExperiment()', () => {
  it('returns undefined for an unknown key, rather than throwing', () => {
    expect(getExperiment('spring')).toBeUndefined();
    expect(getExperiment('')).toBeUndefined();
  });

  it('resolves the pendulum entry by key', () => {
    const entry = getExperiment('pendulum');
    expect(entry).not.toBeUndefined();
    expect(entry.label).toBe('Pendulum');
  });
});

describe('registry - entry contract', () => {
  it('every registered entry has a string key/label and an Experiment subclass', () => {
    for (const entry of EXPERIMENTS) {
      expect(typeof entry.key).toBe('string');
      expect(entry.key.length).toBeGreaterThan(0);
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.ExperimentClass.prototype).toBeInstanceOf(Experiment);
      // parameterSchema must be overridden (base class throws) - reading it
      // here should not throw for a properly-built subclass.
      expect(() => entry.ExperimentClass.parameterSchema).not.toThrow();
    }
  });

  it('has no duplicate keys', () => {
    const keys = EXPERIMENTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
