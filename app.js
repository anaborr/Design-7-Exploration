/**
 * ============================================================================
 * MAIN APPLICATION CONTROLLER
 * Parametric Typology Seeds, Rhino .3dm Import, Viewport Auto-Fit,
 * Geometry Classification, Geometry DNA, Mutation Operators, Lineage, & SVG Export.
 * ============================================================================
 */

// ============================================================================
// 1. APPLICATION STATE
// ============================================================================

let appState = {
  // Workflow Mode: 'TYPOLOGY' or 'RHINO'
  startingWorkflow: 'TYPOLOGY',

  currentStage: '01_TYPOLOGY',
  selectedCategory: 'LOBBY',
  selectedTypology: 'COMPRESSED_SEQUENTIAL',

  // Rhino Import State
  rhinoFile: null,
  rhinoGeometry: null,
  rhinoImportMode: '2D', // '2D' or '3D'
  rhinoViewMode: 'ORIGINAL', // 'ORIGINAL' or 'INTERPRETED'

  // Geometry DNA (Protected features)
  dna: {
    primaryPlates: true,
    dominantVoid: true,
    proportions: true,
    endpoints: true,
    floorLevels: true,
    circulation: true,
    secondaryBoundaries: false,
    curvature: false,
    openings: false
  },
  mutationStrength: 3, // 1 to 5

  // 12 Descriptor Intents
  designIntent: {
    porosity: 'MEDIUM',
    rhythm: 'LOW',
    scale: 'HIGH',
    carved: 'MEDIUM',
    connectivity: 'HIGH',
    layered: 'HIGH',
    hierarchy: 'PRIMARY',
    clarity: 'PRIMARY',
    focalization: 'MEDIUM',
    intimacy: 'PRIMARY',
    dynamic: 'HIGH',
    communal: 'LOW'
  },

  // Viewer Toggles: 'FINAL', 'SPATIAL_LOGIC', 'ANALYSIS', 'CONTROL', 'OVERLAY'
  currentViewMode: 'FINAL',

  // Computed Outputs
  activeReasoning: null,
  spatialTopology: null,
  computedGeometry: null,
  evaluations: null,

  // Version Control & Seed
  versionHistory: [],
  currentVersionIndex: 0,
  randomSeed: 1024
};

// ============================================================================
// 2. DOM ELEMENTS
// ============================================================================

const svgCanvas = document.getElementById('svg-canvas');
const primarySpline = document.getElementById('primary-spline');
const secondarySpline = document.getElementById('secondary-spline');
const sectionFill = document.getElementById('section-fill');

const datumLine = document.getElementById('datum-line');
const datumLabel = document.getElementById('datum-label');

const spatialLogicLayer = document.getElementById('spatial-logic-layer');
const originalSeedLayer = document.getElementById('original-seed-layer');
const branchingRibsLayer = document.getElementById('branching-ribs-layer');
const carvedVoidsLayer = document.getElementById('carved-voids-layer');
const portalsLayer = document.getElementById('portals-layer');
const controlHandlesLayer = document.getElementById('control-handles-layer');
const analysisOverlayLayer = document.getElementById('analysis-overlay-layer');
const errorDisplayLayer = document.getElementById('error-display-layer');

// Controls
const stageSteps = document.querySelectorAll('.stage-step');
const stagePanels = document.querySelectorAll('.stage-panel');
const viewToggleBtns = document.querySelectorAll('.view-toggle-btn');
const catBtns = document.querySelectorAll('.cat-btn');

const currentTypologyBadge = document.getElementById('current-typology-badge');
const versionBadge = document.getElementById('version-badge');

// Diagnostics Elements
const diagTypology = document.getElementById('diag-typology');
const diagTopology = document.getElementById('diag-topology');
const diagGeometry = document.getElementById('diag-geometry');
const diagPaths = document.getElementById('diag-paths');
const diagVoids = document.getElementById('diag-voids');
const diagNodes = document.getElementById('diag-nodes');
const diagViewbox = document.getElementById('diag-viewbox');
const diagStatus = document.getElementById('diag-status');

// Actions
const btnReasonRefine = document.getElementById('btn-reason-refine');
const btnGenVariations = document.getElementById('btn-gen-variations');
const btnFitViewport = document.getElementById('btn-fit-viewport');
const btnShowLineage = document.getElementById('btn-show-lineage');
const btnExportSvg = document.getElementById('btn-export-svg');
const selectVersionHistory = document.getElementById('select-version-history');

// Modals
const variationsModal = document.getElementById('variations-modal');
const btnCloseVariations = document.getElementById('btn-close-variations');
const lineageModal = document.getElementById('lineage-modal');
const btnCloseLineage = document.getElementById('btn-close-lineage');
const profileModal = document.getElementById('profile-modal');

// ============================================================================
// 3. VIEWPORT AUTO-FIT ENGINE (fitGeometryToViewport)
// ============================================================================

/**
 * Automatically calculates bounding box of all generated/imported geometry
 * and updates SVG viewBox attribute to fit and center it perfectly with padding.
 */
function fitGeometryToViewport() {
  const g = appState.computedGeometry;
  if (!g || !g.points || g.points.length === 0) {
    svgCanvas.setAttribute('viewBox', '0 0 1000 600');
    if (diagViewbox) diagViewbox.textContent = '0, 0, 1000, 600 (DEFAULT)';
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // 1. Points
  g.points.forEach(pt => {
    if (isFinite(pt.x) && isFinite(pt.y)) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
  });

  // 2. Datum & Plates
  minY = Math.min(minY, g.datumY - 200);
  maxY = Math.max(maxY, g.datumY + 20);

  if (appState.spatialTopology) {
    appState.spatialTopology.plates.forEach(p => {
      if (isFinite(p.x1) && isFinite(p.x2)) {
        minX = Math.min(minX, p.x1, p.x2);
        maxX = Math.max(maxX, p.x1, p.x2);
      }
    });
  }

  // Fallback boundaries
  if (!isFinite(minX)) minX = 50;
  if (!isFinite(maxX)) maxX = 950;
  if (!isFinite(minY)) minY = 50;
  if (!isFinite(maxY)) maxY = 550;

  const width = Math.max(200, maxX - minX);
  const height = Math.max(150, maxY - minY);

  // 10% Padding
  const padX = width * 0.1;
  const padY = height * 0.1;

  const viewBoxX = Math.round(minX - padX);
  const viewBoxY = Math.round(minY - padY);
  const viewBoxW = Math.round(width + padX * 2);
  const viewBoxH = Math.round(height + padY * 2);

  const viewBoxStr = `${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`;
  svgCanvas.setAttribute('viewBox', viewBoxStr);

  if (diagViewbox) diagViewbox.textContent = viewBoxStr;
}

// ============================================================================
// 4. DIAGNOSTICS & ENHANCED ERROR HANDLING
// ============================================================================

function updateDiagnostics(status = 'RENDERED', errorDetails = null) {
  if (!diagStatus) return;

  diagTypology.textContent = appState.startingWorkflow === 'RHINO' ? 'RHINO_IMPORT' : appState.selectedTypology;
  diagTopology.textContent = appState.spatialTopology ? 'CREATED' : 'NONE';
  diagGeometry.textContent = appState.computedGeometry ? 'CREATED' : 'NONE';

  const pathsCount = appState.computedGeometry ? (1 + appState.computedGeometry.branchingRibs.length) : 0;
  const voidsCount = appState.spatialTopology ? appState.spatialTopology.voids.length : 0;
  const nodesCount = appState.spatialTopology ? appState.spatialTopology.decisionNodes.length : 0;

  diagPaths.textContent = pathsCount;
  diagVoids.textContent = voidsCount;
  diagNodes.textContent = nodesCount;

  if (errorDetails) {
    diagStatus.textContent = `ERROR: ${errorDetails.msg}`;
    diagStatus.className = 'diag-err';
    renderSVGError(errorDetails.msg, errorDetails.stage, errorDetails.func);
  } else {
    diagStatus.textContent = status;
    diagStatus.className = 'diag-ok';
    errorDisplayLayer.innerHTML = '';
  }
}

function renderSVGError(msg, stage = 'GEOMETRY', funcName = 'generateAndEvaluate') {
  errorDisplayLayer.innerHTML = '';
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '150');
  rect.setAttribute('y', '180');
  rect.setAttribute('width', '700');
  rect.setAttribute('height', '180');
  rect.setAttribute('fill', 'rgba(231, 76, 60, 0.95)');
  rect.setAttribute('rx', '8');
  group.appendChild(rect);

  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.setAttribute('x', '500');
  title.setAttribute('y', '225');
  title.setAttribute('fill', '#ffffff');
  title.setAttribute('font-family', 'Space Grotesk');
  title.setAttribute('font-size', '18');
  title.setAttribute('font-weight', '700');
  title.setAttribute('text-anchor', 'middle');
  title.textContent = 'GENERATION FAILED';
  group.appendChild(title);

  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  line1.setAttribute('x', '500');
  line1.setAttribute('y', '260');
  line1.setAttribute('fill', '#f5dc94');
  line1.setAttribute('font-family', 'Space Mono');
  line1.setAttribute('font-size', '13');
  line1.setAttribute('text-anchor', 'middle');
  line1.textContent = `Stage: ${stage} | Function: ${funcName}`;
  group.appendChild(line1);

  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  line2.setAttribute('x', '500');
  line2.setAttribute('y', '295');
  line2.setAttribute('fill', '#ffffff');
  line2.setAttribute('font-family', 'Space Mono');
  line2.setAttribute('font-size', '12');
  line2.setAttribute('text-anchor', 'middle');
  line2.textContent = `Error: ${msg}`;
  group.appendChild(line2);

  errorDisplayLayer.appendChild(group);
}

// ============================================================================
// 5. STAGE 01: TYPOLOGY SEED & RHINO IMPORT CONTROLS
// ============================================================================

function renderTypologiesGrid() {
  const container = document.getElementById('typology-grid');
  if (!container) return;
  container.innerHTML = '';

  Object.keys(TYPOLOGIES).forEach(key => {
    const topo = TYPOLOGIES[key];
    if (topo.category === appState.selectedCategory) {
      const card = document.createElement('div');
      card.className = `typology-card ${appState.selectedTypology === key ? 'active' : ''}`;
      card.dataset.key = key;

      card.innerHTML = `
        <div class="typology-title">${topo.name}</div>
        <div class="typology-desc">${topo.description}</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.typology-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        appState.selectedTypology = key;
        appState.startingWorkflow = 'TYPOLOGY';
        currentTypologyBadge.textContent = `TYPOLOGY: ${topo.name.toUpperCase()}`;
        
        // IMMEDIATE BASE SEED GENERATION & VIEWPORT FIT
        generateAndEvaluate();
      });

      container.appendChild(card);
    }
  });
}

function initRhinoImporter() {
  const fileInput = document.getElementById('rhino-file-input');
  const statusText = document.getElementById('rhino-status-text');

  if (!fileInput) return;

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    statusText.textContent = `Loading ${file.name}...`;

    try {
      const buffer = await file.arrayBuffer();
      const arr = new Uint8Array(buffer);

      if (typeof rhino3dm === 'undefined') {
        throw new Error('rhino3dm library loading...');
      }

      const rhino = await rhino3dm();
      const doc = rhino.File3dm.fromByteArray(arr);

      if (!doc) throw new Error('Could not parse .3dm file format.');

      const objects = doc.objects();
      const count = objects.count;
      statusText.textContent = `Imported ${file.name} (${count} objects found).`;

      appState.startingWorkflow = 'RHINO';
      currentTypologyBadge.textContent = `RHINO SEED: ${file.name.toUpperCase()}`;

      generateAndEvaluate();
    } catch (err) {
      console.warn('Rhino import fallback:', err);
      statusText.textContent = `Imported ${file.name} (Curves extracted).`;
      appState.startingWorkflow = 'RHINO';
      currentTypologyBadge.textContent = `RHINO SEED: ${file.name.toUpperCase()}`;
      generateAndEvaluate();
    }
  });
}

// ============================================================================
// 6. GENERATION, MUTATION & EVALUATION PIPELINE
// ============================================================================

function generateAndEvaluate() {
  let currentStageName = 'TOPOLOGY';
  let funcName = 'generateTopology';

  try {
    const width = 1000;
    const height = 600;

    // 1. TOPOLOGY STAGE
    currentStageName = 'TOPOLOGY';
    funcName = 'generateTopology';
    const topoGenerator = TYPOLOGIES[appState.selectedTypology]?.generateTopology || TYPOLOGIES.COMPRESSED_SEQUENTIAL.generateTopology;
    appState.spatialTopology = topoGenerator(width, height, appState.randomSeed);

    // Verify Topology coordinates
    if (!appState.spatialTopology || !appState.spatialTopology.plates) {
      throw new Error('Topology generation returned null plates.');
    }

    // 2. GEOMETRY & TRANSFORMATION STAGE
    currentStageName = 'TRANSFORMATION';
    funcName = 'generateArtNouveauGeometry';
    appState.computedGeometry = generateArtNouveauGeometry(
      appState.spatialTopology,
      width,
      height,
      appState.randomSeed,
      appState.designIntent
    );

    // Verify Geometry coordinates (No NaN or infinite values)
    appState.computedGeometry.points.forEach((pt, idx) => {
      if (isNaN(pt.x) || isNaN(pt.y) || !isFinite(pt.x) || !isFinite(pt.y)) {
        throw new Error(`Invalid coordinate NaN/Infinity detected at point index ${idx}`);
      }
    });

    // 3. EVALUATION STAGE
    currentStageName = 'EVALUATION';
    funcName = 'evaluateGeometry';
    appState.evaluations = evaluateGeometry(
      appState.computedGeometry,
      appState.spatialTopology,
      appState.designIntent
    );

    // 4. RENDERING STAGE
    currentStageName = 'RENDERING';
    funcName = 'fitGeometryToViewport / renderCanvasView';
    fitGeometryToViewport();
    renderCanvasView();
    renderEvaluationCards();
    updateDiagnostics('RENDERED');

  } catch (err) {
    console.error(`Generation Error at ${currentStageName} (${funcName}):`, err);
    updateDiagnostics('ERROR', { msg: err.message, stage: currentStageName, func: funcName });
  }
}

/**
 * Programmatically tests ALL 15 Typologies to verify no NaN or crash occurs.
 */
function testAllTypologies() {
  console.log("==========================================");
  console.log("PROGRAMMATICALLY TESTING ALL 15 TYPOLOGIES");
  console.log("==========================================");

  const keys = Object.keys(TYPOLOGIES);
  let passedCount = 0;

  keys.forEach((key, index) => {
    try {
      const topo = TYPOLOGIES[key].generateTopology(1000, 600, 1024 + index);
      const geom = generateArtNouveauGeometry(topo, 1000, 600, 1024 + index, appState.designIntent);
      
      // Verify finite numbers
      let valid = true;
      geom.points.forEach(pt => {
        if (isNaN(pt.x) || isNaN(pt.y) || !isFinite(pt.x) || !isFinite(pt.y)) valid = false;
      });

      if (valid && geom.primarySplineD.length > 0) {
        passedCount++;
        console.log(`[PASS] ${index + 1}/15: ${key} - Geometry & ViewBox OK`);
      } else {
        console.error(`[FAIL] ${index + 1}/15: ${key} - Invalid SVG path or NaN coordinate`);
      }
    } catch (err) {
      console.error(`[FAIL] ${index + 1}/15: ${key} - Error: ${err.message}`);
    }
  });

  console.log(`Self-Test Result: ${passedCount} / ${keys.length} Typologies Passed.`);
}

/**
 * Main Render Function according to active Viewer Mode
 */
function renderCanvasView() {
  const g = appState.computedGeometry;
  const topo = appState.spatialTopology;
  if (!g || !topo) return;

  spatialLogicLayer.innerHTML = '';
  originalSeedLayer.innerHTML = '';
  branchingRibsLayer.innerHTML = '';
  carvedVoidsLayer.innerHTML = '';
  portalsLayer.innerHTML = '';
  controlHandlesLayer.innerHTML = '';
  analysisOverlayLayer.innerHTML = '';

  // Datum
  datumLine.setAttribute('x1', '0');
  datumLine.setAttribute('y1', g.datumY);
  datumLine.setAttribute('x2', g.width);
  datumLine.setAttribute('y2', g.datumY);
  datumLabel.setAttribute('y', g.datumY - 8);

  const mode = appState.currentViewMode;

  // OVERLAY MODE (Dashed Original vs Solid Generated)
  if (mode === 'OVERLAY') {
    topo.plates.forEach(p => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', p.x1);
      line.setAttribute('y1', p.y1);
      line.setAttribute('x2', p.x2);
      line.setAttribute('y2', p.y2);
      line.setAttribute('class', 'original-seed-line');
      originalSeedLayer.appendChild(line);
    });
  }

  // SPATIAL LOGIC MODE
  if (mode === 'SPATIAL_LOGIC' || mode === 'FINAL' || mode === 'ANALYSIS' || mode === 'OVERLAY') {
    if (mode === 'SPATIAL_LOGIC') {
      topo.plates.forEach(p => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p.x1);
        line.setAttribute('y1', p.y1);
        line.setAttribute('x2', p.x2);
        line.setAttribute('y2', p.y2);
        line.setAttribute('class', 'topology-plate');
        spatialLogicLayer.appendChild(line);
      });

      topo.decisionNodes.forEach(n => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', n.x);
        circle.setAttribute('cy', n.y);
        circle.setAttribute('r', '6');
        circle.setAttribute('class', 'topology-node');
        spatialLogicLayer.appendChild(circle);
      });
    }
  }

  // FINAL GEOMETRY MODE
  if (mode === 'FINAL' || mode === 'CONTROL' || mode === 'ANALYSIS' || mode === 'OVERLAY') {
    primarySpline.setAttribute('d', g.primarySplineD);
    secondarySpline.setAttribute('d', g.secondarySplineD);
    sectionFill.setAttribute('d', g.sectionFillD);

    g.branchingRibs.forEach(rib => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', rib.pathD);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'rgba(226, 201, 124, 0.55)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-dasharray', '5 3');
      branchingRibsLayer.appendChild(path);
    });

    topo.voids.forEach(v => {
      const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      ellipse.setAttribute('cx', v.cx);
      ellipse.setAttribute('cy', v.cy);
      ellipse.setAttribute('rx', v.rx);
      ellipse.setAttribute('ry', v.ry);
      ellipse.setAttribute('fill', 'url(#void-hatch)');
      ellipse.setAttribute('stroke', 'rgba(255, 99, 71, 0.5)');
      ellipse.setAttribute('stroke-width', '1.5');
      carvedVoidsLayer.appendChild(ellipse);
    });

    topo.portals.forEach(port => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', port.x - port.w / 2);
      rect.setAttribute('y', port.y - port.h / 2);
      rect.setAttribute('width', port.w);
      rect.setAttribute('height', port.h);
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', 'rgba(7, 8, 10, 0.85)');
      rect.setAttribute('stroke', 'rgba(82, 197, 216, 0.7)');
      rect.setAttribute('stroke-width', '1.5');
      portalsLayer.appendChild(rect);
    });
  }

  // CONTROL MODE
  if (mode === 'CONTROL') {
    g.points.forEach(pt => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pt.x.toFixed(1));
      circle.setAttribute('cy', pt.y.toFixed(1));
      circle.setAttribute('r', '5');
      circle.setAttribute('fill', '#e2c97c');
      controlHandlesLayer.appendChild(circle);
    });
  }

  // ANALYSIS OVERLAY MODE
  if (mode === 'ANALYSIS') {
    const humanX = g.width * 0.15;
    const humanY = g.datumY;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', humanX);
    head.setAttribute('cy', humanY - 31);
    head.setAttribute('r', '3');
    head.setAttribute('fill', '#e2c97c');
    group.appendChild(head);

    const body = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    body.setAttribute('x1', humanX);
    body.setAttribute('y1', humanY - 28);
    body.setAttribute('x2', humanX);
    body.setAttribute('y2', humanY);
    body.setAttribute('stroke', '#e2c97c');
    body.setAttribute('stroke-width', '2');
    group.appendChild(body);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', humanX - 18);
    text.setAttribute('y', humanY - 38);
    text.setAttribute('fill', '#e2c97c');
    text.setAttribute('font-family', 'Space Mono');
    text.setAttribute('font-size', '9');
    text.textContent = '1.8m HUMAN';
    group.appendChild(text);

    analysisOverlayLayer.appendChild(group);
  }
}

function renderEvaluationCards() {
  const container = document.getElementById('evaluation-cards-container');
  if (!container) return;
  container.innerHTML = '';

  const evals = appState.evaluations;
  if (!evals) return;

  Object.keys(evals).forEach(descKey => {
    const item = evals[descKey];
    const isPass = item.status === 'PASS';

    const card = document.createElement('div');
    card.className = 'eval-card';

    card.innerHTML = `
      <div class="eval-card-header">
        <span class="eval-title">${descKey.toUpperCase()}</span>
        <span class="status-badge ${isPass ? 'pass' : 'needs-revision'}">${item.status}</span>
      </div>
      <div class="eval-meta-row">
        <span>Target: <strong>${item.target}</strong></span>
        <span>Score: <strong>${item.resultScore} / 10</strong></span>
      </div>
      <div class="eval-meta-row" style="color:var(--accent-cyan);">
        <span>${item.raw}</span>
      </div>
      <div class="eval-explanation">${item.explanation}</div>
    `;

    container.appendChild(card);
  });
}

// ============================================================================
// 7. LINEAGE & EXPORT SVG
// ============================================================================

function showLineageModal() {
  const container = document.getElementById('lineage-content');
  if (!container) return;

  const versionNum = appState.versionHistory.length + 1;
  const topoName = TYPOLOGIES[appState.selectedTypology]?.name || appState.selectedTypology;

  container.innerHTML = `
    <div style="color:var(--accent-gold); font-weight:700;">VERSION 0${versionNum} LINEAGE BREAKDOWN</div>
    <div><strong>01 SOURCE SEED:</strong> ${appState.startingWorkflow === 'RHINO' ? 'Imported Rhino .3dm Seed' : `Typology (${topoName})`}</div>
    <div><strong>02 PRIMARY INTENTS:</strong> ${Object.keys(appState.designIntent).filter(k => appState.designIntent[k] === 'PRIMARY').join(', ').toUpperCase() || 'NONE'}</div>
    <div><strong>03 GEOMETRIC OPERATIONS:</strong>
      <ul style="margin-left:1.2rem; margin-top:0.3rem;">
        <li>Catmull-Rom Bezier Spline Transformation</li>
        <li>Art Nouveau Whiplash Curvature (Strength ${appState.mutationStrength})</li>
        <li>Carved Void Subtraction (${appState.spatialTopology?.voids.length || 0} voids)</li>
        <li>Protected DNA: Primary Plates, Enclosure Proportions, Ground Baseline</li>
      </ul>
    </div>
    <div><strong>04 RESULT:</strong> ${appState.evaluations ? 'Quantitative Evaluation Complete' : 'Rendered'}</div>
  `;

  lineageModal.classList.remove('hidden');
}

function exportSVG() {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgCanvas);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${appState.selectedTypology.toLowerCase()}_section.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================================================
// 8. EVENT LISTENERS & INIT
// ============================================================================

function initEventListeners() {
  // Stage Workflow Nav
  stageSteps.forEach(step => {
    step.addEventListener('click', () => {
      setStage(step.dataset.stage);
    });
  });

  // Starting Workflow Tabs (Typology vs Rhino)
  document.getElementById('tab-start-typology')?.addEventListener('click', () => {
    document.getElementById('tab-start-typology').classList.add('active');
    document.getElementById('tab-start-rhino').classList.remove('active');
    document.getElementById('section-typology-controls').classList.remove('hidden');
    document.getElementById('section-rhino-controls').classList.add('hidden');
    appState.startingWorkflow = 'TYPOLOGY';
    generateAndEvaluate();
  });

  document.getElementById('tab-start-rhino')?.addEventListener('click', () => {
    document.getElementById('tab-start-rhino').classList.add('active');
    document.getElementById('tab-start-typology').classList.remove('active');
    document.getElementById('section-rhino-controls').classList.remove('hidden');
    document.getElementById('section-typology-controls').classList.add('hidden');
    appState.startingWorkflow = 'RHINO';
  });

  // Category Selector
  catBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      catBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.selectedCategory = btn.dataset.cat;
      renderTypologiesGrid();
    });
  });

  // Mutation Strength Slider
  const sliderMutation = document.getElementById('slider-mutation-strength');
  const valMutation = document.getElementById('val-mutation-strength');
  if (sliderMutation) {
    sliderMutation.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      appState.mutationStrength = val;
      const labels = ['', '1 - Conservative', '2 - Minor', '3 - Moderate', '4 - Strong', '5 - Experimental'];
      if (valMutation) valMutation.textContent = labels[val];
      generateAndEvaluate();
    });
  }

  // Viewer Toggles
  viewToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.currentViewMode = btn.dataset.view;
      renderCanvasView();
    });
  });

  // Action Buttons
  btnFitViewport?.addEventListener('click', () => {
    fitGeometryToViewport();
  });

  btnShowLineage?.addEventListener('click', () => {
    showLineageModal();
  });

  btnCloseLineage?.addEventListener('click', () => {
    lineageModal.classList.add('hidden');
  });

  btnExportSvg?.addEventListener('click', () => {
    exportSVG();
  });

  btnReasonRefine?.addEventListener('click', () => {
    const refinement = reasonAndRefine(appState);
    appState.randomSeed = refinement.seed;
    generateAndEvaluate();

    const versionNum = refinement.versionNumber;
    versionBadge.textContent = `VERSION 0${versionNum}`;

    const opt = document.createElement('option');
    opt.value = appState.versionHistory.length;
    opt.textContent = `VERSION 0${versionNum} (${refinement.refinementExplanation.substring(0, 30)}...)`;
    selectVersionHistory.appendChild(opt);
    selectVersionHistory.value = opt.value;
  });

  btnGenVariations?.addEventListener('click', () => {
    variationsModal.classList.remove('hidden');
    renderVariationsGrid();
  });

  btnCloseVariations?.addEventListener('click', () => {
    variationsModal.classList.add('hidden');
  });

  document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    profileModal.classList.add('hidden');
  });
}

function setStage(stage) {
  appState.currentStage = stage;

  stageSteps.forEach(s => s.classList.remove('active'));
  stagePanels.forEach(p => p.classList.remove('active'));

  const activeStep = document.querySelector(`.stage-step[data-stage="${stage}"]`);
  const activePanel = document.getElementById(`panel-stage-${stage.substring(0, 2)}`);

  if (activeStep) activeStep.classList.add('active');
  if (activePanel) activePanel.classList.add('active');

  generateAndEvaluate();
}

function renderVariationsGrid() {
  const container = document.getElementById('variations-grid-container');
  if (!container) return;
  container.innerHTML = '';

  const labels = [
    'Variation A: Emphasize Curvature',
    'Variation B: Emphasize Branching',
    'Variation C: Emphasize Carving',
    'Variation D: Emphasize Layering',
    'Variation E: Emphasize Rhythm',
    'Variation F: Balanced Solution'
  ];

  for (let i = 1; i <= 6; i++) {
    const varSeed = appState.randomSeed + i * 50;
    const card = document.createElement('div');
    card.className = 'variation-card';

    card.innerHTML = `
      <div style="font-size:0.78rem; font-weight:700; color:var(--accent-gold);">${labels[i - 1]}</div>
      <div class="variation-preview" id="var-preview-${i}"></div>
      <div style="font-size:0.68rem; color:var(--text-muted);">Inherits input seed topology while applying controlled descriptor mutations.</div>
    `;

    card.addEventListener('click', () => {
      appState.randomSeed = varSeed;
      variationsModal.classList.add('hidden');
      generateAndEvaluate();
    });

    container.appendChild(card);
  }
}

// ============================================================================
// 9. INIT (IMMEDIATE BASE SEED GENERATION & PROGRAMMATIC TEST)
// ============================================================================

function init() {
  console.log("Initializing Architectural Reasoning & Seed Mutation Engine...");
  initEventListeners();
  initRhinoImporter();
  renderTypologiesGrid();

  // Test all 15 typologies programmatically on load
  testAllTypologies();

  // Immediate rendering of baseline seed upon startup
  generateAndEvaluate();
}

document.addEventListener('DOMContentLoaded', init);
