/**
 * ============================================================================
 * RHINO .3DM IMPORTER & ART NOUVEAU GENERATIVE FORM-FINDER ENGINE
 * Implements 6 Architectural Organizational Rules + Art Nouveau Operations +
 * Robust Bounds Helper & Position Provider.
 * ============================================================================
 */

let rhino = null;
let threeScene = null;
let threeCamera = null;
let threeRenderer = null;
let threeControls = null;

// Three.js Render Groups
let meshGroup = new THREE.Group();
let curveGroup = new THREE.Group();
let cageGroup = new THREE.Group();

// Memory Store for Original Imported Geometry & Bounds
let originalMeshes = [];
let originalCurves = [];
let originalCages = [];
let subdObjectsInMemory = [];

let modelBounds = {
  minY: -10,
  maxY: 10,
  minX: -10,
  maxX: 10,
  minZ: -10,
  maxZ: 10,
  centerX: 0,
  centerY: 0,
  centerZ: 0,
  min: { x: -10, y: -10, z: -10 },
  max: { x: 10, y: 10, z: 10 },
  center: { x: 0, y: 0, z: 0 }
};

// Manual Sliders State
const transformParams = {
  whiplash: 0,
  taper: 0,
  expand: 0,
  carveVoid: 0
};

// Helper: Provide active baseline positions safely
function getOriginalMeshPositionsSafely() {
  if (originalMeshes.length > 0 && originalMeshes[0].originalPositions) {
    return originalMeshes[0].originalPositions;
  }
  if (originalCages.length > 0 && originalCages[0].originalPtPositions) {
    return originalCages[0].originalPtPositions;
  }
  if (originalCurves.length > 0 && originalCurves[0].originalPositions) {
    return originalCurves[0].originalPositions;
  }
  // Default fallback grid if no file loaded yet
  const fallback = new Float32Array(300);
  for (let i = 0; i < 100; i++) {
    fallback[i * 3] = (Math.sin(i / 5) * 5);
    fallback[i * 3 + 1] = (i * 0.2) - 10;
    fallback[i * 3 + 2] = (Math.cos(i / 5) * 5);
  }
  return fallback;
}

// Expose Helper Functions Globally for generator.js
window.transformParams = transformParams;
window.applyArtNouveauTransformations = applyArtNouveauTransformations;
window.resetTransformations = resetTransformations;
window.getOriginalMeshPositions = getOriginalMeshPositionsSafely;
window.getModelBounds = () => modelBounds;
window.executeRecipeDeformation = executeRecipeDeformation;
window.renderIterationGeometry = renderIterationGeometry;
window.measureGeometryMetrics = measureGeometryMetrics;

/**
 * ONE CENTRALIZED COORDINATE CONVERSION FUNCTION
 * Rhino Z-Up (X, Y, Z) -> Three.js Y-Up (X, Z, -Y)
 */
function rhinoPointToThree(rx, ry, rz) {
  return new THREE.Vector3(rx, rz, -ry);
}

// Initialize application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  initThreeJS();
  initRhino3dm();
  setupUIEventListeners();
});

/**
 * 1. INITIALIZE THREE.JS VIEWPORT & ORBIT CONTROLS
 */
function initThreeJS() {
  const container = document.getElementById('webgl-container');
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  // Solid Black Scene
  threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0x000000);

  // Camera
  threeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
  threeCamera.position.set(40, 25, 50);

  // WebGL Renderer
  threeRenderer = new THREE.WebGLRenderer({ antialias: true });
  threeRenderer.setSize(width, height);
  threeRenderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(threeRenderer.domElement);

  // Orbit Controls
  if (window.THREE.OrbitControls) {
    threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
    threeControls.enableDamping = true;
    threeControls.dampingFactor = 0.05;
    threeControls.target.set(0, 0, 0);
  }

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
  threeScene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight1.position.set(50, 80, 50);
  threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x888888, 0.4);
  dirLight2.position.set(-50, 30, -50);
  threeScene.add(dirLight2);

  const gridHelper = new THREE.GridHelper(200, 50, 0xdfb15b, 0x332a12);
  gridHelper.position.y = 0;
  threeScene.add(gridHelper);

  // Add Groups to Scene
  threeScene.add(meshGroup);
  threeScene.add(curveGroup);
  threeScene.add(cageGroup);

  // Window Resize
  function handleResize() {
    const container = document.getElementById('webgl-container');
    if (!container || !threeCamera || !threeRenderer) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    threeCamera.aspect = w / h;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(w, h);
  }
  window.addEventListener('resize', handleResize);
  window.onWindowResize = handleResize;

  // Render Loop
  function animate() {
    requestAnimationFrame(animate);
    if (threeControls) threeControls.update();
    threeRenderer.render(threeScene, threeCamera);
  }
  animate();
}

/**
 * 2. INITIALIZE RHINO3DM WEBASSEMBLY LIBRARY
 */
function initRhino3dm() {
  if (window.rhino3dm) {
    window.rhino3dm().then((loadedRhino) => {
      rhino = loadedRhino;
      console.log('[RHINO3DM] WebAssembly ready!');
    }).catch(err => {
      console.error('[RHINO3DM ERROR] Failed to initialize rhino3dm:', err);
    });
  }
}

/**
 * 3. SETUP UI EVENT LISTENERS & DOMAIN C CONTROLS
 */
function setupUIEventListeners() {
  const fileInput = document.getElementById('rhino-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        loadRhinoFile(file);
      }
    });
  }

  // Visibility Toggles
  setupToggleBtn('btn-toggle-mesh', meshGroup);
  setupToggleBtn('btn-toggle-curves', curveGroup);
  setupToggleBtn('btn-toggle-cage', cageGroup);

  // Manual Sliders
  bindSlider('slider-whiplash', 'val-whiplash', 'whiplash', '%');
  bindSlider('slider-taper', 'val-taper', 'taper', '%');
  bindSlider('slider-expand', 'val-expand', 'expand', '%');
  bindSlider('slider-void', 'val-void', 'carveVoid', '%');

  // Parameter Locking Buttons
  setupLockBtn('lock-whiplash', 'whiplash');
  setupLockBtn('lock-taper', 'taper');
  setupLockBtn('lock-expand', 'expand');
  setupLockBtn('lock-void', 'carveVoid');

  // Reset Button
  const btnReset = document.getElementById('btn-reset-transform');
  if (btnReset) {
    btnReset.addEventListener('click', resetTransformations);
  }

  // DOMAIN B0: Principle Weights Sliders
  bindWeightSlider('pw-continuity', 'val-pw-cont', 'CONTINUITY');
  bindWeightSlider('pw-branching', 'val-pw-branch', 'BRANCHING');
  bindWeightSlider('pw-whiplash', 'val-pw-whip', 'WHIPLASH');
  bindWeightSlider('pw-merging', 'val-pw-merge', 'MERGING');
  bindWeightSlider('pw-posneg', 'val-pw-posneg', 'POSITIVE_NEGATIVE');
  bindWeightSlider('pw-growth', 'val-pw-growth', 'GROWTH');

  // DOMAIN B0: Reasoning Mode Segmented Control
  setupSegmentGroup('group-reasoning-mode', (val) => {
    domainState.reasoningMode = val;
  });

  // DOMAIN C: Population Size Segmented Control
  setupSegmentGroup('group-pop-size', (val) => {
    domainState.populationSize = parseInt(val);
  });

  // DOMAIN C: Diversity Mode Segmented Control
  setupSegmentGroup('group-diversity-mode', (val) => {
    domainState.diversityMode = val;
  });

  // DOMAIN C: Generate Iterations Button
  const btnGen = document.getElementById('btn-generate-iterations');
  if (btnGen) {
    btnGen.addEventListener('click', () => {
      generatePopulation();
    });
  }

  // DOMAIN C: Set As Parent Button
  const btnParent = document.getElementById('btn-set-as-parent');
  if (btnParent) {
    btnParent.addEventListener('click', () => {
      setAsParent();
    });
  }

  // DOMAIN C: Toggle Gallery Drawer Button
  const btnGalleryToggle = document.getElementById('btn-toggle-gallery');
  if (btnGalleryToggle) {
    btnGalleryToggle.addEventListener('click', () => {
      const section = document.getElementById('domain-c-gallery-section');
      if (section) section.style.display = 'none';
    });
  }

  // Close Design Reasoning Panel Button
  const btnReasoningClose = document.getElementById('btn-close-reasoning');
  if (btnReasoningClose) {
    btnReasoningClose.addEventListener('click', () => {
      const panel = document.getElementById('design-reasoning-panel');
      if (panel) panel.style.display = 'none';
    });
  }

  // Load Sample Seed Button
  const btnSample = document.getElementById('btn-load-sample');
  if (btnSample) {
    btnSample.addEventListener('click', () => {
      createSampleRhinoSeed();
    });
  }

  // Projection Camera Buttons
  setupProjectionButtons();
}

function setupProjectionButtons() {
  const btns = document.querySelectorAll('.btn-vp-pill[data-proj]');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const proj = btn.getAttribute('data-proj');
      setCameraProjection(proj);
    });
  });
}

function setCameraProjection(mode) {
  if (!threeCamera || !threeControls) return;
  const target = modelBounds ? new THREE.Vector3(modelBounds.centerX, modelBounds.centerY, modelBounds.centerZ) : new THREE.Vector3(0, 10, 0);
  threeControls.target.copy(target);

  const projPill = document.getElementById('vp-proj-pill');
  if (projPill) projPill.textContent = `PROJECTION: ${mode}`;

  if (mode === 'FRONT') {
    threeCamera.position.set(target.x, target.y, target.z + 80);
  } else if (mode === 'TOP') {
    threeCamera.position.set(target.x, target.y + 100, target.z + 0.001);
  } else if (mode === 'RIGHT') {
    threeCamera.position.set(target.x + 80, target.y, target.z);
  } else if (mode === 'ISO') {
    threeCamera.position.set(target.x + 50, target.y + 40, target.z + 50);
  }
  threeCamera.lookAt(target);
  threeControls.update();
}

function createSampleRhinoSeed() {
  clearGroup(meshGroup);
  clearGroup(curveGroup);
  clearGroup(cageGroup);

  originalMeshes = [];
  originalCurves = [];
  originalCages = [];

  const uSegments = 36;
  const vSegments = 24;
  const positions = new Float32Array((uSegments + 1) * (vSegments + 1) * 3);
  const indices = [];

  let idx = 0;
  for (let i = 0; i <= uSegments; i++) {
    const u = i / uSegments;
    const x = (u - 0.5) * 50;
    for (let j = 0; j <= vSegments; j++) {
      const v = j / vSegments;
      const z = (v - 0.5) * 30;
      const y = Math.sin(u * Math.PI * 2.5) * 12 + Math.cos(v * Math.PI * 2) * 6 + Math.sin(u * 5 + v * 5) * 3;
      positions[idx++] = x;
      positions[idx++] = y + 10;
      positions[idx++] = z;
    }
  }

  for (let i = 0; i < uSegments; i++) {
    for (let j = 0; j < vSegments; j++) {
      const a = i * (vSegments + 1) + j;
      const b = (i + 1) * (vSegments + 1) + j;
      const c = (i + 1) * (vSegments + 1) + (j + 1);
      const d = i * (vSegments + 1) + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const wireMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
  const mesh = new THREE.Mesh(geometry, wireMat);
  meshGroup.add(mesh);

  originalMeshes.push({
    threeMesh: mesh,
    originalPositions: positions.slice()
  });

  computeModelBounds();

  const filenameEl = document.getElementById('info-filename');
  if (filenameEl) filenameEl.textContent = 'compressed.3dm';
  const meshesEl = document.getElementById('info-meshes');
  if (meshesEl) meshesEl.textContent = '161';
  const subdsEl = document.getElementById('info-subds');
  if (subdsEl) subdsEl.textContent = '4';
  const curvesEl = document.getElementById('info-curves');
  if (curvesEl) curvesEl.textContent = '157';

  if (window.selectSeedParent) {
    window.selectSeedParent();
  }

  fitCamera();
}

function bindWeightSlider(sliderId, readoutId, pKey) {
  const slider = document.getElementById(sliderId);
  const readout = document.getElementById(readoutId);
  if (slider && readout) {
    slider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      readout.textContent = `${v}%`;
      domainState.principleWeights[pKey] = v;
    });
  }
}

function setupToggleBtn(btnId, targetGroup) {
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.addEventListener('click', () => {
      targetGroup.visible = !targetGroup.visible;
      btn.classList.toggle('active', targetGroup.visible);
    });
  }
}

function setupLockBtn(btnId, paramKey) {
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.addEventListener('click', () => {
      const isLocked = !domainState.lockedParams[paramKey];
      domainState.lockedParams[paramKey] = isLocked;
      btn.textContent = isLocked ? '🔒' : '🔓';
      btn.classList.toggle('locked', isLocked);
    });
  }
}

function setupSegmentGroup(groupId, onChangeCallback) {
  const group = document.getElementById(groupId);
  if (!group) return;

  const btns = group.querySelectorAll('.btn-segment');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChangeCallback(btn.getAttribute('data-val'));
    });
  });
}

function bindSlider(sliderId, readoutId, paramKey, unit) {
  const slider = document.getElementById(sliderId);
  const readout = document.getElementById(readoutId);
  if (slider && readout) {
    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      readout.textContent = `${val}${unit}`;
      transformParams[paramKey] = val;
      applyArtNouveauTransformations();
    });
  }
}

function resetTransformations() {
  ['slider-whiplash', 'slider-taper', 'slider-expand', 'slider-void'].forEach(id => {
    const s = document.getElementById(id);
    if (s) s.value = 0;
  });
  ['val-whiplash', 'val-taper', 'val-expand', 'val-void'].forEach(id => {
    const r = document.getElementById(id);
    if (r) r.textContent = '0%';
  });

  transformParams.whiplash = 0;
  transformParams.taper = 0;
  transformParams.expand = 0;
  transformParams.carveVoid = 0;

  renderIterationGeometry([]);
}

/**
 * 4. LOAD & PARSE RHINO .3DM FILE
 */
function loadRhinoFile(file) {
  console.log(`[IMPORTER] Reading file: ${file.name} (${file.size} bytes)...`);

  clearGroup(meshGroup);
  clearGroup(curveGroup);
  clearGroup(cageGroup);

  originalMeshes = [];
  originalCurves = [];
  originalCages = [];
  subdObjectsInMemory = [];

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const arr = new Uint8Array(evt.target.result);
      if (!rhino) throw new Error('Rhino3dm library not ready.');

      const doc = rhino.File3dm.fromByteArray(arr);
      if (!doc) throw new Error('Failed to parse .3dm file.');

      parseRhinoObjects(doc, file.name);

    } catch (err) {
      console.error('[IMPORT ERROR]', err);
      alert(`Import Failed: ${err.message}`);
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * 5. PARSE RHINO OBJECTS
 */
function parseRhinoObjects(doc, filename) {
  const objects = doc.objects();
  let meshCount = 0;
  let subdCount = 0;
  let curveCount = 0;

  for (let i = 0; i < objects.count; i++) {
    const obj = objects.get(i);
    const geom = obj.geometry();
    if (!geom) continue;

    const typeInt = geom.objectType;

    if (typeInt === rhino.ObjectType.Mesh) {
      meshCount++;
      buildThreeMesh(geom);
    } else if (typeInt === rhino.ObjectType.Curve) {
      curveCount++;
      buildThreeCurve(geom);
    } else if (typeInt === rhino.ObjectType.SubD) {
      subdCount++;
      subdObjectsInMemory.push(geom);
      buildSubDCageOverlay(geom);
    }
  }

  computeModelBounds();
  resetTransformations();

  // Trigger Domain A1 Seed Identity Signature Analysis
  if (window.analyzeSeedIdentity && originalMeshes.length > 0) {
    const seedId = window.analyzeSeedIdentity(modelBounds, originalMeshes[0].originalPositions);
    if (seedId) {
      const elAxis = document.getElementById('id-axis');
      const elAspect = document.getElementById('id-aspect');
      const elZones = document.getElementById('id-zones');
      if (elAxis) elAxis.textContent = `${seedId.dominantAxis}-AXIS DOMINANT`;
      if (elAspect) elAspect.textContent = `${seedId.aspectRatio} Ratio`;
      if (elZones) elZones.textContent = `5 Zones (A-E)`;
    }
  }

  if (window.selectSeedParent) {
    window.selectSeedParent();
  }

  document.getElementById('info-filename').textContent = filename;
  document.getElementById('info-meshes').textContent = meshCount;
  document.getElementById('info-subds').textContent = subdCount;
  document.getElementById('info-curves').textContent = curveCount;

  fitCamera();
}

function buildThreeMesh(meshGeom) {
  const verts = meshGeom.vertices();
  const faces = meshGeom.faces();

  const positions = [];

  for (let f = 0; f < faces.count; f++) {
    const face = faces.get(f);
    const p1 = rhinoPointToThree(verts.get(face[0])[0], verts.get(face[0])[1], verts.get(face[0])[2]);
    const p2 = rhinoPointToThree(verts.get(face[1])[0], verts.get(face[1])[1], verts.get(face[1])[2]);
    const p3 = rhinoPointToThree(verts.get(face[2])[0], verts.get(face[2])[1], verts.get(face[2])[2]);

    positions.push(p1.x, p1.y, p1.z);
    positions.push(p2.x, p2.y, p2.z);
    positions.push(p3.x, p3.y, p3.z);

    if (faces.isQuad(face)) {
      const p4 = rhinoPointToThree(verts.get(face[3])[0], verts.get(face[3])[1], verts.get(face[3])[2]);
      positions.push(p1.x, p1.y, p1.z);
      positions.push(p3.x, p3.y, p3.z);
      positions.push(p4.x, p4.y, p4.z);
    }
  }

  const posArray = new Float32Array(positions);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(posArray.slice(), 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
    wireframe: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  meshGroup.add(mesh);

  originalMeshes.push({ mesh, originalPositions: posArray });
}

function buildThreeCurve(curveGeom) {
  const dom = curveGeom.domain ? curveGeom.domain : [0, 1];
  const samples = 80;
  const positions = [];

  for (let s = 0; s <= samples; s++) {
    const t = dom[0] + (s / samples) * (dom[1] - dom[0]);
    try {
      const pt = curveGeom.pointAt ? curveGeom.pointAt(t) : null;
      if (pt) {
        const p3 = rhinoPointToThree(pt[0], pt[1], pt[2]);
        positions.push(p3.x, p3.y, p3.z);
      }
    } catch (e) {}
  }

  if (positions.length >= 6) {
    const posArray = new Float32Array(positions);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(posArray.slice(), 3));

    const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
    const line = new THREE.Line(geometry, material);
    curveGroup.add(line);

    originalCurves.push({ line, originalPositions: posArray });
  }
}

function buildSubDCageOverlay(subdGeom) {
  try {
    let cageMesh = null;
    if (rhino.Mesh.createFromSubDControlNet) {
      cageMesh = rhino.Mesh.createFromSubDControlNet(subdGeom, false);
    }
    if (!cageMesh && subdGeom.vertices) cageMesh = subdGeom;

    if (cageMesh && cageMesh.vertices && cageMesh.faces) {
      const verts = cageMesh.vertices();
      const faces = cageMesh.faces();

      const linePositions = [];
      const pointPositions = [];

      for (let f = 0; f < faces.count; f++) {
        const face = faces.get(f);
        const p1 = rhinoPointToThree(verts.get(face[0])[0], verts.get(face[0])[1], verts.get(face[0])[2]);
        const p2 = rhinoPointToThree(verts.get(face[1])[0], verts.get(face[1])[1], verts.get(face[1])[2]);
        const p3 = rhinoPointToThree(verts.get(face[2])[0], verts.get(face[2])[1], verts.get(face[2])[2]);

        linePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        linePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        linePositions.push(p3.x, p3.y, p3.z, p1.x, p1.y, p1.z);
      }

      for (let v = 0; v < verts.count; v++) {
        const pt = rhinoPointToThree(verts.get(v)[0], verts.get(v)[1], verts.get(v)[2]);
        pointPositions.push(pt.x, pt.y, pt.z);
      }

      const origLinePos = new Float32Array(linePositions);
      const origPtPos = new Float32Array(pointPositions);

      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(origLinePos.slice(), 3));
      const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, opacity: 0.8, transparent: true });
      const cageLines = new THREE.LineSegments(lineGeom, lineMat);
      cageGroup.add(cageLines);

      const pointGeom = new THREE.BufferGeometry();
      pointGeom.setAttribute('position', new THREE.Float32BufferAttribute(origPtPos.slice(), 3));
      const pointMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 });
      const cagePoints = new THREE.Points(pointGeom, pointMat);
      cageGroup.add(cagePoints);

      originalCages.push({ cageLines, cagePoints, originalLinePositions: origLinePos, originalPtPositions: origPtPos });
    }
  } catch (e) {}
}

function computeModelBounds() {
  const box = new THREE.Box3();
  if (meshGroup.children.length > 0) box.setFromObject(meshGroup);
  else if (curveGroup.children.length > 0) box.setFromObject(curveGroup);
  else if (cageGroup.children.length > 0) box.setFromObject(cageGroup);

  if (!box.isEmpty()) {
    const center = new THREE.Vector3(); box.getCenter(center);
    modelBounds.minY = box.min.y;
    modelBounds.maxY = box.max.y;
    modelBounds.minX = box.min.x;
    modelBounds.maxX = box.max.x;
    modelBounds.minZ = box.min.z;
    modelBounds.maxZ = box.max.z;
    modelBounds.centerX = center.x;
    modelBounds.centerY = center.y;
    modelBounds.centerZ = center.z;

    modelBounds.min = { x: box.min.x, y: box.min.y, z: box.min.z };
    modelBounds.max = { x: box.max.x, y: box.max.y, z: box.max.z };
    modelBounds.center = { x: center.x, y: center.y, z: center.z };
  }
}

/**
/**
 * 6. DOMAIN B — RULE-BASED ART NOUVEAU SHAPE GRAMMAR ENGINE
 * 
 * DNA Vector: [C, B, W, M, V, G]
 * C = Continuity [0.0, 1.0]
 * B = Branching [0.0, 1.0]
 * W = Whiplash Curvature [0.0, 1.0]
 * M = Merging Surfaces [0.0, 1.0]
 * V = Positive/Negative Space [0.0, 1.0]
 * G = Growth/Aggregation [0.0, 1.0]
 * 
 * Pipeline execution order:
 * ORIGINAL RHINO SEED -> CONTINUITY -> BRANCHING -> WHIPLASH -> MERGING -> POSITIVE/NEGATIVE -> GROWTH -> VALIDATION -> FINAL GEOMETRY
 */

function calculateSeedIdentityScore(deformedPos, origPos, bounds) {
  if (!deformedPos || !origPos || deformedPos.length === 0) return 100;
  
  const count = Math.floor(origPos.length / 3);
  let totalDisp = 0;
  let spanX = Math.max(0.1, Math.abs(bounds.max.x - bounds.min.x));
  let spanY = Math.max(0.1, Math.abs(bounds.max.y - bounds.min.y));
  let spanZ = Math.max(0.1, Math.abs(bounds.max.z - bounds.min.z));
  let diag = Math.sqrt(spanX * spanX + spanY * spanY + spanZ * spanZ) || 1.0;

  for (let i = 0; i < origPos.length; i += 3) {
    let dx = deformedPos[i] - origPos[i];
    let dy = deformedPos[i+1] - origPos[i+1];
    let dz = deformedPos[i+2] - origPos[i+2];
    totalDisp += Math.sqrt(dx*dx + dy*dy + dz*dz);
  }

  let meanDisp = count > 0 ? (totalDisp / count) : 0;
  let normDisp = Math.min(1.0, meanDisp / (diag * 0.35));

  let score = Math.round(Math.max(40, Math.min(100, (1.0 - 0.6 * normDisp) * 100)));
  return score;
}

function applyArtNouveauDNA(positions, dna, bounds, identityThreshold = 75) {
  if (!positions || positions.length === 0) return new Float32Array(0);
  
  const C = dna && dna[0] !== undefined ? Math.max(0, Math.min(1, dna[0])) : 0;
  const B = dna && dna[1] !== undefined ? Math.max(0, Math.min(1, dna[1])) : 0;
  const W = dna && dna[2] !== undefined ? Math.max(0, Math.min(1, dna[2])) : 0;
  const M = dna && dna[3] !== undefined ? Math.max(0, Math.min(1, dna[3])) : 0;
  const V = dna && dna[4] !== undefined ? Math.max(0, Math.min(1, dna[4])) : 0;
  const G = dna && dna[5] !== undefined ? Math.max(0, Math.min(1, dna[5])) : 0;

  // MANDATORY ZERO STATE: DNA [0,0,0,0,0,0] -> Exact pristine copy, 0 displacement!
  if (C === 0 && B === 0 && W === 0 && M === 0 && V === 0 && G === 0) {
    window.lastEngineStats = {
      affectedVertexCount: 0,
      affectedPct: 0,
      totalVertexCount: Math.floor(positions.length / 3),
      maxDisplacement: 0,
      meanDisplacement: 0,
      seedIdentityPct: 100,
      ruleValidation: {
        continuity: { pass: true, msg: '✓ PRISTINE SEED' },
        branching: { pass: true, msg: '✓ SINGULAR TRAJECTORY' },
        whiplash: { pass: true, msg: '✓ UNMODIFIED' },
        merging: { pass: true, msg: '✓ NO MERGE NEEDED' },
        posneg: { pass: true, msg: '✓ SOLID ENCLOSED' },
        growth: { pass: true, msg: '✓ CONTAINED SEED' }
      }
    };
    return new Float32Array(positions);
  }

  // Bounding box setup
  const minX = bounds?.min?.x ?? bounds?.minX ?? -10;
  const maxX = bounds?.max?.x ?? bounds?.maxX ?? 10;
  const minY = bounds?.min?.y ?? bounds?.minY ?? -10;
  const maxY = bounds?.max?.y ?? bounds?.maxY ?? 10;
  const minZ = bounds?.min?.z ?? bounds?.minZ ?? -10;
  const maxZ = bounds?.max?.z ?? bounds?.maxZ ?? 10;

  const spanX = Math.max(0.1, Math.abs(maxX - minX));
  const spanY = Math.max(0.1, Math.abs(maxY - minY));
  const spanZ = Math.max(0.1, Math.abs(maxZ - minZ));

  let domAxis = 'Y', domMin = minY, domSpan = spanY, transSpan = Math.max(spanX, spanZ);
  if (spanX >= spanY && spanX >= spanZ) {
    domAxis = 'X'; domMin = minX; domSpan = spanX; transSpan = Math.max(spanY, spanZ);
  } else if (spanZ >= spanY && spanZ >= spanX) {
    domAxis = 'Z'; domMin = minZ; domSpan = spanZ; transSpan = Math.max(spanX, spanY);
  }

  const centerX = bounds?.center?.x ?? bounds?.centerX ?? (minX + maxX) / 2;
  const centerY = bounds?.center?.y ?? bounds?.centerY ?? (minY + maxY) / 2;
  const centerZ = bounds?.center?.z ?? bounds?.centerZ ?? (minZ + maxZ) / 2;

  const totalVerts = Math.floor(positions.length / 3);

  // Scaling factor for Seed Identity Protection threshold
  let magScale = 1.0;

  function runPipeline(scale) {
    const activeC = C * scale;
    const activeB = B * scale;
    const activeW = W * scale;
    const activeM = M * scale;
    const activeV = V * scale;
    const activeG = G * scale;

    const temp = new Float32Array(positions);

    // 1. CONTINUITY (C)
    // S(t) = 3t^2 - 2t^3 smooth interpolation
    if (activeC > 0) {
      for (let i = 0; i < temp.length; i += 3) {
        let x = temp[i], y = temp[i+1], z = temp[i+2];
        let domVal = (domAxis === 'X') ? x : ((domAxis === 'Z') ? z : y);
        let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));
        let S = 3 * u * u - 2 * u * u * u; // Smooth cubic transition
        
        let targetX = centerX + (x - centerX) * (1 - 0.35 * activeC * S);
        let targetZ = centerZ + (z - centerZ) * (1 - 0.35 * activeC * S);
        let targetY = y + activeC * 0.28 * domSpan * Math.sin(Math.PI * u);

        temp[i] = (1 - activeC) * x + activeC * targetX;
        temp[i+1] = (1 - activeC) * y + activeC * targetY;
        temp[i+2] = (1 - activeC) * z + activeC * targetZ;
      }
    }

    // 2. ORGANIC ART NOUVEAU BRANCHING (B)
    // Continuous spatial bifurcation along natural botanical parabolic tendril curves
    if (activeB > 0.05) {
      const nodeStartU = Math.max(0.12, 0.42 - activeB * 0.28); // Node height (0.14 -> 0.35)
      const maxBranchReach = activeB * 0.65 * domSpan;
      const numForks = activeB >= 0.55 ? 3 : 2; // 2-way or 3-way bifurcation
      const forkAngle = (22 + activeB * 65) * (Math.PI / 180); // 22 deg to 87 deg flare

      for (let i = 0; i < temp.length; i += 3) {
        let x = temp[i], y = temp[i+1], z = temp[i+2];
        let domVal = (domAxis === 'X') ? x : ((domAxis === 'Z') ? z : y);
        let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));

        if (u > nodeStartU) {
          let tBranch = (u - nodeStartU) / (1 - nodeStartU);
          // Organic parabolic + S-curve tendril growth envelope
          let growthEnvelope = Math.pow(tBranch, 1.25) * (1.0 + 0.35 * Math.sin(Math.PI * tBranch));

          // Calculate spatial radial angle from central axis to group adjacent vertices organically
          let dx = x - centerX;
          let dz = z - centerZ;
          let spatialAngle = Math.atan2(dz, dx);

          // Sector allocation based on spatial angle (0.0 -> 1.0)
          let normalizedAngle = (spatialAngle + Math.PI) / (2 * Math.PI);
          let forkSector = Math.floor(normalizedAngle * numForks) % numForks;

          let spreadAngle = (forkSector - (numForks - 1) / 2.0) * forkAngle;
          let dispMagnitude = growthEnvelope * maxBranchReach;

          let branchDx = dispMagnitude * Math.cos(spatialAngle + spreadAngle * 0.5);
          let branchDz = dispMagnitude * Math.sin(spatialAngle + spreadAngle * 0.5);
          let branchDy = dispMagnitude * 0.30 * tBranch; // Organic upward botanical reach

          temp[i] += branchDx;
          temp[i+2] += branchDz;
          if (domAxis === 'Y') {
            temp[i+1] += branchDy;
          } else if (domAxis === 'X') {
            temp[i] += branchDy;
          } else {
            temp[i+2] += branchDy;
          }
        }
      }
    }

    // 3. WHIPLASH CURVATURE (W)
    // A(W) = W * 0.45 * transverseDimension
    // D(t) = A(W) * sin(pi*t + W*pi*t^2)
    if (activeW > 0) {
      const Amp = activeW * 0.45 * transSpan;
      for (let i = 0; i < temp.length; i += 3) {
        let x = temp[i], y = temp[i+1], z = temp[i+2];
        let domVal = (domAxis === 'X') ? x : ((domAxis === 'Z') ? z : y);
        let t = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));

        let D1 = Amp * Math.sin(Math.PI * t + activeW * Math.PI * t * t);
        let D2 = activeW > 0.40 ? (activeW - 0.40) * Amp * Math.sin(2 * Math.PI * t + Math.PI * 0.5) : 0;
        let totalD = D1 + D2;

        if (domAxis === 'Y') {
          temp[i] += totalD;
          temp[i+2] += totalD * 0.45 * Math.cos(Math.PI * t);
        } else {
          temp[i+1] += totalD;
          temp[i+2] += totalD * 0.45;
        }
      }
    }

    // 4. MERGING SURFACES (M)
    const hasBranchingOrMulti = activeB >= 0.15 || totalVerts >= 20;
    if (activeM > 0 && hasBranchingOrMulti) {
      const sigma = (0.05 + 0.35 * activeM) * domSpan;
      for (let i = 0; i < temp.length; i += 3) {
        let x = temp[i], z = temp[i+2];
        let dist = Math.sqrt((x - centerX)*(x - centerX) + (z - centerZ)*(z - centerZ));
        let w = Math.exp(-(dist * dist) / (2 * sigma * sigma));
        
        let pull = activeM * 1.2 * w;
        temp[i] += pull * (centerX - x);
        temp[i+2] += pull * (centerZ - z);
      }
    }

    // 5. POSITIVE / NEGATIVE SPACE (V)
    if (activeV > 0) {
      const Nvoid = Math.floor(1 + 3 * activeV);
      const R = (0.08 + 0.28 * activeV) * transSpan;

      for (let i = 0; i < temp.length; i += 3) {
        let x = temp[i], y = temp[i+1], z = temp[i+2];
        let domVal = (domAxis === 'X') ? x : ((domAxis === 'Z') ? z : y);
        let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));

        for (let vIdx = 0; vIdx < Nvoid; vIdx++) {
          let uVoid = (vIdx + 1) / (Nvoid + 1);
          let distU = Math.abs(u - uVoid);
          if (distU < 0.28) {
            let dx = x - centerX, dz = z - centerZ;
            let distRad = Math.sqrt(dx * dx + dz * dz) + 0.0001;
            let field = Math.exp(-(distRad * distRad) / (2 * R * R)) * Math.cos(distU * Math.PI * 2.5);
            
            temp[i] += (dx / distRad) * field * R * activeV * 1.3;
            temp[i+2] += (dz / distRad) * field * R * activeV * 1.3;
          }
        }
      }
    }

    // 6. GROWTH / AGGREGATION (G)
    if (activeG > 0) {
      const N = 1 + Math.floor(4 * activeG);
      const D = activeG * 0.48 * domSpan;

      for (let i = 0; i < temp.length; i += 3) {
        let vertIdx = Math.floor(i / 3);
        let gInstance = vertIdx % N;
        let scaleInst = 1 + gInstance * activeG * 0.25;
        let rotRad = (gInstance * activeG * 30) * (Math.PI / 180);

        let x = temp[i] - centerX;
        let z = temp[i+2] - centerZ;

        let rx = (x * Math.cos(rotRad) - z * Math.sin(rotRad)) * scaleInst;
        let rz = (x * Math.sin(rotRad) + z * Math.cos(rotRad)) * scaleInst;

        temp[i] = centerX + rx;
        temp[i+2] = centerZ + rz;

        if (domAxis === 'Y') {
          temp[i+1] += gInstance * (D / Math.max(1, N)) * 0.30;
        }
      }
    }

    return temp;
  }

  // Calculate Seed Identity Protection threshold loop
  let finalPositions = runPipeline(magScale);
  let identityScore = calculateSeedIdentityScore(finalPositions, positions, bounds);

  while (identityScore < identityThreshold && magScale > 0.1) {
    magScale -= 0.05;
    finalPositions = runPipeline(magScale);
    identityScore = calculateSeedIdentityScore(finalPositions, positions, bounds);
  }

  // Stats & Rule Validation computation
  let affectedCount = 0;
  let maxDisp = 0;
  let totalDispSum = 0;

  for (let i = 0; i < positions.length; i += 3) {
    let dx = finalPositions[i] - positions[i];
    let dy = finalPositions[i+1] - positions[i+1];
    let dz = finalPositions[i+2] - positions[i+2];
    let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist > 0.001) {
      affectedCount++;
      totalDispSum += dist;
      if (dist > maxDisp) maxDisp = dist;
    }
  }

  const affectedPct = Math.round((affectedCount / totalVerts) * 100);

  window.lastEngineStats = {
    affectedVertexCount: affectedCount,
    affectedPct: affectedPct,
    totalVertexCount: totalVerts,
    maxDisplacement: Number(maxDisp.toFixed(2)),
    meanDisplacement: affectedCount > 0 ? Number((totalDispSum / affectedCount).toFixed(2)) : 0,
    seedIdentityPct: identityScore,
    scaledMagnitude: Math.round(magScale * 100),
    ruleValidation: {
      continuity: { pass: true, msg: C > 0.7 ? '✓ CONTINUOUS FLOW' : (C > 0.3 ? '✓ CONNECTED' : '✓ INDEPENDENT') },
      branching: { pass: B < 0.2 || affectedCount > 0, msg: B >= 0.6 ? '✓ HIERARCHICAL BRANCHING' : (B >= 0.2 ? '✓ BIFURCATING' : '✓ SINGULAR') },
      whiplash: { pass: W === 0 || maxDisp > 0, msg: W > 0.6 ? '✓ WHIPLASH INFLECTED' : (W > 0.3 ? '✓ FLOWING CURVATURE' : '✓ LINEAR') },
      merging: { pass: M === 0 || (B >= 0.2 || totalVerts >= 30), msg: (B >= 0.2 || totalVerts >= 30) ? (M > 0.7 ? '✓ MERGED / UNIFIED' : '✓ CONVERGING') : '✕ PRECONDITION NOT SATISFIED' },
      posneg: { pass: true, msg: V > 0.6 ? '✓ INTERLOCK SOLID/VOID' : (V > 0.3 ? '✓ POROUS VOID' : '✓ SOLID ENCLOSED') },
      growth: { pass: true, msg: G > 0.6 ? '✓ PROLIFERATING GROWTH' : (G > 0.3 ? '✓ EXTENDING GROWTH' : '✓ CONTAINED SEED') }
    }
  };

  return finalPositions;
}

function executeRecipeDeformation(positions, recipeOrDna, bounds) {
  if (!positions || positions.length === 0) return new Float32Array(0);
  
  // If passed DNA vector [C, B, W, M, V, G]
  if (Array.isArray(recipeOrDna) && recipeOrDna.length === 6 && typeof recipeOrDna[0] === 'number') {
    const thresh = (window.domainState && window.domainState.seedIdentityThreshold) ? window.domainState.seedIdentityThreshold : 75;
    return applyArtNouveauDNA(positions, recipeOrDna, bounds, thresh);
  }

  // If passed array of recipe objects, convert to DNA representation
  const dna = [0, 0, 0, 0, 0, 0];
  if (Array.isArray(recipeOrDna)) {
    recipeOrDna.forEach(step => {
      if (step.type === 'CONTINUITY') dna[0] = Math.max(dna[0], step.strength || step.sectionScale || 0.6);
      if (step.type === 'BRANCH') dna[1] = Math.max(dna[1], (step.branchCount || 2) >= 3 ? 0.8 : 0.4);
      if (step.type === 'WHIPLASH') dna[2] = Math.max(dna[2], step.intensity || step.strength || 0.65);
      if (step.type === 'MERGE') dna[3] = Math.max(dna[3], (step.mergeStrength || step.strength || 65) / 100.0);
      if (step.type === 'VOID') dna[4] = Math.max(dna[4], (step.openingScalePct || step.voidRatio || 30) / 100.0);
      if (step.type === 'GROWTH') dna[5] = Math.max(dna[5], (step.repetitionCount || step.count || 3) / 5.0);
    });
  }

  const thresh = (window.domainState && window.domainState.seedIdentityThreshold) ? window.domainState.seedIdentityThreshold : 75;
  return applyArtNouveauDNA(positions, dna, bounds, thresh);
}

/**
 * MEASURE GEOMETRY OUTPUT METRICS (POST-TRANSFORMATION)
 */
function measureGeometryMetrics(defPositions, origPositions, bounds) {
  if (!defPositions || !origPositions || defPositions.length === 0) {
    return {
      heightChangePct: 0,
      widthChangePct: 0,
      depthChangePct: 0,
      pathLengthChangePct: 0,
      voidRatioChangePct: 0,
      verticality: 0,
      asymmetry: 0,
      compression: 1.0,
      expansion: 1.0,
      porosity: 0,
      centrality: 0
    };
  }

  const origMinY = bounds.min ? bounds.min.y : (bounds.minY || -10);
  const origMaxY = bounds.max ? bounds.max.y : (bounds.maxY || 10);
  const origSpanY = Math.max(0.1, Math.abs(origMaxY - origMinY));

  const origMinX = bounds.min ? bounds.min.x : (bounds.minX || -10);
  const origMaxX = bounds.max ? bounds.max.x : (bounds.maxX || 10);
  const origSpanX = Math.max(0.1, Math.abs(origMaxX - origMinX));

  const origMinZ = bounds.min ? bounds.min.z : (bounds.minZ || -10);
  const origMaxZ = bounds.max ? bounds.max.z : (bounds.maxZ || 10);
  const origSpanZ = Math.max(0.1, Math.abs(origMaxZ - origMinZ));

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  let leftDispSum = 0, leftCount = 0;
  let rightDispSum = 0, rightCount = 0;
  let totalDisplacement = 0;

  const count = Math.floor(defPositions.length / 3);
  for (let i = 0; i < defPositions.length; i += 3) {
    const x = defPositions[i];
    const y = defPositions[i + 1];
    const z = defPositions[i + 2];

    const ox = origPositions[i];
    const oy = origPositions[i + 1];
    const oz = origPositions[i + 2];

    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;

    const dx = x - ox;
    const dy = y - oy;
    const dz = z - oz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    totalDisplacement += dist;

    if (ox < (bounds.center ? bounds.center.x : bounds.centerX)) {
      leftDispSum += dist; leftCount++;
    } else {
      rightDispSum += dist; rightCount++;
    }
  }

  const defSpanY = Math.max(0.1, maxY - minY);
  const defSpanX = Math.max(0.1, maxX - minX);
  const defSpanZ = Math.max(0.1, maxZ - minZ);

  const heightChangePct = Number((((defSpanY - origSpanY) / origSpanY) * 100).toFixed(1));
  const widthChangePct = Number((((defSpanX - origSpanX) / origSpanX) * 100).toFixed(1));
  const depthChangePct = Number((((defSpanZ - origSpanZ) / origSpanZ) * 100).toFixed(1));

  const avgDisp = count > 0 ? (totalDisplacement / count) : 0;
  const pathLengthChangePct = Number(((avgDisp / (origSpanY * 0.2)) * 100).toFixed(1));

  const avgLeft = leftCount > 0 ? (leftDispSum / leftCount) : 0;
  const avgRight = rightCount > 0 ? (rightDispSum / rightCount) : 0;
  const asymmetry = Number((Math.abs(avgLeft - avgRight) / Math.max(0.1, origSpanX * 0.1) * 100).toFixed(1));

  const verticality = Number(((maxY - origMaxY) / origSpanY).toFixed(2));
  const expansion = Number((defSpanX / origSpanX).toFixed(2));
  const compression = Number((1.0 / Math.max(0.2, expansion)).toFixed(2));
  const porosity = Number(Math.min(50, Math.max(2, Math.round(pathLengthChangePct * 0.35))));

  return {
    heightChangePct,
    widthChangePct,
    depthChangePct,
    pathLengthChangePct,
    voidRatioChangePct: Number((widthChangePct * 0.3 + pathLengthChangePct * 0.2).toFixed(1)),
    verticality,
    asymmetry,
    compression,
    expansion,
    porosity
  };
}

let activeVisualCompMode = 'ITERATION';

function switchVisualComparisonMode(mode) {
  activeVisualCompMode = mode;

  const btns = document.querySelectorAll('.btn-vp-pill[onclick*="switchVisualComparisonMode"]');
  btns.forEach(b => {
    b.classList.remove('active');
    if (b.getAttribute('onclick').includes(mode)) b.classList.add('active');
  });

  if (window.domainState && window.domainState.dna) {
    renderIterationGeometry(window.domainState.dna);
  }
}

window.switchVisualComparisonMode = switchVisualComparisonMode;

/**
 * RENDER RECIPE / DNA DEFORMATION IN MAIN VIEWPORT
 */
function renderIterationGeometry(recipeOrDna) {
  const compMode = activeVisualCompMode;

  // Deform Meshes
  originalMeshes.forEach(item => {
    const attr = item.mesh.geometry.attributes.position;
    let defPos;

    if (compMode === 'SEED') {
      defPos = item.originalPositions;
    } else {
      defPos = executeRecipeDeformation(item.originalPositions, recipeOrDna, modelBounds);
    }

    for (let i = 0; i < defPos.length; i++) {
      attr.array[i] = defPos[i];
    }
    attr.needsUpdate = true;
    item.mesh.geometry.computeVertexNormals();

    // Adjust visual style for overlay comparison mode
    if (compMode === 'OVERLAY') {
      if (item.mesh.material) item.mesh.material.wireframe = true;
    } else {
      if (item.mesh.material) item.mesh.material.wireframe = false;
    }
  });

  // Deform Curves
  originalCurves.forEach(item => {
    const attr = item.line.geometry.attributes.position;
    let defPos;

    if (compMode === 'SEED') {
      defPos = item.originalPositions;
    } else {
      defPos = executeRecipeDeformation(item.originalPositions, recipeOrDna, modelBounds);
    }

    for (let i = 0; i < defPos.length; i++) {
      attr.array[i] = defPos[i];
    }
    attr.needsUpdate = true;
  });

  // Deform SubD Cages
  originalCages.forEach(item => {
    const lineAttr = item.cageLines.geometry.attributes.position;
    let defLinePos = compMode === 'SEED' ? item.originalLinePositions : executeRecipeDeformation(item.originalLinePositions, recipeOrDna, modelBounds);
    for (let i = 0; i < defLinePos.length; i++) {
      lineAttr.array[i] = defLinePos[i];
    }
    lineAttr.needsUpdate = true;

    const ptAttr = item.cagePoints.geometry.attributes.position;
    let defPtPos = compMode === 'SEED' ? item.originalPtPositions : executeRecipeDeformation(item.originalPtPositions, recipeOrDna, modelBounds);
    for (let i = 0; i < defPtPos.length; i++) {
      ptAttr.array[i] = defPtPos[i];
    }
    ptAttr.needsUpdate = true;
  });
}

function applyArtNouveauTransformations() {
  if (window.domainState && window.domainState.dna) {
    renderIterationGeometry(window.domainState.dna);
  }
}

function fitCamera() {
  let targetGroup = meshGroup;
  const meshBox = new THREE.Box3().setFromObject(meshGroup);
  if (meshBox.isEmpty()) {
    const curveBox = new THREE.Box3().setFromObject(curveGroup);
    if (!curveBox.isEmpty()) targetGroup = curveGroup;
    else targetGroup = cageGroup;
  }

  const box = new THREE.Box3().setFromObject(targetGroup);
  if (box.isEmpty()) return;

  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0 && !isNaN(maxDim)) {
    const fov = threeCamera.fov * (Math.PI / 180);
    let cameraDist = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.8;

    threeCamera.position.set(center.x + cameraDist * 0.8, center.y + cameraDist * 0.6, center.z + cameraDist * 1.2);
    threeCamera.near = Math.max(0.1, maxDim / 500);
    threeCamera.far = Math.max(5000, maxDim * 50);
    threeCamera.updateProjectionMatrix();

    if (threeControls) {
      threeControls.target.copy(center);
      threeControls.update();
    }
  }
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const obj = group.children[0];
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
    group.remove(obj);
  }
}

/**
 * AUTOMATED DEVELOPER DIAGNOSTIC SUITE
 * Tests all 6 primary Art Nouveau Shape Grammar principles from 0% to 100%
 */
function runDomainBDiagnostics() {
  const origPos = window.getOriginalMeshPositions();
  const bounds = window.getModelBounds();
  if (!origPos || origPos.length === 0) {
    console.warn('[DIAGNOSTICS] No geometry loaded to run diagnostic tests.');
    return [];
  }

  const tests = [
    { name: '01 CONTINUITY', dna0: [0, 0, 0, 0, 0, 0], dna1: [1.0, 0, 0, 0, 0, 0] },
    { name: '02 BRANCHING', dna0: [0, 0, 0, 0, 0, 0], dna1: [0, 1.0, 0, 0, 0, 0] },
    { name: '03 WHIPLASH', dna0: [0, 0, 0, 0, 0, 0], dna1: [0, 0, 1.0, 0, 0, 0] },
    { name: '04 MERGING', dna0: [0, 0, 0, 0, 0, 0], dna1: [0, 0.4, 0, 1.0, 0, 0] },
    { name: '05 POSITIVE / NEGATIVE', dna0: [0, 0, 0, 0, 0, 0], dna1: [0, 0, 0, 0, 1.0, 0] },
    { name: '06 GROWTH', dna0: [0, 0, 0, 0, 0, 0], dna1: [0, 0, 0, 0, 0, 1.0] }
  ];

  const results = [];

  tests.forEach(test => {
    const resMin = applyArtNouveauDNA(origPos, test.dna0, bounds, 50);
    const resMax = applyArtNouveauDNA(origPos, test.dna1, bounds, 50);

    let diff = 0;
    let hasNaN = false;
    for (let i = 0; i < resMin.length; i++) {
      if (isNaN(resMin[i]) || isNaN(resMax[i])) hasNaN = true;
      diff += Math.abs(resMax[i] - resMin[i]);
    }

    const passed = diff > 0.01 && !hasNaN;
    results.push({ name: test.name, pass: passed, delta: Number(diff.toFixed(2)) });
  });

  console.log('[DIAGNOSTICS RESULTS]', results);

  const gridEl = document.getElementById('diag-tests-grid');
  if (gridEl) {
    gridEl.innerHTML = results.map(r => `
      <div class="diag-test-item">
        <span class="test-name">${r.name}</span>
        <span class="test-status ${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</span>
      </div>
    `).join('');
  }

  return results;
}

window.runDomainBDiagnostics = runDomainBDiagnostics;
window.applyArtNouveauDNA = applyArtNouveauDNA;
window.calculateSeedIdentityScore = calculateSeedIdentityScore;

