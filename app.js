/**
 * ============================================================================
 * DESIGN 7 EXPLORATION - DESCRIPTOR-DRIVEN ARCHITECTURAL EVOLUTION SYSTEM
 * RHINO SUBD & 3D WEBGL ENGINE (STAGED CONTROLLER & THREE.JS VIEWPORT)
 * - Restored Proven Working Diagnostic Importer parseRhino3dm (Commit 3235a8b)
 * - Persistent Object Storage: importedRhinoObjects (Generation 0 Seed)
 * - Decoupled Pipeline: IMPORT -> STORE -> CLASSIFY -> BOUNDS -> RENDER
 * - High-Visibility Debug Material: THREE.MeshNormalMaterial + Edges Wireframe
 * - Camera Fit: Auto-fits OrbitControls and camera position to model Box3
 * - Render Pipeline Diagnostic Card & Object Error Logging
 * ============================================================================
 */

// Global Rhino3dm Module Reference
let rhino = null;

// Persistent Global Storage for Generation 0 Seed
let importedRhinoObjects = [];

// Application State
let appState = {
  originalRhinoGeometry: null,
  projectionMode: 'FRONT',
  displayMode: 'SURFACE',
  objectVisibilityMap: {}
};

// Three.js Global References
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let ambientLight = null;
let dirLight1 = null;
let dirLight2 = null;
let importedRhinoGroup = null;

// Global Bounding Box & Target Center
let globalBoundingBox = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 0, y: 0, z: 0 },
  center: { x: 0, y: 0, z: 0 },
  size: { x: 0, y: 0, z: 0 },
  maxDim: 100
};

// DOM Elements
const threeCanvasContainer = document.getElementById('three-canvas-container');
const threeCanvas = document.getElementById('three-canvas');

const startScreenCard = document.getElementById('start-screen-card');
const canvasTagsOverlay = document.getElementById('canvas-tags-overlay');
const diagnosticsOverlay = document.getElementById('diagnostics-overlay');
const viewerTogglesOverlay = document.getElementById('viewer-toggles-overlay');

const currentProjBadge = document.getElementById('current-projection-badge');

const btnRhinoFileInput = document.getElementById('rhino-file-input');
const btnRhinoFileInputMain = document.getElementById('rhino-file-input-main');
const btnLoadSampleSeed = document.getElementById('btn-load-sample-seed');
const btnStartSample = document.getElementById('btn-start-sample');
const btnVerifyRhinoImport = document.getElementById('btn-verify-rhino-import');

const viewToggleBtns = document.querySelectorAll('.view-toggle-btn');
const projToggleBtns = document.querySelectorAll('.proj-toggle-btn');
const btnToggleAllVis = document.getElementById('btn-toggle-all-visibility');

const diagFilename = document.getElementById('diag-filename');
const diagObjects = document.getElementById('diag-objects');
const diagSubdCount = document.getElementById('diag-subd-count');
const diagRendered = document.getElementById('diag-rendered');
const diagXRange = document.getElementById('diag-x-range');
const diagYRange = document.getElementById('diag-y-range');
const diagZRange = document.getElementById('diag-z-range');
const diagUnits = document.getElementById('diag-units');
const diagProjection = document.getElementById('diag-projection');
const diagStatus = document.getElementById('diag-status');

// Raw Import Card Elements
const rawFileName = document.getElementById('raw-file-name');
const rawFileSize = document.getElementById('raw-file-size');
const rawDocStatus = document.getElementById('raw-doc-status');
const rawTableStatus = document.getElementById('raw-table-status');
const rawObjectCount = document.getElementById('raw-object-count');
const rawGeomRetrieved = document.getElementById('raw-geom-retrieved');
const rawNullGeom = document.getElementById('raw-null-geom');
const rawClassified = document.getElementById('raw-classified');
const rawUnclassified = document.getElementById('raw-unclassified');

// Render Pipeline Card Elements
const rndObjectsRcvd = document.getElementById('rnd-objects-rcvd');
const rndObjectsConv = document.getElementById('rnd-objects-conv');
const rndObjectsAdded = document.getElementById('rnd-objects-added');
const rndObjectsFailed = document.getElementById('rnd-objects-failed');
const rndModelChildren = document.getElementById('rnd-model-children');
const rndBboxStatus = document.getElementById('rnd-bbox-status');
const rndCamFit = document.getElementById('rnd-cam-fit');
const rndStatus = document.getElementById('rnd-status');

// Bounding Box Card Elements
const metaXRange = document.getElementById('meta-x-range');
const metaXBounds = document.getElementById('meta-x-bounds');
const metaYRange = document.getElementById('meta-y-range');
const metaYBounds = document.getElementById('meta-y-bounds');
const metaZRange = document.getElementById('meta-z-range');
const metaZBounds = document.getElementById('meta-z-bounds');
const metaModelCenter = document.getElementById('meta-model-center');

// SubD Metrics Counters
const countSubdObjs = document.getElementById('count-subd-objs');
const countSubdVerts = document.getElementById('count-subd-verts');
const countSubdEdges = document.getElementById('count-subd-edges');
const countSubdFaces = document.getElementById('count-subd-faces');

// Geometry Breakdown Counters
const countSubd = document.getElementById('count-subd');
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

// ============================================================================
// 1. INITIALIZATION & THREE.JS VIEWPORT SETUP
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  console.log('[SYSTEM] Initializing Design 7 SubD & 3D WebGL Engine...');

  initThreeJS();

  if (window.rhino3dm) {
    window.rhino3dm().then((loadedRhino) => {
      rhino = loadedRhino;
      const ver = rhino.version ? (typeof rhino.version === 'function' ? rhino.version() : rhino.version) : '8.x';
      console.log('[RHINO] 3 rhino3dm initialized. Version:', ver);
      const dbgRhinoInit = document.getElementById('dbg-rhino-init');
      if (dbgRhinoInit) dbgRhinoInit.textContent = 'YES';
      enableImportControls();
    }).catch((err) => {
      console.error('[RHINO ERROR] Failed at Stage 3: rhino3dm initialization failed:', err);
      const dbgRhinoInit = document.getElementById('dbg-rhino-init');
      if (dbgRhinoInit) dbgRhinoInit.textContent = 'NO (FAILED)';
    });
  } else {
    console.error('[RHINO ERROR] rhino3dm script tag not found.');
  }

  attachEventListeners();
});

function initThreeJS() {
  const width = threeCanvasContainer ? (threeCanvasContainer.clientWidth || 800) : 800;
  const height = threeCanvasContainer ? (threeCanvasContainer.clientHeight || 600) : 600;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a); // Dark technical theme

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
  camera.position.set(0, -300, 150);
  camera.up.set(0, 0, 1); // Z-Up Coordinate System (Rhino standard)

  renderer = new THREE.WebGLRenderer({
    canvas: threeCanvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  if (THREE.OrbitControls) {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI;
  }

  ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight1.position.set(100, -200, 300);
  scene.add(dirLight1);

  dirLight2 = new THREE.DirectionalLight(0xffd700, 0.4);
  dirLight2.position.set(-100, 200, -100);
  scene.add(dirLight2);

  const gridHelper = new THREE.GridHelper(500, 50, 0xffd700, 0x333333);
  gridHelper.rotation.x = Math.PI / 2; // Orient grid to XY plane
  scene.add(gridHelper);

  const axesHelper = new THREE.AxesHelper(20);
  scene.add(axesHelper);

  window.addEventListener('resize', onWindowResize);
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function onWindowResize() {
  if (!threeCanvasContainer || !renderer || !camera) return;
  const width = threeCanvasContainer.clientWidth;
  const height = threeCanvasContainer.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function enableImportControls() {
  if (btnRhinoFileInput) btnRhinoFileInput.disabled = false;
  if (btnRhinoFileInputMain) btnRhinoFileInputMain.disabled = false;
  if (btnLoadSampleSeed) btnLoadSampleSeed.disabled = false;
  if (btnStartSample) btnStartSample.disabled = false;
}

function attachEventListeners() {
  if (btnRhinoFileInput) {
    btnRhinoFileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
  }
  if (btnRhinoFileInputMain) {
    btnRhinoFileInputMain.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
  }
  if (btnLoadSampleSeed) {
    btnLoadSampleSeed.addEventListener('click', () => loadSampleSeed());
  }
  if (btnStartSample) {
    btnStartSample.addEventListener('click', () => loadSampleSeed());
  }

  viewToggleBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      viewToggleBtns.forEach((b) => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      appState.displayMode = targetBtn.dataset.view;
      updateDisplayModeVisibility();
    });
  });

  projToggleBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      projToggleBtns.forEach((b) => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      setCameraProjection(targetBtn.dataset.proj);
    });
  });

  if (btnToggleAllVis) {
    btnToggleAllVis.addEventListener('click', () => toggleAllObjectVisibility());
  }
}

// ============================================================================
// 2. STAGE 1: FILE SELECT & ARRAY BUFFER LOADING
// ============================================================================

async function handleFileSelect(file) {
  if (!file) return;

  console.log('[RHINO] 1 File selected');
  console.log('FILE NAME:', file.name);
  console.log('FILE SIZE:', file.size, 'bytes');

  const dbgFileSelected = document.getElementById('dbg-file-selected');
  const dbgFileName = document.getElementById('dbg-file-name');
  const dbgFileSize = document.getElementById('dbg-file-size');

  if (dbgFileSelected) dbgFileSelected.textContent = 'YES';
  if (dbgFileName) dbgFileName.textContent = file.name;
  if (dbgFileSize) dbgFileSize.textContent = `${file.size} bytes`;

  if (rawFileName) rawFileName.textContent = file.name;
  if (rawFileSize) rawFileSize.textContent = `${file.size} bytes`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    await parseRhino3dm(arrayBuffer, file.name);
  } catch (err) {
    console.error('[RHINO ERROR] Failed at Stage 1/2:', err);
    const dbgErrors = document.getElementById('dbg-errors');
    if (dbgErrors) dbgErrors.textContent = `Stage 1/2: ${err.message}`;
  }
}

// ============================================================================
// 3. RESTORED WORKING IMPORTER: parseRhino3dm(arrayBuffer, filename)
// ============================================================================

/**
 * EXACT WORKING IMPORTER CODE FROM COMMIT 3235a8b
 * - Parses .3dm array buffer
 * - Retrieves object table & object count
 * - Stores original retrieved objects into importedRhinoObjects array
 * - Updates import diagnostic card with RAW OBJECT COUNT
 */
async function parseRhino3dm(arrayBuffer, filename) {
  console.log('[RHINO] 2 ArrayBuffer loaded. Byte length:', arrayBuffer ? arrayBuffer.byteLength : 0);

  const dbgFileBytes = document.getElementById('dbg-file-bytes');
  const dbgRhinoInit = document.getElementById('dbg-rhino-init');
  const dbgDocCreated = document.getElementById('dbg-doc-created');
  const dbgTableFound = document.getElementById('dbg-table-found');
  const dbgRawCount = document.getElementById('dbg-raw-count');
  const dbgGeomCount = document.getElementById('dbg-geom-count');
  const dbgNullCount = document.getElementById('dbg-null-count');
  const dbgErrors = document.getElementById('dbg-errors');

  if (dbgFileBytes) dbgFileBytes.textContent = arrayBuffer ? arrayBuffer.byteLength : 0;

  // TEST 2 CHECK
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    console.error('[RHINO ERROR] Failed at Stage 2: ArrayBuffer byteLength is 0');
    if (dbgErrors) dbgErrors.textContent = 'Stage 2: ArrayBuffer is 0 bytes';
    return;
  }

  // TEST 3 CHECK
  if (!rhino) {
    console.log('[RHINO] Awaiting rhino3dm module initialization...');
    try {
      if (window.rhino3dm) {
        rhino = await window.rhino3dm();
      }
    } catch (e) {
      console.error('[RHINO ERROR] Failed at Stage 3: rhino3dm initialization failed:', e);
      if (dbgRhinoInit) dbgRhinoInit.textContent = 'NO (FAILED)';
      if (dbgErrors) dbgErrors.textContent = 'Stage 3: rhino3dm init failed';
      return;
    }
  }

  if (!rhino) {
    console.error('[RHINO ERROR] Failed at Stage 3: rhino3dm object is null');
    if (dbgRhinoInit) dbgRhinoInit.textContent = 'NO';
    if (dbgErrors) dbgErrors.textContent = 'Stage 3: rhino3dm object is null';
    return;
  }

  console.log('[RHINO] 3 rhino3dm initialized');
  if (dbgRhinoInit) dbgRhinoInit.textContent = 'YES';

  // TEST 4: PARSE FILE3DM
  let doc = null;
  try {
    const bytes = new Uint8Array(arrayBuffer);
    doc = rhino.File3dm.fromByteArray(bytes);
    console.log('[RHINO] File3dm.fromByteArray result:', doc);

    if (!doc) {
      console.error('[RHINO ERROR] Failed at Stage 4: File3dm.fromByteArray returned null');
      if (dbgDocCreated) dbgDocCreated.textContent = 'NO (NULL)';
      if (rawDocStatus) rawDocStatus.textContent = 'INVALID';
      if (dbgErrors) dbgErrors.textContent = 'Stage 4: File3dm is null';
      return;
    }
  } catch (err) {
    console.error('[RHINO ERROR] Failed at Stage 4: File3dm.fromByteArray threw exception:', err);
    if (dbgDocCreated) dbgDocCreated.textContent = 'NO (THREW ERROR)';
    if (rawDocStatus) rawDocStatus.textContent = 'INVALID';
    if (dbgErrors) dbgErrors.textContent = `Stage 4: ${err.message}`;
    return;
  }

  console.log('[RHINO] 4 File3dm parsed');
  if (dbgDocCreated) dbgDocCreated.textContent = 'YES';
  if (rawDocStatus) rawDocStatus.textContent = 'VALID';

  // TEST 5: OBJECT TABLE
  let objectsTable = null;
  try {
    objectsTable = doc.objects();
    console.log('[RHINO] doc.objects() result:', objectsTable);

    if (!objectsTable) {
      console.error('[RHINO ERROR] Failed at Stage 5: doc.objects() returned null');
      if (dbgTableFound) dbgTableFound.textContent = 'NO';
      if (rawTableStatus) rawTableStatus.textContent = 'NOT FOUND';
      if (dbgErrors) dbgErrors.textContent = 'Stage 5: doc.objects() is null';
      return;
    }
  } catch (err) {
    console.error('[RHINO ERROR] Failed at Stage 5: doc.objects() threw exception:', err);
    if (dbgTableFound) dbgTableFound.textContent = 'NO (THREW ERROR)';
    if (rawTableStatus) rawTableStatus.textContent = 'NOT FOUND';
    if (dbgErrors) dbgErrors.textContent = `Stage 5: ${err.message}`;
    return;
  }

  console.log('[RHINO] 5 Object table found');
  if (dbgTableFound) dbgTableFound.textContent = 'YES';
  if (rawTableStatus) rawTableStatus.textContent = 'FOUND';

  // Read raw count safely
  let rawCount = 0;
  try {
    if (typeof objectsTable.count === 'function') {
      rawCount = objectsTable.count();
    } else if (typeof objectsTable.count === 'number') {
      rawCount = objectsTable.count;
    } else if (objectsTable.count) {
      rawCount = Number(objectsTable.count);
    }
  } catch (err) {
    console.warn('[RHINO] Error reading objectsTable.count:', err);
  }

  console.log('[RHINO] 6 Raw object count:', rawCount);
  if (dbgRawCount) dbgRawCount.textContent = rawCount;
  if (rawObjectCount) rawObjectCount.textContent = rawCount;
  if (diagObjects) diagObjects.textContent = rawCount;
  if (diagFilename) diagFilename.textContent = filename;

  // TEST 6: RETRIEVE RAW OBJECTS INTO PERSISTENT MEMORY ARRAY
  importedRhinoObjects = [];
  let geomCount = 0;
  let nullCount = 0;

  for (let i = 0; i < rawCount; i++) {
    try {
      const fileObj = objectsTable.get ? objectsTable.get(i) : null;

      let geom = null;
      if (fileObj) {
        if (typeof fileObj.geometry === 'function') {
          geom = fileObj.geometry();
        } else if (fileObj.geometry) {
          geom = fileObj.geometry;
        }
      }

      let attributes = null;
      if (fileObj) {
        if (typeof fileObj.attributes === 'function') {
          attributes = fileObj.attributes();
        } else if (fileObj.attributes) {
          attributes = fileObj.attributes;
        }
      }

      let objId = `obj_${i + 1}`;
      let objName = `Object ${i + 1}`;
      let layerIndex = 0;

      if (attributes) {
        if (typeof attributes.id === 'function') {
          objId = attributes.id();
        } else if (attributes.id) {
          objId = attributes.id;
        }
        if (typeof attributes.name === 'function') {
          objName = attributes.name() || objName;
        } else if (attributes.name) {
          objName = attributes.name;
        }
        if (typeof attributes.layerIndex === 'function') {
          layerIndex = attributes.layerIndex();
        } else if (attributes.layerIndex !== undefined) {
          layerIndex = attributes.layerIndex;
        }
      }

      const ctorName = geom && geom.constructor ? geom.constructor.name : (geom ? 'GeometryBase' : 'None');

      if (geom) {
        geomCount++;
      } else {
        nullCount++;
      }

      console.log(`[RHINO] Raw Object ${i}:`, {
        index: i,
        id: objId,
        geometryExists: !!geom,
        geometryConstructor: ctorName,
        rawObject: fileObj,
        rawGeometry: geom
      });

      importedRhinoObjects.push({
        index: i + 1,
        id: objId,
        name: objName,
        layerIndex: layerIndex,
        rawObject: fileObj,
        geom: geom,
        ctorName: ctorName,
        type: 'Other'
      });
    } catch (objErr) {
      console.error(`[RHINO ERROR] Error retrieving raw object at index ${i}:`, objErr);
      nullCount++;
    }
  }

  console.log('[RHINO] 6 Raw objects retrieved summary:', {
    rawCount: rawCount,
    geomCount: geomCount,
    nullCount: nullCount,
    objectsCount: importedRhinoObjects.length
  });

  if (dbgGeomCount) dbgGeomCount.textContent = geomCount;
  if (dbgNullCount) dbgNullCount.textContent = nullCount;
  if (rawGeomRetrieved) rawGeomRetrieved.textContent = geomCount;
  if (rawNullGeom) rawNullGeom.textContent = nullCount;
  if (rawClassified) rawClassified.textContent = geomCount;
  if (rawUnclassified) rawUnclassified.textContent = nullCount;

  if (dbgErrors) dbgErrors.textContent = 'NONE';
  if (diagStatus) {
    diagStatus.textContent = rawCount > 0 ? `OBJECT TABLE: ${rawCount} OBJECTS FOUND` : 'OBJECT TABLE EMPTY';
    diagStatus.className = rawCount > 0 ? 'diag-ok' : 'diag-err';
  }

  // DECOUPLED PIPELINE EXECUTION (Isolated Error Handling)
  // Step A: Classify actual 41 object types
  try {
    classifyRhinoObjects(importedRhinoObjects);
  } catch (err) {
    console.warn('[PIPELINE WARNING] Object classification step warning:', err);
  }

  // Step B: Calculate 3D World Model Bounding Box
  try {
    calculateModelBounds(importedRhinoObjects);
  } catch (err) {
    console.warn('[PIPELINE WARNING] Bounding box calculation warning:', err);
  }

  // Step C: Render 41 Objects into Three.js
  try {
    renderImportedRhinoModel(importedRhinoObjects);
  } catch (err) {
    console.error('[PIPELINE ERROR] Rendering step threw exception:', err);
    const rndStatus = document.getElementById('rnd-status');
    if (rndStatus) rndStatus.textContent = 'FAILED';
  }
}

// ============================================================================
// 4. CLASSIFY 41 RHINO OBJECT TYPES & POPULATE UI BREAKDOWN (TOTAL = 41)
// ============================================================================

function classifyRhinoObjects(objects) {
  const counts = {
    subd: 0, nurbs: 0, polylines: 0, polycurves: 0, lines: 0,
    arcs: 0, breps: 0, extrusions: 0, meshes: 0, points: 0,
    blocks: 0, unsupported: 0
  };

  const subdMetrics = { totalObjects: 0, totalVertices: 0, totalEdges: 0, totalFaces: 0 };

  objects.forEach((obj) => {
    const geom = obj.geom;
    if (!geom) {
      counts.unsupported++;
      obj.type = 'Unsupported';
      return;
    }

    const ctorName = obj.ctorName || (geom.constructor ? geom.constructor.name : 'Unknown');
    const objTypeVal = typeof geom.objectType === 'function' ? geom.objectType() : geom.objectType;
    const objTypeName = typeof objTypeVal === 'object' ? (objTypeVal.name || 'Unknown') : String(objTypeVal || 'Unknown');

    const isSubD = (rhino.SubD && geom instanceof rhino.SubD) ||
                   ctorName === 'SubD' || objTypeName === 'SubD' ||
                   (rhino.ObjectType && objTypeVal === rhino.ObjectType.SubD) || objTypeVal === 262144;

    const isBrep = (rhino.Brep && geom instanceof rhino.Brep) ||
                   ctorName === 'Brep' || objTypeName === 'Brep' ||
                   (rhino.ObjectType && objTypeVal === rhino.ObjectType.Brep) || objTypeVal === 16;

    const isExtrusion = (rhino.Extrusion && geom instanceof rhino.Extrusion) ||
                        ctorName === 'Extrusion' || objTypeName === 'Extrusion' ||
                        (rhino.ObjectType && objTypeVal === rhino.ObjectType.Extrusion) || objTypeVal === 1073741824;

    const isMesh = (rhino.Mesh && geom instanceof rhino.Mesh) ||
                   ctorName === 'Mesh' || objTypeName === 'Mesh' ||
                   (rhino.ObjectType && objTypeVal === rhino.ObjectType.Mesh) || objTypeVal === 32;

    const isCurve = (rhino.Curve && geom instanceof rhino.Curve) ||
                    ctorName.includes('Curve') || objTypeName.includes('Curve') ||
                    (rhino.ObjectType && objTypeVal === rhino.ObjectType.Curve) || objTypeVal === 4;

    const isPoint = (rhino.Point && geom instanceof rhino.Point) ||
                    ctorName === 'Point' || objTypeName === 'Point' ||
                    (rhino.ObjectType && objTypeVal === rhino.ObjectType.Point) || objTypeVal === 1;

    const isBlock = (rhino.InstanceReference && geom instanceof rhino.InstanceReference) ||
                    ctorName === 'InstanceReference' || objTypeName === 'InstanceReference' ||
                    (rhino.ObjectType && objTypeVal === rhino.ObjectType.InstanceReference) || objTypeVal === 4096;

    if (isSubD) {
      obj.type = 'SubD';
      counts.subd++;
      subdMetrics.totalObjects++;

      let vCount = 0, eCount = 0, fCount = 0;
      try {
        const vList = typeof geom.vertices === 'function' ? geom.vertices() : geom.vertices;
        const eList = typeof geom.edges === 'function' ? geom.edges() : geom.edges;
        const fList = typeof geom.faces === 'function' ? geom.faces() : geom.faces;

        if (vList) vCount = typeof vList.count === 'function' ? vList.count() : (vList.count || 0);
        if (eList) eCount = typeof eList.count === 'function' ? eList.count() : (eList.count || 0);
        if (fList) fCount = typeof fList.count === 'function' ? fList.count() : (fList.count || 0);
      } catch (e) {}

      subdMetrics.totalVertices += vCount;
      subdMetrics.totalEdges += eCount;
      subdMetrics.totalFaces += fCount;

      obj.subdData = { vertexCount: vCount, edgeCount: eCount, faceCount: fCount };
    } else if (isBrep) {
      obj.type = 'Brep';
      counts.breps++;
    } else if (isExtrusion) {
      obj.type = 'Extrusion';
      counts.extrusions++;
    } else if (isMesh) {
      obj.type = 'Mesh';
      counts.meshes++;
    } else if (isCurve) {
      if (ctorName.includes('Polyline') || objTypeName.includes('Polyline')) {
        obj.type = 'PolylineCurve';
        counts.polylines++;
      } else if (ctorName.includes('PolyCurve') || objTypeName.includes('PolyCurve')) {
        obj.type = 'PolyCurve';
        counts.polycurves++;
      } else if (ctorName.includes('Line') || objTypeName.includes('Line')) {
        obj.type = 'LineCurve';
        counts.lines++;
      } else if (ctorName.includes('Arc') || ctorName.includes('Circle') || objTypeName.includes('Arc')) {
        obj.type = 'ArcCurve';
        counts.arcs++;
      } else {
        obj.type = 'NurbsCurve';
        counts.nurbs++;
      }
    } else if (isPoint) {
      obj.type = 'Point';
      counts.points++;
    } else if (isBlock) {
      obj.type = 'InstanceReference';
      counts.blocks++;
    } else {
      counts.unsupported++;
      obj.type = 'Unsupported';
    }
  });

  // Populate Breakdown Counters UI
  if (countSubd) countSubd.textContent = counts.subd;
  if (countNurbs) countNurbs.textContent = counts.nurbs;
  if (countPolylines) countPolylines.textContent = counts.polylines;
  if (countPolycurves) countPolycurves.textContent = counts.polycurves;
  if (countLines) countLines.textContent = counts.lines;
  if (countArcs) countArcs.textContent = counts.arcs;
  if (countBreps) countBreps.textContent = counts.breps;
  if (countExtrusions) countExtrusions.textContent = counts.extrusions;
  if (countMeshes) countMeshes.textContent = counts.meshes;
  if (countPoints) countPoints.textContent = counts.points;
  if (countBlocks) countBlocks.textContent = counts.blocks;
  if (countUnsupported) countUnsupported.textContent = counts.unsupported;

  if (countSubdObjs) countSubdObjs.textContent = subdMetrics.totalObjects;
  if (countSubdVerts) countSubdVerts.textContent = subdMetrics.totalVertices;
  if (countSubdEdges) countSubdEdges.textContent = subdMetrics.totalEdges;
  if (countSubdFaces) countSubdFaces.textContent = subdMetrics.totalFaces;

  if (diagSubdCount) diagSubdCount.textContent = subdMetrics.totalObjects;

  console.log('[RHINO OBJECT TYPE BREAKDOWN]', counts);
  renderObjectVisibilityList(objects);
}

// ============================================================================
// 5. CALCULATE RHINO WORLD BOUNDS
// ============================================================================

function calculateModelBounds(objects) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let validCount = 0;

  objects.forEach((obj) => {
    if (!obj.geom) return;
    try {
      let bbox = null;
      if (typeof obj.geom.getBoundingBox === 'function') {
        bbox = obj.geom.getBoundingBox();
      }
      if (bbox && bbox.min && bbox.max) {
        const bx0 = bbox.min[0], by0 = bbox.min[1], bz0 = bbox.min[2];
        const bx1 = bbox.max[0], by1 = bbox.max[1], bz1 = bbox.max[2];

        if (isFinite(bx0) && isFinite(bx1)) {
          minX = Math.min(minX, bx0);
          minY = Math.min(minY, by0);
          minZ = Math.min(minZ, bz0);
          maxX = Math.max(maxX, bx1);
          maxY = Math.max(maxY, by1);
          maxZ = Math.max(maxZ, bz1);
          validCount++;

          obj.bounds = { min: { x: bx0, y: by0, z: bz0 }, max: { x: bx1, y: by1, z: bz1 } };
        }
      }
    } catch (e) {
      console.warn('Bounding box query error for object', obj.id, e);
    }
  });

  if (validCount === 0 || minX === Infinity) {
    minX = -50; minY = -50; minZ = -50;
    maxX = 50; maxY = 50; maxZ = 50;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxDim = Math.max(sizeX, sizeY, sizeZ, 1.0);

  globalBoundingBox = {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    center: { x: centerX, y: centerY, z: centerZ },
    size: { x: sizeX, y: sizeY, z: sizeZ },
    maxDim: maxDim
  };

  // Display bounds on screen (No longer showing "-")
  if (metaXRange) metaXRange.textContent = `${minX.toFixed(1)} to ${maxX.toFixed(1)}`;
  if (metaXBounds) metaXBounds.textContent = `${sizeX.toFixed(1)} mm`;

  if (metaYRange) metaYRange.textContent = `${minY.toFixed(1)} to ${maxY.toFixed(1)}`;
  if (metaYBounds) metaYBounds.textContent = `${sizeY.toFixed(1)} mm`;

  if (metaZRange) metaZRange.textContent = `${minZ.toFixed(1)} to ${maxZ.toFixed(1)}`;
  if (metaZBounds) metaZBounds.textContent = `${sizeZ.toFixed(1)} mm`;

  if (metaModelCenter) metaModelCenter.textContent = `${centerX.toFixed(1)}, ${centerY.toFixed(1)}, ${centerZ.toFixed(1)}`;

  if (diagXRange) diagXRange.textContent = `${minX.toFixed(1)} to ${maxX.toFixed(1)}`;
  if (diagYRange) diagYRange.textContent = `${minY.toFixed(1)} to ${maxY.toFixed(1)}`;
  if (diagZRange) diagZRange.textContent = `${minZ.toFixed(1)} to ${maxZ.toFixed(1)}`;
}

// ============================================================================
// 6. RENDER IMPORTER MODEL (renderImportedRhinoModel)
// ============================================================================

/**
 * Converts 41 retrieved Rhino objects into Three.js meshes/wireframes,
 * adds them to importedRhinoModel group, fits camera, and renders scene.
 */
function renderImportedRhinoModel(rhinoObjects) {
  console.log('[RENDER PIPELINE] Starting renderImportedRhinoModel with', rhinoObjects.length, 'objects...');

  const rndObjectsRcvd = document.getElementById('rnd-objects-rcvd');
  const rndObjectsConv = document.getElementById('rnd-objects-conv');
  const rndObjectsAdded = document.getElementById('rnd-objects-added');
  const rndObjectsFailed = document.getElementById('rnd-objects-failed');
  const rndModelChildren = document.getElementById('rnd-model-children');
  const rndBboxStatus = document.getElementById('rnd-bbox-status');
  const rndCamFit = document.getElementById('rnd-cam-fit');
  const rndStatus = document.getElementById('rnd-status');

  if (rndObjectsRcvd) rndObjectsRcvd.textContent = rhinoObjects.length;

  if (importedRhinoGroup) {
    scene.remove(importedRhinoGroup);
  }

  importedRhinoGroup = new THREE.Group();
  importedRhinoGroup.name = 'importedRhinoModel';

  let convertedCount = 0;
  let addedCount = 0;
  let failedCount = 0;

  // High-visibility materials
  const surfaceMaterial = new THREE.MeshNormalMaterial({
    side: THREE.DoubleSide
  });

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xffd700, // Bright gold
    linewidth: 1.5
  });

  const curveMaterial = new THREE.LineBasicMaterial({
    color: 0x00ffff, // Cyan
    linewidth: 2.0
  });

  const pointMaterial = new THREE.PointsMaterial({
    color: 0xff4500,
    size: (globalBoundingBox.maxDim || 100) * 0.02
  });

  rhinoObjects.forEach((obj, idx) => {
    if (!obj.geom) {
      failedCount++;
      console.warn(`[RENDER PIPELINE LOG] Object ${idx + 1} (${obj.name}): Null geometry. Skipping.`);
      return;
    }

    const objGroup = new THREE.Group();
    objGroup.name = obj.id;

    let success = false;
    let failReason = '';

    try {
      // 1. SUBD GEOMETRY
      if (obj.type === 'SubD') {
        let subdMesh = null;
        if (rhino.Mesh && rhino.Mesh.createFromSubDControlNet) {
          subdMesh = rhino.Mesh.createFromSubDControlNet(obj.geom);
        } else if (typeof obj.geom.toMesh === 'function') {
          subdMesh = obj.geom.toMesh();
        }

        if (subdMesh) {
          const threeGeom = convertRhinoMeshToThreeBufferGeometry(subdMesh);
          if (threeGeom) {
            const meshObj = new THREE.Mesh(threeGeom, surfaceMaterial);
            objGroup.add(meshObj);
            const edgesGeom = new THREE.EdgesGeometry(threeGeom);
            const lineSegs = new THREE.LineSegments(edgesGeom, edgeMaterial);
            objGroup.add(lineSegs);
            success = true;
          }
        }

        // Cage Wireframe Fallback
        const cageLines = extractSubDCageWireframe(obj.geom);
        if (cageLines.length > 0) {
          const linePositions = [];
          cageLines.forEach(pair => {
            linePositions.push(pair.start.x, pair.start.y, pair.start.z);
            linePositions.push(pair.end.x, pair.end.y, pair.end.z);
          });
          const lineGeom = new THREE.BufferGeometry();
          lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
          const lineSegs = new THREE.LineSegments(lineGeom, edgeMaterial);
          objGroup.add(lineSegs);
          success = true;
        }
      }
      // 2. BREP / SURFACE
      else if (obj.type === 'Brep') {
        if (rhino.Mesh && rhino.Mesh.createFromBrep) {
          const meshes = rhino.Mesh.createFromBrep(obj.geom);
          if (meshes && meshes.length > 0) {
            const threeGeom = convertRhinoMeshToThreeBufferGeometry(meshes[0]);
            if (threeGeom) {
              const meshObj = new THREE.Mesh(threeGeom, surfaceMaterial);
              objGroup.add(meshObj);
              const edgesGeom = new THREE.EdgesGeometry(threeGeom);
              const lineSegs = new THREE.LineSegments(edgesGeom, edgeMaterial);
              objGroup.add(lineSegs);
              success = true;
            }
          }
        }
      }
      // 3. EXTRUSION
      else if (obj.type === 'Extrusion') {
        if (typeof obj.geom.getMesh === 'function') {
          const mesh = obj.geom.getMesh(rhino.MeshType ? rhino.MeshType.Any : 0);
          if (mesh) {
            const threeGeom = convertRhinoMeshToThreeBufferGeometry(mesh);
            if (threeGeom) {
              const meshObj = new THREE.Mesh(threeGeom, surfaceMaterial);
              objGroup.add(meshObj);
              const edgesGeom = new THREE.EdgesGeometry(threeGeom);
              const lineSegs = new THREE.LineSegments(edgesGeom, edgeMaterial);
              objGroup.add(lineSegs);
              success = true;
            }
          }
        }
      }
      // 4. MESH
      else if (obj.type === 'Mesh') {
        const threeGeom = convertRhinoMeshToThreeBufferGeometry(obj.geom);
        if (threeGeom) {
          const meshObj = new THREE.Mesh(threeGeom, surfaceMaterial);
          objGroup.add(meshObj);
          const edgesGeom = new THREE.EdgesGeometry(threeGeom);
          const lineSegs = new THREE.LineSegments(edgesGeom, edgeMaterial);
          objGroup.add(lineSegs);
          success = true;
        }
      }
      // 5. CURVES
      else if (obj.type.includes('Curve') || obj.type === 'PolylineCurve' || obj.type === 'NurbsCurve') {
        const linePairs = sampleCurveTo3DLines(obj.geom);
        if (linePairs.length > 0) {
          const positions = [];
          linePairs.forEach(pair => {
            positions.push(pair.start.x, pair.start.y, pair.start.z);
            positions.push(pair.end.x, pair.end.y, pair.end.z);
          });
          const lineGeom = new THREE.BufferGeometry();
          lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          const lineSegs = new THREE.LineSegments(lineGeom, curveMaterial);
          objGroup.add(lineSegs);
          success = true;
        }
      }
      // 6. POINT
      else if (obj.type === 'Point') {
        const pt = typeof obj.geom.location === 'function' ? obj.geom.location() : obj.geom.location;
        if (pt) {
          const ptGeom = new THREE.BufferGeometry();
          ptGeom.setAttribute('position', new THREE.Float32BufferAttribute([pt[0], pt[1], pt[2]], 3));
          const pointsObj = new THREE.Points(ptGeom, pointMaterial);
          objGroup.add(pointsObj);
          success = true;
        }
      }
    } catch (conversionErr) {
      failReason = conversionErr.message;
    }

    if (success && objGroup.children.length > 0) {
      importedRhinoGroup.add(objGroup);
      convertedCount++;
      addedCount++;
    } else {
      failedCount++;
      console.warn(`[RENDER PIPELINE LOG] Object ${idx + 1} (${obj.name}) | Type: ${obj.type} | Ctor: ${obj.ctorName} | Conversion FAILED. Reason: ${failReason || 'No mesh/lines generated'}`);
    }
  });

  scene.add(importedRhinoGroup);
  console.log('[RENDER PIPELINE SUCCESS] Added importedRhinoGroup to Three.js scene with', importedRhinoGroup.children.length, 'children.');

  if (rndObjectsConv) rndObjectsConv.textContent = convertedCount;
  if (rndObjectsAdded) rndObjectsAdded.textContent = addedCount;
  if (rndObjectsFailed) rndObjectsFailed.textContent = failedCount;
  if (rndModelChildren) rndModelChildren.textContent = importedRhinoGroup.children.length;

  // FIT CAMERA TO THREE.JS BOUNDING BOX
  const box = new THREE.Box3().setFromObject(importedRhinoGroup);
  const isBoxValid = !box.isEmpty();

  if (rndBboxStatus) rndBboxStatus.textContent = isBoxValid ? 'VALID' : 'EMPTY';

  if (isBoxValid && camera && controls) {
    const center = new THREE.Vector3();
    box.getCenter(center);

    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 1.0);
    const fov = camera.fov * (Math.PI / 180);
    let cameraDist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.2;

    controls.target.copy(center);
    camera.position.set(center.x, center.y - cameraDist, center.z + cameraDist * 0.5);
    camera.up.set(0, 0, 1);

    camera.near = Math.max(0.1, cameraDist / 100);
    camera.far = cameraDist * 100;
    camera.updateProjectionMatrix();

    controls.update();
    renderer.render(scene, camera);

    if (rndCamFit) rndCamFit.textContent = 'YES';
    if (rndStatus) rndStatus.textContent = 'SUCCESS';

    // REMOVE START SCREEN CARD ONLY UPON RENDER SUCCESS (ADDED TO THREE.JS > 0)
    if (addedCount > 0 && startScreenCard) {
      startScreenCard.style.display = 'none';
      if (canvasTagsOverlay) canvasTagsOverlay.style.display = 'flex';
      if (diagnosticsOverlay) diagnosticsOverlay.style.display = 'block';
      if (viewerTogglesOverlay) viewerTogglesOverlay.style.display = 'block';
    }
  } else {
    if (rndCamFit) rndCamFit.textContent = 'NO';
    if (rndStatus) rndStatus.textContent = 'EMPTY BBOX';
  }

  if (diagRendered) diagRendered.textContent = addedCount;
  if (diagStatus) {
    diagStatus.textContent = `IMPORTED: ${addedCount}/${rhinoObjects.length} OBJECTS VISIBLE`;
    diagStatus.className = 'diag-ok';
  }
}

/**
 * Converts a rhino3dm Mesh into a THREE.BufferGeometry
 */
function convertRhinoMeshToThreeBufferGeometry(mesh) {
  try {
    const vertsList = typeof mesh.vertices === 'function' ? mesh.vertices() : mesh.vertices;
    const facesList = typeof mesh.faces === 'function' ? mesh.faces() : mesh.faces;

    if (!vertsList || !facesList) return null;

    const positions = [];
    const indices = [];

    const vCount = typeof vertsList.count === 'function' ? vertsList.count() : (vertsList.count || 0);
    for (let i = 0; i < vCount; i++) {
      const pt = vertsList.get(i);
      positions.push(pt[0], pt[1], pt[2]);
    }

    const fCount = typeof facesList.count === 'function' ? facesList.count() : (facesList.count || 0);
    for (let i = 0; i < fCount; i++) {
      const f = facesList.get(i);
      if (f.length === 4) {
        indices.push(f[0], f[1], f[2]);
        indices.push(f[0], f[2], f[3]);
      } else if (f.length === 3) {
        indices.push(f[0], f[1], f[2]);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (indices.length > 0) {
      geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
    }
    geometry.computeVertexNormals();
    return geometry;
  } catch (err) {
    console.error('Error converting rhino mesh to THREE.BufferGeometry:', err);
    return null;
  }
}

function extractSubDCageWireframe(subd) {
  const linePairs = [];
  try {
    const edges = typeof subd.edges === 'function' ? subd.edges() : subd.edges;
    const count = edges ? (typeof edges.count === 'function' ? edges.count() : (edges.count || 0)) : 0;
    for (let i = 0; i < count; i++) {
      const edge = edges.get(i);
      const line = typeof edge.toLine === 'function' ? edge.toLine() : edge.toLine;
      if (line) {
        const pA = line.from;
        const pB = line.to;
        linePairs.push({
          start: { x: pA[0], y: pA[1], z: pA[2] },
          end: { x: pB[0], y: pB[1], z: pB[2] }
        });
      }
    }
  } catch (err) {}
  return linePairs;
}

function sampleCurveTo3DLines(curve) {
  const linePairs = [];
  try {
    const domain = typeof curve.domain === 'function' ? curve.domain() : curve.domain;
    if (!domain) return linePairs;

    const samples = 60;
    const tStart = domain[0];
    const tEnd = domain[1];
    const step = (tEnd - tStart) / samples;

    let prevPt = curve.pointAt(tStart);
    for (let i = 1; i <= samples; i++) {
      const t = tStart + i * step;
      const currPt = curve.pointAt(t);
      linePairs.push({
        start: { x: prevPt[0], y: prevPt[1], z: prevPt[2] },
        end: { x: currPt[0], y: currPt[1], z: currPt[2] }
      });
      prevPt = currPt;
    }
  } catch (err) {}
  return linePairs;
}

function setCameraProjection(proj) {
  if (!camera || !controls) return;
  appState.projectionMode = proj;

  const center = globalBoundingBox.center;
  const dist = (globalBoundingBox.maxDim || 100) * 2.2;

  switch (proj) {
    case 'FRONT':
      camera.position.set(center.x, center.y - dist, center.z);
      camera.up.set(0, 0, 1);
      break;
    case 'TOP':
      camera.position.set(center.x, center.y, center.z + dist);
      camera.up.set(0, 1, 0);
      break;
    case 'RIGHT':
      camera.position.set(center.x + dist, center.y, center.z);
      camera.up.set(0, 0, 1);
      break;
    case 'PERSPECTIVE':
    default:
      camera.position.set(center.x + dist * 0.7, center.y - dist * 0.7, center.z + dist * 0.5);
      camera.up.set(0, 0, 1);
      break;
  }

  controls.target.set(center.x, center.y, center.z);
  controls.update();

  if (currentProjBadge) currentProjBadge.textContent = `PROJECTION: ${proj}`;
  if (diagProjection) diagProjection.textContent = proj;
}

function updateDisplayModeVisibility() {
  if (!importedRhinoGroup) return;
  importedRhinoGroup.children.forEach(child => {
    const isObjVisible = appState.objectVisibilityMap[child.name] !== false;
    child.visible = isObjVisible;
  });
}

function renderObjectVisibilityList(objects) {
  if (!objectVisibilityList) return;
  objectVisibilityList.innerHTML = '';

  objects.forEach((obj) => {
    const item = document.createElement('div');
    item.className = 'object-item';

    const typeBadge = obj.type === 'SubD' ? '<span class="type-subd">SubD</span>' : `<span class="type-badge">${obj.type}</span>`;
    const subdDetail = obj.subdData ? `<div class="obj-sub-info">V:${obj.subdData.vertexCount} E:${obj.subdData.edgeCount} F:${obj.subdData.faceCount}</div>` : '';

    item.innerHTML = `
      <div style="flex:1; overflow:hidden;">
        <div style="font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
          ${obj.name} ${typeBadge}
        </div>
        ${subdDetail}
      </div>
      <div style="display:flex; gap:0.25rem;">
        <button class="vis-btn isolate-btn" data-id="${obj.id}">ISOLATE</button>
        <button class="vis-btn toggle-btn" data-id="${obj.id}">HIDE</button>
      </div>
    `;

    item.querySelector('.isolate-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      isolateObject(obj.id);
    });

    const toggleBtn = item.querySelector('.toggle-btn');
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleObjectVisibility(obj.id, toggleBtn);
    });

    objectVisibilityList.appendChild(item);
  });
}

function isolateObject(objId) {
  Object.keys(appState.objectVisibilityMap).forEach((id) => {
    appState.objectVisibilityMap[id] = (id === objId);
  });
  updateDisplayModeVisibility();
}

function toggleObjectVisibility(objId, btnElement) {
  const current = appState.objectVisibilityMap[objId] !== false;
  appState.objectVisibilityMap[objId] = !current;
  if (btnElement) {
    btnElement.textContent = !current ? 'HIDE' : 'SHOW';
  }
  updateDisplayModeVisibility();
}

function toggleAllObjectVisibility() {
  const allVisible = Object.values(appState.objectVisibilityMap).every((v) => v === true);
  Object.keys(appState.objectVisibilityMap).forEach((id) => {
    appState.objectVisibilityMap[id] = !allVisible;
  });
  updateDisplayModeVisibility();
}

async function loadSampleSeed() {
  console.log('[RHINO] 1 File selected (Sample Seed)');

  const dbgFileSelected = document.getElementById('dbg-file-selected');
  const dbgFileName = document.getElementById('dbg-file-name');
  const dbgFileSize = document.getElementById('dbg-file-size');

  if (dbgFileSelected) dbgFileSelected.textContent = 'YES (SAMPLE)';
  if (dbgFileName) dbgFileName.textContent = 'sample_architectural_seed.3dm';

  if (rawFileName) rawFileName.textContent = 'sample_architectural_seed.3dm';

  if (!rhino) {
    if (window.rhino3dm) {
      try {
        rhino = await window.rhino3dm();
      } catch (e) {}
    }
  }

  if (!rhino) {
    alert('Rhino3dm library not yet loaded. Please wait a moment.');
    return;
  }

  try {
    const doc = new rhino.File3dm();

    let subd = null;
    if (rhino.SubD && rhino.SubD.createFromMesh) {
      const mesh = new rhino.Mesh();
      mesh.vertices().add(-50, -50, 0);
      mesh.vertices().add(50, -50, 0);
      mesh.vertices().add(50, 50, 0);
      mesh.vertices().add(-50, 50, 0);
      mesh.vertices().add(-50, -50, 80);
      mesh.vertices().add(50, -50, 80);
      mesh.vertices().add(50, 50, 80);
      mesh.vertices().add(-50, 50, 80);

      mesh.faces().addFace(0, 1, 2, 3);
      mesh.faces().addFace(4, 5, 6, 7);
      mesh.faces().addFace(0, 1, 5, 4);
      mesh.faces().addFace(1, 2, 6, 5);
      mesh.faces().addFace(2, 3, 7, 6);
      mesh.faces().addFace(3, 0, 4, 7);

      subd = rhino.SubD.createFromMesh(mesh);
    }

    if (subd) {
      const attr = new rhino.ObjectAttributes();
      attr.name = 'Sample SubD Vault';
      doc.objects().add(subd, attr);
    } else {
      const ptList = new rhino.Point3dCollection();
      ptList.add(-60, 0, 0);
      ptList.add(-30, 0, 90);
      ptList.add(30, 0, 90);
      ptList.add(60, 0, 0);
      const curve = rhino.NurbsCurve.create(false, 3, ptList);
      doc.objects().add(curve, null);
    }

    const bytes = doc.toByteArray();
    if (dbgFileSize) dbgFileSize.textContent = `${bytes.byteLength} bytes`;
    if (rawFileSize) rawFileSize.textContent = `${bytes.byteLength} bytes`;

    await parseRhino3dm(bytes.buffer, 'sample_architectural_seed.3dm');
  } catch (err) {
    console.error('Error generating sample seed:', err);
  }
}
