import * as THREE from 'three';
import { EXPERIMENTS, getExperiment } from './registry.js';
import { createSimLoop } from './simLoop.js';
import { UIPanel } from './UIPanel.js';
import { Graph } from './Graph.js';

// Fixed pixel size for the three.js viewport. Not read from window/CSS -
// #app is CSS-capped at max-width 1126px and viewportContainer otherwise has
// zero intrinsic size (bare <div>, no stylesheet rule targets it) - so an
// explicit inline size is the simplest way to give the renderer a real box
// to fill without editing style.css or adding a resize listener.
const VIEWPORT_WIDTH = 960;
const VIEWPORT_HEIGHT = 540;

// ---------------------------------------------------------------------------
// DOM scaffolding - main.js builds its own containers under #app, the same
// way UIPanel/Graph build their own internal elements. index.html stays the
// untouched Vite scaffold.
// ---------------------------------------------------------------------------
const app = document.querySelector('#app');

const switcherBar = document.createElement('div');
const switcherLabel = document.createElement('label');
switcherLabel.htmlFor = 'experiment-select';
switcherLabel.textContent = 'Experiment:';
const switcherSelect = document.createElement('select');
switcherSelect.id = 'experiment-select';

// Populated generically from the registry - never a hardcoded key/label, so
// this works whether EXPERIMENTS has one entry or many (CLAUDE.md rule 4).
for (const entry of EXPERIMENTS) {
  const option = document.createElement('option');
  option.value = entry.key;
  option.textContent = entry.label;
  switcherSelect.appendChild(option);
}
switcherBar.append(switcherLabel, switcherSelect);

const viewportContainer = document.createElement('div');
viewportContainer.style.width = `${VIEWPORT_WIDTH}px`;
viewportContainer.style.height = `${VIEWPORT_HEIGHT}px`;

const uiPanelContainer = document.createElement('div');
const graphContainer = document.createElement('div');

app.append(switcherBar, viewportContainer, uiPanelContainer, graphContainer);

// ---------------------------------------------------------------------------
// Three.js scene/camera/renderer - created once, never recreated on switch.
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  50, // fov - natural, non-distorting default
  VIEWPORT_WIDTH / VIEWPORT_HEIGHT,
  0.1,
  100 // far - generous for objects living in roughly a 0-20 unit range
);
// Framed to keep a fall from ~20 units down to ground level (y=0) in view,
// with margin above and below.
camera.position.set(0, 10, 30);
camera.lookAt(0, 10, 0);

// Baseline lighting - generic scene setup every experiment benefits from,
// not per-experiment logic, so it belongs here rather than in an Experiment
// subclass.
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
viewportContainer.appendChild(renderer.domElement);
// Deliberately no window 'resize' listener - not asked for, would be scope
// creep; the viewport has a fixed size for the lifetime of the page.

// ---------------------------------------------------------------------------
// UIPanel / Graph - created once, reused across every experiment switch.
// ---------------------------------------------------------------------------
const uiPanel = new UIPanel(uiPanelContainer);
const graph = new Graph(graphContainer);

// ---------------------------------------------------------------------------
// Experiment switching - one code path for both the initial load and every
// later switch, so there's no duplicated load/construct/setup/bind logic.
// ---------------------------------------------------------------------------
let activeExperiment = null;

function switchExperiment(key) {
  const entry = getExperiment(key);
  if (!entry) {
    console.warn(`main: no experiment registered under key "${key}" - ignoring.`);
    return;
  }

  // Free whatever the previously-active experiment built before replacing it.
  if (activeExperiment) {
    activeExperiment.dispose();
  }

  const params = uiPanel.loadExperiment(entry);      // sliders + params, before an instance exists
  const experiment = new entry.ExperimentClass();
  experiment.setup(scene, params);                    // params existed before this instance did
  uiPanel.bindExperiment(experiment);                  // sliders can now call reset()
  graph.bindExperiment(experiment);                    // draw()/CSV export can now read its history

  activeExperiment = experiment;
}

switcherSelect.addEventListener('change', () => switchExperiment(switcherSelect.value));

// ---------------------------------------------------------------------------
// Fixed-timestep sim loop. Render callback only renders + draws the graph -
// it never reaches into physics state (CLAUDE.md rule 2).
// ---------------------------------------------------------------------------
const loop = createSimLoop(
  (dt) => activeExperiment?.update(dt), // defensive belt-and-suspenders only -
  () => {                                // the ordering below is the real guarantee
    renderer.render(scene, camera);
    graph.draw();
  }
);

// Load the first registered experiment BEFORE starting the loop, so
// activeExperiment is always assigned by the time update() is ever called.
if (EXPERIMENTS.length > 0) {
  switchExperiment(EXPERIMENTS[0].key);
  loop.start();
} else {
  console.warn('main: EXPERIMENTS registry is empty - nothing to load.');
}
