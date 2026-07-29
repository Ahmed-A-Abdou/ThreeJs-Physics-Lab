// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIPanel } from './UIPanel.js';

// Fake schema, shaped like real ParameterSchemaEntry[] - no real Experiment
// subclass involved. UIPanel must not care where the schema came from.
const fakeSchemaA = [
  { key: 'length', label: 'Length (m)', min: 0.1, max: 2, step: 0.1, default: 1 },
  { key: 'gravity', label: 'Gravity (m/s^2)', min: 1, max: 20, step: 0.5, default: 9.8 },
];

const fakeSchemaB = [
  { key: 'mass', label: 'Mass (kg)', min: 0.5, max: 5, step: 0.5, default: 2 },
];

// Fake registry-entry shape: { key, label, ExperimentClass }. ExperimentClass
// here is a plain object, not a real class - UIPanel only ever reads
// `.parameterSchema` off it, so this stand-in is enough.
function makeEntry(key, label, schema) {
  return { key, label, ExperimentClass: { parameterSchema: schema } };
}

describe('UIPanel', () => {
  let container;
  let panel;

  beforeEach(() => {
    container = document.createElement('div');
    panel = new UIPanel(container);
  });

  it('loadExperiment() builds a params object matching the schema defaults', () => {
    const params = panel.loadExperiment(makeEntry('pendulum', 'Pendulum', fakeSchemaA));
    expect(params).toEqual({ length: 1, gravity: 9.8 });
  });

  it('renders one control per schema entry, with correct attributes and visible labels', () => {
    panel.loadExperiment(makeEntry('pendulum', 'Pendulum', fakeSchemaA));

    const inputs = container.querySelectorAll('input[type="range"]');
    expect(inputs.length).toBe(fakeSchemaA.length);

    fakeSchemaA.forEach((schemaEntry, i) => {
      const input = inputs[i];
      expect(Number(input.min)).toBe(schemaEntry.min);
      expect(Number(input.max)).toBe(schemaEntry.max);
      expect(Number(input.step)).toBe(schemaEntry.step);
      expect(Number(input.value)).toBe(schemaEntry.default);
    });

    expect(container.textContent).toContain('Length (m)');
    expect(container.textContent).toContain('Gravity (m/s^2)');
  });

  it('a control change updates params[key] as a number and calls reset() on the bound experiment', () => {
    const params = panel.loadExperiment(makeEntry('pendulum', 'Pendulum', fakeSchemaA));

    const fakeExperiment = { reset: vi.fn() };
    panel.bindExperiment(fakeExperiment);

    const lengthInput = container.querySelectorAll('input[type="range"]')[0];
    lengthInput.value = '1.5';
    lengthInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(params.length).toBe(1.5);
    expect(typeof params.length).toBe('number');
    expect(fakeExperiment.reset).toHaveBeenCalledTimes(1);
    expect(fakeExperiment.reset).toHaveBeenCalledWith(params);
  });

  it('loading a second, different schema clears the old controls and rebuilds fresh ones', () => {
    panel.loadExperiment(makeEntry('pendulum', 'Pendulum', fakeSchemaA));
    expect(container.querySelectorAll('input[type="range"]').length).toBe(2);

    const params = panel.loadExperiment(makeEntry('projectile', 'Projectile', fakeSchemaB));
    const inputs = container.querySelectorAll('input[type="range"]');

    expect(inputs.length).toBe(1);
    expect(params).toEqual({ mass: 2 });
    expect(container.textContent).not.toContain('Length (m)');
    expect(container.textContent).not.toContain('Gravity (m/s^2)');
    expect(container.textContent).toContain('Mass (kg)');
  });

  it('shows the experiment display label from the registry entry, not from the schema', () => {
    panel.loadExperiment(makeEntry('pendulum', 'Pendulum', fakeSchemaA));
    expect(container.textContent).toContain('Pendulum');
  });

  it('does not throw and does not call reset() if a control changes before an experiment is bound', () => {
    const params = panel.loadExperiment(makeEntry('pendulum', 'Pendulum', fakeSchemaA));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const lengthInput = container.querySelectorAll('input[type="range"]')[0];
    lengthInput.value = '1.5';

    expect(() => lengthInput.dispatchEvent(new Event('input', { bubbles: true }))).not.toThrow();
    expect(params.length).toBe(1.5); // params still updates
    expect(warnSpy).toHaveBeenCalled(); // missing binding is surfaced, not silently swallowed

    warnSpy.mockRestore();
  });
});
