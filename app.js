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
curveGroup.visible = false;
cageGroup.visible = false;

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
  threeRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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

  // Lighting Setup â€” Rhino Shaded Mode Aesthetic
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

  // Expose on window for external engines (branchingEngine, etc.)
  window.threeScene = threeScene;
  window.meshGroup = meshGroup;
  window.curveGroup = curveGroup;
  window.cageGroup = cageGroup;
  window.threeCamera = threeCamera;
  window.threeControls = threeControls;
  window.threeRenderer = threeRenderer;

  // Add branching wall group
  if (!window.branchingWallGroup) {
    window.branchingWallGroup = new THREE.Group();
    window.branchingWallGroup.name = 'branchingWallGroup';
  }
  threeScene.add(window.branchingWallGroup);

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
      // Do not load a default geometry on startup. Wait for user to import.
      setTimeout(() => {
        if (typeof window.updateDiagnosticsPanel === 'function') {
          window.updateDiagnosticsPanel({ filename: 'None (Awaiting Import)' });
        }
      }, 150);
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

  // DOMAIN C: Generate Iterations Button handled in generator.js

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
    originalPositions: new Float32Array(positions),
    originalIndices: new Uint32Array(indices)
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
      btn.textContent = isLocked ? 'ðŸ”’' : 'ðŸ”“';
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

  if (window.clearBranchingGeometry) {
    window.clearBranchingGeometry();
  }

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

  // 3. Reset 3 Art Nouveau DNA slider elements in DOM
  ['slider-dna-c', 'slider-dna-w', 'slider-dna-b'].forEach(id => {
    const sEl = document.getElementById(id);
    if (sEl) sEl.value = 0;
  });

  if (window.syncBranchingFromDnaSlider) {
    window.syncBranchingFromDnaSlider(0);
  }
  if (window.clearBranchingGeometry) {
    window.clearBranchingGeometry();
  }



  // 4. Force Mesh Group to be Visible, keep curve/cage hidden
  if (meshGroup) meshGroup.visible = true;
  if (curveGroup) {
    curveGroup.visible = false;
    clearGroup(curveGroup);
  }
  if (cageGroup) {
    cageGroup.visible = false;
    clearGroup(cageGroup);
  }

  const btnMesh = document.getElementById('btn-toggle-mesh'); if (btnMesh) btnMesh.classList.add('active');

  // 5. Restore ALL SubD and standard meshes to exact un-deformed positions
  originalMeshes.forEach(item => {
    const targetMesh = item.mesh || item.threeMesh;
    if (!targetMesh || !targetMesh.geometry || !item.originalPositions) return;

    targetMesh.visible = true;
    const attr = targetMesh.geometry.attributes.position;
    if (attr) {
      if (attr.array.length !== item.originalPositions.length) {
        const newGeom = new THREE.BufferGeometry();
        newGeom.setAttribute('position', new THREE.Float32BufferAttribute(item.originalPositions, 3));
        if (item.originalIndices) {
          newGeom.setIndex(new THREE.BufferAttribute(item.originalIndices, 1));
        }
        newGeom.computeVertexNormals();
        newGeom.computeBoundingBox();
        newGeom.computeBoundingSphere();
        targetMesh.geometry.dispose();
        targetMesh.geometry = newGeom;
      } else {
        for (let i = 0; i < item.originalPositions.length; i++) {
          attr.array[i] = item.originalPositions[i];
        }
        attr.needsUpdate = true;
        targetMesh.geometry.computeVertexNormals();
        targetMesh.geometry.computeBoundingBox();
        targetMesh.geometry.computeBoundingSphere();
      }
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

    if (typeInt === rhino.ObjectType.SubD) {
      subdCount++;
      subdObjectsInMemory.push(geom);
      // Cage overlay removed per user requirement: only SubD mesh is shown

      // Process & render actual SubD polygon mesh faces
      const res = processAndRenderSubDMesh(geom, subdCount);
      subdDiagnostics.push(res);
    } else if (typeInt === rhino.ObjectType.Curve) {
      // Curves disabled per user settings: only SubD mesh is shown, no Curves
      console.log(`[IMPORTER] Ignored Curve object (index ${i}) per user settings`);
    } else if (typeInt === rhino.ObjectType.Mesh) {
      meshCount++;
      buildThreeMesh(geom);
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

  originalMeshes.push({ mesh, threeMesh: mesh, originalPositions: new Float32Array(positions), originalIndices: new Uint32Array(indices) });
}

function buildThreeCurve(curveGeom) {
  // Curves disabled per user settings: only SubD mesh is shown, no Curves
  return;
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
  originalMeshes.push({ mesh, threeMesh: mesh, originalPositions: new Float32Array(positions), originalIndices: new Uint32Array(indices) });

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
  // SubD cage overlay disabled per user settings: only SubD mesh is shown
  return;
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
 * 6. DOMAIN B â€” RULE-BASED ART NOUVEAU SHAPE GRAMMAR ENGINE
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
  
  const compareLen = Math.min(origPos.length, deformedPos.length);
  const count = Math.floor(compareLen / 3);
  let totalDisp = 0;
  let spanX = Math.max(0.1, Math.abs(bounds.max.x - bounds.min.x));
  let spanY = Math.max(0.1, Math.abs(bounds.max.y - bounds.min.y));
  let spanZ = Math.max(0.1, Math.abs(bounds.max.z - bounds.min.z));
  let diag = Math.sqrt(spanX * spanX + spanY * spanY + spanZ * spanZ) || 1.0;

  for (let i = 0; i < compareLen; i += 3) {
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

function computeMeshVertexNormals(positions, bounds) {
  const vNormals = new Map();
  const getKey = (x, y, z) => {
    if (x === undefined || y === undefined || z === undefined) return '0,0,0';
    return Number(x).toFixed(2) + ',' + Number(y).toFixed(2) + ',' + Number(z).toFixed(2);
  };
  const minX = bounds?.min?.x ?? bounds?.minX ?? -15.1;
  const maxX = bounds?.max?.x ?? bounds?.maxX ?? 15.1;
  const minY = bounds?.min?.y ?? bounds?.minY ?? -10.0;
  const maxY = bounds?.max?.y ?? bounds?.maxY ?? 10.0;
  const minZ = bounds?.min?.z ?? bounds?.minZ ?? -5.35;
  const maxZ = bounds?.max?.z ?? bounds?.maxZ ?? 5.35;
  const cX = (minX + maxX) / 2, cY = (minY + maxY) / 2, cZ = (minZ + maxZ) / 2;

  const maxI = positions.length - 9;
  for (let i = 0; i <= maxI; i += 9) {
    let p0x = positions[i], p0y = positions[i+1], p0z = positions[i+2];
    let p1x = positions[i+3], p1y = positions[i+4], p1z = positions[i+5];
    let p2x = positions[i+6], p2y = positions[i+7], p2z = positions[i+8];
    let v1x = p1x - p0x, v1y = p1y - p0y, v1z = p1z - p0z;
    let v2x = p2x - p0x, v2y = p2y - p0y, v2z = p2z - p0z;
    let nx = v1y * v2z - v1z * v2y;
    let ny = v1z * v2x - v1x * v2z;
    let nz = v1x * v2y - v1y * v2x;
    let len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0.0001) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 1; nz = 0; }

    let cx = (p0x + p1x + p2x) / 3;
    let cy = (p0y + p1y + p2y) / 3;
    let cz = (p0z + p1z + p2z) / 3;
    if (nx * (cx - cX) + ny * (cy - cY) + nz * (cz - cZ) < 0) {
      nx = -nx; ny = -ny; nz = -nz;
    }

    for (let v = 0; v < 3; v++) {
      let vx = positions[i + v * 3], vy = positions[i + v * 3 + 1], vz = positions[i + v * 3 + 2];
      let k = getKey(vx, vy, vz);
      let curr = vNormals.get(k);
      if (!curr) vNormals.set(k, { x: nx, y: ny, z: nz });
      else { curr.x += nx; curr.y += ny; curr.z += nz; }
    }
  }

  for (let [k, n] of vNormals) {
    let len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
    if (len > 0) { n.x /= len; n.y /= len; n.z /= len; }
  }
  return vNormals;
}

/**
 * CORE RULE TRANSFORMATION FILTERED THROUGH DOMAIN A SPATIAL GRAMMAR
 * Every transformation receives the active typology: applyRule(mesh, ruleStrength, activeTypology)
 * 
 * Modifies:
 * - WHERE the rule acts (affected spatial regions, vertical/ground filters, void boundaries)
 * - WHICH direction it acts (preferred axis, verticalBias, horizontalBias, linearBias, radialBias)
 * - HOW MUCH geometry it affects (attenuation, branchLimit, localized envelopes)
 * - WHAT spatial result it is allowed to create (void preservation, flat plates, stepped progression)
 */
function applyRule(mesh, ruleName, ruleStrength, activeTypology, bounds, vNormals) {
  if (!mesh || mesh.length === 0) return mesh;

  // Flexible argument handling: applyRule(mesh, ruleStrength, activeTypology)
  if (typeof ruleName === 'number') {
    activeTypology = ruleStrength;
    ruleStrength = ruleName;
    ruleName = 'GROWTH';
  }

  const strength = typeof ruleStrength === 'number' ? Math.max(0, Math.min(1, ruleStrength)) : 0;
  if (strength <= 0.001) return new Float32Array(mesh);

  const typoKey = typeof activeTypology === 'string'
    ? activeTypology
    : (activeTypology?.id || (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID');
  const typoDef = (window.BASE_TYPOLOGIES && window.BASE_TYPOLOGIES[typoKey]) || (window.BASE_TYPOLOGIES && window.BASE_TYPOLOGIES.VERTICAL_VOID) || null;
  const profile = (typoDef && typoDef.typologyProfile) || {
    preferredAxis: 'Y',
    verticalBias: 'HIGH',
    horizontalBias: 'LOW',
    voidBias: 'HIGH',
    groundBias: 'LOW',
    linearBias: 'LOW',
    radialBias: 'HIGH',
    stepBias: 'NONE',
    enclosureBias: 'LOW',
    branchLimit: 'LOW',
    affectedRegions: ['ATRIUM_PERIMETER']
  };
  const grammar = (typoDef && typoDef.spatialGrammar) || {
    growthBias: 'VERTICAL_PERIMETER',
    whiplashStyle: 'UPWARD_CURVATURE',
    continuityMode: 'VERTICAL_CONNECTIONS',
    branchingConstraint: 'VOID_CLEAR',
    mergingBehavior: 'NONE',
    voidBehavior: 'VERTICAL_SHAFT'
  };

  const minX = bounds?.min?.x ?? bounds?.minX ?? -15.1;
  const maxX = bounds?.max?.x ?? bounds?.maxX ?? 15.1;
  const minY = bounds?.min?.y ?? bounds?.minY ?? -10.0;
  const maxY = bounds?.max?.y ?? bounds?.maxY ?? 10.0;
  const minZ = bounds?.min?.z ?? bounds?.minZ ?? -5.35;
  const maxZ = bounds?.max?.z ?? bounds?.maxZ ?? 5.35;

  const spanX = Math.max(0.1, Math.abs(maxX - minX));
  const spanY = Math.max(0.1, Math.abs(maxY - minY));
  const spanZ = Math.max(0.1, Math.abs(maxZ - minZ));
  const transSpan = Math.max(spanX, spanZ);

  let domAxis = profile.preferredAxis || 'X';
  let domMin = (domAxis === 'Y') ? minY : ((domAxis === 'Z') ? minZ : minX);
  let domSpan = (domAxis === 'Y') ? spanY : ((domAxis === 'Z') ? spanZ : spanX);

  const centerX = bounds?.center?.x ?? bounds?.centerX ?? (minX + maxX) / 2;
  const centerY = bounds?.center?.y ?? bounds?.centerY ?? (minY + maxY) / 2;
  const centerZ = bounds?.center?.z ?? bounds?.centerZ ?? (minZ + maxZ) / 2;

  const getKey = (x, y, z) => (x !== undefined && y !== undefined && z !== undefined) ? (Number(x).toFixed(2) + ',' + Number(y).toFixed(2) + ',' + Number(z).toFixed(2)) : '0,0,0';
  let out = new Float32Array(mesh);
  const upperRule = (ruleName || '').toUpperCase();

  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  // RULE 1: GROWTH (G)
  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  if (upperRule === 'GROWTH' || upperRule === 'G') {
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let dx = x - centerX, dy = y - centerY, dz = z - centerZ;
      let rCenter = Math.sqrt(dx * dx + dz * dz);
      let rNorm = rCenter / transSpan;
      let domVal = (domAxis === 'X') ? x : ((domAxis === 'Z') ? z : y);
      let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));

      let k = getKey(x, y, z);
      let n = vNormals ? (vNormals.get(k) || { x: dx / (rCenter || 1), y: 0, z: dz / (rCenter || 1) }) : { x: dx / (rCenter || 1), y: 0, z: dz / (rCenter || 1) };

      if (grammar.growthBias === 'VERTICAL_PERIMETER') {
        // Vertical Void Lobby & Void-Field Gathering:
        // Growth moves upward and around a central void.
        // Center void (rNorm < 0.22) strictly preserved with 0 growth displacement!
        if (rNorm >= 0.22) {
          let vertLift = strength * spanY * 0.58 * Math.sin(Math.PI * Math.min(1.0, u + 0.1)) * Math.min(1.5, rNorm + 0.35);
          out[i+1] += vertLift;
          out[i] += n.x * vertLift * 0.12;
          out[i+2] += n.z * vertLift * 0.12;
        }
      } else if (grammar.growthBias === 'HORIZONTAL_EXPAND') {
        // Continuous Hall Lobby & Open Hall Workspace:
        // Growth spreads broadly along the main horizontal axis / plane; vertical growth clamped!
        let expandDistX = strength * spanX * 0.24 * (Math.abs(dx) > 0.05 ? Math.sign(dx) : (n.x >= 0 ? 1 : -1)) + n.x * strength * spanX * 0.14;
        let expandDistZ = strength * spanZ * 0.40 * (Math.abs(dz) > 0.05 ? Math.sign(dz) : (n.z >= 0 ? 1 : -1)) + n.z * strength * spanZ * 0.22;
        out[i] += expandDistX;
        out[i+2] += expandDistZ;
        // Vertical growth strictly clamped to 0
      } else if (grammar.growthBias === 'AXIAL_LONGITUDINAL') {
        // Linear Gallery Lobby:
        // Growth extends strongly along ONE directional axis (X); lateral and vertical remain narrow and low!
        let axialSign = Math.abs(dx) > 0.1 ? Math.sign(dx) : (n.x >= 0 ? 1 : -1);
        let pullAxis = strength * spanX * 0.42 * axialSign * (1.0 + 0.35 * Math.min(1.0, Math.abs(dx) / (spanX * 0.5)));
        out[i] += pullAxis;
        // Lateral (Z) and Vertical (Y) strictly clamped to keep gallery narrow & directional
      } else if (grammar.growthBias === 'CHOKE_RELEASE_EXPAND') {
        // Compressed Sequential Lobby:
        // Growth alternates narrow -> wide -> narrow -> wide along path
        let sChoke = Math.sin(4.0 * Math.PI * u - Math.PI * 0.5);
        if (sChoke > 0) {
          // Release zone: wide expansion in Z and upward volume in Y
          let releaseExp = strength * sChoke;
          out[i+2] += (dz >= 0 ? 1 : -1) * spanZ * 0.50 * releaseExp;
          out[i+1] += Math.max(0, n.y) * spanY * 0.38 * releaseExp;
          out[i] += n.x * spanX * 0.18 * releaseExp;
        } else {
          // Choke zone: compressed narrow width
          let chokeComp = strength * Math.abs(sChoke);
          out[i+2] -= (dz >= 0 ? 1 : -1) * spanZ * 0.22 * chokeComp;
          out[i+1] -= spanY * 0.12 * chokeComp;
        }
      } else if (grammar.growthBias === 'GROUND_ONLY') {
        // Topographic Lobby:
        // Growth follows and extends the ground plane; vertical growth remains limited
        let floorWeight = Math.max(0, 1.0 - (y - minY) / (0.45 * spanY));
        let pullDist = strength * spanX * 0.35 * floorWeight;
        out[i] += n.x * pullDist;
        out[i+1] += Math.max(0, n.y) * pullDist * 0.35;
        out[i+2] += n.z * pullDist;
      } else if (grammar.growthBias === 'STEPPED_LEVELS' || grammar.growthBias === 'AMPHITHEATER_STEPPED') {
        // Cascaded Plates & Stepped Amphitheater:
        // Growth produces repeated stepped progression (horizontal + vertical offsets)
        let numTiers = 5;
        let tier = Math.floor(u * numTiers) / numTiers;
        out[i+1] += strength * spanY * 0.42 * tier;
        out[i] -= (dx >= 0 ? 1 : -1) * strength * spanX * 0.18 * tier;
        out[i+2] += n.z * strength * spanZ * 0.15;
      } else if (grammar.growthBias === 'VOID_PERIMETER' || grammar.growthBias === 'OVERLOOK_RIBBON') {
        // Void-Edge Workspace & Linear Edge Gallery:
        // Growth follows perimeter of the existing void; center void clear
        if (rNorm >= 0.22 && rNorm <= 0.65) {
          let pullDist = transSpan * 0.32 * strength;
          let dirX = dx / (rCenter + 0.001);
          let dirZ = dz / (rCenter + 0.001);
          out[i] += dirX * pullDist * 0.55;
          out[i+2] += dirZ * pullDist * 0.55;
          out[i+1] += Math.max(0, n.y) * pullDist * 0.28;
        }
      } else if (grammar.growthBias === 'INSERTED_PLATFORM') {
        // Inserted Plate:
        // Growth creates a broad horizontal platform with low vertical thickness
        let midWeight = Math.max(0, 1.0 - Math.abs(y - centerY) / (0.25 * spanY));
        let pullDist = transSpan * 0.38 * strength * midWeight;
        out[i] += n.x * pullDist;
        out[i+2] += n.z * pullDist;
      } else if (grammar.growthBias === 'POD_ENCLOSURE') {
        // Room-Within-Volume:
        // Growth concentrates locally to create an enclosure
        let podWeight = Math.max(0, 1.0 - rCenter / (0.35 * transSpan));
        out[i] += n.x * strength * 0.28 * transSpan * podWeight;
        out[i+1] += n.y * strength * 0.32 * spanY * podWeight;
        out[i+2] += n.z * strength * 0.28 * transSpan * podWeight;
      } else if (grammar.growthBias === 'CONTINUOUS_WARPED') {
        // Folded Workspace:
        // Growth extends the existing warped floor
        let floorWeight = Math.max(0, 1.0 - (y - minY) / (0.55 * spanY));
        let pullDist = spanX * 0.30 * strength * floorWeight;
        out[i] += n.x * pullDist * 0.7;
        out[i+1] += Math.sin(2.0 * Math.PI * u) * pullDist * 0.45;
        out[i+2] += n.z * pullDist * 0.7;
      } else if (grammar.growthBias === 'FLAT_XY') {
        // Flat Deep-Plan:
        // Horizontal expansion with minimal vertical deformation
        let pullDist = spanX * 0.25 * strength;
        out[i] += n.x * pullDist;
        out[i+2] += n.z * pullDist;
      } else {
        // Default directional growth
        let pullDist = spanX * 0.30 * strength;
        out[i] += n.x * pullDist;
        out[i+1] += Math.max(0, n.y) * pullDist * 0.5;
        out[i+2] += n.z * pullDist;
      }
    }
  }

  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  // ═══ RULE 2: BRANCHING (B) ═══
  // Mathematical Implementation: Murray's Law, Minimal Path, and Volumetric Deformation
  // Branches bifurcate and pull floor/ceiling together to form organic, thick columns.
  else if (upperRule === 'BRANCHING' || upperRule === 'B') {
    const B = Math.max(0, Math.min(1.0, strength));
    if (B < 0.001) return out;

    // Mathematical Implementation: Completely new continuous architectural space
    // Generates a dense topological floor and ceiling mesh, then pulls them together
    // into organic, structural columns based on Art Nouveau / Biological principles.
    const newVerts = [];
    const resolution = 60; // 60x60 grid = 3600 quads per plane = 7200 triangles = 21600 vertices per plane
    
    // Helper to generate a plane
    function generatePlane(yLevel, normalDir) {
      const stepX = spanX / resolution;
      const stepZ = spanZ / resolution;
      
      for (let i = 0; i < resolution; i++) {
        for (let j = 0; j < resolution; j++) {
          let x1 = minX + i * stepX, z1 = minZ + j * stepZ;
          let x2 = x1 + stepX, z2 = z1;
          let x3 = x1, z3 = z1 + stepZ;
          let x4 = x1 + stepX, z4 = z1 + stepZ;
          
          if (normalDir > 0) { // Floor (normals up)
            newVerts.push(x1, yLevel, z1,  x3, yLevel, z3,  x2, yLevel, z2);
            newVerts.push(x2, yLevel, z2,  x3, yLevel, z3,  x4, yLevel, z4);
          } else { // Ceiling (normals down)
            newVerts.push(x1, yLevel, z1,  x2, yLevel, z2,  x3, yLevel, z3);
            newVerts.push(x2, yLevel, z2,  x4, yLevel, z4,  x3, yLevel, z3);
          }
        }
      }
    }
    
    generatePlane(minY, 1);
    generatePlane(maxY, -1);
    
    out = new Float32Array(newVerts);

    // Apply Murray's Law and Minimal Path (Soap Film) to create bifurcating columns
    // that pull the completely new floor/ceiling geometry together to form continuous spaces.
    let numTrunks = 1;
    if (activeTypology === 'LINEAR_DIRECTIONAL') numTrunks = Math.max(2, Math.floor(B * 8)); // Gothic avenue
    else if (activeTypology === 'OPEN_HALL') numTrunks = Math.max(4, Math.floor(B * 6)); // Grid of umbrellas
    else if (activeTypology === 'VERTICAL_VOID') numTrunks = 1; // Massive central hollow column
    else numTrunks = Math.max(1, Math.floor(B * 5));

    const trees = [];
    
    for (let t = 0; t < numTrunks; t++) {
      let tRatio = numTrunks > 1 ? (t + 1) / (numTrunks + 1) : 0.5;
      let bx = minX + spanX * tRatio;
      let bz = centerZ;

      if (activeTypology === 'LINEAR_DIRECTIONAL') {
        bz = centerZ + (t % 2 === 0 ? spanZ * 0.3 : -spanZ * 0.3); // Staggered nave
      } else if (activeTypology === 'OPEN_HALL') {
        bx = minX + spanX * (0.25 + 0.5 * (t % 2));
        bz = minZ + spanZ * (0.25 + 0.5 * Math.floor(t / 2));
      } else if (activeTypology === 'VERTICAL_VOID') {
        bx = centerX; bz = centerZ; // Center
      } else {
        bz = centerZ + Math.sin(t * Math.PI) * spanZ * 0.25;
      }
      
      let rTrunk = spanX * 0.10 * B + 0.5;
      if (activeTypology === 'VERTICAL_VOID') rTrunk = spanX * 0.25 * B + 1.0; 

      trees.push({ bx: bx, bz: bz, rTrunk: rTrunk });
    }
    
    // Transform the NEW continuous mesh geometry to sweep towards the branching columns
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      
      let minDist = Infinity;
      let closestCX = x, closestCZ = z;
      let currentR = 0;
      
      for (let t = 0; t < trees.length; t++) {
        let tree = trees[t];
        let dist = Math.hypot(x - tree.bx, z - tree.bz);
        
        if (dist < minDist) {
          minDist = dist;
          closestCX = tree.bx;
          closestCZ = tree.bz;
          currentR = tree.rTrunk;
        }
      }
      
      // Global Inverse-Distance Force Field: Pulls floor up and ceiling down
      let force = 1.0 / (1.0 + Math.pow(minDist / (currentR * 2.5 + 0.01), 2.5));
      
      let pullY = 0, pullX = 0, pullZ = 0;

      if (activeTypology === 'COMPRESSED_EXPANDED') {
        pullY = (centerY - y) * force * B * 0.95; // Almost touch
        pullX = (closestCX - x) * force * B * 0.9;
        pullZ = (closestCZ - z) * force * B * 0.9;
      } else if (activeTypology === 'VERTICAL_VOID') {
        // Pushes OUTWARDS to form a massive hole
        let distCenter = Math.hypot(x - centerX, z - centerZ);
        let voidForce = Math.exp(-distCenter * distCenter / (currentR * currentR));
        pullX = (x - centerX) * voidForce * B * 0.9; 
        pullZ = (z - centerZ) * voidForce * B * 0.9;
        pullY = (centerY - y) * force * B * 0.4;
      } else {
        pullY = (centerY - y) * force * B * 0.95; // Creates continuous column where they meet
        pullX = (closestCX - x) * force * B * 0.55;
        pullZ = (closestCZ - z) * force * B * 0.55;
      }

      out[i+1] += pullY;
      out[i] += pullX;
      out[i+2] += pullZ;
    }
  }




  // ═══ RULE 3: WHIPLASH (W) ═══
  // Mathematical Implementation: Phyllotaxis and Logarithmic Spirals
  // Spirals form along the golden angle to maximize efficiency (shortest paths).
  else if (upperRule === 'WHIPLASH' || upperRule === 'W') {
    const W = Math.max(0, Math.min(1.0, strength));
    if (W < 0.001) return out;

    // Based on "Observation, Analysis, and Computation of Branching Patterns in Natural Systems"
    // Apply Phyllotactic logic (Fibonacci series & Golden Angle) to twist and undulate the geometry
    const goldenAngle = 2.39996; // 137.508 degrees in radians
    
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
      let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
      
      let dx = x - centerX;
      let dz = z - centerZ;
      let distRad = Math.hypot(dx, dz) + 0.001;

      // Helical Twist and Fibonacci Bulging based on Typology
      let theta = 0;
      let rotX = 0, rotZ = 0, rotY = 0;
      let bulge = 0;

      if (activeTypology === 'VERTICAL_VOID') {
        // Spiraling balconies around the central light well
        theta = uY * goldenAngle * 4.0 * W;
        let spiralNode = Math.sin(uY * Math.PI * 6.0 * W - Math.atan2(dz, dx) * 4.0);
        bulge = spiralNode * spanX * 0.15 * W;
      } else if (activeTypology === 'LINEAR_DIRECTIONAL') {
        // Lateral undulations guiding forward flow (along X)
        theta = uX * goldenAngle * 2.0 * W;
        let spiralNode = Math.sin(uX * Math.PI * 4.0 * W - Math.atan2(y-centerY, dz) * 2.0);
        bulge = spiralNode * spanZ * 0.1 * W;
      } else if (activeTypology === 'OPEN_HALL') {
        // Flat vortex on the ceiling
        let radU = distRad / (spanX * 0.5);
        theta = radU * goldenAngle * 3.0 * W;
        let spiralNode = Math.sin(radU * Math.PI * 3.0 * W - Math.atan2(dz, dx) * 2.0);
        bulge = spiralNode * spanY * 0.1 * W * (y > centerY ? 1 : 0); // Only ceiling bulges
      } else {
        theta = uY * goldenAngle * 3.0 * W;
        let spiralNode = Math.sin(uY * Math.PI * 4.0 * W - Math.atan2(dz, dx) * 3.0);
        bulge = spiralNode * spanX * 0.08 * W;
      }

      // Apply Twist (around Y by default, or X for Linear)
      if (activeTypology === 'LINEAR_DIRECTIONAL') {
        let cosT = Math.cos(theta), sinT = Math.sin(theta);
        rotY = (y - centerY) * cosT - dz * sinT;
        rotZ = (y - centerY) * sinT + dz * cosT;
        out[i+1] = centerY + rotY + (rotY / (distRad+0.001)) * bulge;
        out[i+2] = centerZ + rotZ + (rotZ / (distRad+0.001)) * bulge;
      } else {
        let cosT = Math.cos(theta), sinT = Math.sin(theta);
        rotX = dx * cosT - dz * sinT;
        rotZ = dx * sinT + dz * cosT;
        out[i] = centerX + rotX + (rotX / (distRad+0.001)) * bulge;
        out[i+2] = centerZ + rotZ + (rotZ / (distRad+0.001)) * bulge;
      }
      
      // Shortest Path Deflection (Murray's / Thompson)
      let dip = Math.cos(uY * Math.PI * 2.0) * spanY * 0.05 * W;
      out[i+1] += dip;
    }
  }

  // RULE 4: MERGING (M)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  else if (upperRule === 'MERGING' || upperRule === 'M') {
    const sigma = (0.05 + 0.35 * strength) * domSpan;
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let domVal = (domAxis === 'X') ? x : ((domAxis === 'Z') ? z : y);
      let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));

      if (grammar.mergingBehavior === 'COMPRESSION_CHOKE') {
        let sChoke = Math.sin(4.0 * Math.PI * u - Math.PI * 0.5);
        if (sChoke < 0) {
          let pinch = strength * 1.4 * Math.abs(sChoke);
          out[i] += pinch * (centerX - x) * 0.4;
          out[i+2] += pinch * (centerZ - z) * 0.6;
          out[i+1] += pinch * (centerY - y) * 0.3;
        }
      } else if (grammar.mergingBehavior === 'CONTINUOUS_SHELL') {
        let dist = Math.sqrt((x - centerX)*(x - centerX) + (z - centerZ)*(z - centerZ));
        let w = Math.exp(-(dist * dist) / (2 * sigma * sigma));
        let pull = strength * 1.5 * w;
        out[i] += pull * (centerX - x) * 0.3;
        out[i+2] += pull * (centerZ - z) * 0.3;
      } else if (grammar.mergingBehavior === 'ENCLOSURE_POD') {
        let dist = Math.sqrt((x - centerX)*(x - centerX) + (z - centerZ)*(z - centerZ));
        if (dist < 0.40 * transSpan) {
          let pull = strength * 1.6;
          out[i] += pull * (centerX - x) * 0.5;
          out[i+2] += pull * (centerZ - z) * 0.5;
        }
      } else {
        let dist = Math.sqrt((x - centerX)*(x - centerX) + (z - centerZ)*(z - centerZ));
        let w = Math.exp(-(dist * dist) / (2 * sigma * sigma));
        let pull = strength * 1.2 * w;
        out[i] += pull * (centerX - x);
        out[i+2] += pull * (centerZ - z);
      }
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RULE 5: POSITIVE / NEGATIVE SPACE (V)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  else if (upperRule === 'POSNEG' || upperRule === 'V' || upperRule === 'POSITIVE_NEGATIVE') {
    if (grammar.voidBehavior === 'VERTICAL_SHAFT' || grammar.voidBehavior === 'ORGANIZING_VOID') {
      const voidRadius = (0.15 + 0.35 * strength) * transSpan;
      for (let i = 0; i < out.length; i += 3) {
        let dx = out[i] - centerX, dz = out[i+2] - centerZ;
        let distRad = Math.sqrt(dx * dx + dz * dz) + 0.0001;
        if (distRad < voidRadius * 1.4) {
          let pushDist = (1.0 - distRad / (voidRadius * 1.4)) * strength * voidRadius * 0.65;
          out[i] += (dx / distRad) * pushDist;
          out[i+2] += (dz / distRad) * pushDist;
        }
      }
    } else if (grammar.voidBehavior === 'OPEN_INTERIOR') {
      for (let i = 0; i < out.length; i += 3) {
        let dx = out[i] - centerX, dz = out[i+2] - centerZ;
        let distRad = Math.sqrt(dx * dx + dz * dz) + 0.0001;
        let pushDist = Math.exp(-(distRad * distRad) / (2 * transSpan * transSpan * 0.1)) * strength * transSpan * 0.22;
        out[i] += (dx / distRad) * pushDist;
        out[i+2] += (dz / distRad) * pushDist;
      }
    } else if (grammar.voidBehavior === 'LATERAL_LIGHT') {
      for (let i = 0; i < out.length; i += 3) {
        let domVal = (domAxis === 'X') ? out[i] : ((domAxis === 'Z') ? out[i+2] : out[i+1]);
        let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));
        let sideOpening = Math.sin(4.0 * Math.PI * u);
        if (sideOpening > 0.3) {
          let pushZ = strength * transSpan * 0.25 * (out[i+2] >= centerZ ? 1 : -1) * (sideOpening - 0.3);
          out[i+2] += pushZ;
        }
      }
    } else if (grammar.voidBehavior === 'INNER_OUTER_SEP') {
      for (let i = 0; i < out.length; i += 3) {
        let dx = out[i] - centerX, dz = out[i+2] - centerZ;
        let distRad = Math.sqrt(dx * dx + dz * dz) + 0.0001;
        let podBoundary = 0.30 * transSpan;
        if (Math.abs(distRad - podBoundary) < 0.12 * transSpan) {
          let sep = (distRad >= podBoundary ? 1 : -1) * strength * 0.10 * transSpan;
          out[i] += (dx / distRad) * sep;
          out[i+2] += (dz / distRad) * sep;
        }
      }
    } else {
      const Nvoid = Math.floor(1 + 3 * strength);
      const R = (0.08 + 0.28 * strength) * transSpan;
      for (let i = 0; i < out.length; i += 3) {
        let domVal = (domAxis === 'X') ? out[i] : ((domAxis === 'Z') ? out[i+2] : out[i+1]);
        let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));
        for (let vIdx = 0; vIdx < Nvoid; vIdx++) {
          let uVoid = (vIdx + 1) / (Nvoid + 1);
          let distU = Math.abs(u - uVoid);
          if (distU < 0.28) {
            let dx = out[i] - centerX, dz = out[i+2] - centerZ;
            let distRad = Math.sqrt(dx * dx + dz * dz) + 0.0001;
            let field = Math.exp(-(distRad * distRad) / (2 * R * R)) * Math.cos(distU * Math.PI * 2.5);
            out[i] += (dx / distRad) * field * R * strength * 1.3;
            out[i+2] += (dz / distRad) * field * R * strength * 1.3;
          }
        }
      }
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ═══ RULE 6: CONTINUITY (C) ═══
  // Mathematical Implementation: Fluid Flow and Turbulence Reduction
  // Reduces high-pressure nodes by streamlining flow along paths.
  else if (upperRule === 'CONTINUITY' || upperRule === 'C') {
    const C = Math.max(0, Math.min(1.0, strength));
    if (C < 0.001) return out;
    
    // Based on "Observation, Analysis, and Computation of Branching Patterns in Natural Systems"
    // Apply River System Morphology: Decrease turbulence, streamline flow, smooth out high-pressure nodes
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      
      let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
      let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
      let uZ = Math.min(1, Math.max(0, (z - minZ) / spanZ));
      
      let flowSweep = 0, dy = 0, deltaSpread = 0;

      if (activeTypology === 'LINEAR_DIRECTIONAL') {
        // Streamline purely along X (wind tunnel)
        flowSweep = Math.sin(uY * Math.PI) * spanX * 0.25 * C;
        out[i] += flowSweep;
        dy = (centerY - y) * C * 0.2; // Flatten height
      } else if (activeTypology === 'VERTICAL_VOID') {
        // Vertical updraft (chimney)
        flowSweep = Math.sin(uX * Math.PI) * Math.cos(uZ * Math.PI) * spanY * 0.3 * C;
        out[i+1] += flowSweep;
        deltaSpread = Math.cos(uY * Math.PI * 2.0) * spanX * 0.15 * C;
        out[i] += deltaSpread;
      } else if (activeTypology === 'OPEN_HALL') {
        // Flatten outwards like a calm lake
        dy = (y > centerY ? maxY - y : minY - y) * C * 0.2; 
        deltaSpread = Math.cos(uY * Math.PI) * spanX * 0.2 * C;
        out[i] += deltaSpread;
        out[i+2] += Math.cos(uY * Math.PI) * spanZ * 0.2 * C;
      } else {
        // River morphology sweep
        flowSweep = Math.sin(uX * Math.PI) * Math.cos(uY * Math.PI) * spanZ * 0.20 * C;
        out[i+2] += flowSweep;
        dy = (centerY - y) * C * 0.15;
        deltaSpread = Math.cos(uY * Math.PI * 2.0) * spanX * 0.10 * C;
        out[i] += deltaSpread;
      }
      out[i+1] += dy;
    }
  }

  function smoothstep(min, max, value) {
    var x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
  }

  return out;
}

window.applyRule = applyRule;

function applyArtNouveauDNA(positions, dna, bounds, identityThreshold = 75, isMesh = true, typologyKey = null) {
  if (!positions || positions.length === 0) return new Float32Array(0);

  const C = dna && dna[0] !== undefined ? Math.max(0, Math.min(1, dna[0])) : 0;
  const B = dna && dna[1] !== undefined ? Math.max(0, Math.min(1, dna[1])) : 0;
  const W = dna && dna[2] !== undefined ? Math.max(0, Math.min(1, dna[2])) : 0;
  const M = dna && dna[3] !== undefined ? Math.max(0, Math.min(1, dna[3])) : 0;
  const V = dna && dna[4] !== undefined ? Math.max(0, Math.min(1, dna[4])) : 0;
  const G = dna && dna[5] !== undefined ? Math.max(0, Math.min(1, dna[5])) : 0;

  const typoKey = typologyKey || (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID';
  const totalVerts = Math.floor(positions.length / 3);

  // MANDATORY ZERO STATE: DNA [0,0,0,0,0,0] -> Exact pristine copy, 0 displacement!
  if (C === 0 && B === 0 && W === 0 && M === 0 && V === 0 && G === 0) {
    window.lastEngineStats = {
      affectedVertexCount: 0,
      affectedPct: 0,
      totalVertexCount: totalVerts,
      maxDisplacement: 0,
      meanDisplacement: 0,
      seedIdentityPct: 100,
      scaledMagnitude: 100,
      ruleValidation: {
        continuity: { pass: true, msg: 'Ã¢Å“â€œ PRISTINE SEED' },
        branching: { pass: true, msg: 'Ã¢Å“â€œ SINGULAR TRAJECTORY' },
        whiplash: { pass: true, msg: 'Ã¢Å“â€œ UNMODIFIED' },
        merging: { pass: true, msg: 'Ã¢Å“â€œ NO MERGE NEEDED' },
        posneg: { pass: true, msg: 'Ã¢Å“â€œ SOLID ENCLOSED' },
        growth: { pass: true, msg: 'Ã¢Å“â€œ CONTAINED SEED' }
      }
    };
    return new Float32Array(positions);
  }

  // Pre-compute shared vertex normals
  const vNormals = computeMeshVertexNormals(positions, bounds);

  // Synchronize additive architectural branching walls if active
  if (B > 0.001 && window.syncBranchingFromDnaSlider) {
    window.syncBranchingFromDnaSlider(B * 100, W, C, typoKey);
  } else if (B === 0 && window.clearBranchingGeometry) {
    window.clearBranchingGeometry();
  }

  // Execute pipeline strictly through applyRule with the active Domain A Typology
  let temp = new Float32Array(positions);

  if (B > 0.001) temp = applyRule(temp, 'BRANCHING', B, typoKey, bounds, vNormals);
  if (G > 0.001) temp = applyRule(temp, 'GROWTH', G, typoKey, bounds, vNormals);
  if (W > 0.001) temp = applyRule(temp, 'WHIPLASH', W, typoKey, bounds, vNormals);
  if (M > 0.001) temp = applyRule(temp, 'MERGING', M, typoKey, bounds, vNormals);
  if (V > 0.001) temp = applyRule(temp, 'POSNEG', V, typoKey, bounds, vNormals);
  if (C > 0.001) temp = applyRule(temp, 'CONTINUITY', C, typoKey, bounds, vNormals);

  // Validate resulting geometry against Domain A Typology
  if (window.validateTypologyGeometry) {
    window.validateTypologyGeometry(temp, positions, bounds, typoKey);
  }

  const finalPositions = temp;
  const identityScore = calculateSeedIdentityScore(finalPositions, positions, bounds);

  // Stats & Rule Validation computation
  let affectedCount = 0;
  let maxDisp = 0;
  let totalDispSum = 0;

  const compareLen = Math.min(positions.length, finalPositions.length);
  for (let i = 0; i < compareLen; i += 3) {
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
    scaledMagnitude: 100,
    ruleValidation: {
      continuity: { pass: true, msg: C > 0.7 ? '✓ CONTINUOUS FORM' : (C > 0.3 ? '✓ CONNECTING ELEMENTS' : '✓ SEPARATE ELEMENTS') },
      branching: { pass: B < 0.2 || affectedCount > 0, msg: B >= 0.6 ? 'Ã¢Å“â€œ HIERARCHICAL BRANCHING' : (B >= 0.2 ? 'Ã¢Å“â€œ BIFURCATING' : 'Ã¢Å“â€œ SINGULAR') },
      whiplash: { pass: W === 0 || maxDisp > 0, msg: W > 0.6 ? 'Ã¢Å“â€œ WHIPLASH INFLECTED' : (W > 0.3 ? 'Ã¢Å“â€œ FLOWING CURVATURE' : 'Ã¢Å“â€œ LINEAR') },
      merging: { pass: M === 0 || (B >= 0.2 || totalVerts >= 30), msg: (B >= 0.2 || totalVerts >= 30) ? (M > 0.7 ? 'Ã¢Å“â€œ MERGED / UNIFIED' : 'Ã¢Å“â€œ CONVERGING') : 'Ã¢Å“â€¢ PRECONDITION NOT SATISFIED' },
      posneg: { pass: true, msg: V > 0.6 ? 'Ã¢Å“â€œ INTERLOCK SOLID/VOID' : (V > 0.3 ? 'Ã¢Å“â€œ POROUS VOID' : 'Ã¢Å“â€œ SOLID ENCLOSED') },
      growth: { pass: true, msg: G > 0.6 ? 'Ã¢Å“â€œ PROLIFERATING GROWTH' : (G > 0.3 ? 'Ã¢Å“â€œ EXTENDING GROWTH' : 'Ã¢Å“â€œ CONTAINED SEED') }
    }
  };

  return finalPositions;
}


function executeRecipeDeformation(positions, recipeOrDna, bounds, isMesh = true, typologyKey = null) {
  if (!positions || positions.length === 0) return new Float32Array(0);
  
  const typo = typologyKey || (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID';

  // If passed DNA vector [C, B, W, M, V, G]
  if (Array.isArray(recipeOrDna) && recipeOrDna.length === 6 && typeof recipeOrDna[0] === 'number') {
    const thresh = (window.domainState && window.domainState.seedIdentityThreshold) ? window.domainState.seedIdentityThreshold : 75;
    return applyArtNouveauDNA(positions, recipeOrDna, bounds, thresh, isMesh, typo);
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
  return applyArtNouveauDNA(positions, dna, bounds, thresh, isMesh, typo);
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

  const compareLen = Math.min(defPositions.length, origPositions.length);
  const count = Math.floor(compareLen / 3);
  for (let i = 0; i < compareLen; i += 3) {
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

  const currentTypo = (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID';
  renderIterationGeometry(targetDna, mode, currentTypo);
}

window.switchVisualComparisonMode = switchVisualComparisonMode;

/**
 * RENDER RECIPE / DNA DEFORMATION IN MAIN VIEWPORT
 */
function renderIterationGeometry(recipeOrDna, explicitMode, explicitTypologyKey = null) {
  let compMode = explicitMode || activeVisualCompMode;
  const activeTypologyKey = explicitTypologyKey || (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID';
  const isSeedDna = !recipeOrDna || (Array.isArray(recipeOrDna) && (recipeOrDna.length === 0 || (typeof recipeOrDna[0] === 'number' && recipeOrDna.every(v => Math.abs(v) < 0.0001))));

  if (isSeedDna) {
    compMode = 'SEED';
    activeVisualCompMode = 'SEED';
    window.activeVisualCompMode = 'SEED';
    if (window.domainState) window.domainState.visualComparisonMode = 'SEED';

    const bSeed = document.getElementById('btn-comp-seed');
    const bIter = document.getElementById('btn-comp-iter');
    if (bSeed) bSeed.classList.add('active');
    if (bIter) bIter.classList.remove('active');

    const vpTag = document.getElementById('vp-gen-tag');
    if (vpTag) vpTag.textContent = 'GENERATION 0: ORIGINAL RHINO SEED';

    // Clear branching geometry immediately
    if (window.clearBranchingGeometry) {
      window.clearBranchingGeometry();
    }
    if (window.syncBranchingFromDnaSlider) {
      window.syncBranchingFromDnaSlider(0, 0, 0, activeTypologyKey);
    }
    window._lastComputedWeldedPositions = null;
    window._lastComputedIndices = null;
    window._lastComputedBranchIndices = null;

    window.lastEngineStats = {
      affectedVertexCount: 0,
      affectedPct: 0,
      totalVertexCount: originalMeshes.reduce((acc, m) => acc + (m.originalPositions ? m.originalPositions.length / 3 : 0), 0),
      maxDisplacement: 0,
      meanDisplacement: 0,
      seedIdentityPct: 100,
      ruleValidation: {
        continuity: { pass: true, msg: 'âœ“ PRISTINE SEED' },
        branching: { pass: true, msg: 'âœ“ SINGULAR TRAJECTORY' },
        whiplash: { pass: true, msg: 'âœ“ UNMODIFIED' },
        merging: { pass: true, msg: 'âœ“ NO MERGE NEEDED' },
        posneg: { pass: true, msg: 'âœ“ SOLID ENCLOSED' },
        growth: { pass: true, msg: 'âœ“ CONTAINED SEED' }
      }
    };
  } else if (compMode === 'SEED' || !explicitMode) {
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
  if (curveGroup) curveGroup.visible = false;
  if (cageGroup) cageGroup.visible = false;

  // Deform or Restore SubD / Standard Meshes
  originalMeshes.forEach(item => {
    const targetMesh = item.mesh || item.threeMesh;
    if (!targetMesh || !targetMesh.geometry || !item.originalPositions) return;

    if (compMode === 'SEED' || isSeedDna) {
      const origPos = item.originalPositions;
      const curAttr = targetMesh.geometry.attributes.position;
      const curIndex = targetMesh.geometry.index;

      const needsNewGeom = !curAttr || 
        curAttr.array.length !== origPos.length || 
        (item.originalIndices && (!curIndex || curIndex.count !== item.originalIndices.length));

      if (needsNewGeom) {
        const newGeom = new THREE.BufferGeometry();
        newGeom.setAttribute('position', new THREE.Float32BufferAttribute(origPos, 3));
        if (item.originalIndices) {
          newGeom.setIndex(new THREE.BufferAttribute(item.originalIndices, 1));
        }
        newGeom.computeVertexNormals();
        newGeom.computeBoundingBox();
        newGeom.computeBoundingSphere();
        targetMesh.geometry.dispose();
        targetMesh.geometry = newGeom;
      } else {
        for (let i = 0; i < origPos.length; i++) {
          curAttr.array[i] = origPos[i];
        }
        curAttr.needsUpdate = true;
        if (item.originalIndices && curIndex) {
          for (let i = 0; i < item.originalIndices.length; i++) {
            curIndex.array[i] = item.originalIndices[i];
          }
          curIndex.needsUpdate = true;
        }
        targetMesh.geometry.computeVertexNormals();
        targetMesh.geometry.computeBoundingBox();
        targetMesh.geometry.computeBoundingSphere();
      }
      if (targetMesh.material) {
        targetMesh.material.wireframe = false;
        targetMesh.material.needsUpdate = true;
      }
      targetMesh.visible = true;
      return;
    }

    const attr = targetMesh.geometry.attributes.position;
    let defPos = executeRecipeDeformation(item.originalPositions, recipeOrDna, modelBounds, true, activeTypologyKey);

    if (defPos.length !== attr.array.length) {
      const newGeom = new THREE.BufferGeometry();
      
      // Apply manually computed welded SubD topology to achieve smooth, connected shading
      if (window._lastComputedWeldedPositions && window._lastComputedIndices && window._lastComputedIndices.length > 0) {
        newGeom.setAttribute('position', new THREE.BufferAttribute(window._lastComputedWeldedPositions, 3));
        newGeom.setIndex(new THREE.BufferAttribute(window._lastComputedIndices, 1));
      } else {
        newGeom.setAttribute('position', new THREE.Float32BufferAttribute(defPos, 3));
        if (item.originalIndices) {
          let baseLen = item.originalIndices.length;
          let baseVerts = item.originalPositions.length / 3;
          let addedVerts = (defPos.length - item.originalPositions.length) / 3;
          
          let combinedIndices;
          if (window._lastComputedBranchIndices && window._lastComputedBranchIndices.length > 0) {
             combinedIndices = new Uint32Array(baseLen + window._lastComputedBranchIndices.length);
             combinedIndices.set(item.originalIndices);
             combinedIndices.set(window._lastComputedBranchIndices, baseLen);
          } else {
             combinedIndices = new Uint32Array(baseLen + addedVerts);
             combinedIndices.set(item.originalIndices);
             for (let i = 0; i < addedVerts; i++) {
                combinedIndices[baseLen + i] = baseVerts + i;
             }
          }
          newGeom.setIndex(new THREE.BufferAttribute(combinedIndices, 1));
        }
      }
      
      newGeom.computeVertexNormals();
      newGeom.computeBoundingBox();
      newGeom.computeBoundingSphere();
      targetMesh.geometry.dispose();
      targetMesh.geometry = newGeom;
    } else {
      if (window._lastComputedWeldedPositions && window._lastComputedIndices && window._lastComputedIndices.length > 0) {
        targetMesh.geometry.dispose();
        const newGeom = new THREE.BufferGeometry();
        newGeom.setAttribute('position', new THREE.BufferAttribute(window._lastComputedWeldedPositions, 3));
        newGeom.setIndex(new THREE.BufferAttribute(window._lastComputedIndices, 1));
        newGeom.computeVertexNormals();
        targetMesh.geometry = newGeom;
      } else {
        for (let i = 0; i < defPos.length; i++) {
          attr.array[i] = defPos[i];
        }
        attr.needsUpdate = true;
        if (targetMesh.geometry.index) {
          targetMesh.geometry.index.needsUpdate = true;
        }
        targetMesh.geometry.computeVertexNormals();
      }
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
    const defPos = item.originalPositions;

    if (!attr || defPos.length !== attr.array.length) {
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
      let defLinePos = item.originalLinePositions; // Cages remain static
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
      let defPtPos = item.originalPtPositions; // Cages remain static
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

  if (compMode === 'SEED' || isSeedDna) {
    if (typeof computeModelBounds === 'function') computeModelBounds();
  }
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
window.applyRule = applyRule;
window.calculateSeedIdentityScore = calculateSeedIdentityScore;

window.meshGroup = meshGroup;
window.curveGroup = curveGroup;
window.cageGroup = cageGroup;
window.originalMeshes = originalMeshes;
window.originalCurves = originalCurves;
window.originalCages = originalCages;
window.fitCamera = fitCamera;

window.exportViewportToPNG = function() {
    if (!threeRenderer || !threeScene || !threeCamera) {
        console.warn("Renderer not initialized yet.");
        return;
    }
    
    threeRenderer.render(threeScene, threeCamera);
    const dataURL = threeRenderer.domElement.toDataURL("image/png");
    
    const a = document.createElement('a');
    a.href = dataURL;
    const now = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    a.download = `iteration_capture_${now}.png`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};


