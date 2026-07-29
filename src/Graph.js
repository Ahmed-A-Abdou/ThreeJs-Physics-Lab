/**
 * @typedef {import('./Experiment.js').Measurements} Measurements
 * @typedef {import('./Experiment.js').MeasurementPoint} MeasurementPoint
 */

/**
 * Canvas overlay that plots an experiment's recorded (t, value) history and
 * exports it as CSV. Like UIPanel, this file never imports a concrete
 * Experiment subclass and never branches on which experiment is active
 * (CLAUDE.md rule 3/4) - it only knows the generic Measurements shape
 * ({ label, points }) declared in Experiment.js, and plots whatever it's
 * handed.
 *
 * Lifecycle (owned by a future main.js, not built here):
 *
 *   const graph = new Graph(container);
 *   ...                                  // after experiment.setup()
 *   graph.bindExperiment(experiment);     // now draw()/export can read its history
 *   createSimLoop(
 *     dt => experiment.update(dt),
 *     () => { renderer.render(scene, camera); graph.draw(); },
 *   );
 *
 * draw() is meant to be called once per animation frame. getMeasurements()
 * already returns the FULL cumulative history since the experiment started
 * (see Experiment.js's JSDoc), so draw() never accumulates points itself -
 * every call clears the canvas and redraws the complete series from
 * scratch. That also means switching experiments needs no explicit "clear
 * the old graph" step: bindExperiment() just swaps which experiment draw()
 * reads from, and the next draw() call naturally clears the canvas and
 * plots the new experiment's (fresh, or already-recorded) history instead.
 */
export class Graph {
  /**
   * @param {HTMLElement} container - Element this graph renders into. Owned
   *   by the caller (future main.js) - this file never touches index.html.
   * @param {Object} [options]
   * @param {number} [options.width=600]  - Canvas width, in pixels.
   * @param {number} [options.height=300] - Canvas height, in pixels.
   * @param {number} [options.padding=32] - Empty margin, in pixels, kept
   *   between the plotted line and every canvas edge, so the line never
   *   touches the border and there's room for axis labels.
   */
  constructor(container, { width = 600, height = 300, padding = 32 } = {}) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.padding = padding;

    // Fixed pixel dimensions passed in explicitly, not read from
    // container.clientWidth/Height - happy-dom's layout engine (used by
    // this file's tests) always reports 0 for those, and even in a real
    // browser that would race the page's CSS loading. A canvas element's
    // width/height attributes ARE its backing pixel resolution - set once,
    // here.
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.className = 'graph__canvas';

    // Fetched once and cached, rather than re-calling getContext('2d') in
    // every draw() call. This is also what makes Graph testable without a
    // real rasterizer: a test can stub HTMLCanvasElement.prototype.getContext
    // to return a fake object of vi.fn() spies BEFORE constructing a Graph,
    // and every ctx.* call this file makes from then on goes through that
    // fake instead of a real canvas.
    this.ctx = this.canvas.getContext('2d');

    this.exportButton = document.createElement('button');
    this.exportButton.type = 'button';
    this.exportButton.className = 'graph__export-button';
    this.exportButton.textContent = 'Export CSV';
    this.exportButton.addEventListener('click', () => this._exportCSV());

    this.container.append(this.canvas, this.exportButton);

    /** The instance draw()/export read from. Null until bindExperiment() runs. */
    this.activeExperiment = null;
  }

  /**
   * Bind the experiment whose measurements this graph should plot/export.
   * Same role as UIPanel.bindExperiment(): called once, after the
   * experiment's setup() has run.
   *
   * @param {import('./Experiment.js').Experiment} experiment
   */
  bindExperiment(experiment) {
    this.activeExperiment = experiment;
  }

  /**
   * Redraw the canvas from the bound experiment's complete recorded history.
   * Safe to call every frame - it always re-reads getMeasurements() fresh
   * rather than assuming anything about what it drew last time.
   */
  draw() {
    if (!this.activeExperiment) {
      // Same guard-pattern precedent as UIPanel's slider handler: a missing
      // binding is a caller mistake (main.js forgot bindExperiment()), not a
      // reason to crash the render loop - warn once and skip this frame.
      console.warn(
        'Graph: draw() called with no experiment bound - call bindExperiment(experiment) first. Skipping this frame.'
      );
      return;
    }

    const measurements = this.activeExperiment.getMeasurements();
    const { ctx, width, height, padding } = this;

    ctx.clearRect(0, 0, width, height);

    const pixels = mapPointsToPixels(measurements.points, { width, height, padding });

    // Fewer than 2 points can't form a line segment (0 points: nothing to
    // draw; 1 point: a lone moveTo would draw nothing visible) - skip
    // stroking entirely rather than issuing a no-op beginPath/stroke pair.
    if (pixels.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pixels[0].x, pixels[0].y);
      for (let i = 1; i < pixels.length; i++) {
        ctx.lineTo(pixels[i].x, pixels[i].y);
      }
      ctx.stroke();
    }

    // Time is always the x-axis, regardless of which experiment is active -
    // that's a property of every Measurements series (t, value), not
    // per-experiment logic. The y-axis label, in contrast, MUST come from
    // the measurement itself (spec: "uses label for the axis") - this file
    // has no idea whether it's plotting an angle, a height, or a velocity.
    ctx.fillText('Time (s)', width / 2, height - 4);
    ctx.fillText(measurements.label, padding / 2, 12);
  }

  /**
   * Export button handler: read the bound experiment's full history fresh,
   * format it as CSV, and trigger a browser download.
   */
  _exportCSV() {
    if (!this.activeExperiment) {
      console.warn(
        'Graph: CSV export requested with no experiment bound - call bindExperiment(experiment) first. Ignoring.'
      );
      return;
    }

    const measurements = this.activeExperiment.getMeasurements();
    const csvText = measurementsToCSV(measurements);
    this._downloadCSV(filenameForLabel(measurements.label), csvText);
  }

  /**
   * Trigger a browser file download for the given CSV text. Isolated from
   * _exportCSV() so a test can call it directly with canned inputs, without
   * needing a bound experiment at all.
   *
   * @param {string} filename
   * @param {string} csvText
   */
  _downloadCSV(filename, csvText) {
    const blob = new Blob([csvText], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    // A temporary, never-rendered <a download> is the standard way to turn
    // a Blob into a "Save As" download - it only needs to exist long enough
    // for its one click() call.
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Release the Blob URL now that the download has been handed off -
    // otherwise it leaks for the lifetime of the page.
    URL.revokeObjectURL(url);
  }
}

/**
 * Pure, DOM-free: map a series of (t, value) points onto pixel coordinates
 * inside a canvas plot area, auto-scaling BOTH axes to the points' own
 * min/max range. Graph never assumes a fixed axis range - it must plot
 * whatever quantity (and whatever range) any experiment hands it.
 *
 * No document/canvas dependency, so this is directly unit-testable with
 * plain Vitest - no DOM environment or canvas mocking needed.
 *
 * @param {MeasurementPoint[]} points
 * @param {{width: number, height: number, padding: number}} box
 * @returns {{x: number, y: number}[]}
 */
export function mapPointsToPixels(points, { width, height, padding }) {
  if (points.length === 0) return [];

  const plotWidth = width - 2 * padding;
  const plotHeight = height - 2 * padding;

  let tMin = points[0].t, tMax = points[0].t;
  let vMin = points[0].value, vMax = points[0].value;
  for (const p of points) {
    if (p.t < tMin) tMin = p.t;
    if (p.t > tMax) tMax = p.t;
    if (p.value < vMin) vMin = p.value;
    if (p.value > vMax) vMax = p.value;
  }
  const tRange = tMax - tMin;
  const vRange = vMax - vMin;

  return points.map((p) => {
    // A single point, or every point sharing the same t (or the same
    // value), makes that axis's range zero - dividing by it would produce
    // NaN. Fall back to the center of that axis instead of crashing.
    const tFrac = tRange === 0 ? 0.5 : (p.t - tMin) / tRange;
    const vFrac = vRange === 0 ? 0.5 : (p.value - vMin) / vRange;
    const x = padding + tFrac * plotWidth;
    // Canvas y grows downward; flip so a larger value plots higher on screen.
    const y = padding + (1 - vFrac) * plotHeight;
    return { x, y };
  });
}

/**
 * Pure, DOM-free: render a Measurements object as CSV text - a header row
 * followed by one "t,value" line per point.
 *
 * Numbers are formatted with a fixed 6 decimal places rather than plain
 * String(n): a fixed timestep as small as 1/120s (~0.008333s) needs that
 * much resolution, and toFixed avoids both floating-point noise (e.g.
 * 0.1 + 0.2 === 0.30000000000000004) and scientific notation for very
 * small/large values, which some spreadsheet CSV importers mishandle.
 * Lines are '\n'-terminated (not '\r\n') - LF-only text, matching this
 * repo's other files, and browsers/spreadsheets read LF-only CSV fine.
 *
 * @param {Measurements} measurements
 * @returns {string}
 */
export function measurementsToCSV({ points }) {
  const lines = ['t,value'];
  for (const p of points) {
    lines.push(`${p.t.toFixed(6)},${p.value.toFixed(6)}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Turn a measurement's label into a safe, simple download filename - e.g.
 * "Bob Height (m)" -> "bob-height-m.csv". Deliberately minimal (lowercase,
 * collapse runs of non-alphanumeric characters to one hyphen, trim leading/
 * trailing hyphens) rather than a general-purpose slugify utility - this
 * repo's labels are short, human-written strings, not arbitrary input.
 *
 * @param {string} label
 * @returns {string}
 */
export function filenameForLabel(label) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'measurements'}.csv`;
}
