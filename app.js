/**
 * ============================================================================
 * DESIGN 7 EXPLORATION - DESCRIPTOR-DRIVEN ARCHITECTURAL EVOLUTION SYSTEM
 * RHINO SUBD SOURCE & COMPANION DISPLAY MESH ENGINE (THREE.JS VIEWER)
 * - Decoupled Architecture:
 *   SOURCE_SUBD   -> Editable Generation 0 Seed (Stored immutably in originalSubDObjects)
 *   DISPLAY_MESH  -> Companion Visualization Geometry (Converted to Three.js BufferGeometry)
 *   THREE.JS      -> WebGL Viewport Renderer
 * - Paired Object Manager: SPACE_01 (SubD) <-> SPACE_01_DISPLAY (Mesh)
 * - High-Visibility Debug Material: THREE.MeshNormalMaterial + Edges Wireframe
 * - Source & Display Diagnostics Card Updates
 * ============================================================================
 */

// Global Rhino3dm Module Reference
let rhino = null;

// Persistent Global Storage for Generation 0 Source & Companion Display Geometry
let importedRhinoObjects = [];
let originalSubDObjects = [];  // Generation 0 Editable Source DNA
let displayMeshObjects = [];   // Browser Visualization Geometry
let subdMeshPairs = [];        // Paired Relationships: [{ subd, mesh, name }]

// Application State
let appState = {
  originalRhinoGeometry: null,
  sourceRhinoObjects: [],
  displayObjects: [],
  threeModel: null,
  parentGeometry: null,
  childGeometry: null,
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

// Debug & Diagnostics Cards
const rawFileName = document.getElementById('raw-file-name');
const rawFileSize = document.getElementById('raw-file-size');
const rawDocStatus = document.getElementById('raw-doc-status');
const rawTableStatus = document.getElementById('raw-table-status');
const rawObjectCount = document.getElementById('raw-object-count');
const rawGeomRetrieved = document.getElementById('raw-geom-retrieved');
const rawNullGeom = document.getElementById('raw-null-geom');
const rawClassified = document.getElementById('raw-classified');
const rawUnclassified = document.getElementById('raw-unclassified');

const rndObjectsRcvd = document.getElementById('rnd-objects-rcvd');
const rndObjectsConv = document.getElementById('rnd-objects-conv');
const rndObjectsAdded = document.getElementById('rnd-objects-added');
const rndObjectsFailed = document.getElementById('rnd-objects-failed');
const rndModelChildren = document.getElementById('rnd-model-children');
const rndBboxStatus = document.getElementById('rnd-bbox-status');
const rndCamFit = document.getElementById('rnd-cam-fit');
const rndStatus = document.getElementById('rnd-status');

// Source & Display Pairing Elements
const srcSubdCount = document.getElementById('src-subd-count');
const srcSubdStored = document.getElementById('src-subd-stored');
const dspMeshCount = document.getElementById('dsp-mesh-count');
const dspMeshConv = document.getElementById('dsp-mesh-conv');
const dspThreeCount = document.getElementById('dsp-three-count');
const pairCount = document.getElementById('pair-count');
const pairUnpairedSubd = document.getElementById('pair-unpaired-subd');
const pairUnpairedMesh = document.getElementById('pair-unpaired-mesh');
const vwrBbox = document.getElementById('vwr-bbox');
const vwrCamFit = document.getElementById('vwr-cam-fit');
const vwrStatus = document.getElementById('vwr-status');

// Bounding Box Cards
const metaXRange = document.getElementById('meta-x-range');
const metaXBounds = document.getElementById('meta-x-bounds');
const metaYRange = document.getElementById('meta-y-range');
const metaYBounds = document.getElementById('meta-y-bounds');
const metaZRange = document.getElementById('meta-z-range');
const metaZBounds = document.getElementById('meta-z-bounds');
const metaModelCenter = document.getElementById('meta-model-center');

const countSubd = document.getElementById('count-subd');
const countMeshes = document.getElementById('count-meshes');
const countNurbs = document.getElementById('count-nurbs');
const objectVisibilityList = document.getElementById('object-visibility-list');

// ============================================================================
// 1. INITIALIZATION & THREE.JS SETUP
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
  scene.background = new THREE.Color(0x0a0a0a);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
  camera.position.set(0, -300, 150);
  camera.up.set(0, 0, 1);

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
  gridHelper.rotation.x = Math.PI / 2;
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

// 11-Stage Import Execution Trace Helper
function setTrace(stageNum, status, text) {
  const el = document.getElementById(`tr-${stageNum}`);
  if (el) {
    el.textContent = `${status} ${text ? '(' + text + ')' : ''}`;
    el.style.color = status === 'PASS' ? '#50e3c2' : (status === 'FAIL' ? '#ff4d4d' : '#aaa');
    el.style.fontWeight = 'bold';
  }
}

function enableImportControls() {
  if (btnRhinoFileInput) btnRhinoFileInput.disabled = false;
  if (btnRhinoFileInputMain) btnRhinoFileInputMain.disabled = false;
  if (btnLoadSampleSeed) btnLoadSampleSeed.disabled = false;
  if (btnStartSample) btnStartSample.disabled = false;

  const btnTestMutation = document.getElementById('btn-test-mutation');
  if (btnTestMutation) {
    btnTestMutation.disabled = true;
    btnTestMutation.title = 'Mutation engine disabled until Rhino import rendering is verified';
    btnTestMutation.style.opacity = '0.5';
    btnTestMutation.style.cursor = 'not-allowed';
  }
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

  console.log('[RHINO] 1 File selected:', file.name, 'Size:', file.size, 'bytes');

  setTrace(1, 'PASS', file.name);

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
    setTrace(2, 'PASS', `${arrayBuffer.byteLength} bytes`);
    await parseRhino3dm(arrayBuffer, file.name);
  } catch (err) {
    console.error('[RHINO ERROR] Failed at Stage 1/2:', err);
    setTrace(2, 'FAIL', err.message);
    const dbgErrors = document.getElementById('dbg-errors');
    if (dbgErrors) dbgErrors.textContent = `Stage 1/2: ${err.message}`;
  }
}

// ============================================================================
// 3. RESTORED WORKING IMPORTER: parseRhino3dm(arrayBuffer, filename)
// ============================================================================

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

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    console.error('[RHINO ERROR] Failed at Stage 2: ArrayBuffer byteLength is 0');
    if (dbgErrors) dbgErrors.textContent = 'Stage 2: ArrayBuffer is 0 bytes';
    return;
  }

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
  setTrace(3, 'PASS', 'File3dm CREATED');
  if (dbgDocCreated) dbgDocCreated.textContent = 'YES';
  if (rawDocStatus) rawDocStatus.textContent = 'VALID';

  let objectsTable = null;
  try {
    objectsTable = doc.objects();
    console.log('[RHINO] doc.objects() result:', objectsTable);

    if (!objectsTable) {
      console.error('[RHINO ERROR] Failed at Stage 5: doc.objects() returned null');
      setTrace(4, 'FAIL', 'doc.objects() returned null');
      if (dbgTableFound) dbgTableFound.textContent = 'NO';
      if (rawTableStatus) rawTableStatus.textContent = 'NOT FOUND';
      if (dbgErrors) dbgErrors.textContent = 'Stage 5: doc.objects() is null';
      return;
    }
  } catch (err) {
    console.error('[RHINO ERROR] Failed at Stage 5: doc.objects() threw exception:', err);
    setTrace(4, 'FAIL', err.message);
    if (dbgTableFound) dbgTableFound.textContent = 'NO (THREW ERROR)';
    if (rawTableStatus) rawTableStatus.textContent = 'NOT FOUND';
    if (dbgErrors) dbgErrors.textContent = `Stage 5: ${err.message}`;
    return;
  }

  console.log('[RHINO] 5 Object table found');
  setTrace(4, 'PASS', 'OBJECT TABLE FOUND');
  if (dbgTableFound) dbgTableFound.textContent = 'YES';
  if (rawTableStatus) rawTableStatus.textContent = 'FOUND';

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
  setTrace(5, 'PASS', `${rawCount} RAW OBJECTS`);
  if (dbgRawCount) dbgRawCount.textContent = rawCount;
  if (rawObjectCount) rawObjectCount.textContent = rawCount;
  if (diagObjects) diagObjects.textContent = rawCount;
  if (diagFilename) diagFilename.textContent = filename;

  // STORE RETRIEVED RHINO OBJECTS INTO PERSISTENT MEMORY ARRAY
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

  setTrace(6, 'PASS', `${geomCount} CLASSIFIED`);

  if (dbgGeomCount) dbgGeomCount.textContent = geomCount;
  if (dbgNullCount) dbgNullCount.textContent = nullCount;
  if (rawGeomRetrieved) rawGeomRetrieved.textContent = geomCount;
  if (rawNullGeom) rawNullGeom.textContent = nullCount;
  if (rawClassified) rawClassified.textContent = geomCount;
  if (rawUnclassified) rawUnclassified.textContent = nullCount;

  if (dbgErrors) dbgErrors.textContent = 'NONE';

  // PROCESS SOURCE_SUBD AND DISPLAY_MESH ARCHITECTURE
  try {
    processSourceAndDisplayGeometry(doc, importedRhinoObjects);
    appState.sourceRhinoObjects = importedRhinoObjects;
    appState.displayObjects = displayMeshObjects;
    setTrace(7, 'PASS', `${displayMeshObjects.length} CONVERTED`);
  } catch (err) {
    console.warn('[PIPELINE WARNING] Source and Display processing warning:', err);
    setTrace(7, 'FAIL', err.message);
  }

  try {
    calculateModelBounds(importedRhinoObjects);
  } catch (err) {
    console.warn('[PIPELINE WARNING] Bounding box calculation warning:', err);
  }

  try {
    renderImportedRhinoModel(displayMeshObjects.length > 0 ? displayMeshObjects : importedRhinoObjects);
  } catch (err) {
    console.error('[PIPELINE ERROR] Rendering step threw exception:', err);
    const rndStatus = document.getElementById('rnd-status');
    if (rndStatus) rndStatus.textContent = 'FAILED';
  }
}

// ============================================================================
// 4. SOURCE_SUBD & DISPLAY_MESH PAIRING MANAGER
// ============================================================================

/**
 * Separates SOURCE_SUBD (Generation 0 Seed) from DISPLAY_MESH (Visualization)
 * and pairs them by name: SPACE_01 <-> SPACE_01_DISPLAY
 */
function processSourceAndDisplayGeometry(doc, objects) {
  originalSubDObjects = [];
  displayMeshObjects = [];
  subdMeshPairs = [];

  const layerTable = typeof doc.layers === 'function' ? doc.layers() : doc.layers;
  const layerMap = {};
  if (layerTable) {
    const lCount = typeof layerTable.count === 'function' ? layerTable.count() : (layerTable.count || 0);
    for (let i = 0; i < lCount; i++) {
      const layer = layerTable.get(i);
      const lName = typeof layer.name === 'function' ? layer.name() : layer.name;
      layerMap[i] = lName;
    }
  }

  objects.forEach((obj) => {
    const geom = obj.geom;
    if (!geom) return;

    const ctorName = obj.ctorName || (geom.constructor ? geom.constructor.name : 'Unknown');
    const objTypeVal = typeof geom.objectType === 'function' ? geom.objectType() : geom.objectType;
    const objTypeName = typeof objTypeVal === 'object' ? (objTypeVal.name || 'Unknown') : String(objTypeVal || 'Unknown');
    const layerName = layerMap[obj.layerIndex] || '';

    const isSubD = (rhino.SubD && geom instanceof rhino.SubD) ||
                   ctorName === 'SubD' || objTypeName === 'SubD' ||
                   (rhino.ObjectType && objTypeVal === rhino.ObjectType.SubD) || objTypeVal === 262144 ||
                   layerName.toUpperCase().includes('SOURCE_SUBD');

    const isMesh = (rhino.Mesh && geom instanceof rhino.Mesh) ||
                   ctorName === 'Mesh' || objTypeName === 'Mesh' ||
                   (rhino.ObjectType && objTypeVal === rhino.ObjectType.Mesh) || objTypeVal === 32 ||
                   layerName.toUpperCase().includes('DISPLAY_MESH');

    if (isSubD) {
      obj.type = 'SubD';
      originalSubDObjects.push(obj);
    } else if (isMesh) {
      obj.type = 'Mesh';
      displayMeshObjects.push(obj);
    } else {
      obj.type = ctorName.includes('Curve') ? 'NurbsCurve' : 'Other';
    }
  });

  // PAIRING LOGIC: Pair SubD objects with companion Meshes in file or build companion display mesh
  originalSubDObjects.forEach((subdObj, idx) => {
    const baseName = subdObj.name.replace(/_DISPLAY/i, '').replace(/_SUBD/i, '');
    let companionMesh = displayMeshObjects.find((m) => m.name.includes(baseName) || m.index === subdObj.index);

    // If file has pure SubDs without explicit mesh objects on layer DISPLAY_MESH, build companion display mesh
    if (!companionMesh) {
      companionMesh = {
        index: subdObj.index,
        id: `${subdObj.id}_display_mesh`,
        name: `${subdObj.name}_DISPLAY`,
        type: 'Mesh',
        ctorName: 'Mesh',
        geom: subdObj.geom,
        isGeneratedCompanion: true
      };
      displayMeshObjects.push(companionMesh);
    }

    subdMeshPairs.push({
      subd: subdObj,
      mesh: companionMesh,
      name: baseName
    });
  });

  // Update Source & Display Diagnostics Card in UI
  if (srcSubdCount) srcSubdCount.textContent = originalSubDObjects.length;
  if (srcSubdStored) srcSubdStored.textContent = originalSubDObjects.length;
  if (dspMeshCount) dspMeshCount.textContent = displayMeshObjects.length;
  if (dspMeshConv) dspMeshConv.textContent = displayMeshObjects.length;
  if (dspThreeCount) dspThreeCount.textContent = displayMeshObjects.length;
  if (pairCount) pairCount.textContent = subdMeshPairs.length;
  if (pairUnpairedSubd) pairUnpairedSubd.textContent = Math.max(0, originalSubDObjects.length - subdMeshPairs.length);
  if (pairUnpairedMesh) pairUnpairedMesh.textContent = Math.max(0, displayMeshObjects.length - subdMeshPairs.length);

  if (countSubd) countSubd.textContent = originalSubDObjects.length;
  if (countMeshes) countMeshes.textContent = displayMeshObjects.length;

  console.log('[SOURCE & DISPLAY PAIRING COMPLETE]', {
    originalSubDCount: originalSubDObjects.length,
    displayMeshCount: displayMeshObjects.length,
    pairedCount: subdMeshPairs.length
  });

  renderObjectVisibilityList(importedRhinoObjects);
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
// 6. THREE.JS CONVERTER FOR DISPLAY MESHES
// ============================================================================

function createDisplayBufferGeometry(obj, idx) {
  const geom = obj.geom;
  if (!geom) return null;

  // 1. If object is a Rhino Mesh, convert vertices & face indices (supporting Quads & Triangles)
  const isMesh = (rhino.Mesh && geom instanceof rhino.Mesh) || obj.ctorName === 'Mesh' || obj.type === 'Mesh';

  if (isMesh) {
    return convertRhinoMeshToThreeBufferGeometry(geom);
  }

  // 2. If object is a SubD, extract SubD Control-Net Mesh for display
  const isSubD = (rhino.SubD && geom instanceof rhino.SubD) || obj.ctorName === 'SubD' || obj.type === 'SubD';

  if (isSubD) {
    try {
      let subdMesh = null;
      if (rhino.Mesh && rhino.Mesh.createFromSubDControlNet) {
        subdMesh = rhino.Mesh.createFromSubDControlNet(geom);
      } else if (typeof geom.toMesh === 'function') {
        subdMesh = geom.toMesh();
      }

      if (subdMesh) {
        const bufferGeom = convertRhinoMeshToThreeBufferGeometry(subdMesh);
        if (bufferGeom) return bufferGeom;
      }
    } catch (e) {}

    // Fallback: Extract control vertices & faces directly from SubD structure
    return createControlNetMeshFromSubD(geom);
  }

  return null;
}

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
        // Quad face -> 2 Triangles
        indices.push(f[0], f[1], f[2]);
        indices.push(f[0], f[2], f[3]);
      } else if (f.length === 3) {
        // Triangle face
        indices.push(f[0], f[1], f[2]);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (indices.length > 0) {
      geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } catch (err) {
    console.error('Error converting Rhino mesh to THREE.BufferGeometry:', err);
    return null;
  }
}

function createControlNetMeshFromSubD(subd) {
  try {
    const vList = typeof subd.vertices === 'function' ? subd.vertices() : subd.vertices;
    const fList = typeof subd.faces === 'function' ? subd.faces() : subd.faces;

    if (!vList) return null;

    const vCount = typeof vList.count === 'function' ? vList.count() : (vList.count || 0);
    const fCount = fList ? (typeof fList.count === 'function' ? fList.count() : (fList.count || 0)) : 0;

    const positions = [];
    for (let i = 0; i < vCount; i++) {
      const v = vList.get(i);
      const loc = typeof v.location === 'function' ? v.location() : v.location;
      if (loc) {
        positions.push(loc[0], loc[1], loc[2]);
      } else {
        positions.push(0, 0, 0);
      }
    }

    const indices = [];
    if (fCount > 0) {
      for (let i = 0; i < fCount; i++) {
        const face = fList.get(i);
        let vIndices = [];

        if (typeof face.vertexIndices === 'function') {
          vIndices = face.vertexIndices();
        } else if (face.vertexIndices) {
          vIndices = face.vertexIndices;
        } else {
          const fVerts = typeof face.vertices === 'function' ? face.vertices() : face.vertices;
          if (fVerts) {
            const fvCount = typeof fVerts.count === 'function' ? fVerts.count() : (fVerts.count || 0);
            for (let j = 0; j < fvCount; j++) {
              const fv = fVerts.get(j);
              const vIdx = typeof fv.vertexIndex === 'function' ? fv.vertexIndex() : (fv.vertexIndex || j);
              vIndices.push(vIdx);
            }
          }
        }

        if (vIndices && vIndices.length >= 3) {
          if (vIndices.length === 3) {
            indices.push(vIndices[0], vIndices[1], vIndices[2]);
          } else if (vIndices.length === 4) {
            indices.push(vIndices[0], vIndices[1], vIndices[2]);
            indices.push(vIndices[0], vIndices[2], vIndices[3]);
          } else {
            for (let k = 1; k < vIndices.length - 1; k++) {
              indices.push(vIndices[0], vIndices[k], vIndices[k + 1]);
            }
          }
        }
      }
    }

    if (indices.length === 0 && positions.length >= 9) {
      for (let i = 0; i < (positions.length / 3) - 2; i += 2) {
        indices.push(i, i + 1, i + 2);
      }
    }

    if (positions.length >= 9) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      if (indices.length > 0) {
        geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
      }
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    }
  } catch (err) {
    console.warn('SubD control-net mesh fallback warning:', err);
  }
  return null;
}

// ============================================================================
// 7. RENDERER & CAMERA FIT: renderImportedRhinoModel(displayObjects)
// ============================================================================

function renderImportedRhinoModel(displayObjects) {
  console.log('[RENDER PIPELINE] Starting renderImportedRhinoModel with', displayObjects.length, 'display objects...');

  if (rndObjectsRcvd) rndObjectsRcvd.textContent = displayObjects.length;

  if (importedRhinoGroup) {
    scene.remove(importedRhinoGroup);
  }

  importedRhinoGroup = new THREE.Group();
  importedRhinoGroup.name = 'importedRhinoModel';

  let convertedCount = 0;
  let addedCount = 0;
  let failedCount = 0;

  const surfaceMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffd700, linewidth: 1.5 });
  const curveMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2.0 });

  displayObjects.forEach((obj, idx) => {
    if (!obj.geom) {
      failedCount++;
      return;
    }

    const objGroup = new THREE.Group();
    objGroup.name = obj.id;
    let success = false;

    try {
      const bufferGeom = createDisplayBufferGeometry(obj, idx + 1);

      if (bufferGeom) {
        const meshObj = new THREE.Mesh(bufferGeom, surfaceMaterial);
        objGroup.add(meshObj);

        const edgesGeom = new THREE.EdgesGeometry(bufferGeom);
        const lineSegs = new THREE.LineSegments(edgesGeom, edgeMaterial);
        objGroup.add(lineSegs);
        success = true;
      } else if (obj.type.includes('Curve')) {
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
    } catch (err) {
      console.warn(`[RENDER PIPELINE LOG] Object ${idx + 1} (${obj.name}) conversion error:`, err);
    }

    if (success && objGroup.children.length > 0) {
      importedRhinoGroup.add(objGroup);
      convertedCount++;
      addedCount++;
    } else {
      failedCount++;
    }
  });

  scene.add(importedRhinoGroup);
  appState.threeModel = importedRhinoGroup;
  console.log('[RENDER PIPELINE SUCCESS] Added importedRhinoGroup to Three.js scene with', importedRhinoGroup.children.length, 'children.');

  setTrace(8, 'PASS', `${addedCount} ADDED TO THREE.JS`);

  if (rndObjectsConv) rndObjectsConv.textContent = convertedCount;
  if (rndObjectsAdded) rndObjectsAdded.textContent = addedCount;
  if (rndObjectsFailed) rndObjectsFailed.textContent = failedCount;
  if (rndModelChildren) rndModelChildren.textContent = importedRhinoGroup.children.length;

  if (dspMeshConv) dspMeshConv.textContent = convertedCount;
  if (dspThreeCount) dspThreeCount.textContent = addedCount;

  // FIT CAMERA TO THREE.JS BOUNDING BOX
  const box = new THREE.Box3().setFromObject(importedRhinoGroup);
  const isBoxValid = !box.isEmpty();

  setTrace(9, 'PASS', isBoxValid ? 'VALID' : 'EMPTY');

  if (rndBboxStatus) rndBboxStatus.textContent = isBoxValid ? 'VALID' : 'EMPTY';
  if (vwrBbox) vwrBbox.textContent = isBoxValid ? 'VALID' : 'EMPTY';

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

    setTrace(10, 'PASS', 'YES');

    if (rndCamFit) rndCamFit.textContent = 'YES';
    if (vwrCamFit) vwrCamFit.textContent = 'YES';
    if (rndStatus) rndStatus.textContent = 'SUCCESS';
    if (vwrStatus) vwrStatus.textContent = 'SUCCESS';

    if (addedCount > 0 && startScreenCard) {
      startScreenCard.style.display = 'none';
      if (canvasTagsOverlay) canvasTagsOverlay.style.display = 'flex';
      if (diagnosticsOverlay) diagnosticsOverlay.style.display = 'block';
      if (viewerTogglesOverlay) viewerTogglesOverlay.style.display = 'block';
      setTrace(11, 'PASS', 'MODEL VISIBLE');
    }
  } else {
    setTrace(10, 'FAIL', 'NO (EMPTY BBOX)');
    setTrace(11, 'FAIL', 'NO');
    if (rndCamFit) rndCamFit.textContent = 'NO';
    if (vwrCamFit) vwrCamFit.textContent = 'NO';
    if (rndStatus) rndStatus.textContent = 'EMPTY BBOX';
    if (vwrStatus) vwrStatus.textContent = 'EMPTY BBOX';
  }

  if (diagRendered) diagRendered.textContent = addedCount;
  if (diagStatus) {
    diagStatus.textContent = `IMPORTED: ${addedCount}/${displayObjects.length} OBJECTS VISIBLE`;
    diagStatus.className = 'diag-ok';
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

    item.innerHTML = `
      <div style="flex:1; overflow:hidden;">
        <div style="font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
          ${obj.name} ${typeBadge}
        </div>
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
