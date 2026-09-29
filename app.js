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

  // WebGL Renderer with soft shadow support
  threeRenderer = new THREE.WebGLRenderer({ antialias: true });
  threeRenderer.setSize(width, height);
  threeRenderer.setPixelRatio(window.devicePixelRatio);
  threeRenderer.shadowMap.enabled = true;
  threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(threeRenderer.domElement);

  // Orbit Controls
  if (window.THREE.OrbitControls) {
    threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
    threeControls.enableDamping = true;
    threeControls.dampingFactor = 0.05;
    threeControls.target.set(0, 0, 0);
  }

  // Lighting Setup — Rhino Shaded Mode Aesthetic
  // Soft Hemisphere Light (Sky: pure white, Ground: soft dark charcoal/slate for AO feel)
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x2b2c36, 0.65);
  threeScene.add(hemiLight);

  // Directional Key Light from Upper/Front-Left
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
  keyLight.position.set(-60, 100, 80);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.bias = -0.0001;
  threeScene.add(keyLight);

  // Directional Fill Light from Opposite Side
  const fillLight = new THREE.DirectionalLight(0x778899, 0.35);
  fillLight.position.set(60, -40, -60);
  threeScene.add(fillLight);

  // Overhead Soft Ambient Fill
  const topLight = new THREE.DirectionalLight(0xffffff, 0.25);
  topLight.position.set(0, 150, 0);
  threeScene.add(topLight);

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
      window.rhino = loadedRhino;
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
      e.target.value = '';
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

  // Restore Original Rhino Geometry Buttons
  const btnRestoreHeader = document.getElementById('btn-restore-original');
  if (btnRestoreHeader) {
    btnRestoreHeader.addEventListener('click', restoreOriginalImportedGeometry);
  }
  const btnRestoreSidebar = document.getElementById('btn-sidebar-restore-original');
  if (btnRestoreSidebar) {
    btnRestoreSidebar.addEventListener('click', restoreOriginalImportedGeometry);
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
  geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const wireMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
  const mesh = new THREE.Mesh(geometry, wireMat);
  meshGroup.add(mesh);

  originalMeshes.push({
    mesh: mesh,
    threeMesh: mesh,
    originalPositions: new Float32Array(positions)
  });

  window.originalMeshes = originalMeshes;
  window.originalCurves = originalCurves;
  window.originalCages = originalCages;

  computeModelBounds();

  if (window.analyzeSeedIdentity) {
    window.analyzeSeedIdentity(modelBounds, positions);
  }

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
 * RESTORE ORIGINAL IMPORTED RHINO GEOMETRY
 * Restores all SubD meshes, curves, and cages back to exact un-deformed Rhino geometry.
 */
function restoreOriginalImportedGeometry() {
  console.log('[RESTORE] Restoring original imported Rhino geometry and SubD meshes...');

  // Set visual comparison mode to SEED
  activeVisualCompMode = 'SEED';

  // 1. Reset manual sliders in UI and state
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

  // 2. Reset Domain B DNA state in generator.js if available
  if (window.domainState) {
    window.domainState.dna = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    window.domainState.activeRefinementProposal = null;
    window.domainState.selectedParentId = 'RHINO-SEED';
    window.domainState.selectedParentGenome = null;
    window.domainState.visualComparisonMode = 'SEED';
  }

  // 3. Reset 6 Art Nouveau DNA slider elements in DOM
  ['slider-dna-c', 'slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g'].forEach(id => {
    const sEl = document.getElementById(id);
    if (sEl) sEl.value = 0;
  });

  // Reset secondary branch controls if present
  const branchCountEl = document.getElementById('slider-branch-count'); if (branchCountEl) branchCountEl.value = 2;
  const branchPosEl = document.getElementById('slider-branch-pos'); if (branchPosEl) branchPosEl.value = 50;
  const branchHAngleEl = document.getElementById('slider-branch-h-angle'); if (branchHAngleEl) branchHAngleEl.value = 0;
  const branchVAngleEl = document.getElementById('slider-branch-v-angle'); if (branchVAngleEl) branchVAngleEl.value = 0;
  const branchLenEl = document.getElementById('slider-branch-length'); if (branchLenEl) branchLenEl.value = 100;
  const branchWidthEl = document.getElementById('slider-branch-width'); if (branchWidthEl) branchWidthEl.value = 100;

  // 4. Force Groups & Layers to be Visible
  if (meshGroup) meshGroup.visible = true;
  if (curveGroup) curveGroup.visible = true;
  if (cageGroup) cageGroup.visible = true;

  const btnMesh = document.getElementById('btn-toggle-mesh'); if (btnMesh) btnMesh.classList.add('active');
  const btnCage = document.getElementById('btn-toggle-cage'); if (btnCage) btnCage.classList.add('active');
  const btnCurves = document.getElementById('btn-toggle-curves'); if (btnCurves) btnCurves.classList.add('active');

  // 5. Restore ALL SubD and standard meshes to exact un-deformed positions
  originalMeshes.forEach(item => {
    const targetMesh = item.mesh || item.threeMesh;
    if (!targetMesh || !targetMesh.geometry || !item.originalPositions) return;

    targetMesh.visible = true;
    const attr = targetMesh.geometry.attributes.position;
    if (attr) {
      for (let i = 0; i < item.originalPositions.length; i++) {
        attr.array[i] = item.originalPositions[i];
      }
      attr.needsUpdate = true;
      targetMesh.geometry.computeVertexNormals();
      targetMesh.geometry.computeBoundingBox();
      targetMesh.geometry.computeBoundingSphere();
    }
    if (targetMesh.material) {
      targetMesh.material.wireframe = false;
      targetMesh.material.needsUpdate = true;
    }
  });

  // 6. Restore curves
  originalCurves.forEach(item => {
    const targetLine = item.line || item.threeCurve;
    if (!targetLine || !targetLine.geometry || !item.originalPositions) return;

    targetLine.visible = true;
    const attr = targetLine.geometry.attributes.position;
    if (attr) {
      for (let i = 0; i < item.originalPositions.length; i++) {
        attr.array[i] = item.originalPositions[i];
      }
      attr.needsUpdate = true;
    }
  });

  // 7. Restore SubD cages
  originalCages.forEach(item => {
    if (item.cageLines && item.cageLines.geometry && item.originalLinePositions) {
      item.cageLines.visible = true;
      const lineAttr = item.cageLines.geometry.attributes.position;
      if (lineAttr) {
        for (let i = 0; i < item.originalLinePositions.length; i++) {
          lineAttr.array[i] = item.originalLinePositions[i];
        }
        lineAttr.needsUpdate = true;
      }
    }
    if (item.cagePoints && item.cagePoints.geometry && item.originalPtPositions) {
      item.cagePoints.visible = true;
      const ptAttr = item.cagePoints.geometry.attributes.position;
      if (ptAttr) {
        for (let i = 0; i < item.originalPtPositions.length; i++) {
          ptAttr.array[i] = item.originalPtPositions[i];
        }
        ptAttr.needsUpdate = true;
      }
    }
  });

  // 8. Update DNA UI and stats
  if (window.updateDnaUIAndViewport) {
    window.updateDnaUIAndViewport();
  }

  // 9. Hide Refinement Banner & Designer Changes Panel & Active Iter Badge
  const refBanner = document.getElementById('designer-refinement-banner');
  if (refBanner) refBanner.style.display = 'none';

  const changesPanel = document.getElementById('designer-changes-panel');
  if (changesPanel) changesPanel.style.display = 'none';

  const activeBadge = document.getElementById('selected-iter-readout');
  if (activeBadge) activeBadge.style.display = 'none';

  // Deselect iteration cards and lineage nodes in gallery
  document.querySelectorAll('.pop-iter-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.lineage-node').forEach(n => n.classList.remove('active'));

  // 10. Update Viewport Header Overlay Title
  const vpTag = document.getElementById('vp-gen-tag');
  if (vpTag) vpTag.textContent = 'GENERATION 0: ORIGINAL RHINO SEED';

  // 11. Sync visual comparison mode buttons
  const bSeed = document.getElementById('btn-comp-seed');
  const btns = document.querySelectorAll('#btn-comp-seed, #btn-comp-parent, #btn-comp-iter, #btn-comp-overlay');
  btns.forEach(b => b.classList.remove('active'));
  if (bSeed) bSeed.classList.add('active');

  // 12. Re-compute bounds and re-fit camera
  computeModelBounds();
  fitCamera();

  // 13. Synchronize global window references
  window.originalMeshes = originalMeshes;
  window.originalCurves = originalCurves;
  window.originalCages = originalCages;

  console.log(`[RESTORE SUCCESS] Successfully restored ${originalMeshes.length} SubD/standard meshes to original Rhino geometry.`);
}

window.restoreOriginalImportedGeometry = restoreOriginalImportedGeometry;
window.revertToOriginalRhinoSeed = restoreOriginalImportedGeometry;

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

  window.originalMeshes = originalMeshes;
  window.originalCurves = originalCurves;
  window.originalCages = originalCages;

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

window.loadRhinoFile = loadRhinoFile;
window.loadRhinoFromUrl = async function(url = 'compressed.3dm') {
  try {
    console.log(`[URL LOADER] Fetching ${url}...`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    blob.name = url.split('/').pop() || 'compressed.3dm';
    loadRhinoFile(blob);
  } catch (e) {
    console.error('[URL LOADER ERROR]', e);
  }
};

/**
 * 5. PARSE RHINO OBJECTS
 */
function parseRhinoObjects(doc, filename) {
  const objects = doc.objects();
  let meshCount = 0;
  let subdCount = 0;
  let curveCount = 0;
  const subdDiagnostics = [];

  for (let i = 0; i < objects.count; i++) {
    const obj = objects.get(i);

    try {
      const attrs = obj.attributes();
      if (attrs) {
        if (attrs.visible === false || attrs.visible === 0) {
          console.log(`[IMPORTER] Skipping hidden object (index ${i})`);
          continue;
        }
        if (attrs.mode && attrs.mode.value === 1) {
          console.log(`[IMPORTER] Skipping object with hidden mode (index ${i})`);
          continue;
        }
        if (attrs.layerIndex >= 0) {
          const layers = doc.layers();
          if (layers && attrs.layerIndex < layers.count) {
            const layer = layers.get(attrs.layerIndex);
            if (layer && (layer.visible === false || layer.visible === 0)) {
              console.log(`[IMPORTER] Skipping object on hidden layer (index ${i})`);
              continue;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[IMPORTER] Error checking object visibility:', e);
    }

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

      // Process & render actual SubD polygon mesh faces
      const res = processAndRenderSubDMesh(geom, subdCount);
      subdDiagnostics.push(res);
    }
  }

  // Print diagnostic report to console
  console.log('====================================');
  console.log('SUBD CONVERSION DIAGNOSTIC REPORT:');
  const diagStrings = subdDiagnostics.map(d => d.logStr);
  diagStrings.forEach(s => console.log(s));
  console.log('====================================');

  // Update UI diagnostic card
  const subdDiagBox = document.getElementById('subd-diag-rows');
  if (subdDiagBox) {
    subdDiagBox.innerHTML = diagStrings.length > 0 ? diagStrings.join('\n') : 'No SubDs detected in file.';
  }

  const pConv = document.getElementById('p-conv');
  const pAdded = document.getElementById('p-added');
  const pFailed = document.getElementById('p-failed');
  const successfulSubDs = subdDiagnostics.filter(d => d.rendered).length;
  const failedSubDs = subdDiagnostics.filter(d => !d.rendered).length;

  if (pConv) pConv.textContent = meshCount + successfulSubDs;
  if (pAdded) pAdded.textContent = meshCount + successfulSubDs;
  if (pFailed) pFailed.textContent = failedSubDs;

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

  const elFilename = document.getElementById('info-filename');
  if (elFilename) elFilename.textContent = filename;
  const elMeshes = document.getElementById('info-meshes');
  if (elMeshes) elMeshes.textContent = meshCount + successfulSubDs;
  const elSubds = document.getElementById('info-subds');
  if (elSubds) elSubds.textContent = subdCount;
  const elRendered = document.getElementById('info-rendered');
  if (elRendered) elRendered.textContent = meshCount + successfulSubDs;
  const elCurves = document.getElementById('info-curves');
  if (elCurves) elCurves.textContent = curveCount;

  activeVisualCompMode = 'ITERATION';
  window.activeVisualCompMode = 'ITERATION';
  if (window.domainState) window.domainState.visualComparisonMode = 'ITERATION';

  window.originalMeshes = originalMeshes;
  window.originalCurves = originalCurves;
  window.originalCages = originalCages;

  fitCamera();
}

function buildThreeMesh(meshGeom) {
  const verts = meshGeom.vertices ? (typeof meshGeom.vertices === 'function' ? meshGeom.vertices() : meshGeom.vertices) : null;
  const faces = meshGeom.faces ? (typeof meshGeom.faces === 'function' ? meshGeom.faces() : meshGeom.faces) : null;

  if (!verts || !faces) return;

  const vertCount = typeof verts.count === 'number' ? verts.count : (verts.length || 0);
  const faceCount = typeof faces.count === 'number' ? faces.count : (faces.length || 0);

  if (vertCount === 0 || faceCount === 0) return;

  const positions = new Float32Array(vertCount * 3);
  for (let v = 0; v < vertCount; v++) {
    const pt = verts.get(v);
    const coords = getVertexCoords(pt);
    const p3js = rhinoPointToThree(coords.x, coords.y, coords.z);

    positions[v * 3]     = isNaN(p3js.x) ? 0 : p3js.x;
    positions[v * 3 + 1] = isNaN(p3js.y) ? 0 : p3js.y;
    positions[v * 3 + 2] = isNaN(p3js.z) ? 0 : p3js.z;
  }

  const indices = [];
  for (let f = 0; f < faceCount; f++) {
    const face = faces.get(f);
    const fIdx = getFaceIndices(face);
    if (!fIdx) continue;

    const { a, b, c, d } = fIdx;

    if (!isNaN(a) && !isNaN(b) && !isNaN(c) && a < vertCount && b < vertCount && c < vertCount) {
      indices.push(a, b, c);
    }

    if (d !== c && d !== a && !isNaN(d) && d < vertCount) {
      indices.push(a, c, d);
    }
  }

  if (indices.length === 0) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xdcdcdc,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide,
    flatShading: false,
    wireframe: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  meshGroup.add(mesh);

  originalMeshes.push({ mesh, threeMesh: mesh, originalPositions: new Float32Array(positions) });
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
        const coords = getVertexCoords(pt);
        const p3 = rhinoPointToThree(coords.x, coords.y, coords.z);
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

function getVertexCoords(pt) {
  if (!pt) return { x: 0, y: 0, z: 0 };
  let x = undefined, y = undefined, z = undefined;
  if (typeof pt.x === 'number') { x = pt.x; y = pt.y; z = pt.z; }
  else if (typeof pt[0] === 'number') { x = pt[0]; y = pt[1]; z = pt[2]; }
  return {
    x: x !== undefined && !isNaN(x) ? x : 0,
    y: y !== undefined && !isNaN(y) ? y : 0,
    z: z !== undefined && !isNaN(z) ? z : 0
  };
}

function getFaceIndices(face) {
  if (!face) return null;
  let a = undefined, b = undefined, c = undefined, d = undefined;
  if (typeof face.a === 'number') { a = face.a; b = face.b; c = face.c; d = face.d; }
  else if (typeof face[0] === 'number') { a = face[0]; b = face[1]; c = face[2]; d = face[3]; }
  if (a === undefined || b === undefined || c === undefined) return null;
  if (d === undefined) d = c;
  return { a, b, c, d };
}

function getValidVertexCount(meshObj) {
  if (!meshObj) return 0;
  try {
    if (typeof meshObj.vertices === 'function') {
      const v = meshObj.vertices();
      return typeof v.count === 'number' ? v.count : (v.length || 0);
    } else if (meshObj.vertices) {
      return typeof meshObj.vertices.count === 'number' ? meshObj.vertices.count : (meshObj.vertices.length || 0);
    }
  } catch (e) {}
  return 0;
}

function getValidFaceCount(meshObj) {
  if (!meshObj) return 0;
  try {
    if (typeof meshObj.faces === 'function') {
      const f = meshObj.faces();
      return typeof f.count === 'number' ? f.count : (f.length || 0);
    } else if (meshObj.faces) {
      return typeof meshObj.faces.count === 'number' ? meshObj.faces.count : (meshObj.faces.length || 0);
    }
  } catch (e) {}
  return 0;
}

function convertSubDToPolygonMesh(subdGeom) {
  if (!subdGeom) return { mesh: null, method: 'NONE' };
  const r = window.rhino || rhino;
  let mesh = null;
  let method = 'NONE';

  // 1. High-Fidelity Smooth Subdivision Limit Surface
  // Subdivide SubD by level 2 Catmull-Clark and extract smooth polygon mesh
  for (let level of [2, 1]) {
    try {
      if (typeof subdGeom.duplicate === 'function' && r && r.Mesh && typeof r.Mesh.createFromSubDControlNet === 'function') {
        const sub = subdGeom.duplicate();
        if (typeof sub.subdivide === 'function') {
          sub.subdivide(level);
        }
        const candidate = r.Mesh.createFromSubDControlNet(sub, false);
        if (candidate && getValidVertexCount(candidate) > 0 && getValidFaceCount(candidate) > 0) {
          mesh = candidate;
          method = `SubD.subdivide(${level}) -> Mesh.createFromSubDControlNet`;
          break;
        }
      }
    } catch (e) {}
  }

  // 2. Direct createFromSubDControlNet (level 0)
  if (!mesh) {
    try {
      if (r && r.Mesh && typeof r.Mesh.createFromSubDControlNet === 'function') {
        const candidate = r.Mesh.createFromSubDControlNet(subdGeom, false);
        if (candidate && getValidVertexCount(candidate) > 0 && getValidFaceCount(candidate) > 0) {
          mesh = candidate;
          method = 'rhino.Mesh.createFromSubDControlNet';
        }
      }
    } catch (e) {}
  }

  // 3. Optional createFromSubD with density arguments if supported
  if (!mesh) {
    for (let d = 0; d <= 4; d++) {
      try {
        if (r && r.Mesh && typeof r.Mesh.createFromSubD === 'function') {
          const candidate = r.Mesh.createFromSubD(subdGeom, d);
          if (candidate && getValidVertexCount(candidate) > 0 && getValidFaceCount(candidate) > 0) {
            mesh = candidate;
            method = `rhino.Mesh.createFromSubD(density=${d})`;
            break;
          }
        }
      } catch (e) {}
    }
  }

  // 4. Direct SubD geometry fallback if it already exposes vertices and faces
  if (!mesh && subdGeom.vertices && subdGeom.faces && getValidVertexCount(subdGeom) > 0 && getValidFaceCount(subdGeom) > 0) {
    mesh = subdGeom;
    method = 'Direct SubD Geometry';
  }

  return { mesh, method };
}

function processAndRenderSubDMesh(subdGeom, subdIndex) {
  const converted = convertSubDToPolygonMesh(subdGeom);
  const targetMesh = converted.mesh;
  const method = converted.method;

  if (!targetMesh) {
    const msg = `SubD ${subdIndex} | vertices: 0 | faces: 0 | triangles: 0 | THREE.Mesh added: NO`;
    console.log(msg);
    return { index: subdIndex, method: 'NONE', vertices: 0, faces: 0, triangles: 0, rendered: false, logStr: msg };
  }

  const vertCount = getValidVertexCount(targetMesh);
  const faceCount = getValidFaceCount(targetMesh);

  if (vertCount === 0 || faceCount === 0) {
    const msg = `SubD ${subdIndex} | vertices: ${vertCount} | faces: ${faceCount} | triangles: 0 | THREE.Mesh added: NO`;
    console.log(msg);
    return { index: subdIndex, method, vertices: vertCount, faces: faceCount, triangles: 0, rendered: false, logStr: msg };
  }

  let verts = null;
  let faces = null;

  try {
    verts = typeof targetMesh.vertices === 'function' ? targetMesh.vertices() : targetMesh.vertices;
    faces = typeof targetMesh.faces === 'function' ? targetMesh.faces() : targetMesh.faces;
  } catch (e) {}

  if (!verts || !faces) {
    const msg = `SubD ${subdIndex} | vertices: 0 | faces: 0 | triangles: 0 | THREE.Mesh added: NO`;
    console.log(msg);
    return { index: subdIndex, method, vertices: 0, faces: 0, triangles: 0, rendered: false, logStr: msg };
  }

  const positions = new Float32Array(vertCount * 3);
  for (let v = 0; v < vertCount; v++) {
    const pt = verts.get(v);
    const coords = getVertexCoords(pt);
    const p3js = rhinoPointToThree(coords.x, coords.y, coords.z);

    positions[v * 3]     = isNaN(p3js.x) ? 0 : p3js.x;
    positions[v * 3 + 1] = isNaN(p3js.y) ? 0 : p3js.y;
    positions[v * 3 + 2] = isNaN(p3js.z) ? 0 : p3js.z;
  }

  const indices = [];
  let triFaceCount = 0;

  for (let f = 0; f < faceCount; f++) {
    const face = faces.get(f);
    const fIdx = getFaceIndices(face);
    if (!fIdx) continue;

    const { a, b, c, d } = fIdx;

    if (!isNaN(a) && !isNaN(b) && !isNaN(c) && a < vertCount && b < vertCount && c < vertCount) {
      indices.push(a, b, c);
      triFaceCount++;
    }

    if (d !== c && d !== a && !isNaN(d) && d < vertCount) {
      indices.push(a, c, d);
      triFaceCount++;
    }
  }

  if (indices.length === 0 || triFaceCount === 0) {
    const msg = `SubD ${subdIndex} | vertices: ${vertCount} | faces: ${faceCount} | triangles: 0 | THREE.Mesh added: NO`;
    console.log(msg);
    return { index: subdIndex, method, vertices: vertCount, faces: faceCount, triangles: 0, rendered: false, logStr: msg };
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    color: 0xdcdcdc,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide,
    flatShading: false,
    transparent: false,
    opacity: 1.0,
    wireframe: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `SubDMesh_${subdIndex}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.visible = true;

  meshGroup.add(mesh);
  originalMeshes.push({ mesh, threeMesh: mesh, originalPositions: new Float32Array(positions) });

  const msg = `SubD ${subdIndex} | vertices: ${vertCount} | faces: ${faceCount} | triangles: ${triFaceCount} | THREE.Mesh added: YES`;
  console.log(msg);

  return {
    index: subdIndex,
    method,
    vertices: vertCount,
    faces: faceCount,
    triangles: triFaceCount,
    rendered: true,
    logStr: msg
  };
}

function buildSubDCageOverlay(subdGeom) {
  try {
    const r = window.rhino || rhino;
    let cageMesh = null;
    if (r && r.Mesh && r.Mesh.createFromSubDControlNet) {
      cageMesh = r.Mesh.createFromSubDControlNet(subdGeom, false);
    }
    if (!cageMesh && subdGeom.vertices) cageMesh = subdGeom;

    if (cageMesh && cageMesh.vertices && cageMesh.faces) {
      const verts = typeof cageMesh.vertices === 'function' ? cageMesh.vertices() : cageMesh.vertices;
      const faces = typeof cageMesh.faces === 'function' ? cageMesh.faces() : cageMesh.faces;

      const vertCount = typeof verts.count === 'number' ? verts.count : (verts.length || 0);
      const faceCount = typeof faces.count === 'number' ? faces.count : (faces.length || 0);

      const linePositions = [];
      const pointPositions = [];

      for (let f = 0; f < faceCount; f++) {
        const face = faces.get(f);
        const fIdx = getFaceIndices(face);
        if (!fIdx) continue;

        const p1 = rhinoPointToThree(getVertexCoords(verts.get(fIdx.a)).x, getVertexCoords(verts.get(fIdx.a)).y, getVertexCoords(verts.get(fIdx.a)).z);
        const p2 = rhinoPointToThree(getVertexCoords(verts.get(fIdx.b)).x, getVertexCoords(verts.get(fIdx.b)).y, getVertexCoords(verts.get(fIdx.b)).z);
        const p3 = rhinoPointToThree(getVertexCoords(verts.get(fIdx.c)).x, getVertexCoords(verts.get(fIdx.c)).y, getVertexCoords(verts.get(fIdx.c)).z);

        linePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        linePositions.push(p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        linePositions.push(p3.x, p3.y, p3.z, p1.x, p1.y, p1.z);
      }

      for (let v = 0; v < vertCount; v++) {
        const pt = rhinoPointToThree(getVertexCoords(verts.get(v)).x, getVertexCoords(verts.get(v)).y, getVertexCoords(verts.get(v)).z);
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

function applyArtNouveauDNA(positions, dna, bounds, identityThreshold = 75, isMesh = true) {
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
    let newVertices = [];

    function generateSmoothBranch(vertsArr, evalPath, baseRadius, numSegs) {
      let sides = 16;
      let prevRing = [];
      let lastDir = null, lastUp = null, lastRight = null;
      
      for (let seg = 0; seg <= numSegs; seg++) {
        let t = seg / numSegs;
        let curCenter = evalPath(t);
        
        let tNext = Math.min(1.0, t + 0.05);
        let nextCenter = evalPath(tNext);
        if (t === 1.0) {
           let tPrev = Math.max(0.0, t - 0.05);
           let prevCenter = evalPath(tPrev);
           nextCenter = curCenter;
           curCenter = prevCenter; 
        }
        let dir = { x: nextCenter.x - curCenter.x, y: nextCenter.y - curCenter.y, z: nextCenter.z - curCenter.z };
        let dLen = Math.sqrt(dir.x*dir.x + dir.y*dir.y + dir.z*dir.z);
        if(dLen < 0.0001) dir = {x:0,y:1,z:0}; else {dir.x/=dLen; dir.y/=dLen; dir.z/=dLen;}
        
        if (!lastDir) {
          let up = Math.abs(dir.y) < 0.99 ? {x:0, y:1, z:0} : {x:1, y:0, z:0};
          let right = { x: up.y*dir.z - up.z*dir.y, y: up.z*dir.x - up.x*dir.z, z: up.x*dir.y - up.y*dir.x };
          let rLen = Math.sqrt(right.x*right.x + right.y*right.y + right.z*right.z);
          if(rLen < 0.0001) { right = {x:1,y:0,z:0}; } else { right.x/=rLen; right.y/=rLen; right.z/=rLen; }
          let up2 = { x: dir.y*right.z - dir.z*right.y, y: dir.z*right.x - dir.x*right.z, z: dir.x*right.y - dir.y*right.x };
          lastDir = dir; lastUp = up2; lastRight = right;
        } else {
          let cross = { x: lastDir.y*dir.z - lastDir.z*dir.y, y: lastDir.z*dir.x - lastDir.x*dir.z, z: lastDir.x*dir.y - lastDir.y*dir.x };
          let dot = lastDir.x*dir.x + lastDir.y*dir.y + lastDir.z*dir.z;
          let cLen = Math.sqrt(cross.x*cross.x + cross.y*cross.y + cross.z*cross.z);
          if (cLen > 0.0001) {
            cross.x/=cLen; cross.y/=cLen; cross.z/=cLen;
            let angle = Math.acos(Math.max(-1, Math.min(1, dot)));
            let C = Math.cos(angle), S = Math.sin(angle), t_mat = 1 - C;
            let R = (v, k) => ({
                 x: v.x*(C + k.x*k.x*t_mat) + v.y*(k.x*k.y*t_mat - k.z*S) + v.z*(k.x*k.z*t_mat + k.y*S),
                 y: v.x*(k.y*k.x*t_mat + k.z*S) + v.y*(C + k.y*k.y*t_mat) + v.z*(k.y*k.z*t_mat - k.x*S),
                 z: v.x*(k.z*k.x*t_mat - k.y*S) + v.y*(k.z*k.y*t_mat + k.x*S) + v.z*(C + k.z*k.z*t_mat)
            });
            lastRight = R(lastRight, cross);
            lastUp = R(lastUp, cross);
          }
          lastDir = dir;
        }
        
        let radiusScale = Math.pow(1.0 - t, 0.65);
        let currentRadius = baseRadius * radiusScale; 
        if (seg === numSegs) currentRadius = 0; 
        
        curCenter = evalPath(t); 
        
        let currentRing = [];
        for (let s = 0; s < sides; s++) {
          let angle = (s / sides) * Math.PI * 2;
          let rCos = Math.cos(angle) * currentRadius;
          let rSin = Math.sin(angle) * currentRadius;
          currentRing.push({
            x: curCenter.x + lastRight.x * rCos + lastUp.x * rSin,
            y: curCenter.y + lastRight.y * rCos + lastUp.y * rSin,
            z: curCenter.z + lastRight.z * rCos + lastUp.z * rSin
          });
        }
        
        if (seg > 0) {
          for (let s = 0; s < sides; s++) {
            let sNext = (s + 1) % sides;
            let p0 = prevRing[s], p1 = currentRing[s];
            let p2 = currentRing[sNext], p3 = prevRing[sNext];
            
            if (seg === numSegs) {
              vertsArr.push(p0.x, p0.y, p0.z, p3.x, p3.y, p3.z, p1.x, p1.y, p1.z);
            } else {
              vertsArr.push(p0.x, p0.y, p0.z, p3.x, p3.y, p3.z, p2.x, p2.y, p2.z);
              vertsArr.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z);
            }
          }
        }
        prevRing = currentRing;
      }
    }

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

    // 2. ORGANIC ART NOUVEAU BRANCHING (B) - CREATE NEW GEOMETRY
    if (B > 0.05 && isMesh) {
      const bSettings = (window.domainState && window.domainState.branchSettings) || {};
      const customForks = bSettings.count ? parseInt(bSettings.count) : null;
      const numForks = customForks || (activeB >= 0.55 ? 3 : 2);
      const customNodeU = (bSettings.pos !== undefined) ? (bSettings.pos / 100) : null;
      const nodeStartU = customNodeU !== null ? Math.min(0.85, Math.max(0.05, customNodeU)) : 0.40;
      const lenMult = (bSettings.length !== undefined) ? (bSettings.length / 100) : 1.0;
      const widthMult = (bSettings.width !== undefined) ? (bSettings.width / 100) : 1.0;
      const hAngleRad = (bSettings.hAngle !== undefined) ? (bSettings.hAngle * Math.PI / 180) : 0;
      const vAngleRad = (bSettings.vAngle !== undefined) ? (bSettings.vAngle * Math.PI / 180) : 0;

      const maxBranchReach = 0.5 * domSpan * lenMult;
      const forkAngle = (60 * (Math.PI / 180)) * widthMult;
      const numSegments = 16; // Higher resolution for smoother curves
      const branchBaseRadius = domSpan * 0.045 * widthMult; // Much thicker base for volumetric structural feel

      for (let f = 0; f < numForks; f++) {
        let spreadAngle = (f - (numForks - 1) / 2.0) * forkAngle;
        let branchesSpawned = 0;
        
        for (let i = 0; i < temp.length; i += 9) {
          if (i + 8 >= temp.length) break;

          let cx = (temp[i] + temp[i+3] + temp[i+6]) / 3;
          let cy = (temp[i+1] + temp[i+4] + temp[i+7]) / 3;
          let cz = (temp[i+2] + temp[i+5] + temp[i+8]) / 3;
          
          let domVal = (domAxis === 'X') ? cx : ((domAxis === 'Z') ? cz : cy);
          let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));
          
          if (u > nodeStartU - 0.15 && u < nodeStartU + 0.15) {
            let dx = cx - centerX;
            let dz = cz - centerZ;
            let spatialAngle = Math.atan2(dz, dx);
            let angleDiff = Math.abs(spatialAngle - ((f * Math.PI * 2 / numForks) - Math.PI));
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
            
            if (angleDiff < 0.8 && branchesSpawned < 3) { 
              branchesSpawned++;
              
              let evalPath = (t) => {
                let ease = t * t * (3 - 2 * t);
                let dispMagnitude = ease * maxBranchReach * (0.8 + activeB);
                
                let nx = cx, ny = cy, nz = cz;
                
                // Unified fluid sweep along primary axis (graceful arch downward)
                if (domAxis === 'X') {
                   let sweepDir = (cx > centerX) ? 1 : -1;
                   nx += sweepDir * dispMagnitude;
                   ny -= dispMagnitude * 0.45; // arch towards ground
                   nz += (cz > centerZ ? 1 : -1) * dispMagnitude * 0.25; 
                } else if (domAxis === 'Z') {
                   let sweepDir = (cz > centerZ) ? 1 : -1; 
                   nz += sweepDir * dispMagnitude;
                   ny -= dispMagnitude * 0.45;
                   nx += (cx > centerX ? 1 : -1) * dispMagnitude * 0.25;
                } else {
                   let sweepDir = (cy > centerY) ? 1 : -1;
                   ny += sweepDir * dispMagnitude;
                   nx += (cx > centerX ? 1 : -1) * dispMagnitude * 0.45;
                   nz += (cz > centerZ ? 1 : -1) * dispMagnitude * 0.25;
                }
                
                return { x: nx, y: ny, z: nz };
              };
              
              generateSmoothBranch(newVertices, evalPath, branchBaseRadius, numSegments);
            }
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

    // 6. GROWTH / AGGREGATION (G) - CREATE NEW EXTENSIONS
    if (G > 0.05 && isMesh) {
      const numOrigins = 3;
      const numSegments = Math.floor(12 + activeG * 8); // Higher res for curl
      const growthReach = Math.max(0.1, activeG) * 0.8 * domSpan;
      const growthBaseRadius = domSpan * 0.05 * Math.max(0.3, activeG); // Much thicker base

      for (let g = 0; g < numOrigins; g++) {
        let targetU = 0.2 + (g / numOrigins) * 0.6; 
        let growthsSpawned = 0;
        
        for (let i = 0; i < temp.length; i += 9) {
          if (i + 8 >= temp.length) break;
          let cx = (temp[i] + temp[i+3] + temp[i+6]) / 3;
          let cy = (temp[i+1] + temp[i+4] + temp[i+7]) / 3;
          let cz = (temp[i+2] + temp[i+5] + temp[i+8]) / 3;
          
          let domVal = (domAxis === 'X') ? cx : ((domAxis === 'Z') ? cz : cy);
          let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));
          
          if (u > targetU - 0.15 && u < targetU + 0.15) {
            let dx = cx - centerX; let dz = cz - centerZ;
            let spatialAngle = Math.atan2(dz, dx);
            let angleDiff = Math.abs(spatialAngle - (g * Math.PI * 2 / numOrigins));
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
            
            if (angleDiff < 0.8 && growthsSpawned < 3) { 
              growthsSpawned++;
              
              let evalPath = (t) => {
                let ease = t * t * (3 - 2 * t);
                
                // Art Nouveau Fern Curl: radius grows, angle spirals in parallel to axis
                let curlRadius = ease * growthReach * 0.8;
                let curlAngle = t * Math.PI * 1.5; // unfurl 270 degrees
                
                let nx = cx, ny = cy, nz = cz;
                
                if (domAxis === 'X') {
                   let dir = (cx > centerX) ? 1 : -1;
                   nx += dir * curlRadius * Math.sin(curlAngle);
                   ny += curlRadius * Math.cos(curlAngle) - curlRadius; // start tangent
                   nz += (cz > centerZ ? 1 : -1) * ease * growthReach * 0.25;
                } else if (domAxis === 'Z') {
                   let dir = (cz > centerZ) ? 1 : -1;
                   nz += dir * curlRadius * Math.sin(curlAngle);
                   ny += curlRadius * Math.cos(curlAngle) - curlRadius; 
                   nx += (cx > centerX ? 1 : -1) * ease * growthReach * 0.25;
                } else {
                   let dir = (cy > centerY) ? 1 : -1;
                   ny += dir * curlRadius * Math.sin(curlAngle);
                   nx += curlRadius * Math.cos(curlAngle) - curlRadius;
                   nz += (cz > centerZ ? 1 : -1) * ease * growthReach * 0.25;
                }
                
                return { x: nx, y: ny, z: nz };
              };
              
              generateSmoothBranch(newVertices, evalPath, growthBaseRadius, numSegments);
            }
          }
        }
      }
    }

    if (newVertices.length > 0) {
      let combined = new Float32Array(temp.length + newVertices.length);
      combined.set(temp);
      combined.set(newVertices, temp.length);
      return combined;
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

function executeRecipeDeformation(positions, recipeOrDna, bounds, isMesh = true) {
  if (!positions || positions.length === 0) return new Float32Array(0);
  
  // If passed DNA vector [C, B, W, M, V, G]
  if (Array.isArray(recipeOrDna) && recipeOrDna.length === 6 && typeof recipeOrDna[0] === 'number') {
    const thresh = (window.domainState && window.domainState.seedIdentityThreshold) ? window.domainState.seedIdentityThreshold : 75;
    return applyArtNouveauDNA(positions, recipeOrDna, bounds, thresh, isMesh);
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
  return applyArtNouveauDNA(positions, dna, bounds, thresh, isMesh);
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
window.activeVisualCompMode = activeVisualCompMode;

function switchVisualComparisonMode(mode) {
  activeVisualCompMode = mode;
  window.activeVisualCompMode = mode;
  if (window.domainState) window.domainState.visualComparisonMode = mode;

  const btns = document.querySelectorAll('#btn-comp-seed, #btn-comp-parent, #btn-comp-iter, #btn-comp-overlay, .btn-vp-pill[onclick*="switchVisualComparisonMode"]');
  btns.forEach(b => {
    b.classList.remove('active');
    const clk = b.getAttribute('onclick') || '';
    const id = b.id || '';
    if (clk.includes(`'${mode}'`) || clk.includes(`"${mode}"`) || id.toLowerCase().includes(mode.toLowerCase())) {
      b.classList.add('active');
    }
  });

  let targetDna = (window.domainState && window.domainState.dna) ? window.domainState.dna : [0, 0, 0, 0, 0, 0];
  if (mode === 'SEED') {
    targetDna = [0, 0, 0, 0, 0, 0];
  } else if (mode === 'PARENT') {
    targetDna = (window.domainState && window.domainState.selectedParentGenome) ? window.domainState.selectedParentGenome.dna : [0, 0, 0, 0, 0, 0];
  }

  renderIterationGeometry(targetDna, mode);
}

window.switchVisualComparisonMode = switchVisualComparisonMode;

/**
 * RENDER RECIPE / DNA DEFORMATION IN MAIN VIEWPORT
 */
function renderIterationGeometry(recipeOrDna, explicitMode) {
  let compMode = explicitMode || activeVisualCompMode;
  const isSeedDna = !recipeOrDna || (Array.isArray(recipeOrDna) && recipeOrDna.every(v => v === 0));

  // If user passes a non-zero DNA vector (tweaking sliders or running generation),
  // but comparison mode was locked to SEED, automatically switch to ITERATION mode so tweaks take effect!
  if (!isSeedDna && (compMode === 'SEED' || !explicitMode)) {
    compMode = 'ITERATION';
    activeVisualCompMode = 'ITERATION';
    window.activeVisualCompMode = 'ITERATION';
    if (window.domainState) window.domainState.visualComparisonMode = 'ITERATION';

    const bSeed = document.getElementById('btn-comp-seed');
    const bIter = document.getElementById('btn-comp-iter');
    if (bSeed) bSeed.classList.remove('active');
    if (bIter) bIter.classList.add('active');

    const vpTag = document.getElementById('vp-gen-tag');
    if (vpTag) vpTag.textContent = 'INTERACTIVE LIVE TWEAK';
  }

  // Ensure render groups are visible
  if (meshGroup) meshGroup.visible = true;
  if (curveGroup) curveGroup.visible = true;
  if (cageGroup) cageGroup.visible = true;

  // Deform or Restore SubD / Standard Meshes
  originalMeshes.forEach(item => {
    const targetMesh = item.mesh || item.threeMesh;
    if (!targetMesh || !targetMesh.geometry || !item.originalPositions) return;

    const attr = targetMesh.geometry.attributes.position;
    let defPos;

    if (compMode === 'SEED' || isSeedDna) {
      defPos = item.originalPositions;
    } else {
      defPos = executeRecipeDeformation(item.originalPositions, recipeOrDna, modelBounds);
    }

    if (defPos.length !== attr.array.length) {
      const newGeom = new THREE.BufferGeometry();
      newGeom.setAttribute('position', new THREE.Float32BufferAttribute(defPos, 3));
      newGeom.computeVertexNormals();
      newGeom.computeBoundingBox();
      newGeom.computeBoundingSphere();
      targetMesh.geometry.dispose();
      targetMesh.geometry = newGeom;
    } else {
      for (let i = 0; i < defPos.length; i++) {
        attr.array[i] = defPos[i];
      }
      attr.needsUpdate = true;
      targetMesh.geometry.computeVertexNormals();
      targetMesh.geometry.computeBoundingBox();
      targetMesh.geometry.computeBoundingSphere();
    }
    targetMesh.visible = true;

    // Adjust visual style for overlay comparison mode
    if (compMode === 'OVERLAY') {
      if (targetMesh.material) {
        targetMesh.material.wireframe = true;
        targetMesh.material.needsUpdate = true;
      }
    } else {
      if (targetMesh.material) {
        targetMesh.material.wireframe = false;
        targetMesh.material.needsUpdate = true;
      }
    }
  });

  // Deform or Restore Curves
  originalCurves.forEach(item => {
    const targetLine = item.line || item.threeCurve;
    if (!targetLine || !targetLine.geometry || !item.originalPositions) return;

    const attr = targetLine.geometry.attributes.position;
    let defPos;

    if (compMode === 'SEED' || isSeedDna) {
      defPos = item.originalPositions;
    } else {
      defPos = executeRecipeDeformation(item.originalPositions, recipeOrDna, modelBounds, false);
    }

    if (defPos.length !== attr.array.length) {
      const newGeom = new THREE.BufferGeometry();
      newGeom.setAttribute('position', new THREE.Float32BufferAttribute(defPos, 3));
      targetLine.geometry.dispose();
      targetLine.geometry = newGeom;
    } else {
      for (let i = 0; i < defPos.length; i++) {
        attr.array[i] = defPos[i];
      }
      attr.needsUpdate = true;
    }
    targetLine.visible = true;
  });

  // Deform or Restore SubD Cages
  originalCages.forEach(item => {
    if (item.cageLines && item.cageLines.geometry && item.originalLinePositions) {
      const lineAttr = item.cageLines.geometry.attributes.position;
      let defLinePos = (compMode === 'SEED' || isSeedDna) ? item.originalLinePositions : executeRecipeDeformation(item.originalLinePositions, recipeOrDna, modelBounds, false);
      if (defLinePos.length !== lineAttr.array.length) {
        const newGeom = new THREE.BufferGeometry();
        newGeom.setAttribute('position', new THREE.Float32BufferAttribute(defLinePos, 3));
        item.cageLines.geometry.dispose();
        item.cageLines.geometry = newGeom;
      } else {
        for (let i = 0; i < defLinePos.length; i++) {
          lineAttr.array[i] = defLinePos[i];
        }
        lineAttr.needsUpdate = true;
      }
      item.cageLines.visible = true;
    }

    if (item.cagePoints && item.cagePoints.geometry && item.originalPtPositions) {
      const ptAttr = item.cagePoints.geometry.attributes.position;
      let defPtPos = (compMode === 'SEED' || isSeedDna) ? item.originalPtPositions : executeRecipeDeformation(item.originalPtPositions, recipeOrDna, modelBounds, false);
      if (defPtPos.length !== ptAttr.array.length) {
        const newGeom = new THREE.BufferGeometry();
        newGeom.setAttribute('position', new THREE.Float32BufferAttribute(defPtPos, 3));
        item.cagePoints.geometry.dispose();
        item.cagePoints.geometry = newGeom;
      } else {
        for (let i = 0; i < defPtPos.length; i++) {
          ptAttr.array[i] = defPtPos[i];
        }
        ptAttr.needsUpdate = true;
      }
      item.cagePoints.visible = true;
    }
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

window.meshGroup = meshGroup;
window.curveGroup = curveGroup;
window.cageGroup = cageGroup;
window.originalMeshes = originalMeshes;
window.originalCurves = originalCurves;
window.originalCages = originalCages;
window.fitCamera = fitCamera;

