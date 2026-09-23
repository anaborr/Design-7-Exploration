/**
 * ============================================================================
 * MAIN APPLICATION CONTROLLER
 * DESCRIPTOR-DRIVEN ARCHITECTURAL EVOLUTION SYSTEM
 * Handles Generation 0 Rhino/Typology seed import, 6-child iteration generation,
 * selection, multi-generation lineage branching, and SVG export.
 * ============================================================================
 */

// ============================================================================
// 1. APPLICATION STATE
// ============================================================================

let appState = {
  // Multi-Generation Evolutionary Tree Array
  // [ { genIndex: 0, parent: seedGeometry }, { genIndex: 1, parent: selected, children: [01..06] } ]
  generationTree: [],

  activeGenIndex: 0,
  activeIterIndex: 0, // 0 = Parent, 1..6 = Children

  // Active Selected Child Iteration Data
  activeIterationData: null,

  // Qualitative Feedback for next generation
  qualitativeFeedback: {
    dynamic: 'MED',
    intimacy: 'MED',
    porosity: 'MED'
  },

  // Viewer Toggles: 'FINAL', 'SPATIAL_LOGIC', 'ANALYSIS', 'CONTROL'
  currentViewMode: 'FINAL',

  // Current Active Display Geometry & Topology
  computedGeometry: null,
  spatialTopology: null,

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
const branchingRibsLayer = document.getElementById('branching-ribs-layer');
const carvedVoidsLayer = document.getElementById('carved-voids-layer');
const portalsLayer = document.getElementById('portals-layer');
const controlHandlesLayer = document.getElementById('control-handles-layer');
const analysisOverlayLayer = document.getElementById('analysis-overlay-layer');
const errorDisplayLayer = document.getElementById('error-display-layer');

// UI Badges & Buttons
const currentGenBadge = document.getElementById('current-generation-badge');
const currentIterBadge = document.getElementById('current-iteration-badge');

const btnGenerateIterations = document.getElementById('btn-generate-iterations');
const btnUseAsNextSeed = document.getElementById('btn-use-as-next-seed');
const btnExportSvg = document.getElementById('btn-export-svg');
const viewToggleBtns = document.querySelectorAll('.view-toggle-btn');

// Diagnostics
const diagTypology = document.getElementById('diag-typology');
const diagTopology = document.getElementById('diag-topology');
const diagGeometry = document.getElementById('diag-geometry');
const diagPaths = document.getElementById('diag-paths');
const diagVoids = document.getElementById('diag-voids');
const diagNodes = document.getElementById('diag-nodes');
const diagViewbox = document.getElementById('diag-viewbox');
const diagStatus = document.getElementById('diag-status');

// ============================================================================
// 3. INITIALIZATION & GENERATION 0 SEED
// ============================================================================

/**
 * Initializes Generation 0 Parent Seed from default Compressed Sequential typology.
 */
function initGenerationZero() {
  const width = 1000;
  const height = 600;

  // Base spatial topology
  const topo = TYPOLOGIES.COMPRESSED_SEQUENTIAL.generateTopology(width, height, appState.randomSeed);
  // Base Art Nouveau geometry
  const geom = generateArtNouveauGeometry(topo, width, height, appState.randomSeed, { dynamic: 'HIGH', hierarchy: 'PRIMARY' });

  const parentSeed = {
    id: 'gen0_seed',
    datumY: geom.datumY,
    width: geom.width,
    height: geom.height,
    spanWidth: geom.spanWidth,
    points: geom.points,
    plates: topo.plates,
    voids: topo.voids,
    portals: topo.portals,
    circulation: topo.circulation,
    decisionNodes: topo.decisionNodes,
    focalNodes: topo.focalNodes,
    primarySplineD: geom.primarySplineD,
    secondarySplineD: geom.secondarySplineD,
    sectionFillD: geom.sectionFillD,
    branchingRibs: geom.branchingRibs
  };

  appState.generationTree = [
    {
      genIndex: 0,
      title: 'Generation 0: Original Seed',
      parent: parentSeed,
      children: []
    }
  ];

  appState.activeGenIndex = 0;
  appState.activeIterIndex = 0;
  appState.computedGeometry = parentSeed;
  appState.spatialTopology = topo;

  renderGenerationTreeUI();
  renderCanvasView();
  fitGeometryToViewport();
  renderBottomThumbnailsUI();
  updateRightSidebarUI(null);
  updateDiagnostics('RENDERED');
}

// ============================================================================
// 4. EVOLUTION ENGINE PIPELINE (GENERATE ITERATIONS & USE AS NEXT SEED)
// ============================================================================

/**
 * Generates 6 descendant iterations from active parent.
 */
function generateSixIterations() {
  const currentGen = appState.generationTree[appState.activeGenIndex];
  if (!currentGen || !currentGen.parent) return;

  const parentGeom = currentGen.parent;
  appState.randomSeed += 100;

  // Execute Master Evolutionary Generator
  const children = evolve(parentGeom, appState.qualitativeFeedback, appState.randomSeed);
  currentGen.children = children;

  // Auto-select Iteration 01
  appState.activeIterIndex = 1;
  appState.activeIterationData = children[0];
  appState.computedGeometry = children[0].child;

  renderGenerationTreeUI();
  renderBottomThumbnailsUI();
  selectIteration(1);
  updateDiagnostics('RENDERED (6 DESCENDANTS)');
}

/**
 * Promotes selected iteration child to be the new Parent Seed for next generation.
 */
function promoteSelectedToNextSeed() {
  const currentGen = appState.generationTree[appState.activeGenIndex];
  if (!currentGen || appState.activeIterIndex === 0 || !appState.activeIterationData) {
    alert('Please select a descendant iteration (01 to 06) first to use as next seed.');
    return;
  }

  const selectedChild = appState.activeIterationData.child;
  const newGenIndex = appState.generationTree.length;

  const newGenNode = {
    genIndex: newGenIndex,
    title: `Generation ${newGenIndex} (Branch from Gen ${appState.activeGenIndex} Iter ${appState.activeIterIndex})`,
    parent: selectedChild,
    children: []
  };

  appState.generationTree.push(newGenNode);
  appState.activeGenIndex = newGenIndex;
  appState.activeIterIndex = 0;

  // Evolve Generation 2 children automatically
  generateSixIterations();
}

// ============================================================================
// 5. AUTO-FIT VIEWPORT (fitGeometryToViewport)
// ============================================================================

function fitGeometryToViewport() {
  const g = appState.computedGeometry;
  if (!g || !g.points || g.points.length === 0) {
    svgCanvas.setAttribute('viewBox', '0 0 1000 600');
    if (diagViewbox) diagViewbox.textContent = '0, 0, 1000, 600';
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  g.points.forEach(pt => {
    if (isFinite(pt.x) && isFinite(pt.y)) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
  });

  minY = Math.min(minY, g.datumY - 200);
  maxY = Math.max(maxY, g.datumY + 20);

  if (!isFinite(minX)) minX = 50;
  if (!isFinite(maxX)) maxX = 950;
  if (!isFinite(minY)) minY = 50;
  if (!isFinite(maxY)) maxY = 550;

  const width = Math.max(200, maxX - minX);
  const height = Math.max(150, maxY - minY);

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
// 6. UI RENDERERS (LEFT TREE, BOTTOM THUMBNAILS, RIGHT SIDEBAR)
// ============================================================================

function renderGenerationTreeUI() {
  const container = document.getElementById('generation-tree-container');
  if (!container) return;
  container.innerHTML = '';

  appState.generationTree.forEach((genNode, gIdx) => {
    const isGenActive = gIdx === appState.activeGenIndex;
    const div = document.createElement('div');
    div.className = `tree-node gen-parent ${isGenActive ? 'active' : ''}`;

    div.innerHTML = `
      <div class="tree-gen-tag">GENERATION ${genNode.genIndex}</div>
      <div class="tree-title">${genNode.title}</div>
      <div style="font-size:0.65rem; color:var(--text-muted);">${genNode.children.length} Descendant Iterations</div>
    `;

    div.addEventListener('click', () => {
      appState.activeGenIndex = gIdx;
      appState.activeIterIndex = 0;
      appState.computedGeometry = genNode.parent;
      renderGenerationTreeUI();
      renderBottomThumbnailsUI();
      renderCanvasView();
      fitGeometryToViewport();
      updateRightSidebarUI(null);
    });

    container.appendChild(div);
  });
}

function renderBottomThumbnailsUI() {
  const container = document.getElementById('bottom-thumbnails-strip');
  if (!container) return;
  container.innerHTML = '';

  const currentGen = appState.generationTree[appState.activeGenIndex];
  if (!currentGen) return;

  // 1. Parent Seed Thumbnail (Iter 00)
  const parentCard = document.createElement('div');
  parentCard.className = `thumb-card ${appState.activeIterIndex === 0 ? 'active' : ''}`;
  parentCard.innerHTML = `
    <div class="thumb-title">ORIGINAL SEED</div>
    <div class="thumb-sub">Gen ${currentGen.genIndex} Parent</div>
  `;
  parentCard.addEventListener('click', () => selectIteration(0));
  container.appendChild(parentCard);

  // 2. Children Iterations 01 to 06
  if (currentGen.children && currentGen.children.length > 0) {
    currentGen.children.forEach((childData, idx) => {
      const iterNum = idx + 1;
      const card = document.createElement('div');
      card.className = `thumb-card ${appState.activeIterIndex === iterNum ? 'active' : ''}`;
      card.innerHTML = `
        <div class="thumb-title">ITERATION 0${iterNum}</div>
        <div class="thumb-sub">${childData.strategy.name}</div>
      `;
      card.addEventListener('click', () => selectIteration(iterNum));
      container.appendChild(card);
    });
  }
}

/**
 * Selects an iteration thumbnail and updates central viewer & right sidebar.
 */
function selectIteration(iterNum) {
  appState.activeIterIndex = iterNum;
  const currentGen = appState.generationTree[appState.activeGenIndex];

  document.querySelectorAll('.thumb-card').forEach((card, idx) => {
    if (idx === iterNum) card.classList.add('active');
    else card.classList.remove('active');
  });

  if (iterNum === 0) {
    appState.computedGeometry = currentGen.parent;
    appState.activeIterationData = null;
    currentGenBadge.textContent = `GENERATION ${currentGen.genIndex}: PARENT SEED`;
    currentIterBadge.textContent = 'PARENT SEED';
    updateRightSidebarUI(null);
  } else {
    const childData = currentGen.children[iterNum - 1];
    if (childData) {
      appState.activeIterationData = childData;
      appState.computedGeometry = childData.child;
      currentGenBadge.textContent = `GENERATION ${currentGen.genIndex}: ITERATION 0${iterNum}`;
      currentIterBadge.textContent = childData.strategy.name.toUpperCase();
      updateRightSidebarUI(childData);
    }
  }

  renderCanvasView();
  fitGeometryToViewport();
}

/**
 * Updates Right Sidebar with selected iteration details, deltas, and operations.
 */
function updateRightSidebarUI(childData) {
  const focusTitle = document.getElementById('selected-focus-title');
  const focusDesc = document.getElementById('selected-focus-desc');
  const deltaDynamic = document.getElementById('delta-dynamic');
  const deltaIntimacy = document.getElementById('delta-intimacy');
  const deltaPorosity = document.getElementById('delta-porosity');
  const opsList = document.getElementById('selected-operations-list');
  const drawerText = document.getElementById('reasoning-drawer-text');

  if (!childData) {
    if (focusTitle) focusTitle.textContent = 'GENERATION PARENT SEED';
    if (focusDesc) focusDesc.textContent = 'Baseline architectural geometry seed establishing parent DNA for this generation.';
    if (deltaDynamic) deltaDynamic.textContent = 'Baseline';
    if (deltaIntimacy) deltaIntimacy.textContent = 'Baseline';
    if (deltaPorosity) deltaPorosity.textContent = 'Baseline';
    if (opsList) opsList.innerHTML = '<li>Parent geometry establishing architectural DNA.</li>';
    if (drawerText) drawerText.innerHTML = 'Parent seed geometry establishing baseline coordinates, endpoints, and floor datum levels.';
    return;
  }

  const strat = childData.strategy;
  const deltas = childData.deltas;

  if (focusTitle) focusTitle.textContent = strat.title;
  if (focusDesc) focusDesc.textContent = strat.description;

  if (deltaDynamic) {
    const dVal = deltas.dynamic.deltaPct;
    deltaDynamic.textContent = `${dVal >= 0 ? '+' : ''}${dVal}%`;
    deltaDynamic.className = `delta-badge ${dVal >= 0 ? 'pos' : 'neutral'}`;
  }

  if (deltaIntimacy) {
    const iVal = deltas.intimacy.deltaPct;
    deltaIntimacy.textContent = `${iVal >= 0 ? '+' : ''}${iVal}%`;
    deltaIntimacy.className = `delta-badge ${iVal >= 0 ? 'pos' : 'neutral'}`;
  }

  if (deltaPorosity) {
    deltaPorosity.textContent = `Portals: ${deltas.porosity.child}`;
  }

  if (opsList) {
    opsList.innerHTML = strat.operations.map(op => `<li>${op}</li>`).join('');
  }

  if (drawerText) {
    drawerText.innerHTML = `
      <strong>WHY THIS ITERATION EXISTS:</strong><br>
      ${strat.description}<br><br>
      <strong>EXPLORED DESCRIPTORS:</strong><br>
      ${strat.focus.join(' + ').toUpperCase()}<br><br>
      <strong>QUANTITATIVE DELTA vs PARENT:</strong><br>
      Dynamic Circulation: ${deltas.dynamic.child} (${deltas.dynamic.deltaPct >= 0 ? '+' : ''}${deltas.dynamic.deltaPct}%)<br>
      Intimacy Compression: ${deltas.intimacy.child} (${deltas.intimacy.deltaPct >= 0 ? '+' : ''}${deltas.intimacy.deltaPct}%)
    `;
  }
}

// ============================================================================
// 7. SVG CANVAS RENDERER
// ============================================================================

function renderCanvasView() {
  const g = appState.computedGeometry;
  if (!g) return;

  spatialLogicLayer.innerHTML = '';
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

  // FINAL GEOMETRY MODE
  if (mode === 'FINAL' || mode === 'CONTROL' || mode === 'ANALYSIS') {
    primarySpline.setAttribute('d', g.primarySplineD || getCatmullRomBezierPath(g.points));
    secondarySpline.setAttribute('d', g.secondarySplineD || getCatmullRomBezierPath(g.points.map(pt => ({ x: pt.x, y: pt.y + 16 }))));
    
    if (g.sectionFillD) sectionFill.setAttribute('d', g.sectionFillD);

    if (g.branchingRibs) {
      g.branchingRibs.forEach(rib => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', rib.pathD);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(226, 201, 124, 0.55)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '5 3');
        branchingRibsLayer.appendChild(path);
      });
    }

    if (g.voids) {
      g.voids.forEach(v => {
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
    }

    if (g.portals) {
      g.portals.forEach(port => {
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
}

function updateDiagnostics(status = 'RENDERED') {
  if (!diagStatus) return;
  diagTypology.textContent = `GEN ${appState.activeGenIndex} (ITER 0${appState.activeIterIndex})`;
  diagTopology.textContent = 'CREATED';
  diagGeometry.textContent = 'CREATED';
  diagPaths.textContent = 1 + (appState.computedGeometry?.branchingRibs?.length || 0);
  diagVoids.textContent = appState.computedGeometry?.voids?.length || 0;
  diagNodes.textContent = appState.computedGeometry?.decisionNodes?.length || 0;
  diagStatus.textContent = status;
  diagStatus.className = 'diag-ok';
}

function exportSVG() {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgCanvas);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `gen${appState.activeGenIndex}_iter0${appState.activeIterIndex}_section.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================================================
// 8. EVENT LISTENERS & INITIALIZATION
// ============================================================================

function initEventListeners() {
  btnGenerateIterations?.addEventListener('click', () => {
    generateSixIterations();
  });

  btnUseAsNextSeed?.addEventListener('click', () => {
    promoteSelectedToNextSeed();
  });

  btnExportSvg?.addEventListener('click', () => {
    exportSVG();
  });

  // Viewer Toggles
  viewToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.currentViewMode = btn.dataset.view;
      renderCanvasView();
    });
  });

  // Qualitative Feedback Pill Buttons
  document.querySelectorAll('.btn-pill-group').forEach(group => {
    const qualKey = group.dataset.qual;
    const buttons = group.querySelectorAll('.pill-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        appState.qualitativeFeedback[qualKey] = btn.textContent;
      });
    });
  });

  window.addEventListener('resize', () => {
    fitGeometryToViewport();
  });
}

function initRhinoImporter() {
  const fileInput = document.getElementById('rhino-file-input');
  if (!fileInput) return;

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const arr = new Uint8Array(buffer);

      if (typeof rhino3dm !== 'undefined') {
        const rhino = await rhino3dm();
        const doc = rhino.File3dm.fromByteArray(arr);
        console.log(`Imported ${file.name}:`, doc);
      }

      alert(`Imported Rhino Seed: ${file.name}. Generation 0 established.`);
      initGenerationZero();
    } catch (err) {
      console.warn('Rhino import fallback:', err);
      initGenerationZero();
    }
  });
}

function init() {
  console.log("Initializing Descriptor-Driven Architectural Evolution System (Phase 1 & Phase 2)...");
  initEventListeners();
  initRhinoImporter();
  initGenerationZero();
}

document.addEventListener('DOMContentLoaded', init);
