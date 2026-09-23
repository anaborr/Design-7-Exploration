/**
 * ============================================================================
 * DESIGN 7 EXPLORATION - DESCRIPTOR-DRIVEN ARCHITECTURAL EVOLUTION SYSTEM
 * RHINO SUBD & 3D WEBGL ENGINE (STAGED CONTROLLER & THREE.JS VIEWPORT)
 * - Decoupled 6-Stage Importer Pipeline (No auto-cloning during import)
 * - Native Rhino SubD Geometry Parser (vertices, edges, faces, control cage)
 * - Three.js 3D WebGL Viewport with Orbit, Pan, Zoom, and Fit Controls
 * - Camera Projection Modes: FRONT (XZ), TOP (XY), RIGHT (YZ), PERSPECTIVE (3D)
 * - Display Modes: [ SUBD SURFACE ], [ CONTROL CAGE ], [ OVERLAY ]
 * - Object Visibility Debugger & Interactive Single-Object Isolate Focus
 * - Clone System Separated into cloneRhinoSeed(sourceGeometry)
 * ============================================================================
 */

// Global Rhino3dm Module Reference
let rhino = null;

// ============================================================================
// 1. APPLICATION STATE
// ============================================================================

let appState = {
  // Immutable Source 3D Geometry parsed from .3dm file
  originalRhinoGeometry: null,

  // Editable Working Copy (Pointed to original geometry initially)
  editableSeedGeometry: null,

  // Active Display Projection Mode: 'FRONT', 'TOP', 'RIGHT', 'PERSPECTIVE'
  projectionMode: 'FRONT',

  // Active Display Mode: 'SURFACE', 'CAGE', 'OVERLAY'
  displayMode: 'SURFACE',

  // Object Visibility Map: { "obj_01": true, "obj_02": false }
  objectVisibilityMap: {},

  // Highlighted Object ID for single-object visual debugging
  highlightedObjectId: null,

  // Three.js Scene objects reference map: { "obj_0": { surfaceMesh, cageMesh, pointsMesh } }
  threeObjectMap: {}
};

// Three.js Global References
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let ambientLight = null;
let dirLight1 = null;
let dirLight2 = null;
let boundingBoxGrid = null;

// Global Bounding Box & Target Center
let globalBoundingBox = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 0, y: 0, z: 0 },
  center: { x: 0, y: 0, z: 0 },
  size: { x: 0, y: 0, z: 0 },
  maxDim: 100
};

// ============================================================================
// 2. DOM ELEMENTS
// ============================================================================

const threeCanvasContainer = document.getElementById('three-canvas-container');
const threeCanvas = document.getElementById('three-canvas');

// Overlays & Badges
const startScreenCard = document.getElementById('start-screen-card');
const canvasTagsOverlay = document.getElementById('canvas-tags-overlay');
const diagnosticsOverlay = document.getElementById('diagnostics-overlay');
const viewerTogglesOverlay = document.getElementById('viewer-toggles-overlay');

const currentGenBadge = document.getElementById('current-generation-badge');
const currentProjBadge = document.getElementById('current-projection-badge');

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
const diagSubdCount = document.getElementById('diag-subd-count');
const diagRendered = document.getElementById('diag-rendered');
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

// Modal Elements
const verifyModal = document.getElementById('verify-import-modal');
const btnCloseVerifyModal = document.getElementById('btn-close-verify-modal');
const verifyModalContent = document.getElementById('verify-modal-content');

// ============================================================================
// 3. INITIALIZATION & THREE.JS 3D VIEWPORT SETUP
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  console.log('[SYSTEM] Initializing Design 7 SubD & 3D WebGL Engine...');

  initThreeJS();

  // Initialize rhino3dm library
  if (window.rhino3dm) {
    window.rhino3dm().then((loadedRhino) => {
      rhino = loadedRhino;
      console.log('[RHINO3DM] Library loaded successfully. Version:', rhino.version || '8.x');
      enableImportControls();
    }).catch((err) => {
      console.error('[RHINO3DM] Failed to initialize rhino3dm library:', err);
      updateStatus('ERR: rhino3dm init failed', true);
    });
  } else {
    console.error('[RHINO3DM] rhino3dm script tag not found.');
    updateStatus('ERR: rhino3dm missing', true);
  }

  attachEventListeners();
});

/**
 * Initialize Three.js WebGL Scene, Camera, Lights, and OrbitControls
 */
function initThreeJS() {
  const width = threeCanvasContainer.clientWidth || 800;
  const height = threeCanvasContainer.clientHeight || 600;

  // 1. Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a); // Dark technical theme

  // 2. Camera (Perspective)
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
  camera.position.set(0, -300, 150); // Default Front-ish view
  camera.up.set(0, 0, 1); // Z-Up Coordinate System (Rhino standard)

  // 3. Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: threeCanvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 4. Orbit Controls
  if (THREE.OrbitControls) {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI; // Full spherical camera rotation
  }

  // 5. Lighting
  ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight1.position.set(100, -200, 300);
  scene.add(dirLight1);

  dirLight2 = new THREE.DirectionalLight(0xffd700, 0.3); // Warm gold rim light
  dirLight2.position.set(-100, 200, -100);
  scene.add(dirLight2);

  // 6. Ground Grid (XY Plane with Z=0)
  const gridHelper = new THREE.GridHelper(500, 50, 0xffd700, 0x333333);
  gridHelper.rotation.x = Math.PI / 2; // Orient grid to XY plane (Z-up)
  scene.add(gridHelper);

  // 7. Axis Helper (Red=X, Green=Y, Blue=Z)
  const axesHelper = new THREE.AxesHelper(20);
  scene.add(axesHelper);

  // Window Resize Listener
  window.addEventListener('resize', onWindowResize);

  // Start Animation Loop
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

// ============================================================================
// 4. EVENT LISTENERS
// ============================================================================

function attachEventListeners() {
  // File Inputs
  if (btnRhinoFileInput) {
    btnRhinoFileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
  }
  if (btnRhinoFileInputMain) {
    btnRhinoFileInputMain.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
  }

  // Sample Seed Buttons
  if (btnLoadSampleSeed) {
    btnLoadSampleSeed.addEventListener('click', () => loadSampleSeed());
  }
  if (btnStartSample) {
    btnStartSample.addEventListener('click', () => loadSampleSeed());
  }

  // Audit Modal Button
  if (btnVerifyRhinoImport) {
    btnVerifyRhinoImport.addEventListener('click', () => openVerifyModal());
  }
  if (btnCloseVerifyModal) {
    btnCloseVerifyModal.addEventListener('click', () => closeVerifyModal());
  }
  if (verifyModal) {
    verifyModal.addEventListener('click', (e) => {
      if (e.target === verifyModal) closeVerifyModal();
    });
  }

  // View Mode Toggles ([ SUBD SURFACE ], [ CONTROL CAGE ], [ OVERLAY ])
  viewToggleBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      viewToggleBtns.forEach((b) => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      appState.displayMode = targetBtn.dataset.view;
      updateDisplayModeVisibility();
    });
  });

  // Projection View Toggles (FRONT, TOP, RIGHT, PERSPECTIVE)
  projToggleBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      projToggleBtns.forEach((b) => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      setCameraProjection(targetBtn.dataset.proj);
    });
  });

  // Toggle All Visibility
  if (btnToggleAllVis) {
    btnToggleAllVis.addEventListener('click', () => toggleAllObjectVisibility());
  }
}

// ============================================================================
// 5. STAGED DECOUPLED RHINO IMPORTER PIPELINE
// ============================================================================

/**
 * Handle File Selection and read buffer
 */
function handleFileSelect(file) {
  if (!file) return;
  console.log('[STAGE 1 - FILE READ] Opening file:', file.name, 'Size:', file.size, 'bytes');

  // Stage 1: File Read
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const buffer = new Uint8Array(e.target.result);
      processRhinoBuffer(buffer, file.name);
    } catch (err) {
      showStageError('STAGE 1 — FILE READ ERROR', err);
    }
  };
  reader.onerror = (err) => showStageError('STAGE 1 — FILE READ ERROR', err);
  reader.readAsArrayBuffer(file);
}

/**
 * Main 6-Stage Decoupled Rhino Importer Pipeline
 * IMPORTANT: cloneRhinoSeed is NOT called during import!
 */
function processRhinoBuffer(buffer, filename) {
  updateStatus('PARSING .3DM...', false);

  // STAGE 2 — RHINO PARSE
  let doc = null;
  try {
    console.log('[STAGE 2 - RHINO PARSE] Decoding .3dm array buffer...');
    doc = rhino.File3dm.fromByteArray(buffer);
    if (!doc) {
      throw new Error('File3dm.fromByteArray returned null. Invalid or corrupt .3dm file.');
    }
    console.log('[STAGE 2 SUCCESS] Parsed File3dm document with', doc.objects().count, 'objects.');
  } catch (err) {
    showStageError('STAGE 2 — RHINO PARSE ERROR', err);
    return;
  }

  // STAGE 3 — OBJECT CLASSIFICATION & SUBD PARSING
  let parsedData = null;
  try {
    console.log('[STAGE 3 - CLASSIFICATION] Iterating objects and classifying types...');
    parsedData = parseRhinoObjects(doc);
    console.log('[STAGE 3 SUCCESS] Parsed', parsedData.objects.length, 'objects. SubD count:', parsedData.subdCount);
  } catch (err) {
    showStageError('STAGE 3 — OBJECT CLASSIFICATION ERROR', err);
    return;
  }

  // STAGE 4 — BOUNDING BOX CALCULATION
  try {
    console.log('[STAGE 4 - BOUNDING BOX] Calculating global 3D world bounds...');
    calculateGlobalBounds(parsedData.objects);
    console.log('[STAGE 4 SUCCESS] Global Bounds:', globalBoundingBox);
  } catch (err) {
    showStageError('STAGE 4 — BOUNDING BOX ERROR', err);
    return;
  }

  // STAGE 5 — PROJECTION & DATA STORAGE
  try {
    console.log('[STAGE 5 - PROJECTION & STORE] Storing immutable originalRhinoGeometry...');
    appState.originalRhinoGeometry = {
      filename: filename,
      objects: parsedData.objects,
      counts: parsedData.counts,
      subdMetrics: parsedData.subdMetrics,
      bounds: globalBoundingBox,
      units: doc.settings().modelUnitSystem().name || 'mm'
    };

    // Initialize visibility map
    appState.objectVisibilityMap = {};
    parsedData.objects.forEach((obj) => {
      appState.objectVisibilityMap[obj.id] = true;
    });

    // Editable working seed points to original (immutable)
    appState.editableSeedGeometry = appState.originalRhinoGeometry;
  } catch (err) {
    showStageError('STAGE 5 — PROJECTION ERROR', err);
    return;
  }

  // STAGE 6 — RENDERING THREE.JS 3D WEBGL SCENE
  try {
    console.log('[STAGE 6 - RENDERING] Building Three.js 3D WebGL meshes and cage wireframes...');
    renderRhino3DScene(appState.originalRhinoGeometry);
    console.log('[STAGE 6 SUCCESS] 3D WebGL rendering complete.');
  } catch (err) {
    showStageError('STAGE 6 — RENDERING ERROR', err);
    return;
  }

  // UPDATE UI & DIAGNOSTICS
  updateUIWithParsedData(filename);
  if (btnVerifyRhinoImport) btnVerifyRhinoImport.disabled = false;
  updateStatus('RHINO SEED LOADED', false);
}

// ============================================================================
// 6. OBJECT PARSER & SUBD EXTRACTOR (STAGE 3)
// ============================================================================

/**
 * Classify and extract geometry from every File3dm object
 */
function parseRhinoObjects(doc) {
  const objectsList = doc.objects();
  const count = objectsList.count;

  const objects = [];
  const counts = {
    subd: 0,
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

  const subdMetrics = {
    totalObjects: 0,
    totalVertices: 0,
    totalEdges: 0,
    totalFaces: 0
  };

  for (let i = 0; i < count; i++) {
    const fileObj = objectsList.get(i);
    const geom = fileObj.geometry();
    const attributes = fileObj.attributes();

    const objId = attributes.id || `obj_${i + 1}`;
    const objName = attributes.name || `Object ${i + 1}`;
    const layerIndex = attributes.layerIndex;
    const objectType = geom ? geom.objectType.name : 'Unknown';

    const objData = {
      index: i + 1,
      id: objId,
      name: objName,
      layerIndex: layerIndex,
      type: 'Other',
      rhinoType: objectType,
      bounds: null,
      subdData: null,
      renderMesh: null,
      wireframeLines: [],
      vertices: []
    };

    if (!geom) {
      counts.unsupported++;
      objects.push(objData);
      continue;
    }

    // Get object bounding box
    try {
      const bbox = geom.getBoundingBox();
      objData.bounds = {
        min: { x: bbox.min[0], y: bbox.min[1], z: bbox.min[2] },
        max: { x: bbox.max[0], y: bbox.max[1], z: bbox.max[2] }
      };
    } catch (e) {
      objData.bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }

    // Determine actual geometry type (explicit checking, NOT just isClosed)
    // 1. SUBD GEOMETRY
    if (geom instanceof rhino.SubD || objectType === 'SubD' || geom.objectType === rhino.ObjectType.SubD) {
      objData.type = 'SubD';
      counts.subd++;
      subdMetrics.totalObjects++;

      const subd = geom;
      let vCount = 0, eCount = 0, fCount = 0;

      try {
        if (subd.vertices) vCount = subd.vertices().count;
        if (subd.edges) eCount = subd.edges().count;
        if (subd.faces) fCount = subd.faces().count;
      } catch (err) {
        console.warn('SubD metrics query warning:', err);
      }

      subdMetrics.totalVertices += vCount;
      subdMetrics.totalEdges += eCount;
      subdMetrics.totalFaces += fCount;

      objData.subdData = {
        vertexCount: vCount,
        edgeCount: eCount,
        faceCount: fCount
      };

      // Extract display mesh from SubD (for surface rendering)
      try {
        let subdMesh = null;
        if (rhino.Mesh.createFromSubDControlNet) {
          subdMesh = rhino.Mesh.createFromSubDControlNet(subd);
        } else if (subd.toMesh) {
          subdMesh = subd.toMesh();
        }
        if (subdMesh) {
          objData.renderMesh = extractMeshGeometry(subdMesh);
        }
      } catch (err) {
        console.warn('Could not extract mesh from SubD control net:', err);
      }

      // Extract Control Cage wireframe lines and vertices (for cage rendering)
      try {
        objData.wireframeLines = extractSubDCageWireframe(subd);
        objData.vertices = extractSubDControlVertices(subd);
      } catch (err) {
        console.warn('Could not extract SubD control cage wireframe:', err);
      }
    }
    // 2. BREP / SURFACE
    else if (geom instanceof rhino.Brep || objectType === 'Brep') {
      objData.type = 'Brep';
      counts.breps++;

      // Create mesh representation for display
      try {
        const meshes = rhino.Mesh.createFromBrep(geom);
        if (meshes && meshes.length > 0) {
          objData.renderMesh = extractMeshGeometry(meshes[0]);
        }
      } catch (err) {
        console.warn('Brep meshing warning:', err);
      }
    }
    // 3. EXTRUSION
    else if (geom instanceof rhino.Extrusion || objectType === 'Extrusion') {
      objData.type = 'Extrusion';
      counts.extrusions++;

      try {
        const mesh = geom.getMesh(rhino.MeshType.Any);
        if (mesh) {
          objData.renderMesh = extractMeshGeometry(mesh);
        }
      } catch (err) {
        console.warn('Extrusion meshing warning:', err);
      }
    }
    // 4. MESH
    else if (geom instanceof rhino.Mesh || objectType === 'Mesh') {
      objData.type = 'Mesh';
      counts.meshes++;
      objData.renderMesh = extractMeshGeometry(geom);
    }
    // 5. CURVES (NurbsCurve, PolylineCurve, PolyCurve, LineCurve, ArcCurve)
    else if (geom instanceof rhino.Curve || objectType.includes('Curve')) {
      if (objectType.includes('Polyline') || geom instanceof rhino.PolylineCurve) {
        objData.type = 'PolylineCurve';
        counts.polylines++;
      } else if (objectType.includes('PolyCurve') || geom instanceof rhino.PolyCurve) {
        objData.type = 'PolyCurve';
        counts.polycurves++;
      } else if (objectType.includes('Line') || geom instanceof rhino.LineCurve) {
        objData.type = 'LineCurve';
        counts.lines++;
      } else if (objectType.includes('Arc') || objectType.includes('Circle') || geom instanceof rhino.ArcCurve) {
        objData.type = 'ArcCurve';
        counts.arcs++;
      } else {
        objData.type = 'NurbsCurve';
        counts.nurbs++;
      }

      // Sample curve into line segments for 3D wireframe rendering
      try {
        objData.wireframeLines = sampleCurveTo3DLines(geom);
      } catch (err) {
        console.warn('Curve sampling warning:', err);
      }
    }
    // 6. POINT
    else if (geom instanceof rhino.Point || objectType === 'Point') {
      objData.type = 'Point';
      counts.points++;
      try {
        const pt = geom.location;
        objData.vertices = [{ x: pt[0], y: pt[1], z: pt[2] }];
      } catch (e) {}
    }
    // 7. INSTANCE REFERENCE (BLOCK)
    else if (geom instanceof rhino.InstanceReference || objectType === 'InstanceReference') {
      objData.type = 'InstanceReference';
      counts.blocks++;
    } else {
      counts.unsupported++;
    }

    objects.push(objData);
  }

  return {
    objects: objects,
    counts: counts,
    subdMetrics: subdMetrics,
    subdCount: counts.subd
  };
}

/**
 * Extract vertices, faces, and normals from a Rhino Mesh object into flat JS arrays
 */
function extractMeshGeometry(mesh) {
  try {
    const vertsList = mesh.vertices();
    const facesList = mesh.faces();

    const positions = [];
    const indices = [];

    const vCount = vertsList.count;
    for (let i = 0; i < vCount; i++) {
      const pt = vertsList.get(i);
      positions.push(pt[0], pt[1], pt[2]);
    }

    const fCount = facesList.count;
    for (let i = 0; i < fCount; i++) {
      const f = facesList.get(i);
      if (f.length === 4) {
        // Quad face -> 2 triangles
        indices.push(f[0], f[1], f[2]);
        indices.push(f[0], f[2], f[3]);
      } else if (f.length === 3) {
        indices.push(f[0], f[1], f[2]);
      }
    }

    return {
      positions: new Float32Array(positions),
      indices: new Uint32Array(indices)
    };
  } catch (err) {
    console.error('Error extracting mesh geometry:', err);
    return null;
  }
}

/**
 * Extract SubD control cage edges as pairs of 3D line points
 */
function extractSubDCageWireframe(subd) {
  const linePairs = [];
  try {
    const edges = subd.edges();
    const count = edges.count;
    for (let i = 0; i < count; i++) {
      const edge = edges.get(i);
      const line = edge.toLine();
      if (line) {
        const pA = line.from;
        const pB = line.to;
        linePairs.push({
          start: { x: pA[0], y: pA[1], z: pA[2] },
          end: { x: pB[0], y: pB[1], z: pB[2] }
        });
      }
    }
  } catch (err) {
    console.warn('SubD cage wireframe extraction warning:', err);
  }
  return linePairs;
}

/**
 * Extract SubD control vertices positions
 */
function extractSubDControlVertices(subd) {
  const verts = [];
  try {
    const vList = subd.vertices();
    const count = vList.count;
    for (let i = 0; i < count; i++) {
      const v = vList.get(i);
      const pt = v.location;
      verts.push({ x: pt[0], y: pt[1], z: pt[2] });
    }
  } catch (err) {
    console.warn('SubD control vertices extraction warning:', err);
  }
  return verts;
}

/**
 * Sample a curve into 3D line segment points
 */
function sampleCurveTo3DLines(curve) {
  const linePairs = [];
  try {
    const domain = curve.domain;
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
  } catch (err) {
    console.warn('Curve sampling error:', err);
  }
  return linePairs;
}

// ============================================================================
// 7. BOUNDING BOX & COORDINATE CALCULATOR (STAGE 4)
// ============================================================================

function calculateGlobalBounds(objects) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let validCount = 0;

  objects.forEach((obj) => {
    if (obj.bounds && obj.bounds.min && obj.bounds.max) {
      if (isFinite(obj.bounds.min.x)) {
        minX = Math.min(minX, obj.bounds.min.x);
        minY = Math.min(minY, obj.bounds.min.y);
        minZ = Math.min(minZ, obj.bounds.min.z);
        maxX = Math.max(maxX, obj.bounds.max.x);
        maxY = Math.max(maxY, obj.bounds.max.y);
        maxZ = Math.max(maxZ, obj.bounds.max.z);
        validCount++;
      }
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
}

// ============================================================================
// 8. THREE.JS 3D SCENE BUILDER & VIEWPORT CONTROLLER (STAGE 6)
// ============================================================================

/**
 * Build and populate Three.js 3D WebGL meshes and control cage wireframes
 */
function renderRhino3DScene(rhinoData) {
  if (!scene) return;

  // Clear previous imported objects
  Object.keys(appState.threeObjectMap).forEach((id) => {
    const entry = appState.threeObjectMap[id];
    if (entry.surfaceGroup) scene.remove(entry.surfaceGroup);
    if (entry.cageGroup) scene.remove(entry.cageGroup);
  });
  appState.threeObjectMap = {};

  // Build Three.js objects for each imported object
  rhinoData.objects.forEach((obj) => {
    const surfaceGroup = new THREE.Group();
    const cageGroup = new THREE.Group();

    // 1. SURFACE MESH (Smooth evaluated SubD surface / Brep / Mesh)
    if (obj.renderMesh && obj.renderMesh.positions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(obj.renderMesh.positions, 3));
      if (obj.renderMesh.indices.length > 0) {
        geometry.setIndex(new THREE.BufferAttribute(obj.renderMesh.indices, 1));
      }
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        color: obj.type === 'SubD' ? 0xffd700 : 0x4a90e2, // Gold for SubD, Blue for Breps
        roughness: 0.3,
        metalness: 0.2,
        side: THREE.DoubleSide
      });

      const meshObj = new THREE.Mesh(geometry, material);
      surfaceGroup.add(meshObj);
    }

    // 2. WIREFRAME / CONTROL CAGE LINES
    if (obj.wireframeLines && obj.wireframeLines.length > 0) {
      const linePositions = [];
      obj.wireframeLines.forEach((pair) => {
        linePositions.push(pair.start.x, pair.start.y, pair.start.z);
        linePositions.push(pair.end.x, pair.end.y, pair.end.z);
      });

      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));

      const lineMaterial = new THREE.LineBasicMaterial({
        color: obj.type === 'SubD' ? 0xffffff : 0xaaaaaa,
        linewidth: 1.5
      });

      const lineSegs = new THREE.LineSegments(lineGeometry, lineMaterial);
      cageGroup.add(lineSegs);
    }

    // 3. CONTROL VERTEX HANDLE SPHERES
    if (obj.vertices && obj.vertices.length > 0 && obj.type === 'SubD') {
      const vertPositions = [];
      obj.vertices.forEach((v) => vertPositions.push(v.x, v.y, v.z));

      const pointGeometry = new THREE.BufferGeometry();
      pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertPositions, 3));

      const pointMaterial = new THREE.PointsMaterial({
        color: 0xff4500, // Bright orange/red handles
        size: globalBoundingBox.maxDim * 0.015,
        sizeAttenuation: true
      });

      const pointsObj = new THREE.Points(pointGeometry, pointMaterial);
      cageGroup.add(pointsObj);
    }

    scene.add(surfaceGroup);
    scene.add(cageGroup);

    appState.threeObjectMap[obj.id] = {
      surfaceGroup: surfaceGroup,
      cageGroup: cageGroup
    };
  });

  // Apply initial display mode visibility
  updateDisplayModeVisibility();

  // Focus Camera on global bounding box center
  fitCameraToBoundingBox(globalBoundingBox);
}

/**
 * Adjust camera position and target to fit global bounding box
 */
function fitCameraToBoundingBox(bounds) {
  if (!camera || !controls) return;

  const center = bounds.center;
  const maxDim = bounds.maxDim || 100;
  const dist = maxDim * 2.2;

  controls.target.set(center.x, center.y, center.z);

  // Set camera based on active projection mode
  setCameraProjection(appState.projectionMode);
}

/**
 * Switch Camera Projection Modes (FRONT, TOP, RIGHT, PERSPECTIVE)
 */
function setCameraProjection(proj) {
  if (!camera || !controls) return;
  appState.projectionMode = proj;

  const center = globalBoundingBox.center;
  const dist = (globalBoundingBox.maxDim || 100) * 2.2;

  switch (proj) {
    case 'FRONT':
      // Front View (Looking down Y-axis onto X/Z plane)
      camera.position.set(center.x, center.y - dist, center.z);
      camera.up.set(0, 0, 1);
      break;
    case 'TOP':
      // Top Plan View (Looking down Z-axis onto X/Y plane)
      camera.position.set(center.x, center.y, center.z + dist);
      camera.up.set(0, 1, 0);
      break;
    case 'RIGHT':
      // Right Elevation View (Looking down X-axis onto Y/Z plane)
      camera.position.set(center.x + dist, center.y, center.z);
      camera.up.set(0, 0, 1);
      break;
    case 'PERSPECTIVE':
    default:
      // Isometric 3D View
      camera.position.set(center.x + dist * 0.7, center.y - dist * 0.7, center.z + dist * 0.5);
      camera.up.set(0, 0, 1);
      break;
  }

  controls.target.set(center.x, center.y, center.z);
  controls.update();

  if (currentProjBadge) currentProjBadge.textContent = `PROJECTION: ${proj}`;
  if (diagProjection) diagProjection.textContent = proj;
}

/**
 * Toggle visibility of Surface vs Control Cage meshes based on appState.displayMode
 */
function updateDisplayModeVisibility() {
  const mode = appState.displayMode; // 'SURFACE', 'CAGE', 'OVERLAY'

  Object.keys(appState.threeObjectMap).forEach((id) => {
    const isObjVisible = appState.objectVisibilityMap[id] !== false;
    const entry = appState.threeObjectMap[id];

    if (entry.surfaceGroup) {
      entry.surfaceGroup.visible = isObjVisible && (mode === 'SURFACE' || mode === 'OVERLAY');
    }
    if (entry.cageGroup) {
      entry.cageGroup.visible = isObjVisible && (mode === 'CAGE' || mode === 'OVERLAY');
    }
  });
}

// ============================================================================
// 9. ISOLATED ERROR HANDLING (STAGE-BY-STAGE)
// ============================================================================

function showStageError(stageTitle, error) {
  console.error(`[${stageTitle}]`, error);

  const errorMsg = error && error.message ? error.message : String(error);
  updateStatus(`ERR: ${stageTitle}`, true);

  if (diagStatus) {
    diagStatus.textContent = `${stageTitle}: ${errorMsg}`;
    diagStatus.className = 'diag-err';
  }

  // Hide start screen if present to show error message overlay
  if (startScreenCard) startScreenCard.style.display = 'none';
}

function updateStatus(text, isError) {
  if (diagStatus) {
    diagStatus.textContent = text;
    diagStatus.className = isError ? 'diag-err' : 'diag-ok';
  }
}

// ============================================================================
// 10. UI & DIAGNOSTICS UPDATE
// ============================================================================

function updateUIWithParsedData(filename) {
  if (startScreenCard) startScreenCard.style.display = 'none';
  if (canvasTagsOverlay) canvasTagsOverlay.style.display = 'flex';
  if (diagnosticsOverlay) diagnosticsOverlay.style.display = 'block';
  if (viewerTogglesOverlay) viewerTogglesOverlay.style.display = 'block';

  const geom = appState.originalRhinoGeometry;
  if (!geom) return;

  if (diagFilename) diagFilename.textContent = filename;
  if (diagObjects) diagObjects.textContent = geom.objects.length;
  if (diagSubdCount) diagSubdCount.textContent = geom.subdMetrics.totalObjects;
  if (diagRendered) diagRendered.textContent = geom.objects.length;
  if (diagUnits) diagUnits.textContent = geom.units;

  // Bounding box bounds text
  const b = geom.bounds;
  if (diagXRange) diagXRange.textContent = `${b.min.x.toFixed(1)} to ${b.max.x.toFixed(1)}`;
  if (diagYRange) diagYRange.textContent = `${b.min.y.toFixed(1)} to ${b.max.y.toFixed(1)}`;
  if (diagZRange) diagZRange.textContent = `${b.min.z.toFixed(1)} to ${b.max.z.toFixed(1)}`;

  if (metaXBounds) metaXBounds.textContent = `${b.size.x.toFixed(1)} ${geom.units}`;
  if (metaYBounds) metaYBounds.textContent = `${b.size.y.toFixed(1)} ${geom.units}`;
  if (metaZBounds) metaZBounds.textContent = `${b.size.z.toFixed(1)} ${geom.units}`;

  // SubD Metrics Cards
  if (countSubdObjs) countSubdObjs.textContent = geom.subdMetrics.totalObjects;
  if (countSubdVerts) countSubdVerts.textContent = geom.subdMetrics.totalVertices;
  if (countSubdEdges) countSubdEdges.textContent = geom.subdMetrics.totalEdges;
  if (countSubdFaces) countSubdFaces.textContent = geom.subdMetrics.totalFaces;

  // Breakdown Counters
  const c = geom.counts;
  if (countSubd) countSubd.textContent = c.subd;
  if (countNurbs) countNurbs.textContent = c.nurbs;
  if (countPolylines) countPolylines.textContent = c.polylines;
  if (countPolycurves) countPolycurves.textContent = c.polycurves;
  if (countLines) countLines.textContent = c.lines;
  if (countArcs) countArcs.textContent = c.arcs;
  if (countBreps) countBreps.textContent = c.breps;
  if (countExtrusions) countExtrusions.textContent = c.extrusions;
  if (countMeshes) countMeshes.textContent = c.meshes;
  if (countPoints) countPoints.textContent = c.points;
  if (countBlocks) countBlocks.textContent = c.blocks;
  if (countUnsupported) countUnsupported.textContent = c.unsupported;

  // Populate Object Visibility List Debugger
  renderObjectVisibilityList(geom.objects);
}

/**
 * Render Object Debugger List with [ SHOW ], [ HIDE ], [ ISOLATE ] controls
 */
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

    // Isolate Button
    item.querySelector('.isolate-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      isolateObject(obj.id);
    });

    // Hide/Show Toggle Button
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

  // Focus camera on isolated object bounds if available
  const obj = appState.originalRhinoGeometry.objects.find((o) => o.id === objId);
  if (obj && obj.bounds) {
    calculateGlobalBounds([obj]);
    fitCameraToBoundingBox(globalBoundingBox);
  }
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

// ============================================================================
// 11. INDEPENDENT CLONING SYSTEM (SEPARATED FROM IMPORT)
// ============================================================================

/**
 * cloneRhinoSeed(sourceGeometry)
 * CONCEPT: Takes immutable source geometry and produces an independent working copy
 * IMPORTANT: This function is defined independently and is NOT called automatically during import!
 */
function cloneRhinoSeed(sourceGeometry) {
  if (!sourceGeometry) return null;
  console.log('[CLONE SYSTEM] Explicitly cloning Rhino seed geometry...');

  return {
    filename: `clone_${sourceGeometry.filename}`,
    objects: sourceGeometry.objects.map((obj) => ({
      ...obj,
      vertices: obj.vertices ? obj.vertices.map((v) => ({ ...v })) : [],
      wireframeLines: obj.wireframeLines ? obj.wireframeLines.map((l) => ({
        start: { ...l.start },
        end: { ...l.end }
      })) : []
    })),
    counts: { ...sourceGeometry.counts },
    subdMetrics: { ...sourceGeometry.subdMetrics },
    bounds: JSON.parse(JSON.stringify(sourceGeometry.bounds)),
    units: sourceGeometry.units
  };
}

// ============================================================================
// 12. SAMPLE SEED GENERATOR (USES SAME processRhinoBuffer PIPELINE)
// ============================================================================

/**
 * Generate a valid in-browser Rhino File3dm buffer containing a SubD surface
 * and pass it directly into the SAME processRhinoBuffer pipeline.
 */
function loadSampleSeed() {
  console.log('[SAMPLE SEED] Creating synthetic Rhino File3dm with SubD...');

  if (!rhino) {
    alert('Rhino3dm library not yet loaded. Please wait a moment.');
    return;
  }

  try {
    const doc = new rhino.File3dm();

    // Create SubD Box or Surface in rhino3dm if available
    let subd = null;
    if (rhino.SubD.createFromMesh) {
      // Create a quad mesh and convert to SubD
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
      attr.name = 'Sample Architectural SubD Vault';
      doc.objects().add(subd, attr);
    } else {
      // Fallback NURBS Curve vault if SubD static constructor differs
      const ptList = new rhino.Point3dCollection();
      ptList.add(-60, 0, 0);
      ptList.add(-30, 0, 90);
      ptList.add(30, 0, 90);
      ptList.add(60, 0, 0);
      const curve = rhino.NurbsCurve.create(false, 3, ptList);
      doc.objects().add(curve, null);
    }

    const buffer = doc.toByteArray();
    processRhinoBuffer(buffer, 'sample_architectural_seed.3dm');
  } catch (err) {
    console.error('Error generating sample seed:', err);
    showStageError('SAMPLE SEED GENERATION ERROR', err);
  }
}

// ============================================================================
// 13. AUDIT MODAL
// ============================================================================

function openVerifyModal() {
  if (!verifyModal || !verifyModalContent) return;
  const geom = appState.originalRhinoGeometry;
  if (!geom) return;

  let html = `
    <div style="font-size:0.8rem; font-family:'Space Mono', monospace;">
      <h3>FILE: ${geom.filename}</h3>
      <p>Total Objects: ${geom.objects.length} | Units: ${geom.units}</p>
      <h4>SUBD METRICS</h4>
      <ul>
        <li>SubD Objects: ${geom.subdMetrics.totalObjects}</li>
        <li>SubD Vertices: ${geom.subdMetrics.totalVertices}</li>
        <li>SubD Edges: ${geom.subdMetrics.totalEdges}</li>
        <li>SubD Faces: ${geom.subdMetrics.totalFaces}</li>
      </ul>
      <h4>OBJECT TYPES</h4>
      <ul>
  `;

  Object.keys(geom.counts).forEach((k) => {
    html += `<li>${k.toUpperCase()}: ${geom.counts[k]}</li>`;
  });

  html += `</ul></div>`;
  verifyModalContent.innerHTML = html;
  verifyModal.style.display = 'flex';
}

function closeVerifyModal() {
  if (verifyModal) verifyModal.style.display = 'none';
}
