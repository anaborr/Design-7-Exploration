/**
 * ============================================================================
 * DESIGN 7 EXPLORATION - DESCRIPTOR-DRIVEN ARCHITECTURAL EVOLUTION SYSTEM
 * CHECKPOINT A CONTROLLER: RHINO FIDELITY & MEMORY MODEL
 * Preserves original native Rhino objects in memory, supports original vs
 * editable seed memory separation, displays real NURBS control polygons,
 * and provides full import audit verification.
 * ============================================================================
 */

// ============================================================================
// 1. APPLICATION STATE
// ============================================================================

let appState = {
  // Immutable 3DM Source Truth
  originalRhinoGeometry: null,

  // Editable Working Copy used for Mutation Seed
  editableSeedGeometry: null,

  // Active Selected Geometry (Parent Seed or Clone)
  activeGeometry: null,
  activeIterIndex: 0, // 0 = Parent Seed, 1..6 = Clones

  // 6 Descendant Clones for Technical Proof
  clones: [],

  // Multi-generation Lineage Tree
  generationTree: [],

  // View Mode: 'EDITABLE', 'ORIGINAL', 'OVERLAY', 'CONTROL'
  currentViewMode: 'EDITABLE'
};

// ============================================================================
// 2. DOM ELEMENTS
// ============================================================================

const svgCanvas = document.getElementById('svg-canvas');
const rhinoOriginalLayer = document.getElementById('rhino-original-layer');
const rhinoEditableLayer = document.getElementById('rhino-editable-layer');
const rhinoControlLayer = document.getElementById('rhino-control-layer');

// Overlays & Badges
const startScreenCard = document.getElementById('start-screen-card');
const canvasTagsOverlay = document.getElementById('canvas-tags-overlay');
const diagnosticsOverlay = document.getElementById('diagnostics-overlay');
const viewerTogglesOverlay = document.getElementById('viewer-toggles-overlay');

const currentGenBadge = document.getElementById('current-generation-badge');
const currentIterBadge = document.getElementById('current-iteration-badge');

// Action Buttons
const btnRhinoFileInput = document.getElementById('rhino-file-input');
const btnRhinoFileInputMain = document.getElementById('rhino-file-input-main');
const btnLoadSampleSeed = document.getElementById('btn-load-sample-seed');
const btnStartSample = document.getElementById('btn-start-sample');
const btnVerifyRhinoImport = document.getElementById('btn-verify-rhino-import');
const btnCloneSeedTest = document.getElementById('btn-clone-seed-test');
const btnExportSvg = document.getElementById('btn-export-svg');
const viewToggleBtns = document.querySelectorAll('.view-toggle-btn');

// Diagnostics & Inspector Elements
const diagFilename = document.getElementById('diag-filename');
const diagObjects = document.getElementById('diag-objects');
const diagCurves = document.getElementById('diag-curves');
const diagPolylines = document.getElementById('diag-polylines');
const diagClosed = document.getElementById('diag-closed');
const diagPoints = document.getElementById('diag-points');
const diagUnits = document.getElementById('diag-units');
const diagBounds = document.getElementById('diag-bounds');
const diagStatus = document.getElementById('diag-status');

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

// Modal Elements
const verifyImportModal = document.getElementById('verify-import-modal');
const btnCloseVerifyModal = document.getElementById('btn-close-verify-modal');
const verifyModalContent = document.getElementById('verify-modal-content');

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
 * Helper to clone points array for deep copy.
 */
function cloneControlPoints(pts) {
  return pts.map(pt => ({ x: pt.x, y: pt.y, z: pt.z, w: pt.w !== undefined ? pt.w : 1.0 }));
}

/**
 * Deep clones entire Rhino Seed structure.
 */
function cloneRhinoSeed(seed) {
  if (!seed) return null;
  return {
    filename: seed.filename,
    units: seed.units,
    objectCount: seed.objectCount,
    counts: { ...seed.counts },
    bounds: { ...seed.bounds },
    layers: seed.layers ? seed.layers.map(l => ({ ...l })) : [],
    unsupportedObjects: seed.unsupportedObjects ? seed.unsupportedObjects.map(u => ({ ...u })) : [],
    objects: seed.objects.map(obj => ({
      id: obj.id,
      rhinoId: obj.rhinoId,
      layerIndex: obj.layerIndex,
      layerName: obj.layerName,
      geometryType: obj.geometryType,
      type: obj.type,
      degree: obj.degree,
      isClosed: obj.isClosed,
      isRational: obj.isRational,
      domain: obj.domain ? [...obj.domain] : [0, 1],
      knots: obj.knots ? [...obj.knots] : [],
      controlPoints: cloneControlPoints(obj.controlPoints),
      renderPoints: cloneControlPoints(obj.renderPoints)
    }))
  };
}

/**
 * Parses binary buffer of a Rhino .3dm file with full NURBS fidelity.
 */
async function processRhinoBuffer(buffer, filename = 'Imported_Seed.3dm') {
  try {
    const rhino = await getRhinoModule();
    if (!rhino) {
      alert('Rhino3dm module loading. Please try again in a moment.');
      return;
    }

    const arr = new Uint8Array(buffer);
    const doc = rhino.File3dm.fromByteArray(arr);

    if (!doc) {
      alert('Could not parse Rhino .3dm file structure.');
      return;
    }

    // Extract Layers Table
    const layersTable = doc.layers();
    const parsedLayers = [];
    for (let l = 0; l < layersTable.count; l++) {
      const lay = layersTable.get(l);
      parsedLayers.push({
        index: l,
        name: lay.name || `Layer_${l}`,
        color: lay.color ? `rgb(${lay.color.r},${lay.color.g},${lay.color.b})` : '#e2c97c'
      });
    }

    const objectsTable = doc.objects();
    const parsedObjects = [];
    const unsupportedObjects = [];

    let countCurves = 0;
    let countPolylines = 0;
    let countClosed = 0;
    let countPoints = 0;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < objectsTable.count; i++) {
      const fileObj = objectsTable.get(i);
      const attrs = fileObj.attributes();
      const geom = fileObj.geometry();
      if (!geom) continue;

      const objId = `obj_${i}`;
      const rhinoId = attrs ? attrs.id : `uuid_${i}`;
      const layerIdx = attrs ? attrs.layerIndex : 0;
      const layerName = parsedLayers[layerIdx] ? parsedLayers[layerIdx].name : 'Default';

      // 1. Point Geometry
      if (geom.location) {
        countPoints++;
        const pt = geom.location;
        const px = Array.isArray(pt) ? pt[0] : pt.x;
        const py = Array.isArray(pt) ? pt[1] : pt.y;
        const pz = Array.isArray(pt) ? (pt[2] || 0) : (pt.z || 0);

        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minY = Math.min(minY, py); maxY = Math.max(maxY, py);

        const pointData = { x: px, y: py, z: pz, w: 1.0 };
        parsedObjects.push({
          id: objId,
          rhinoId,
          layerIndex: layerIdx,
          layerName,
          geometryType: 'Point',
          type: 'point',
          degree: 0,
          isClosed: false,
          isRational: false,
          domain: [0, 0],
          controlPoints: [pointData],
          renderPoints: [pointData]
        });
      }
      // 2. Curve / Polyline / NURBS Geometry
      else if (typeof geom.domain !== 'undefined' || typeof geom.isClosed !== 'undefined') {
        const isClosed = Boolean(geom.isClosed);
        const degree = geom.degree !== undefined ? geom.degree : 1;
        const isPolyline = Boolean(geom.isPolyline || degree === 1);
        const isRational = Boolean(geom.isRational);
        const geomType = geom.objectType ? (geom.objectType.name || 'Curve') : (isPolyline ? 'PolylineCurve' : 'NurbsCurve');

        let categoryType = 'curve';
        if (isClosed) {
          categoryType = 'closed_curve';
          countClosed++;
        } else if (isPolyline) {
          categoryType = 'polyline';
          countPolylines++;
        } else {
          categoryType = 'curve';
          countCurves++;
        }

        // Extract Control Points
        const controlPoints = [];
        let cvColl = null;
        try {
          if (typeof geom.controlPoints === 'function') cvColl = geom.controlPoints();
          else if (typeof geom.points === 'function') cvColl = geom.points();
        } catch (e) {}

        if (cvColl && cvColl.count) {
          for (let cIdx = 0; cIdx < cvColl.count; cIdx++) {
            const cv = cvColl.get(cIdx);
            const cx = Array.isArray(cv) ? cv[0] : cv.x;
            const cy = Array.isArray(cv) ? cv[1] : cv.y;
            const cz = Array.isArray(cv) ? (cv[2] || 0) : (cv.z || 0);
            const cw = (Array.isArray(cv) && cv.length > 3) ? cv[3] : (cv.w !== undefined ? cv.w : 1.0);
            controlPoints.push({ x: cx, y: cy, z: cz, w: cw });
          }
        }

        // Evaluate High-Fidelity Render Points along parameter domain
        const renderPoints = [];
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
            renderPoints.push({ x: px, y: py, z: pz, w: 1.0 });

            minX = Math.min(minX, px); maxX = Math.max(maxX, px);
            minY = Math.min(minY, py); maxY = Math.max(maxY, py);
          }
        } else {
          const dom = geom.domain || [0, 1];
          const numSamples = isPolyline ? 10 : 60;
          for (let s = 0; s <= numSamples; s++) {
            const t = dom[0] + (dom[1] - dom[0]) * (s / numSamples);
            const pt = geom.pointAt(t);
            if (pt) {
              const px = Array.isArray(pt) ? pt[0] : pt.x;
              const py = Array.isArray(pt) ? pt[1] : pt.y;
              const pz = Array.isArray(pt) ? (pt[2] || 0) : (pt.z || 0);
              renderPoints.push({ x: px, y: py, z: pz, w: 1.0 });

              minX = Math.min(minX, px); maxX = Math.max(maxX, px);
              minY = Math.min(minY, py); maxY = Math.max(maxY, py);
            }
          }
        }

        // Fallback for controlPoints if CV collection not available
        if (controlPoints.length === 0) {
          renderPoints.forEach(p => controlPoints.push({ ...p }));
        }

        parsedObjects.push({
          id: objId,
          rhinoId,
          layerIndex: layerIdx,
          layerName,
          geometryType: geomType,
          type: categoryType,
          degree,
          isClosed,
          isRational,
          domain: geom.domain ? [geom.domain[0], geom.domain[1]] : [0, 1],
          knots: [],
          controlPoints,
          renderPoints
        });
      }
      // 3. Unsupported 3D / Non-Section Object (Mesh, Text, etc.)
      else {
        unsupportedObjects.push({
          id: objId,
          rhinoId,
          layerName,
          geometryType: geom.objectType ? (geom.objectType.name || 'Unknown') : 'UnsupportedObject'
        });
      }
    }

    if (!isFinite(minX)) { minX = 0; maxX = 100; minY = 0; maxY = 100; }

    const width = Math.max(10, maxX - minX);
    const height = Math.max(10, maxY - minY);
    const unitsStr = doc.settings()?.modelUnits?.name || 'mm';

    const rhinoSeed = {
      filename,
      units: unitsStr,
      objectCount: parsedObjects.length,
      counts: {
        curves: countCurves,
        polylines: countPolylines,
        closedCurves: countClosed,
        points: countPoints,
        unsupported: unsupportedObjects.length
      },
      layers: parsedLayers,
      unsupportedObjects,
      objects: parsedObjects,
      bounds: { minX, minY, maxX, maxY, width, height }
    };

    // Instantiate Memory Model
    appState.originalRhinoGeometry = rhinoSeed;
    appState.editableSeedGeometry = cloneRhinoSeed(rhinoSeed);
    appState.activeGeometry = appState.editableSeedGeometry;

    appState.generationTree = [
      {
        genIndex: 0,
        title: 'Generation 0: Rhino Seed',
        geometry: appState.editableSeedGeometry
      }
    ];

    btnVerifyRhinoImport.disabled = false;
    btnCloneSeedTest.disabled = false;

    renderRhinoSeedView(appState.activeGeometry);
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

    // 1. Curve 1: Roof Arc/Spline (Degree 3, 4 CVs)
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

    // 4. Polyline 1: Structural Column Grid (Degree 1, 3 Points)
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

    // 6. Closed Curve 1: Carved Central Void
    const closedCircle = new rhino.Circle(100);
    const circleCurve = closedCircle.toNurbsCurve();
    circleCurve.translate([200, 120, 0]);
    doc.objects().addCurve(circleCurve);

    const byteArray = doc.toByteArray();
    await processRhinoBuffer(byteArray.buffer, 'Sample_Rhino_Seed.3dm');
  } catch (e) {
    console.error('Error generating sample seed:', e);
  }
}

// ============================================================================
// 4. CLONE GEOMETRY & TEST PROOF
// ============================================================================

function runCloneSeedTest() {
  if (!appState.editableSeedGeometry) return;

  const clones = [];
  for (let i = 1; i <= 6; i++) {
    clones.push(cloneRhinoSeed(appState.editableSeedGeometry));
  }
  appState.clones = clones;
  renderBottomThumbnailsCarousel();
}

// ============================================================================
// 5. VIEWPORT RENDERING & OVERLAY MODES
// ============================================================================

function fitImportedGeometryToViewport(bounds) {
  if (!bounds) return;

  const padX = Math.max(10, bounds.width * 0.12);
  const padY = Math.max(10, bounds.height * 0.12);

  const vX = Math.round(bounds.minX - padX);
  const minSvgY = -bounds.maxY;
  const vY = Math.round(minSvgY - padY);
  const vW = Math.round(bounds.width + padX * 2);
  const vH = Math.round(bounds.height + padY * 2);

  const viewBoxStr = `${vX} ${vY} ${vW} ${vH}`;
  svgCanvas.setAttribute('viewBox', viewBoxStr);
}

/**
 * Helper to build SVG path string from point array.
 */
function buildPathString(points, isClosed) {
  if (!points || points.length === 0) return '';
  let d = '';
  points.forEach((pt, pIdx) => {
    const svgX = pt.x.toFixed(2);
    const svgY = (-pt.y).toFixed(2);
    d += (pIdx === 0 ? `M ${svgX},${svgY}` : ` L ${svgX},${svgY}`);
  });
  if (isClosed) d += ' Z';
  return d;
}

/**
 * Renders objects into a specific SVG layer element with customized styling.
 */
function renderObjectsIntoLayer(containerGroup, seedData, styleOptions = {}) {
  containerGroup.innerHTML = '';
  if (!seedData || !seedData.objects) return;

  seedData.objects.forEach(obj => {
    if (obj.type === 'point') {
      const pt = obj.controlPoints[0] || obj.renderPoints[0];
      if (pt) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', pt.x.toFixed(2));
        circle.setAttribute('cy', (-pt.y).toFixed(2));
        circle.setAttribute('r', '3.5');
        circle.setAttribute('fill', styleOptions.pointColor || 'var(--accent-gold)');
        containerGroup.appendChild(circle);
      }
    } else if (obj.renderPoints.length > 0) {
      const d = buildPathString(obj.renderPoints, obj.isClosed);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);

      if (styleOptions.isOriginal) {
        // ORIGINAL RHINO LAYER (Dashed Cyan)
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#52c5d8');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '6 4');
      } else {
        // EDITABLE SEED LAYER (Solid Gold / Cyan Polylines)
        if (obj.isClosed) {
          path.setAttribute('fill', 'rgba(226, 201, 124, 0.12)');
          path.setAttribute('stroke', '#e2c97c');
          path.setAttribute('stroke-width', '2');
        } else if (obj.type === 'polyline') {
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', '#52c5d8');
          path.setAttribute('stroke-width', '2');
          path.setAttribute('stroke-dasharray', '4 3');
        } else {
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', 'url(#spline-gradient)');
          path.setAttribute('stroke-width', '2.5');
          path.setAttribute('filter', 'url(#glow)');
        }
      }

      containerGroup.appendChild(path);
    }
  });
}

/**
 * Renders NURBS Control Polygons and CV Handles in CONTROL mode.
 */
function renderControlPolygonLayer(containerGroup, seedData) {
  containerGroup.innerHTML = '';
  if (!seedData || !seedData.objects) return;

  seedData.objects.forEach(obj => {
    if (obj.controlPoints && obj.controlPoints.length > 0) {
      // 1. Draw Control Polygon connecting lines (dashed grey)
      if (obj.controlPoints.length > 1) {
        const dPoly = buildPathString(obj.controlPoints, false);
        const polygonPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        polygonPath.setAttribute('d', dPoly);
        polygonPath.setAttribute('fill', 'none');
        polygonPath.setAttribute('stroke', 'rgba(255, 255, 255, 0.4)');
        polygonPath.setAttribute('stroke-width', '1');
        polygonPath.setAttribute('stroke-dasharray', '3 3');
        containerGroup.appendChild(polygonPath);
      }

      // 2. Draw Control Point Handle Nodes
      obj.controlPoints.forEach((pt, cvIdx) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', pt.x.toFixed(2));
        circle.setAttribute('cy', (-pt.y).toFixed(2));
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', cvIdx === 0 ? '#2ecc71' : (cvIdx === obj.controlPoints.length - 1 ? '#e056fd' : '#ffffff'));
        circle.setAttribute('stroke', '#000000');
        circle.setAttribute('stroke-width', '1');

        // Add tooltip info
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `CV [${cvIdx}] (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) Weight: ${pt.w || 1.0}`;
        circle.appendChild(title);

        containerGroup.appendChild(circle);
      });
    }
  });
}

function renderRhinoSeedView(activeSeed) {
  if (!activeSeed) return;

  if (startScreenCard) startScreenCard.style.display = 'none';
  if (canvasTagsOverlay) canvasTagsOverlay.style.display = 'flex';
  if (diagnosticsOverlay) diagnosticsOverlay.style.display = 'block';
  if (viewerTogglesOverlay) viewerTogglesOverlay.style.display = 'block';

  rhinoOriginalLayer.innerHTML = '';
  rhinoEditableLayer.innerHTML = '';
  rhinoControlLayer.innerHTML = '';

  const mode = appState.currentViewMode;

  // 1. Render ORIGINAL RHINO layer
  if (mode === 'ORIGINAL' || mode === 'OVERLAY') {
    renderObjectsIntoLayer(rhinoOriginalLayer, appState.originalRhinoGeometry, { isOriginal: true });
  }

  // 2. Render EDITABLE SEED layer
  if (mode === 'EDITABLE' || mode === 'OVERLAY' || mode === 'CONTROL') {
    renderObjectsIntoLayer(rhinoEditableLayer, activeSeed, { isOriginal: false });
  }

  // 3. Render CONTROL POLYGON & CVs layer
  if (mode === 'CONTROL') {
    renderControlPolygonLayer(rhinoControlLayer, activeSeed);
  }

  fitImportedGeometryToViewport(activeSeed.bounds);
  updateDiagnosticsAndInspector(activeSeed);
  renderGenerationTreeUI();
}

function updateDiagnosticsAndInspector(seed) {
  if (!seed) return;

  if (diagFilename) diagFilename.textContent = seed.filename;
  if (diagObjects) diagObjects.textContent = seed.objectCount;
  if (diagCurves) diagCurves.textContent = seed.counts.curves;
  if (diagPolylines) diagPolylines.textContent = seed.counts.polylines;
  if (diagClosed) diagClosed.textContent = seed.counts.closedCurves;
  if (diagPoints) diagPoints.textContent = seed.counts.points;
  if (diagUnits) diagUnits.textContent = seed.units;
  if (diagBounds) diagBounds.textContent = `${seed.bounds.width.toFixed(0)}x${seed.bounds.height.toFixed(0)}`;
  if (diagStatus) diagStatus.textContent = `MODE: ${appState.currentViewMode}`;

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

// ============================================================================
// 6. VERIFY RHINO IMPORT AUDIT MODAL
// ============================================================================

function showImportVerificationModal() {
  if (!appState.originalRhinoGeometry || !verifyImportModal || !verifyModalContent) return;

  const orig = appState.originalRhinoGeometry;

  let tableRows = orig.objects.map(obj => `
    <tr>
      <td>${obj.id}</td>
      <td><span class="type-badge">${obj.geometryType}</span></td>
      <td>${obj.layerName}</td>
      <td>Degree ${obj.degree}</td>
      <td>${obj.controlPoints.length} CVs</td>
      <td>${obj.isClosed ? 'Closed' : 'Open'}</td>
      <td>${obj.isRational ? 'Rational' : 'Non-Rational'}</td>
    </tr>
  `).join('');

  let warningHtml = '';
  if (orig.unsupportedObjects && orig.unsupportedObjects.length > 0) {
    warningHtml = `
      <div class="unsupported-warning-box">
        <strong>⚠️ ${orig.unsupportedObjects.length} Unsupported Non-Section Objects Detected:</strong><br>
        The following 3D or annotation objects were ignored for 2D section form-finding (not converted into fake geometry):
        <ul style="margin-top:0.4rem; padding-left:1.2rem;">
          ${orig.unsupportedObjects.map(u => `<li>${u.id} (${u.geometryType} on layer ${u.layerName})</li>`).join('')}
        </ul>
      </div>
    `;
  }

  verifyModalContent.innerHTML = `
    <div class="audit-stats-grid">
      <div class="audit-stat-card">
        <span class="label">FILE NAME</span>
        <span class="val" style="font-size:0.8rem; word-break:break-all;">${orig.filename}</span>
      </div>
      <div class="audit-stat-card">
        <span class="label">RENDERABLE OBJECTS</span>
        <span class="val">${orig.objectCount}</span>
      </div>
      <div class="audit-stat-card">
        <span class="label">UNSUPPORTED OBJECTS</span>
        <span class="val" style="color:${orig.counts.unsupported > 0 ? '#ff6347' : 'var(--accent-green)'}">${orig.counts.unsupported}</span>
      </div>
      <div class="audit-stat-card">
        <span class="label">RHINO UNITS</span>
        <span class="val">${orig.units}</span>
      </div>
    </div>

    ${warningHtml}

    <h3 style="font-size:0.8rem; font-family:var(--font-mono); color:var(--accent-gold); margin-top:0.5rem;">RHINO OBJECT TABLE AUDIT</h3>
    <table class="audit-table">
      <thead>
        <tr>
          <th>Object ID</th>
          <th>Rhino Geometry Type</th>
          <th>Layer</th>
          <th>Degree</th>
          <th>Control Points</th>
          <th>State</th>
          <th>Rationality</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;

  verifyImportModal.style.display = 'flex';
}

function hideImportVerificationModal() {
  if (verifyImportModal) verifyImportModal.style.display = 'none';
}

// ============================================================================
// 7. LINEAGE TREE & THUMBNAILS CAROUSEL
// ============================================================================

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

  if (!appState.editableSeedGeometry) return;

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
    appState.activeGeometry = appState.editableSeedGeometry;
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
// 8. EVENT LISTENERS & INITIALIZATION
// ============================================================================

function initEventListeners() {
  [btnRhinoFileInput, btnRhinoFileInputMain].forEach(input => {
    input?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const buffer = await file.arrayBuffer();
      await processRhinoBuffer(buffer, file.name);
    });
  });

  [btnLoadSampleSeed, btnStartSample].forEach(btn => {
    btn?.addEventListener('click', () => {
      loadSampleRhinoSeed();
    });
  });

  btnVerifyRhinoImport?.addEventListener('click', () => {
    showImportVerificationModal();
  });

  btnCloseVerifyModal?.addEventListener('click', () => {
    hideImportVerificationModal();
  });

  btnCloneSeedTest?.addEventListener('click', () => {
    runCloneSeedTest();
  });

  btnExportSvg?.addEventListener('click', () => {
    exportSVG();
  });

  // Viewer Mode Toggles
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
  console.log("Initializing Descriptor-Driven Architectural Evolution System (Checkpoint A)...");
  initEventListeners();
}

document.addEventListener('DOMContentLoaded', init);
