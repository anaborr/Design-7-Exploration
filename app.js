/**
 * ============================================================================
 * DESIGN 7 EXPLORATION - DESCRIPTOR-DRIVEN ARCHITECTURAL EVOLUTION SYSTEM
 * MILESTONE 1 CONTROLLER
 * Handles zero-initial geometry start screen, browser-based Rhino .3dm import,
 * exact coordinate rendering, viewport auto-fitting, object metadata counts,
 * and 6-child seed clone technical proof test.
 * ============================================================================
 */

// ============================================================================
// 1. APPLICATION STATE
// ============================================================================

let appState = {
  // Imported Generation 0 Rhino Seed Data
  rhinoSeed: null,

  // Active Selected Geometry (Parent or Clone)
  activeGeometry: null,
  activeIterIndex: 0, // 0 = Parent Seed, 1..6 = Clones

  // 6 Descendant Clones for Technical Proof
  clones: [],

  // Lineage Tree
  generationTree: [],

  // View Mode: 'FINAL' (Geometry) or 'CONTROL' (Points)
  currentViewMode: 'FINAL'
};

// ============================================================================
// 2. DOM ELEMENTS
// ============================================================================

const svgCanvas = document.getElementById('svg-canvas');
const rhinoGeometryLayer = document.getElementById('rhino-geometry-layer');
const rhinoControlLayer = document.getElementById('rhino-control-layer');

// Overlays
const startScreenCard = document.getElementById('start-screen-card');
const canvasTagsOverlay = document.getElementById('canvas-tags-overlay');
const diagnosticsOverlay = document.getElementById('diagnostics-overlay');
const viewerTogglesOverlay = document.getElementById('viewer-toggles-overlay');

// Badges & Buttons
const currentGenBadge = document.getElementById('current-generation-badge');
const currentIterBadge = document.getElementById('current-iteration-badge');

const btnRhinoFileInput = document.getElementById('rhino-file-input');
const btnRhinoFileInputMain = document.getElementById('rhino-file-input-main');
const btnLoadSampleSeed = document.getElementById('btn-load-sample-seed');
const btnStartSample = document.getElementById('btn-start-sample');
const btnCloneSeedTest = document.getElementById('btn-clone-seed-test');
const btnGenerateIterations = document.getElementById('btn-generate-iterations');
const btnUseAsNextSeed = document.getElementById('btn-use-as-next-seed');
const btnExportSvg = document.getElementById('btn-export-svg');
const viewToggleBtns = document.querySelectorAll('.view-toggle-btn');

// Diagnostics Elements
const diagFilename = document.getElementById('diag-filename');
const diagObjects = document.getElementById('diag-objects');
const diagCurves = document.getElementById('diag-curves');
const diagPolylines = document.getElementById('diag-polylines');
const diagClosed = document.getElementById('diag-closed');
const diagPoints = document.getElementById('diag-points');
const diagUnits = document.getElementById('diag-units');
const diagBounds = document.getElementById('diag-bounds');
const diagStatus = document.getElementById('diag-status');

// Inspector Elements
const seedInspectorTitle = document.getElementById('seed-inspector-title');
const seedInspectorDesc = document.getElementById('seed-inspector-desc');
const metaObjectsCount = document.getElementById('meta-objects-count');
const metaCurvesCount = document.getElementById('meta-curves-count');
const metaPolylinesCount = document.getElementById('meta-polylines-count');
const metaClosedCount = document.getElementById('meta-closed-count');
const metaPointsCount = document.getElementById('meta-points-count');
const metaWidth = document.getElementById('meta-width');
const metaHeight = document.getElementById('meta-height');
const metaUnits = document.getElementById('meta-units');

// Container Strips
const generationTreeContainer = document.getElementById('generation-tree-container');
const bottomThumbnailsStrip = document.getElementById('bottom-thumbnails-strip');

// ============================================================================
// 3. RHINO .3DM FILE PARSER (rhino3dm.js)
// ============================================================================

let rhinoModule = null;

async function getRhinoModule() {
  if (!rhinoModule && typeof rhino3dm !== 'undefined') {
    rhinoModule = await rhino3dm();
  }
  return rhinoModule;
}

/**
 * Parses binary buffer of a Rhino .3dm file into exact geometric object primitives.
 */
async function processRhinoBuffer(buffer, filename = 'Imported_Seed.3dm') {
  try {
    const rhino = await getRhinoModule();
    if (!rhino) {
      alert('Rhino3dm module is loading. Please try again in a moment.');
      return;
    }

    const arr = new Uint8Array(buffer);
    const doc = rhino.File3dm.fromByteArray(arr);

    if (!doc) {
      alert('Could not parse Rhino .3dm file structure.');
      return;
    }

    const objectsTable = doc.objects();
    const parsedObjects = [];

    let countCurves = 0;
    let countPolylines = 0;
    let countClosed = 0;
    let countPoints = 0;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < objectsTable.count; i++) {
      const fileObj = objectsTable.get(i);
      const geom = fileObj.geometry();
      if (!geom) continue;

      // Check Point geometry
      if (geom.location) {
        countPoints++;
        const pt = geom.location;
        const px = Array.isArray(pt) ? pt[0] : pt.x;
        const py = Array.isArray(pt) ? pt[1] : pt.y;
        const pz = Array.isArray(pt) ? (pt[2] || 0) : (pt.z || 0);

        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minY = Math.min(minY, py); maxY = Math.max(maxY, py);

        parsedObjects.push({
          id: `obj_${i}`,
          type: 'point',
          isClosed: false,
          rhinoTypeStr: 'Point',
          points: [{ x: px, y: py, z: pz }]
        });
      }
      // Check Curve / Polyline / Closed Curve geometry
      else if (typeof geom.domain !== 'undefined' || typeof geom.isClosed !== 'undefined') {
        const isClosed = Boolean(geom.isClosed);
        const isPolyline = Boolean(geom.isPolyline || geom.degree === 1);
        let typeStr = 'curve';

        if (isClosed) {
          typeStr = 'closed_curve';
          countClosed++;
        } else if (isPolyline) {
          typeStr = 'polyline';
          countPolylines++;
        } else {
          typeStr = 'curve';
          countCurves++;
        }

        const pts = [];
        let poly = null;
        try {
          if (typeof geom.toPolyline === 'function') poly = geom.toPolyline();
        } catch (e) {}

        if (poly && poly.count) {
          for (let pIdx = 0; pIdx < poly.count; pIdx++) {
            const pt = poly.get(pIdx);
            const px = Array.isArray(pt) ? pt[0] : pt.x;
            const py = Array.isArray(pt) ? pt[1] : pt.y;
            const pz = Array.isArray(pt) ? (pt[2] || 0) : (pt.z || 0);
            pts.push({ x: px, y: py, z: pz });

            minX = Math.min(minX, px); maxX = Math.max(maxX, px);
            minY = Math.min(minY, py); maxY = Math.max(maxY, py);
          }
        } else {
          // Sample curve parameter domain
          const domain = geom.domain || [0, 1];
          const numSamples = isPolyline ? 10 : 50;
          for (let s = 0; s <= numSamples; s++) {
            const t = domain[0] + (domain[1] - domain[0]) * (s / numSamples);
            const pt = geom.pointAt(t);
            if (pt) {
              const px = Array.isArray(pt) ? pt[0] : pt.x;
              const py = Array.isArray(pt) ? pt[1] : pt.y;
              const pz = Array.isArray(pt) ? (pt[2] || 0) : (pt.z || 0);
              pts.push({ x: px, y: py, z: pz });

              minX = Math.min(minX, px); maxX = Math.max(maxX, px);
              minY = Math.min(minY, py); maxY = Math.max(maxY, py);
            }
          }
        }

        parsedObjects.push({
          id: `obj_${i}`,
          type: typeStr,
          isClosed,
          rhinoTypeStr: geom.objectType ? (geom.objectType.name || typeStr) : typeStr,
          points: pts
        });
      }
    }

    if (!isFinite(minX)) { minX = 0; maxX = 100; minY = 0; maxY = 100; }

    const width = Math.max(10, maxX - minX);
    const height = Math.max(10, maxY - minY);

    const unitsStr = doc.settings()?.modelUnits?.name || 'mm';

    const rhinoSeed = {
      filename,
      objectCount: parsedObjects.length,
      counts: {
        curves: countCurves,
        polylines: countPolylines,
        closedCurves: countClosed,
        points: countPoints
      },
      objects: parsedObjects,
      bounds: { minX, minY, maxX, maxY, width, height },
      units: unitsStr
    };

    appState.rhinoSeed = rhinoSeed;
    appState.activeGeometry = rhinoSeed;
    appState.generationTree = [
      {
        genIndex: 0,
        title: 'Generation 0: Rhino Seed',
        geometry: rhinoSeed
      }
    ];

    // Enable Clone Seed Test Button
    btnCloneSeedTest.disabled = false;

    // Render imported seed
    renderRhinoSeedView(rhinoSeed);
    runCloneSeedTest();
  } catch (err) {
    console.error('Error parsing Rhino file:', err);
    alert('Error reading Rhino file: ' + err.message);
  }
}

/**
 * Creates and loads a sample .3dm file programmatically directly in browser.
 */
async function loadSampleRhinoSeed() {
  try {
    const rhino = await getRhinoModule();
    if (!rhino) {
      alert('Rhino module initializing...');
      return;
    }

    const doc = new rhino.File3dm();

    // 1. Curve 1: Roof Arc/Spline (3 curves requirement)
    const curve1 = new rhino.NurbsCurve(3, 4);
    const cpts1 = curve1.points();
    cpts1.set(0, [20, 180, 0, 1.0]);
    cpts1.set(1, [120, 240, 0, 1.0]);
    cpts1.set(2, [280, 150, 0, 1.0]);
    cpts1.set(3, [380, 210, 0, 1.0]);
    doc.objects().addCurve(curve1);

    // 2. Curve 2: Floor Spline
    const curve2 = new rhino.NurbsCurve(3, 4);
    const cpts2 = curve2.points();
    cpts2.set(0, [20, 40, 0, 1.0]);
    cpts2.set(1, [140, 30, 0, 1.0]);
    cpts2.set(2, [260, 60, 0, 1.0]);
    cpts2.set(3, [380, 40, 0, 1.0]);
    doc.objects().addCurve(curve2);

    // 3. Curve 3: Mezzanine Spline
    const curve3 = new rhino.NurbsCurve(3, 4);
    const cpts3 = curve3.points();
    cpts3.set(0, [150, 110, 0, 1.0]);
    cpts3.set(1, [220, 130, 0, 1.0]);
    cpts3.set(2, [310, 90, 0, 1.0]);
    cpts3.set(3, [380, 110, 0, 1.0]);
    doc.objects().addCurve(curve3);

    // 4. Polyline 1: Structural Column Grid (2 polylines requirement)
    const poly1 = new rhino.Polyline(3);
    poly1.add(50, 40, 0);
    poly1.add(50, 195, 0);
    poly1.add(65, 205, 0);
    doc.objects().addPolyline(poly1);

    // 5. Polyline 2: Access Staircase
    const poly2 = new rhino.Polyline(4);
    poly2.add(150, 40, 0);
    poly2.add(150, 75, 0);
    poly2.add(180, 75, 0);
    poly2.add(180, 115, 0);
    doc.objects().addPolyline(poly2);

    // 6. Closed Curve 1: Carved Central Void (1 closed curve requirement)
    const closedCircle = new rhino.Circle(100); // radius 100
    const circleCurve = closedCircle.toNurbsCurve();
    circleCurve.translate([200, 120, 0]);
    doc.objects().addCurve(circleCurve);

    // Convert document to byte array
    const byteArray = doc.toByteArray();
    await processRhinoBuffer(byteArray.buffer, 'Sample_Rhino_Seed.3dm');
  } catch (e) {
    console.error('Error generating sample seed:', e);
  }
}

// ============================================================================
// 4. CLONE GEOMETRY & TEST PROOF
// ============================================================================

/**
 * Deep clones imported Rhino seed object structure.
 */
function cloneRhinoSeed(seed) {
  if (!seed) return null;
  return {
    filename: seed.filename,
    objectCount: seed.objectCount,
    counts: { ...seed.counts },
    units: seed.units,
    bounds: { ...seed.bounds },
    objects: seed.objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      isClosed: obj.isClosed,
      rhinoTypeStr: obj.rhinoTypeStr,
      points: obj.points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z }))
    }))
  };
}

/**
 * Executes Milestone 1 Clone Test: Clones Rhino seed 6 times and populates carousel.
 */
function runCloneSeedTest() {
  if (!appState.rhinoSeed) return;

  const clones = [];
  for (let i = 1; i <= 6; i++) {
    clones.push(cloneRhinoSeed(appState.rhinoSeed));
  }
  appState.clones = clones;

  renderBottomThumbnailsCarousel();
}

// ============================================================================
// 5. VIEWPORT RENDERING & FIT
// ============================================================================

function fitImportedGeometryToViewport(bounds) {
  if (!bounds) return;

  const padX = Math.max(10, bounds.width * 0.12);
  const padY = Math.max(10, bounds.height * 0.12);

  const vX = Math.round(bounds.minX - padX);
  // SVG Y is inverted relative to standard Rhino Y (Y+ Up in Rhino -> Y- in SVG)
  // We flip Y coordinates when building path d strings: svgY = -rhinoY
  const minSvgY = -bounds.maxY;
  const maxSvgY = -bounds.minY;
  const vY = Math.round(minSvgY - padY);
  const vW = Math.round(bounds.width + padX * 2);
  const vH = Math.round(bounds.height + padY * 2);

  const viewBoxStr = `${vX} ${vY} ${vW} ${vH}`;
  svgCanvas.setAttribute('viewBox', viewBoxStr);
}

function renderRhinoSeedView(seed) {
  if (!seed) return;

  // Hide start screen overlay
  if (startScreenCard) startScreenCard.style.display = 'none';
  if (canvasTagsOverlay) canvasTagsOverlay.style.display = 'flex';
  if (diagnosticsOverlay) diagnosticsOverlay.style.display = 'block';
  if (viewerTogglesOverlay) viewerTogglesOverlay.style.display = 'block';

  // Render SVG Paths
  rhinoGeometryLayer.innerHTML = '';
  rhinoControlLayer.innerHTML = '';

  seed.objects.forEach(obj => {
    if (obj.type === 'point') {
      const pt = obj.points[0];
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pt.x.toFixed(2));
      circle.setAttribute('cy', (-pt.y).toFixed(2));
      circle.setAttribute('r', '3');
      circle.setAttribute('fill', 'var(--accent-gold)');
      circle.setAttribute('filter', 'url(#glow)');
      rhinoGeometryLayer.appendChild(circle);
    } else if (obj.points.length > 0) {
      let d = '';
      obj.points.forEach((pt, pIdx) => {
        const svgX = pt.x.toFixed(2);
        const svgY = (-pt.y).toFixed(2);
        d += (pIdx === 0 ? `M ${svgX},${svgY}` : ` L ${svgX},${svgY}`);
      });
      if (obj.isClosed) d += ' Z';

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);

      if (obj.isClosed) {
        path.setAttribute('fill', 'rgba(226, 201, 124, 0.12)');
        path.setAttribute('stroke', 'var(--accent-gold)');
        path.setAttribute('stroke-width', '2');
      } else if (obj.type === 'polyline') {
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--accent-cyan)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '5 3');
      } else {
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'url(#spline-gradient)');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('filter', 'url(#glow)');
      }

      rhinoGeometryLayer.appendChild(path);

      // Render control handles if CONTROL mode
      if (appState.currentViewMode === 'CONTROL') {
        obj.points.forEach(pt => {
          const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          handle.setAttribute('cx', pt.x.toFixed(2));
          handle.setAttribute('cy', (-pt.y).toFixed(2));
          handle.setAttribute('r', '3');
          handle.setAttribute('fill', '#ffffff');
          rhinoControlLayer.appendChild(handle);
        });
      }
    }
  });

  fitImportedGeometryToViewport(seed.bounds);
  updateDiagnosticsAndInspector(seed);
  renderGenerationTreeUI();
}

function updateDiagnosticsAndInspector(seed) {
  if (!seed) return;

  // Diagnostics Box
  if (diagFilename) diagFilename.textContent = seed.filename;
  if (diagObjects) diagObjects.textContent = seed.objectCount;
  if (diagCurves) diagCurves.textContent = seed.counts.curves;
  if (diagPolylines) diagPolylines.textContent = seed.counts.polylines;
  if (diagClosed) diagClosed.textContent = seed.counts.closedCurves;
  if (diagPoints) diagPoints.textContent = seed.counts.points;
  if (diagUnits) diagUnits.textContent = seed.units;
  if (diagBounds) diagBounds.textContent = `${seed.bounds.width.toFixed(0)}x${seed.bounds.height.toFixed(0)}`;
  if (diagStatus) diagStatus.textContent = 'RHINO SEED LOADED';

  // Right Inspector
  if (seedInspectorTitle) seedInspectorTitle.textContent = seed.filename;
  if (seedInspectorDesc) seedInspectorDesc.textContent = `Original Rhino Seed establishing architectural DNA across ${seed.objectCount} geometric objects.`;
  if (metaObjectsCount) metaObjectsCount.textContent = seed.objectCount;
  if (metaCurvesCount) metaCurvesCount.textContent = seed.counts.curves;
  if (metaPolylinesCount) metaPolylinesCount.textContent = seed.counts.polylines;
  if (metaClosedCount) metaClosedCount.textContent = seed.counts.closedCurves;
  if (metaPointsCount) metaPointsCount.textContent = seed.counts.points;
  if (metaWidth) metaWidth.textContent = `${seed.bounds.width.toFixed(1)} ${seed.units}`;
  if (metaHeight) metaHeight.textContent = `${seed.bounds.height.toFixed(1)} ${seed.units}`;
  if (metaUnits) metaUnits.textContent = seed.units;
}

function renderGenerationTreeUI() {
  if (!generationTreeContainer) return;
  generationTreeContainer.innerHTML = '';

  appState.generationTree.forEach(gen => {
    const div = document.createElement('div');
    div.className = 'tree-node gen-parent active';
    div.innerHTML = `
      <div class="tree-gen-tag">GENERATION 0</div>
      <div class="tree-title">${gen.title}</div>
      <div style="font-size:0.65rem; color:var(--text-muted);">${gen.geometry.objectCount} Objects (${gen.geometry.counts.curves} curves, ${gen.geometry.counts.polylines} polylines)</div>
    `;
    generationTreeContainer.appendChild(div);
  });
}

function renderBottomThumbnailsCarousel() {
  if (!bottomThumbnailsStrip) return;
  bottomThumbnailsStrip.innerHTML = '';

  if (!appState.rhinoSeed) return;

  // 0. Parent Card
  const parentCard = document.createElement('div');
  parentCard.className = `thumb-card ${appState.activeIterIndex === 0 ? 'active' : ''}`;
  parentCard.innerHTML = `
    <div class="thumb-title">ORIGINAL SEED</div>
    <div class="thumb-sub">Generation 0 Parent</div>
  `;
  parentCard.addEventListener('click', () => selectThumbnail(0));
  bottomThumbnailsStrip.appendChild(parentCard);

  // 1..6 Clone Cards
  appState.clones.forEach((clone, idx) => {
    const iterNum = idx + 1;
    const card = document.createElement('div');
    card.className = `thumb-card ${appState.activeIterIndex === iterNum ? 'active' : ''}`;
    card.innerHTML = `
      <div class="thumb-title">ITERATION 0${iterNum}</div>
      <div class="thumb-sub">Clone Seed ${iterNum}</div>
    `;
    card.addEventListener('click', () => selectThumbnail(iterNum));
    bottomThumbnailsStrip.appendChild(card);
  });
}

function selectThumbnail(iterNum) {
  appState.activeIterIndex = iterNum;

  document.querySelectorAll('.thumb-card').forEach((card, idx) => {
    if (idx === iterNum) card.classList.add('active');
    else card.classList.remove('active');
  });

  if (iterNum === 0) {
    appState.activeGeometry = appState.rhinoSeed;
    currentGenBadge.textContent = 'GENERATION 0: ORIGINAL RHINO SEED';
    currentIterBadge.textContent = 'RHINO SEED';
  } else {
    appState.activeGeometry = appState.clones[iterNum - 1];
    currentGenBadge.textContent = `GENERATION 0: CLONE 0${iterNum}`;
    currentIterBadge.textContent = `CLONE 0${iterNum}`;
  }

  renderRhinoSeedView(appState.activeGeometry);
}

function exportSVG() {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgCanvas);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `rhino_seed_gen0_iter0${appState.activeIterIndex}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================================================
// 6. EVENT LISTENERS & INITIALIZATION
// ============================================================================

function initEventListeners() {
  // File inputs
  [btnRhinoFileInput, btnRhinoFileInputMain].forEach(input => {
    input?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const buffer = await file.arrayBuffer();
      await processRhinoBuffer(buffer, file.name);
    });
  });

  // Load sample seed buttons
  [btnLoadSampleSeed, btnStartSample].forEach(btn => {
    btn?.addEventListener('click', () => {
      loadSampleRhinoSeed();
    });
  });

  // Clone Seed Test button
  btnCloneSeedTest?.addEventListener('click', () => {
    runCloneSeedTest();
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
      if (appState.activeGeometry) {
        renderRhinoSeedView(appState.activeGeometry);
      }
    });
  });

  window.addEventListener('resize', () => {
    if (appState.activeGeometry) {
      fitImportedGeometryToViewport(appState.activeGeometry.bounds);
    }
  });
}

function init() {
  console.log("Initializing Descriptor-Driven Architectural Evolution System (Milestone 1)...");
  initEventListeners();
  // Zero initial geometry: Start Screen card is visible until user imports a .3dm file.
}

document.addEventListener('DOMContentLoaded', init);
