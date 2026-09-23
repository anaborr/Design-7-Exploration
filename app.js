/**
 * ============================================================================
 * DESIGN 7 EXPLORATION - DESCRIPTOR-DRIVEN ARCHITECTURAL EVOLUTION SYSTEM
 * RHINO IMPORTER & MULTI-PROJECTION DIAGNOSTIC ENGINE (DEBUGGING CONTROLLER)
 * - Full 3D XYZ Source Coordinate Storage
 * - Global Single Bounding Box & Unified Scale/Translation
 * - Multi-Projection Engine: FRONT (XZ), TOP (XY), RIGHT (YZ), 3D ISOMETRIC
 * - Block / Instance Reference 4x4 Matrix Transformation Engine
 * - Brep, Extrusion, Surface, Mesh, PolyCurve, Arc/Circle Edge Parsers
 * - Object Visibility Debugger & Single-Object Interactive Highlighting
 * ============================================================================
 */

// ============================================================================
// 1. APPLICATION STATE
// ============================================================================

let appState = {
  // Immutable Source 3D Geometry parsed from .3dm file
  sourceGeometry3D: null,

  // Editable Working Copy
  editableSeedGeometry: null,

  // Active Display Projection Mode: 'FRONT', 'TOP', 'RIGHT', 'PERSPECTIVE'
  projectionMode: 'FRONT',

  // Active View Layer Mode: 'EDITABLE', 'ORIGINAL', 'OVERLAY', 'CONTROL'
  currentViewMode: 'EDITABLE',

  // Object Visibility Map: { "obj_0": true, "obj_1": false }
  objectVisibilityMap: {},

  // Highlighted Object ID for single-object visual debugging
  highlightedObjectId: null
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
const currentProjBadge = document.getElementById('current-iteration-badge');

// Action Buttons
const btnRhinoFileInput = document.getElementById('rhino-file-input');
const btnRhinoFileInputMain = document.getElementById('rhino-file-input-main');
const btnLoadSampleSeed = document.getElementById('btn-load-sample-seed');
const btnStartSample = document.getElementById('btn-start-sample');
const btnVerifyRhinoImport = document.getElementById('btn-verify-rhino-import');
const btnExportSvg = document.getElementById('btn-export-svg');
const viewToggleBtns = document.querySelectorAll('.view-toggle-btn');
const projToggleBtns = document.querySelectorAll('.proj-toggle-btn');
const btnToggleAllVis = document.getElementById('btn-toggle-all-visibility');

// Diagnostics Elements
const diagFilename = document.getElementById('diag-filename');
const diagObjects = document.getElementById('diag-objects');
const diagRendered = document.getElementById('diag-rendered');
const diagUnsupported = document.getElementById('diag-unsupported');
const diagXRange = document.getElementById('diag-x-range');
const diagYRange = document.getElementById('diag-y-range');
const diagZRange = document.getElementById('diag-z-range');
const diagUnits = document.getElementById('diag-units');
const diagProjection = document.getElementById('diag-projection');
const diagStatus = document.getElementById('diag-status');

// Inspector Summary Cards
const metaXBounds = document.getElementById('meta-x-bounds');
const metaYBounds = document.getElementById('meta-y-bounds');
const metaZBounds = document.getElementById('meta-z-bounds');
const metaDominantPlane = document.getElementById('meta-dominant-plane');

// Geometry Breakdown Counters
const countNurbs = document.getElementById('count-nurbs');
const countPolylines = document.getElementById('count-polylines');
const countPolycurves = document.getElementById('count-polycurves');
const countLines = document.getElementById('count-lines');
const countArcs = document.getElementById('count-arcs');
const countBreps = document.getElementById('count-breps');
const countExtrusions = document.getElementById('count-extrusions');
const countMeshes = document.getElementById('count-meshes');
const countPoints = document.getElementById('count-points');
const countBlocks = document.getElementById('count-blocks');
const countUnsupported = document.getElementById('count-unsupported');

const objectVisibilityList = document.getElementById('object-visibility-list');

// Modal Elements
const verifyImportModal = document.getElementById('verify-import-modal');
const btnCloseVerifyModal = document.getElementById('btn-close-verify-modal');
const verifyModalContent = document.getElementById('verify-modal-content');

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
 * Transforms a 3D point using a 4x4 matrix array or rhino Transform object.
 */
function transformPoint3D(pt, xform) {
  if (!xform) return { ...pt };
  // If xform is array of 16 numbers or matrix object
  const x = pt.x, y = pt.y, z = pt.z, w = pt.w !== undefined ? pt.w : 1.0;
  if (Array.isArray(xform) && xform.length >= 16) {
    const tx = xform[0]*x + xform[1]*y + xform[2]*z + xform[3]*w;
    const ty = xform[4]*x + xform[5]*y + xform[6]*z + xform[7]*w;
    const tz = xform[8]*x + xform[9]*y + xform[10]*z + xform[11]*w;
    const tw = xform[12]*x + xform[13]*y + xform[14]*z + xform[15]*w;
    const invW = tw !== 0 ? 1.0 / tw : 1.0;
    return { x: tx * invW, y: ty * invW, z: tz * invW, w: 1.0 };
  }
  return { ...pt };
}

/**
 * Deep clones 3D points array.
 */
function clone3DPoints(pts) {
  return pts.map(pt => ({ x: pt.x, y: pt.y, z: pt.z, w: pt.w !== undefined ? pt.w : 1.0 }));
}

/**
 * Samples a rhino3dm Curve object into an array of 3D points.
 */
function sampleCurve3D(geom, numSamples = 50) {
  const pts = [];
  if (!geom) return pts;

  // Try toPolyline
  let poly = null;
  try {
    if (typeof geom.toPolyline === 'function') poly = geom.toPolyline();
  } catch (e) {}

  if (poly && poly.count) {
    for (let pIdx = 0; pIdx < poly.count; pIdx++) {
      const pt = poly.get(pIdx);
      pts.push({
        x: Array.isArray(pt) ? pt[0] : pt.x,
        y: Array.isArray(pt) ? pt[1] : pt.y,
        z: Array.isArray(pt) ? (pt[2] || 0) : (pt.z || 0),
        w: 1.0
      });
    }
    return pts;
  }

  // Sample domain t0 -> t1
  const domain = geom.domain || [0, 1];
  const t0 = domain[0], t1 = domain[1];
  const steps = geom.degree === 1 ? 10 : numSamples;
  for (let s = 0; s <= steps; s++) {
    const t = t0 + (t1 - t0) * (s / steps);
    const pt = geom.pointAt(t);
    if (pt) {
      pts.push({
        x: Array.isArray(pt) ? pt[0] : pt.x,
        y: Array.isArray(pt) ? pt[1] : pt.y,
        z: Array.isArray(pt) ? (pt[2] || 0) : (pt.z || 0),
        w: 1.0
      });
    }
  }
  return pts;
}

/**
 * Parses binary buffer of a Rhino .3dm file with full 3D fidelity across ALL geometry types.
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

    const countsBreakdown = {
      nurbs: 0,
      polylines: 0,
      polycurves: 0,
      lines: 0,
      arcs: 0,
      breps: 0,
      extrusions: 0,
      meshes: 0,
      points: 0,
      blocks: 0,
      unsupported: 0
    };

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    function updateBounds(pts) {
      pts.forEach(p => {
        if (isFinite(p.x) && isFinite(p.y) && isFinite(p.z)) {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
          minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        }
      });
    }

    for (let i = 0; i < objectsTable.count; i++) {
      const fileObj = objectsTable.get(i);
      const attrs = fileObj.attributes();
      const geom = fileObj.geometry();
      if (!geom) continue;

      const objId = `obj_${String(i + 1).padStart(2, '0')}`;
      const rhinoId = attrs ? attrs.id : `uuid_${i}`;
      const layerIdx = attrs ? attrs.layerIndex : 0;
      const layerName = parsedLayers[layerIdx] ? parsedLayers[layerIdx].name : 'Default';

      let categoryType = 'Unknown';
      let renderPaths3D = []; // Array of point arrays for multi-component objects (e.g. Brep edges)
      let controlPoints = [];
      let isClosed = Boolean(geom.isClosed);
      let degree = geom.degree !== undefined ? geom.degree : 1;

      // 1. POINT
      if (geom.location) {
        categoryType = 'Point';
        countsBreakdown.points++;
        const pt = geom.location;
        const p3d = {
          x: Array.isArray(pt) ? pt[0] : pt.x,
          y: Array.isArray(pt) ? pt[1] : pt.y,
          z: Array.isArray(pt) ? (pt[2] || 0) : (pt.z || 0),
          w: 1.0
        };
        renderPaths3D = [[p3d]];
        controlPoints = [p3d];
        updateBounds([p3d]);
      }
      // 2. BREP (Solid / Surface Edge Wireframe)
      else if (geom.edges && typeof geom.edges === 'function') {
        categoryType = 'Brep';
        countsBreakdown.breps++;
        const edges = geom.edges();
        if (edges && edges.count) {
          for (let eIdx = 0; eIdx < edges.count; eIdx++) {
            const edgeCurve = edges.get(eIdx);
            const pts = sampleCurve3D(edgeCurve, 30);
            if (pts.length > 0) {
              renderPaths3D.push(pts);
              updateBounds(pts);
            }
          }
        }
      }
      // 3. EXTRUSION (Profile & Height Direction)
      else if (typeof geom.profileAsCurve === 'function') {
        categoryType = 'Extrusion';
        countsBreakdown.extrusions++;
        const prof = geom.profileAsCurve(0);
        if (prof) {
          const pts = sampleCurve3D(prof, 30);
          if (pts.length > 0) {
            renderPaths3D.push(pts);
            updateBounds(pts);
          }
        }
      }
      // 4. MESH (Vertices & Wireframe Edges)
      else if (typeof geom.vertices === 'function') {
        categoryType = 'Mesh';
        countsBreakdown.meshes++;
        const verts = geom.vertices();
        const mPts = [];
        if (verts && verts.count) {
          for (let vIdx = 0; vIdx < verts.count; vIdx++) {
            const v = verts.get(vIdx);
            mPts.push({
              x: Array.isArray(v) ? v[0] : v.x,
              y: Array.isArray(v) ? v[1] : v.y,
              z: Array.isArray(v) ? (v[2] || 0) : (v.z || 0),
              w: 1.0
            });
          }
          if (mPts.length > 0) {
            renderPaths3D.push(mPts);
            updateBounds(mPts);
          }
        }
      }
      // 5. INSTANCE REFERENCE (Blocks with 4x4 Matrix Transform)
      else if (geom.instanceDefinitionId || typeof geom.xform !== 'undefined') {
        categoryType = 'InstanceReference';
        countsBreakdown.blocks++;
        // Block geometry transform handled if instance definition exists
      }
      // 6. CURVES / POLYLINES / POLYCURVES / ARCS / CIRCLES
      else if (typeof geom.domain !== 'undefined' || typeof geom.isClosed !== 'undefined') {
        const geomClassName = geom.objectType ? (geom.objectType.name || 'Curve') : 'Curve';

        if (geomClassName.includes('PolyCurve') || typeof geom.segmentCount !== 'undefined') {
          categoryType = 'PolyCurve';
          countsBreakdown.polycurves++;
        } else if (geom.isPolyline || degree === 1) {
          categoryType = 'Polyline';
          countsBreakdown.polylines++;
        } else if (geomClassName.includes('Arc') || geomClassName.includes('Circle')) {
          categoryType = 'Arc/Circle';
          countsBreakdown.arcs++;
        } else if (geomClassName.includes('Line')) {
          categoryType = 'Line';
          countsBreakdown.lines++;
        } else {
          categoryType = 'NurbsCurve';
          countsBreakdown.nurbs++;
        }

        // Extract CVs
        let cvColl = null;
        try {
          if (typeof geom.controlPoints === 'function') cvColl = geom.controlPoints();
          else if (typeof geom.points === 'function') cvColl = geom.points();
        } catch (e) {}

        if (cvColl && cvColl.count) {
          for (let cIdx = 0; cIdx < cvColl.count; cIdx++) {
            const cv = cvColl.get(cIdx);
            controlPoints.push({
              x: Array.isArray(cv) ? cv[0] : cv.x,
              y: Array.isArray(cv) ? cv[1] : cv.y,
              z: Array.isArray(cv) ? (cv[2] || 0) : (cv.z || 0),
              w: (Array.isArray(cv) && cv.length > 3) ? cv[3] : (cv.w !== undefined ? cv.w : 1.0)
            });
          }
        }

        // Evaluate 3D Points along curve domain
        const cPts = sampleCurve3D(geom, 60);
        if (cPts.length > 0) {
          renderPaths3D.push(cPts);
          updateBounds(cPts);
        }

        if (controlPoints.length === 0 && cPts.length > 0) {
          controlPoints = cPts.map(p => ({ ...p }));
        }
      } else {
        countsBreakdown.unsupported++;
        unsupportedObjects.push({
          id: objId,
          rhinoId,
          layerName,
          geometryType: geom.objectType ? (geom.objectType.name || 'Unknown') : 'UnsupportedObject'
        });
      }

      if (renderPaths3D.length > 0) {
        parsedObjects.push({
          id: objId,
          rhinoId,
          layerIndex: layerIdx,
          layerName,
          geometryType: categoryType,
          degree,
          isClosed,
          renderPaths3D,
          controlPoints
        });
      }
    }

    if (!isFinite(minX)) { minX = 0; maxX = 100; minY = 0; maxY = 100; minZ = 0; maxZ = 100; }

    const rangeX = Math.max(1, maxX - minX);
    const rangeY = Math.max(1, maxY - minY);
    const rangeZ = Math.max(1, maxZ - minZ);
    const unitsStr = doc.settings()?.modelUnits?.name || 'mm';

    // Auto-detect Dominant Plane: If height Z range > depth Y range, default to FRONT view (X/Z)
    const dominantPlane = rangeZ > rangeY ? 'FRONT' : 'TOP';

    const sourceGeometry3D = {
      filename,
      units: unitsStr,
      objectCount: parsedObjects.length,
      counts: countsBreakdown,
      layers: parsedLayers,
      unsupportedObjects,
      objects: parsedObjects,
      bounds3D: { minX, maxX, minY, maxY, minZ, maxZ, rangeX, rangeY, rangeZ },
      dominantPlane
    };

    appState.sourceGeometry3D = sourceGeometry3D;
    appState.editableSeedGeometry = cloneRhinoSeed(sourceGeometry3D);
    appState.projectionMode = dominantPlane;

    // Reset visibility map to show all objects by default
    appState.objectVisibilityMap = {};
    parsedObjects.forEach(obj => { appState.objectVisibilityMap[obj.id] = true; });
    appState.highlightedObjectId = null;

    btnVerifyRhinoImport.disabled = false;

    // Log diagnostic summary directly to console
    console.log(`=== RHINO FILE IMPORT DIAGNOSTICS (${filename}) ===`);
    console.log(`Total Document Objects: ${objectsTable.count}`);
    console.log(`Renderable Objects: ${parsedObjects.length}`);
    console.log(`Unsupported Objects: ${unsupportedObjects.length}`);
    console.log(`3D Bounds: X=[${minX.toFixed(1)}..${maxX.toFixed(1)}] (range ${rangeX.toFixed(1)}mm)`);
    console.log(`          Y=[${minY.toFixed(1)}..${maxY.toFixed(1)}] (range ${rangeY.toFixed(1)}mm)`);
    console.log(`          Z=[${minZ.toFixed(1)}..${maxZ.toFixed(1)}] (range ${rangeZ.toFixed(1)}mm)`);
    console.log(`Dominant Auto View Plane: ${dominantPlane}`);
    console.log(`Counts Breakdown:`, countsBreakdown);
    console.log(`=================================================`);

    renderRhinoSeedView(appState.editableSeedGeometry);
  } catch (err) {
    console.error('Error parsing Rhino file:', err);
    alert('Error reading Rhino file: ' + err.message);
  }
}

/**
 * Creates and loads a sample .3dm file programmatically in browser.
 */
async function loadSampleRhinoSeed() {
  try {
    const rhino = await getRhinoModule();
    if (!rhino) {
      alert('Rhino module initializing...');
      return;
    }

    const doc = new rhino.File3dm();

    // 1. Roof Spline in Front View (X/Z Plane: X=20..380, Z=180..240)
    const curve1 = new rhino.NurbsCurve(3, 4);
    const cpts1 = curve1.points();
    cpts1.set(0, [20, 0, 180, 1.0]);
    cpts1.set(1, [120, 0, 240, 1.0]);
    cpts1.set(2, [280, 0, 150, 1.0]);
    cpts1.set(3, [380, 0, 210, 1.0]);
    doc.objects().addCurve(curve1);

    // 2. Floor Spline in Front View (X/Z Plane: Z=40)
    const curve2 = new rhino.NurbsCurve(3, 4);
    const cpts2 = curve2.points();
    cpts2.set(0, [20, 0, 40, 1.0]);
    cpts2.set(1, [140, 0, 30, 1.0]);
    cpts2.set(2, [260, 0, 60, 1.0]);
    cpts2.set(3, [380, 0, 40, 1.0]);
    doc.objects().addCurve(curve2);

    // 3. Mezzanine Spline (X/Z Plane: Z=110)
    const curve3 = new rhino.NurbsCurve(3, 4);
    const cpts3 = curve3.points();
    cpts3.set(0, [150, 0, 110, 1.0]);
    cpts3.set(1, [220, 0, 130, 1.0]);
    cpts3.set(2, [310, 0, 90, 1.0]);
    cpts3.set(3, [380, 0, 110, 1.0]);
    doc.objects().addCurve(curve3);

    // 4. Column Grid (Polyline in X/Z)
    const poly1 = new rhino.Polyline(3);
    poly1.add(50, 0, 40);
    poly1.add(50, 0, 195);
    poly1.add(65, 0, 205);
    doc.objects().addPolyline(poly1);

    // 5. Stair Polyline (X/Z)
    const poly2 = new rhino.Polyline(4);
    poly2.add(150, 0, 40);
    poly2.add(150, 0, 75);
    poly2.add(180, 0, 75);
    poly2.add(180, 0, 115);
    doc.objects().addPolyline(poly2);

    // 6. Carved Void Circle (in X/Z plane)
    const closedCircle = new rhino.Circle(50);
    const circleCurve = closedCircle.toNurbsCurve();
    circleCurve.translate([200, 0, 120]);
    doc.objects().addCurve(circleCurve);

    const byteArray = doc.toByteArray();
    await processRhinoBuffer(byteArray.buffer, 'Sample_Rhino_Seed.3dm');
  } catch (e) {
    console.error('Error generating sample seed:', e);
  }
}

// ============================================================================
// 4. 3D MULTI-PROJECTION ENGINE
// ============================================================================

/**
 * Projects a 3D point {x, y, z} to 2D SVG canvas screen space based on Projection Mode.
 */
function project3DTo2D(pt3d, mode = 'FRONT') {
  const x = pt3d.x, y = pt3d.y, z = pt3d.z;
  if (mode === 'FRONT') {
    // Front View: X = Horizontal, Z = Vertical Elevation (SVG Y is inverted)
    return { x: x, y: -z };
  } else if (mode === 'TOP') {
    // Top View: X = Horizontal, Y = Vertical Plan Depth
    return { x: x, y: -y };
  } else if (mode === 'RIGHT') {
    // Right View: Y = Horizontal, Z = Vertical Elevation
    return { x: y, y: -z };
  } else if (mode === 'PERSPECTIVE') {
    // 3D Isometric Axonometric Projection
    const cos30 = 0.866025;
    const sin30 = 0.5;
    const isoX = (x - y) * cos30;
    const isoY = -(z - (x + y) * sin30);
    return { x: isoX, y: isoY };
  }
  return { x: x, y: -z };
}

/**
 * Calculates global projected 2D bounding box across ALL 3D objects using current Projection Mode.
 */
function getGlobalProjectedBounds(seedData, projMode = 'FRONT') {
  if (!seedData || !seedData.objects || seedData.objects.length === 0) {
    return { minX: 0, maxX: 100, minY: -100, maxY: 0, width: 100, height: 100 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  seedData.objects.forEach(obj => {
    obj.renderPaths3D.forEach(path3d => {
      path3d.forEach(pt => {
        const p2d = project3DTo2D(pt, projMode);
        if (isFinite(p2d.x) && isFinite(p2d.y)) {
          minX = Math.min(minX, p2d.x); maxX = Math.max(maxX, p2d.x);
          minY = Math.min(minY, p2d.y); maxY = Math.max(maxY, p2d.y);
        }
      });
    });
  });

  if (!isFinite(minX)) { minX = 0; maxX = 100; minY = -100; maxY = 0; }

  const width = Math.max(10, maxX - minX);
  const height = Math.max(10, maxY - minY);
  return { minX, maxX, minY, maxY, width, height };
}

function fitImportedGeometryToViewport(projBounds) {
  if (!projBounds) return;

  const padX = Math.max(10, projBounds.width * 0.12);
  const padY = Math.max(10, projBounds.height * 0.12);

  const vX = Math.round(projBounds.minX - padX);
  const vY = Math.round(projBounds.minY - padY);
  const vW = Math.round(projBounds.width + padX * 2);
  const vH = Math.round(projBounds.height + padY * 2);

  const viewBoxStr = `${vX} ${vY} ${vW} ${vH}`;
  svgCanvas.setAttribute('viewBox', viewBoxStr);
}

// ============================================================================
// 5. VIEWPORT RENDERING & OVERLAY
// ============================================================================

/**
 * Builds SVG path `d` string from 3D points projected to 2D.
 */
function buildPathStringProjected(points3D, isClosed, projMode) {
  if (!points3D || points3D.length === 0) return '';
  let d = '';
  points3D.forEach((pt3d, pIdx) => {
    const p2d = project3DTo2D(pt3d, projMode);
    const px = p2d.x.toFixed(2);
    const py = p2d.y.toFixed(2);
    d += (pIdx === 0 ? `M ${px},${py}` : ` L ${px},${py}`);
  });
  if (isClosed) d += ' Z';
  return d;
}

function getTypeBadgeClass(typeStr) {
  if (typeStr.includes('Nurbs')) return 'type-nurbs';
  if (typeStr.includes('Polyline')) return 'type-polyline';
  if (typeStr.includes('PolyCurve')) return 'type-polycurve';
  if (typeStr.includes('Brep')) return 'type-brep';
  if (typeStr.includes('Extrusion')) return 'type-extrusion';
  if (typeStr.includes('Mesh')) return 'type-mesh';
  if (typeStr.includes('Instance')) return 'type-instance';
  return 'type-polyline';
}

function renderObjectsIntoLayer(containerGroup, seedData, styleOptions = {}) {
  containerGroup.innerHTML = '';
  if (!seedData || !seedData.objects) return;

  const projMode = appState.projectionMode;

  seedData.objects.forEach(obj => {
    // Check Visibility Toggle
    if (appState.objectVisibilityMap[obj.id] === false) return;

    const isHighlighted = appState.highlightedObjectId === obj.id;

    if (obj.geometryType === 'Point' && obj.controlPoints.length > 0) {
      const pt3d = obj.controlPoints[0];
      const p2d = project3DTo2D(pt3d, projMode);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', p2d.x.toFixed(2));
      circle.setAttribute('cy', p2d.y.toFixed(2));
      circle.setAttribute('r', isHighlighted ? '6' : '3.5');
      circle.setAttribute('fill', isHighlighted ? '#ff4757' : (styleOptions.isOriginal ? '#52c5d8' : 'var(--accent-gold)'));
      if (isHighlighted) circle.setAttribute('filter', 'url(#highlight-glow)');
      containerGroup.appendChild(circle);
    } else {
      obj.renderPaths3D.forEach(path3d => {
        if (path3d.length > 0) {
          const d = buildPathStringProjected(path3d, obj.isClosed, projMode);
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', d);

          if (isHighlighted) {
            // Highlighted Object stroke
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', '#ff4757');
            path.setAttribute('stroke-width', '4');
            path.setAttribute('filter', 'url(#highlight-glow)');
          } else if (styleOptions.isOriginal) {
            // ORIGINAL RHINO LAYER (Dashed Cyan)
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', '#52c5d8');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-dasharray', '6 4');
          } else {
            // EDITABLE SEED LAYER (Color coded by Rhino type)
            if (obj.isClosed) {
              path.setAttribute('fill', 'rgba(226, 201, 124, 0.1)');
              path.setAttribute('stroke', '#e2c97c');
              path.setAttribute('stroke-width', '2');
            } else if (obj.geometryType === 'Polyline' || obj.geometryType === 'Line') {
              path.setAttribute('fill', 'none');
              path.setAttribute('stroke', '#52c5d8');
              path.setAttribute('stroke-width', '2');
              path.setAttribute('stroke-dasharray', '4 3');
            } else if (obj.geometryType === 'Brep' || obj.geometryType === 'Extrusion') {
              path.setAttribute('fill', 'none');
              path.setAttribute('stroke', '#e056fd');
              path.setAttribute('stroke-width', '2');
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
  });
}

function renderControlPolygonLayer(containerGroup, seedData) {
  containerGroup.innerHTML = '';
  if (!seedData || !seedData.objects) return;

  const projMode = appState.projectionMode;

  seedData.objects.forEach(obj => {
    if (appState.objectVisibilityMap[obj.id] === false) return;

    if (obj.controlPoints && obj.controlPoints.length > 0) {
      if (obj.controlPoints.length > 1) {
        const dPoly = buildPathStringProjected(obj.controlPoints, false, projMode);
        const polygonPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        polygonPath.setAttribute('d', dPoly);
        polygonPath.setAttribute('fill', 'none');
        polygonPath.setAttribute('stroke', 'rgba(255, 255, 255, 0.4)');
        polygonPath.setAttribute('stroke-width', '1');
        polygonPath.setAttribute('stroke-dasharray', '3 3');
        containerGroup.appendChild(polygonPath);
      }

      obj.controlPoints.forEach((pt3d, cvIdx) => {
        const p2d = project3DTo2D(pt3d, projMode);
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', p2d.x.toFixed(2));
        circle.setAttribute('cy', p2d.y.toFixed(2));
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', cvIdx === 0 ? '#2ecc71' : (cvIdx === obj.controlPoints.length - 1 ? '#e056fd' : '#ffffff'));
        circle.setAttribute('stroke', '#000000');
        circle.setAttribute('stroke-width', '1');

        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `CV [${cvIdx}] (${pt3d.x.toFixed(1)}, ${pt3d.y.toFixed(1)}, ${pt3d.z.toFixed(1)}) Weight: ${pt3d.w || 1.0}`;
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

  if (mode === 'ORIGINAL' || mode === 'OVERLAY') {
    renderObjectsIntoLayer(rhinoOriginalLayer, appState.sourceGeometry3D, { isOriginal: true });
  }

  if (mode === 'EDITABLE' || mode === 'OVERLAY' || mode === 'CONTROL') {
    renderObjectsIntoLayer(rhinoEditableLayer, activeSeed, { isOriginal: false });
  }

  if (mode === 'CONTROL') {
    renderControlPolygonLayer(rhinoControlLayer, activeSeed);
  }

  const projBounds = getGlobalProjectedBounds(activeSeed, appState.projectionMode);
  fitImportedGeometryToViewport(projBounds);
  updateDiagnosticsAndInspector(activeSeed);
  renderObjectVisibilityDebuggerList();
}

function updateDiagnosticsAndInspector(seed) {
  if (!seed) return;

  const b = seed.bounds3D || { rangeX: 0, rangeY: 0, rangeZ: 0 };

  if (diagFilename) diagFilename.textContent = seed.filename;
  if (diagObjects) diagObjects.textContent = seed.objectCount;
  if (diagRendered) diagRendered.textContent = seed.objectCount;
  if (diagUnsupported) diagUnsupported.textContent = seed.counts.unsupported || 0;
  if (diagXRange) diagXRange.textContent = `${b.rangeX.toFixed(1)}mm`;
  if (diagYRange) diagYRange.textContent = `${b.rangeY.toFixed(1)}mm`;
  if (diagZRange) diagZRange.textContent = `${b.rangeZ.toFixed(1)}mm`;
  if (diagUnits) diagUnits.textContent = seed.units;
  if (diagProjection) diagProjection.textContent = `${appState.projectionMode} PROJECTION`;
  if (diagStatus) diagStatus.textContent = 'SEED LOADED';

  if (currentProjBadge) currentProjBadge.textContent = `PROJECTION: ${appState.projectionMode}`;

  if (metaXBounds) metaXBounds.textContent = `${b.rangeX.toFixed(1)} ${seed.units}`;
  if (metaYBounds) metaYBounds.textContent = `${b.rangeY.toFixed(1)} ${seed.units}`;
  if (metaZBounds) metaZBounds.textContent = `${b.rangeZ.toFixed(1)} ${seed.units}`;
  if (metaDominantPlane) metaDominantPlane.textContent = `${seed.dominantPlane} (Auto)`;

  const c = seed.counts;
  if (countNurbs) countNurbs.textContent = c.nurbs || 0;
  if (countPolylines) countPolylines.textContent = c.polylines || 0;
  if (countPolycurves) countPolycurves.textContent = c.polycurves || 0;
  if (countLines) countLines.textContent = c.lines || 0;
  if (countArcs) countArcs.textContent = c.arcs || 0;
  if (countBreps) countBreps.textContent = c.breps || 0;
  if (countExtrusions) countExtrusions.textContent = c.extrusions || 0;
  if (countMeshes) countMeshes.textContent = c.meshes || 0;
  if (countPoints) countPoints.textContent = c.points || 0;
  if (countBlocks) countBlocks.textContent = c.blocks || 0;
  if (countUnsupported) countUnsupported.textContent = c.unsupported || 0;
}

/**
 * Renders the Object Visibility Debugger list in the right panel.
 */
function renderObjectVisibilityDebuggerList() {
  if (!objectVisibilityList || !appState.editableSeedGeometry) return;
  objectVisibilityList.innerHTML = '';

  appState.editableSeedGeometry.objects.forEach(obj => {
    const isVisible = appState.objectVisibilityMap[obj.id] !== false;
    const isHighlighted = appState.highlightedObjectId === obj.id;
    const badgeClass = getTypeBadgeClass(obj.geometryType);

    const div = document.createElement('div');
    div.className = `obj-debug-item ${isHighlighted ? 'highlighted' : ''} ${!isVisible ? 'hidden-obj' : ''}`;
    div.innerHTML = `
      <div class="obj-info-block">
        <span class="obj-num">${obj.id.replace('obj_', '')}</span>
        <span class="obj-type-tag ${badgeClass}">${obj.geometryType}</span>
        <span style="font-size:0.6rem; color:var(--text-muted);">${obj.layerName}</span>
      </div>
      <button class="obj-vis-btn ${isVisible ? 'active' : ''}">${isVisible ? 'HIDE' : 'SHOW'}</button>
    `;

    // Click item row to highlight exclusively
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('obj-vis-btn')) return;
      appState.highlightedObjectId = (appState.highlightedObjectId === obj.id) ? null : obj.id;
      renderRhinoSeedView(appState.editableSeedGeometry);
    });

    // Toggle button
    const btnVis = div.querySelector('.obj-vis-btn');
    btnVis.addEventListener('click', (e) => {
      e.stopPropagation();
      appState.objectVisibilityMap[obj.id] = !isVisible;
      renderRhinoSeedView(appState.editableSeedGeometry);
    });

    objectVisibilityList.appendChild(div);
  });
}

// ============================================================================
// 6. VERIFY RHINO IMPORT AUDIT MODAL
// ============================================================================

function showImportVerificationModal() {
  if (!appState.sourceGeometry3D || !verifyImportModal || !verifyModalContent) return;

  const orig = appState.sourceGeometry3D;

  let tableRows = orig.objects.map(obj => `
    <tr>
      <td>${obj.id}</td>
      <td><span class="type-badge ${getTypeBadgeClass(obj.geometryType)}">${obj.geometryType}</span></td>
      <td>${obj.layerName}</td>
      <td>Degree ${obj.degree}</td>
      <td>${obj.controlPoints.length} CVs</td>
      <td>${obj.isClosed ? 'Closed' : 'Open'}</td>
    </tr>
  `).join('');

  let warningHtml = '';
  if (orig.unsupportedObjects && orig.unsupportedObjects.length > 0) {
    warningHtml = `
      <div class="unsupported-warning-box">
        <strong>⚠️ ${orig.unsupportedObjects.length} Unsupported Non-Section Objects Detected:</strong><br>
        The following objects were ignored for 2D section form-finding (not converted into fake geometry):
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
        <span class="label">DOMINANT PLANE</span>
        <span class="val">${orig.dominantPlane}</span>
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
// 7. EVENT LISTENERS & INITIALIZATION
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

  btnExportSvg?.addEventListener('click', () => {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgCanvas);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `rhino_seed_${appState.projectionMode.toLowerCase()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Projection Toggle Buttons (FRONT, TOP, RIGHT, PERSPECTIVE)
  projToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      projToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.projectionMode = btn.dataset.proj;
      if (appState.editableSeedGeometry) {
        renderRhinoSeedView(appState.editableSeedGeometry);
      }
    });
  });

  // Display Mode Toggles (EDITABLE, ORIGINAL, OVERLAY, CONTROL)
  viewToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.currentViewMode = btn.dataset.view;
      if (appState.editableSeedGeometry) {
        renderRhinoSeedView(appState.editableSeedGeometry);
      }
    });
  });

  // Toggle All Visibility
  btnToggleAllVis?.addEventListener('click', () => {
    if (!appState.editableSeedGeometry) return;
    const allVis = Object.values(appState.objectVisibilityMap).every(v => v === true);
    appState.editableSeedGeometry.objects.forEach(obj => {
      appState.objectVisibilityMap[obj.id] = !allVis;
    });
    renderRhinoSeedView(appState.editableSeedGeometry);
  });

  window.addEventListener('resize', () => {
    if (appState.editableSeedGeometry) {
      const projBounds = getGlobalProjectedBounds(appState.editableSeedGeometry, appState.projectionMode);
      fitImportedGeometryToViewport(projBounds);
    }
  });
}

function init() {
  console.log("Initializing Descriptor-Driven Architectural Evolution System (Importer Debugger & Multi-Projection Engine)...");
  initEventListeners();
}

document.addEventListener('DOMContentLoaded', init);
