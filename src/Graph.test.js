// @vitest-environment happy-dom
//
// One environment for the whole file, matching UIPanel.test.js's precedent.
// The pure functions below (mapPointsToPixels, measurementsToCSV,
// filenameForLabel) have zero document/canvas dependency, so it doesn't
// matter which environment loads them - splitting them into a second file
// just to run under plain "node" would be a speculative deviation from this
// repo's one-test-file-per-source-file convention.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Graph, mapPointsToPixels, measurementsToCSV, filenameForLabel } from './Graph.js';

describe('mapPointsToPixels (pure)', () => {
  const box = { width: 100, height: 50, padding: 10 }; // plotWidth 80, plotHeight 30

  it('returns [] for an empty points array', () => {
    expect(mapPointsToPixels([], box)).toEqual([]);
  });

  it('maps a single point to the center of the plot area, without dividing by zero', () => {
    expect(mapPointsToPixels([{ t: 5, value: 42 }], box)).toEqual([{ x: 50, y: 25 }]);
  });

  it('centers an axis whose points all share the same t (or the same value)', () => {
    const result = mapPointsToPixels(
      [{ t: 3, value: 0 }, { t: 3, value: 10 }],
      box
    );
    expect(result[0].x).toBe(50); // shared t -> both centered horizontally
    expect(result[1].x).toBe(50);
    expect(result[0].y).toBe(40); // value 0 (min) -> bottom of plot area
    expect(result[1].y).toBe(10); // value 10 (max) -> top of plot area
  });

  it('auto-scales two distinct points to the corners of the plot area', () => {
    const result = mapPointsToPixels(
      [{ t: 0, value: 0 }, { t: 10, value: 100 }],
      box
    );
    expect(result[0]).toEqual({ x: 10, y: 40 }); // min t, min value -> bottom-left
    expect(result[1]).toEqual({ x: 90, y: 10 }); // max t, max value -> top-right
  });
});

describe('measurementsToCSV (pure)', () => {
  it('produces a header row followed by one fixed-precision line per point', () => {
    const csv = measurementsToCSV({
      label: 'Angle (rad)',
      points: [{ t: 0, value: 1 }, { t: 0.5, value: 2.25 }],
    });
    expect(csv).toBe('t,value\n0.000000,1.000000\n0.500000,2.250000\n');
  });

  it('produces just the header for an empty points array', () => {
    expect(measurementsToCSV({ label: 'x', points: [] })).toBe('t,value\n');
  });
});

describe('filenameForLabel (pure)', () => {
  it('lowercases and hyphenates a human-readable label', () => {
    expect(filenameForLabel('Bob Height (m)')).toBe('bob-height-m.csv');
  });

  it('falls back to a generic name if the label has no alphanumeric characters', () => {
    expect(filenameForLabel('***')).toBe('measurements.csv');
  });
});

describe('Graph (DOM)', () => {
  // happy-dom's <canvas>.getContext('2d') returns null (no real 2D
  // rasterizer - verified against this repo's installed happy-dom version).
  // Every test here stubs HTMLCanvasElement.prototype.getContext with a
  // fake context BEFORE constructing a Graph, so Graph's constructor caches
  // this fake instead of null.
  let fakeCtx;

  beforeEach(() => {
    fakeCtx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeGraph() {
    const container = document.createElement('div');
    const graph = new Graph(container);
    return { container, graph };
  }

  it('constructor builds a canvas and an export button, appended to the container', () => {
    const { container } = makeGraph();
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.querySelector('button').textContent).toBe('Export CSV');
  });

  it('draw() warns and no-ops if called before bindExperiment()', () => {
    const { graph } = makeGraph();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => graph.draw()).not.toThrow();

    expect(fakeCtx.clearRect).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('draw() clears the canvas, strokes a line through every point, and labels both axes', () => {
    const { graph } = makeGraph();
    const points = [{ t: 0, value: 1 }, { t: 1, value: 2 }, { t: 2, value: 3 }];
    const getMeasurements = vi.fn(() => ({ label: 'Height (m)', points }));
    graph.bindExperiment({ getMeasurements });

    graph.draw();

    expect(fakeCtx.clearRect).toHaveBeenCalledTimes(1);
    expect(fakeCtx.beginPath).toHaveBeenCalledTimes(1);
    expect(fakeCtx.moveTo).toHaveBeenCalledTimes(1);
    expect(fakeCtx.lineTo).toHaveBeenCalledTimes(points.length - 1); // one segment per extra point
    expect(fakeCtx.stroke).toHaveBeenCalledTimes(1);

    const fillTextArgs = fakeCtx.fillText.mock.calls.map((call) => call[0]);
    expect(fillTextArgs).toContain('Height (m)'); // y-axis label comes from the measurement
    expect(fillTextArgs).toContain('Time (s)');   // x-axis label is fixed, not experiment-specific
  });

  it('draw() re-reads getMeasurements() fresh every call, redrawing the full history each time', () => {
    const { graph } = makeGraph();
    const getMeasurements = vi.fn(() => ({ label: 'Height (m)', points: [{ t: 0, value: 1 }] }));
    graph.bindExperiment({ getMeasurements });

    graph.draw();
    graph.draw();

    expect(getMeasurements).toHaveBeenCalledTimes(2);
    expect(fakeCtx.clearRect).toHaveBeenCalledTimes(2); // each call redraws from scratch
  });

  it('draw() with fewer than 2 points clears the canvas and labels it, but draws no line', () => {
    const { graph } = makeGraph();
    graph.bindExperiment({ getMeasurements: () => ({ label: 'Height (m)', points: [] }) });

    graph.draw();

    expect(fakeCtx.clearRect).toHaveBeenCalledTimes(1);
    expect(fakeCtx.beginPath).not.toHaveBeenCalled();
    expect(fakeCtx.stroke).not.toHaveBeenCalled();
    expect(fakeCtx.fillText).toHaveBeenCalled(); // axis labels still drawn
  });

  it('exports CSV: clicking the button builds a Blob with the correct content and triggers a download', async () => {
    const { container, graph } = makeGraph();
    const points = [{ t: 0, value: 1 }, { t: 1, value: 2 }];
    graph.bindExperiment({ getMeasurements: () => ({ label: 'Bob Height (m)', points }) });

    // happy-dom's URL.createObjectURL/revokeObjectURL are real functions
    // (verified against this repo's installed happy-dom version), so
    // vi.spyOn works directly - no need to invent them with a bare vi.fn().
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    container.querySelector('button').click();

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURLSpy.mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe('text/csv');
    await expect(blobArg.text()).resolves.toBe('t,value\n0.000000,1.000000\n1.000000,2.000000\n');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake-url');
  });

  it('CSV export warns and no-ops if triggered before bindExperiment()', () => {
    const { container } = makeGraph();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL');

    expect(() => container.querySelector('button').click()).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });
});
