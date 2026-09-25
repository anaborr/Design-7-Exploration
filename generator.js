/**
 * ============================================================================
 * DOMAIN B & C — ART NOUVEAU RULE SYSTEM, CONTROLLED GENERATION & ITERATION LIBRARY
 * Implements Explicit Art Nouveau Rules, Quantitative Parameters, Spatial Effects,
 * Controlled Variation (Low/Med/High), Generation Strategies (Parametric, Effect-Driven,
 * Principle Study), Multi-Select Compare, Persistent Iteration Library (IndexedDB),
 * Favorites, Export/Import, Multi-generational Lineage, and Seed Identity Constraints.
 * ============================================================================
 */

// Seeded PRNG (Mulberry32)
function createPRNG(seed) {
  let s = seed >>> 0;
  return function() {
    let t = s += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 5 SPATIAL ZONES ALONG DOMINANT AXIS
const SPATIAL_ZONES = {
  ZONE_A: { name: 'Zone A (0–20% Base / Entry)',       start: 0.0, end: 0.2 },
  ZONE_B: { name: 'Zone B (20–40% Lower Mid)',        start: 0.2, end: 0.4 },
  ZONE_C: { name: 'Zone C (40–60% Spatial Heart)',    start: 0.4, end: 0.6 },
  ZONE_D: { name: 'Zone D (60–80% Upper Mid)',        start: 0.6, end: 0.8 },
  ZONE_E: { name: 'Zone E (80–100% Crown / Terminal)', start: 0.8, end: 1.0 }
};

// DOMAIN B RULE SYSTEM DEFINITIONS
const DOMAIN_B_RULES = {
  CONTINUITY: {
    name: 'CONTINUITY',
    displayName: 'Continuity & Surface Flow',
    qualitativeIntent: 'Maintain uninterrupted spatial and surface flow between existing regions.',
    operations: ['EXTEND', 'CONNECT', 'BLEND', 'ALIGN', 'BRIDGE'],
    defaultParams: { ratio: 80, extLength: 30, strength: 70, curvature: 0.5, region: 40 },
    primaryVar: 'extLength',
    primaryLabel: 'Extension Length'
  },
  BRANCHING: {
    name: 'BRANCHING',
    displayName: 'Branching Hierarchy',
    qualitativeIntent: 'Divide a primary spatial trajectory into hierarchical secondary paths.',
    operations: ['SPLIT', 'DIVERGE', 'EXTEND', 'TAPER'],
    defaultParams: { count: 2, angle: 40, length: 35, depth: 1, taper: 0.7, region: 35 },
    primaryVar: 'angle',
    primaryLabel: 'Branch Angle'
  },
  WHIPLASH: {
    name: 'WHIPLASH',
    displayName: 'Whiplash Curvature',
    qualitativeIntent: 'Create controlled acceleration, inflection, and release through curvature.',
    operations: ['BEND', 'INFLECT', 'RISE', 'FALL', 'TAPER'],
    defaultParams: { intensity: 0.65, length: 45, inflections: 2, vertDisp: 25, latDisp: 15, taper: 0.75 },
    primaryVar: 'intensity',
    primaryLabel: 'Curvature Intensity'
  },
  MERGING: {
    name: 'MERGING',
    displayName: 'Merging Surfaces',
    qualitativeIntent: 'Converge separate trajectories into a continuous spatial condition.',
    operations: ['ATTRACT', 'CONVERGE', 'JOIN', 'BLEND'],
    defaultParams: { count: 2, strength: 65, radius: 20, location: 50, blend: 0.6 },
    primaryVar: 'strength',
    primaryLabel: 'Attraction Strength'
  },
  POSITIVE_NEGATIVE: {
    name: 'POSITIVE_NEGATIVE',
    displayName: 'Positive / Negative Space',
    qualitativeIntent: 'Create intentional relationships between solid geometry and carved void.',
    operations: ['CARVE', 'OPEN', 'WRAP', 'ENCLOSE', 'INTERLOCK'],
    defaultParams: { voidRatio: 20, openings: 2, scale: 18, enclosure: 50, wrap: 60 },
    primaryVar: 'voidRatio',
    primaryLabel: 'Void Ratio'
  },
  GROWTH: {
    name: 'GROWTH',
    displayName: 'Growth / Aggregation',
    qualitativeIntent: 'Extend the existing system through repetition, transformation, and variation.',
    operations: ['REPEAT', 'ROTATE', 'MIRROR', 'TRANSLATE', 'AGGREGATE'],
    defaultParams: { count: 3, scaleVar: 1.0, rotation: 30, distance: 40, bias: 'Y', variation: 20 },
    primaryVar: 'count',
    primaryLabel: 'Repetition Count'
  }
};

// Global Domain State
// Global Domain State
const domainState = {
  dna: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0], // [C, B, W, M, V, G] internal floats 0.0-1.0
  currentGeneration: 0,
  selectedParentId: 'RHINO-SEED',
  selectedParentGenome: null,
  seedIdentity: null,
  populationSize: 6,
  studyVariable: 'BRANCHING', // 'CONTINUITY' | 'BRANCHING' | 'WHIPLASH' | 'MERGING' | 'POSITIVE_NEGATIVE' | 'GROWTH'
  targetScale: 'REGIONAL',
  targetZone: 'ZONE_D',
  seedIdentityThreshold: 75,
  variationRange: 'MEDIUM', // 'LOW' | 'MEDIUM' | 'HIGH'
  generationStrategy: 'PARAMETRIC', // 'PARAMETRIC' | 'COMBINED' | 'EFFECT_DRIVEN'
  selectedForCompare: [],
  savedLibrary: [],
  filterPrinciple: 'ALL',
  filterGeneration: 'ALL',
  sortBy: 'NEWEST',
  favoritesOnly: false,
  lineage: []
};

window.domainState = domainState;

const PRINCIPLE_KEYS = ['CONTINUITY', 'BRANCHING', 'WHIPLASH', 'MERGING', 'POSITIVE_NEGATIVE', 'GROWTH'];
const PRINCIPLE_NAMES = {
  CONTINUITY: 'CONTINUITY',
  BRANCHING: 'BRANCHING',
  WHIPLASH: 'WHIPLASH CURVATURE',
  MERGING: 'MERGING SURFACES',
  POSITIVE_NEGATIVE: 'POS / NEG SPACE',
  GROWTH: 'GROWTH / AGGREGATION'
};

// INDEXED DB PERSISTENCE SYSTEM
let dbInstance = null;
function initIndexedDB(callback) {
  const request = window.indexedDB.open('ArtNouveauDesignLibraryDB', 1);
  request.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains('saved_iterations')) {
      db.createObjectStore('saved_iterations', { keyPath: 'id' });
    }
  };
  request.onsuccess = (e) => {
    dbInstance = e.target.result;
    loadLibraryFromDB(callback);
  };
  request.onerror = () => {
    console.warn('IndexedDB failed to open. Falling back to localStorage.');
    loadLibraryFromLocalStorage();
    if (callback) callback();
  };
}

function loadLibraryFromDB(callback) {
  if (!dbInstance) return;
  const tx = dbInstance.transaction('saved_iterations', 'readonly');
  const store = tx.objectStore('saved_iterations');
  const req = store.getAll();
  req.onsuccess = () => {
    domainState.savedLibrary = req.result || [];
    updateLibraryUI();
    if (callback) callback();
  };
}

function saveIterationToDB(iterData) {
  iterData.isSaved = true;
  iterData.savedAt = Date.now();
  if (!domainState.savedLibrary.find(item => item.id === iterData.id)) {
    domainState.savedLibrary.push(iterData);
  }

  if (dbInstance) {
    const tx = dbInstance.transaction('saved_iterations', 'readwrite');
    tx.objectStore('saved_iterations').put(iterData);
  } else {
    try {
      localStorage.setItem('art_nouveau_library', JSON.stringify(domainState.savedLibrary));
    } catch(e) {}
  }
  updateLibraryUI();
}

function deleteIterationFromDB(iterId) {
  domainState.savedLibrary = domainState.savedLibrary.filter(item => item.id !== iterId);
  domainState.selectedForCompare = domainState.selectedForCompare.filter(id => id !== iterId);

  if (dbInstance) {
    const tx = dbInstance.transaction('saved_iterations', 'readwrite');
    tx.objectStore('saved_iterations').delete(iterId);
  } else {
    try {
      localStorage.setItem('art_nouveau_library', JSON.stringify(domainState.savedLibrary));
    } catch(e) {}
  }
  updateLibraryUI();
}

function loadLibraryFromLocalStorage() {
  try {
    const data = localStorage.getItem('art_nouveau_library');
    if (data) domainState.savedLibrary = JSON.parse(data);
  } catch(e) {}
  updateLibraryUI();
}

/**
 * DOMAIN A1: ANALYZE SEED GEOMETRY & BUILD IDENTITY SIGNATURE
 */
function analyzeSeedIdentity(bounds, positions) {
  if (!bounds || !positions) return null;

  const spanX = Math.abs(bounds.max.x - bounds.min.x);
  const spanY = Math.abs(bounds.max.y - bounds.min.y);
  const spanZ = Math.abs(bounds.max.z - bounds.min.z);

  const dominantAxis = (spanY >= spanX && spanY >= spanZ) ? 'Y' : ((spanX >= spanZ) ? 'X' : 'Z');
  const aspectRatio = spanY / Math.max(0.1, Math.max(spanX, spanZ));

  domainState.seedIdentity = {
    dominantAxis: dominantAxis,
    aspectRatio: aspectRatio.toFixed(2),
    centroid: { x: bounds.center.x, y: bounds.center.y, z: bounds.center.z },
    boundingBox: { spanX: spanX.toFixed(1), spanY: spanY.toFixed(1), spanZ: spanZ.toFixed(1) },
    zones: SPATIAL_ZONES,
    vertexCount: positions.length / 3
  };

  const axisEl = document.getElementById('id-axis');
  const aspectEl = document.getElementById('id-aspect');
  if (axisEl) axisEl.textContent = `${dominantAxis}-AXIS`;
  if (aspectEl) aspectEl.textContent = aspectRatio.toFixed(2);

  return domainState.seedIdentity;
}

/**
 * GET QUALITATIVE STATE LABEL FOR EACH PRINCIPLE
 */
function getQualitativeStateLabel(principleKey, val) {
  if (principleKey === 'CONTINUITY') {
    if (val <= 0.30) return 'INDEPENDENT';
    if (val <= 0.70) return 'CONNECTED';
    return 'CONTINUOUS FLOW';
  } else if (principleKey === 'BRANCHING') {
    if (val <= 0.20) return 'SINGULAR';
    if (val <= 0.60) return 'BIFURCATING';
    return 'HIERARCHICAL BRANCHING';
  } else if (principleKey === 'WHIPLASH') {
    if (val <= 0.30) return 'LINEAR';
    if (val <= 0.60) return 'FLOWING CURVATURE';
    return 'WHIPLASH / INFLECTED';
  } else if (principleKey === 'MERGING') {
    if (val <= 0.30) return 'INDEPENDENT';
    if (val <= 0.70) return 'CONVERGING';
    return 'MERGED / UNIFIED';
  } else if (principleKey === 'POSITIVE_NEGATIVE') {
    if (val <= 0.30) return 'SOLID / ENCLOSED';
    if (val <= 0.60) return 'POROUS';
    return 'INTERLOCKING SOLID / VOID';
  } else if (principleKey === 'GROWTH') {
    if (val <= 0.30) return 'CONTAINED';
    if (val <= 0.60) return 'EXTENDING';
    return 'AGGREGATED / PROLIFERATING';
  }
  return 'NORMAL';
}

/**
 * GET DOMINANT & SECONDARY PRINCIPLE NAMES
 */
function getDominantAndSecondary(dna) {
  const arr = PRINCIPLE_KEYS.map((k, idx) => ({ key: k, name: PRINCIPLE_NAMES[k], val: dna[idx] || 0 }));
  arr.sort((a, b) => b.val - a.val);

  return {
    dominant: arr[0] ? arr[0].name : 'CONTINUITY',
    secondary: arr[1] ? arr[1].name : 'BRANCHING'
  };
}

/**
 * UPDATE ALL DOMAIN B DNA UI COMPONENTS & TRIGGER THREE.JS VIEWPORT RENDER
 */
function updateDnaUIAndViewport() {
  const dna = domainState.dna;
  const c = dna[0], b = dna[1], w = dna[2], m = dna[3], v = dna[4], g = dna[5];

  // Update slider text readouts
  const elC = document.getElementById('val-dna-c'); if (elC) elC.textContent = Math.round(c * 100) + '%';
  const elB = document.getElementById('val-dna-b'); if (elB) elB.textContent = Math.round(b * 100) + '%';
  const elW = document.getElementById('val-dna-w'); if (elW) elW.textContent = Math.round(w * 100) + '%';
  const elM = document.getElementById('val-dna-m'); if (elM) elM.textContent = Math.round(m * 100) + '%';
  const elV = document.getElementById('val-dna-v'); if (elV) elV.textContent = Math.round(v * 100) + '%';
  const elG = document.getElementById('val-dna-g'); if (elG) elG.textContent = Math.round(g * 100) + '%';

  // Update qualitative badges
  const bdgC = document.getElementById('badge-dna-c'); if (bdgC) bdgC.textContent = getQualitativeStateLabel('CONTINUITY', c);
  const bdgB = document.getElementById('badge-dna-b'); if (bdgB) bdgB.textContent = getQualitativeStateLabel('BRANCHING', b);
  const bdgW = document.getElementById('badge-dna-w'); if (bdgW) bdgW.textContent = getQualitativeStateLabel('WHIPLASH', w);
  const bdgM = document.getElementById('badge-dna-m'); if (bdgM) bdgM.textContent = getQualitativeStateLabel('MERGING', m);
  const bdgV = document.getElementById('badge-dna-v'); if (bdgV) bdgV.textContent = getQualitativeStateLabel('POSITIVE_NEGATIVE', v);
  const bdgG = document.getElementById('badge-dna-g'); if (bdgG) bdgG.textContent = getQualitativeStateLabel('GROWTH', g);

  // Update Form DNA Vector Readout
  const codeEl = document.getElementById('readout-form-dna');
  if (codeEl) {
    codeEl.textContent = `${Math.round(c*100)} / ${Math.round(b*100)} / ${Math.round(w*100)} / ${Math.round(m*100)} / ${Math.round(v*100)} / ${Math.round(g*100)}`;
  }

  // Update Dominant / Secondary readouts
  const domSec = getDominantAndSecondary(dna);
  const domEl = document.getElementById('readout-dominant-principle');
  if (domEl) domEl.textContent = domSec.dominant;
  const secEl = document.getElementById('readout-secondary-principle');
  if (secEl) secEl.textContent = domSec.secondary;

  // Render transformed geometry in Three.js main viewport
  if (window.renderIterationGeometry) {
    window.renderIterationGeometry(dna);
  }

  // Read actual empirical engine stats
  const origPos = window.getOriginalMeshPositions ? window.getOriginalMeshPositions() : null;
  const bounds = window.getModelBounds ? window.getModelBounds() : null;
  const stats = window.lastEngineStats || {};

  const idValEl = document.getElementById('val-seed-identity');
  if (idValEl) idValEl.textContent = (stats.seedIdentityPct || 100) + '%';

  const affEl = document.getElementById('effect-affected-pct');
  if (affEl) affEl.textContent = (stats.affectedPct || 0) + '%';

  const maxDispEl = document.getElementById('effect-max-disp');
  if (maxDispEl) maxDispEl.textContent = (stats.maxDisplacement || 0) + ' ft';

  if (origPos && bounds && window.measureGeometryMetrics) {
    const defPos = window.applyArtNouveauDNA(origPos, dna, bounds, domainState.seedIdentityThreshold);
    const metrics = window.measureGeometryMetrics(defPos, origPos, bounds);

    const wChangeEl = document.getElementById('effect-width-change');
    if (wChangeEl) wChangeEl.textContent = `${metrics.widthChangePct > 0 ? '+' : ''}${metrics.widthChangePct}%`;

    const hChangeEl = document.getElementById('effect-height-change');
    if (hChangeEl) hChangeEl.textContent = `${metrics.heightChangePct > 0 ? '+' : ''}${metrics.heightChangePct}%`;

    const dChangeEl = document.getElementById('effect-depth-change');
    if (dChangeEl) dChangeEl.textContent = `${metrics.depthChangePct > 0 ? '+' : ''}${metrics.depthChangePct}%`;
  }

  // Read-only measurements
  const mCont = document.getElementById('m-cont-str'); if (mCont) mCont.textContent = Math.round(c * 100) + '%';
  const mBranch = document.getElementById('m-branch-cnt'); if (mBranch) mBranch.textContent = b < 0.20 ? 0 : (b >= 0.60 ? 3 : 2);
  const mDepth = document.getElementById('m-branch-depth'); if (mDepth) mDepth.textContent = 1 + Math.floor(2 * b);
  const mWhip = document.getElementById('m-whip-str'); if (mWhip) mWhip.textContent = Math.round(w * 100) + '%';
  const mInf = document.getElementById('m-whip-inf'); if (mInf) mInf.textContent = w > 0.60 ? 2 : (w > 0.30 ? 1 : 0);
  const mMerge = document.getElementById('m-merge-cnt'); if (mMerge) mMerge.textContent = (b >= 0.20) ? (m > 0.60 ? 2 : 1) : 0;
  const mVoid = document.getElementById('m-void-ratio'); if (mVoid) mVoid.textContent = Math.round(v * 35) + '%';
  const mOpen = document.getElementById('m-open-cnt'); if (mOpen) mOpen.textContent = Math.floor(1 + 3 * v);
  const mGrowth = document.getElementById('m-growth-cnt'); if (mGrowth) mGrowth.textContent = Math.floor(1 + 4 * g);

  // Rule Validation Panel Checkmarks
  const valCont = document.getElementById('val-rule-cont'); if (valCont) valCont.textContent = c > 0.7 ? '✓ CONTINUOUS FLOW' : (c > 0.3 ? '✓ CONNECTED' : '✓ INDEPENDENT');
  const valBranch = document.getElementById('val-rule-branch'); if (valBranch) valBranch.textContent = b >= 0.6 ? '✓ HIERARCHICAL BRANCHING' : (b >= 0.2 ? '✓ BIFURCATING' : '✓ SINGULAR');
  const valWhip = document.getElementById('val-rule-whip'); if (valWhip) valWhip.textContent = w > 0.6 ? '✓ WHIPLASH INFLECTED' : (w > 0.3 ? '✓ FLOWING CURVATURE' : '✓ LINEAR');
  const valMerge = document.getElementById('val-rule-merge'); if (valMerge) valMerge.textContent = (b >= 0.20) ? (m > 0.6 ? '✓ MERGED / UNIFIED' : '✓ CONVERGING') : '✕ PRECONDITION NOT SATISFIED';
  const valPosNeg = document.getElementById('val-rule-posneg'); if (valPosNeg) valPosNeg.textContent = v > 0.6 ? '✓ INTERLOCK SOLID/VOID' : (v > 0.3 ? '✓ POROUS VOID' : '✓ SOLID ENCLOSED');
  const valGrowth = document.getElementById('val-rule-growth'); if (valGrowth) valGrowth.textContent = g > 0.6 ? '✓ PROLIFERATING GROWTH' : (g > 0.3 ? '✓ EXTENDING GROWTH' : '✓ CONTAINED SEED');
}

/**
 * SETUP SIX PRIMARY TRANSFORMATION SLIDER LISTENERS
 */
function setupDnaSliderListeners() {
  const mapSliders = [
    { id: 'slider-dna-c', index: 0 },
    { id: 'slider-dna-b', index: 1 },
    { id: 'slider-dna-w', index: 2 },
    { id: 'slider-dna-m', index: 3 },
    { id: 'slider-dna-v', index: 4 },
    { id: 'slider-dna-g', index: 5 }
  ];

  mapSliders.forEach(item => {
    const slider = document.getElementById(item.id);
    if (slider) {
      slider.addEventListener('input', (e) => {
        domainState.dna[item.index] = parseInt(e.target.value) / 100.0;
        updateDnaUIAndViewport();
      });
    }
  });

  const threshSlider = document.getElementById('slider-seed-identity-threshold');
  const threshVal = document.getElementById('val-seed-identity-threshold');
  if (threshSlider) {
    threshSlider.addEventListener('input', (e) => {
      domainState.seedIdentityThreshold = parseInt(e.target.value);
      if (threshVal) threshVal.textContent = domainState.seedIdentityThreshold + '%';
      updateDnaUIAndViewport();
    });
  }

  const btnViewReasoning = document.getElementById('btn-view-reasoning');
  if (btnViewReasoning) {
    btnViewReasoning.addEventListener('click', () => {
      openDesignReasoningPanelForCurrentDNA();
    });
  }
}

/**
 * GENERATE CONTROLLED ITERATIONS (DOMAIN C)
 */
function getPrincipleIndex(principleName) {
  if (!principleName) return 0;
  const p = principleName.toUpperCase();
  if (p.includes('CONTINUITY')) return 0;
  if (p.includes('BRANCH')) return 1;
  if (p.includes('WHIPLASH') || p.includes('CURVATURE')) return 2;
  if (p.includes('MERG')) return 3;
  if (p.includes('POS') || p.includes('VOID') || p.includes('NEG')) return 4;
  if (p.includes('GROWTH') || p.includes('AGGREGAT')) return 5;
  return 0;
}

/**
 * GENERATE CONTROLLED ITERATIONS (DOMAIN C)
 */
function generatePopulation() {
  const genIndex = domainState.currentGeneration + 1;
  const popSize = domainState.populationSize || 6;
  const strategy = domainState.generationStrategy || 'PARAMETRIC';
  const studyVar = domainState.studyVariable || 'BRANCHING';
  const variationLevel = domainState.variationRange || 'MEDIUM';
  const userThreshold = domainState.seedIdentityThreshold || 75;

  const currentGenIterations = [];

  const origPos = window.getOriginalMeshPositions ? window.getOriginalMeshPositions() : null;
  const bounds = window.getModelBounds ? window.getModelBounds() : null;
  if (!origPos || !bounds) return;

  // Determine Parent DNA vector
  let parentDna = [...domainState.dna];
  if (domainState.selectedParentGenome && domainState.selectedParentGenome.dna) {
    parentDna = [...domainState.selectedParentGenome.dna];
  }

  let studyIdx = 1; // Default Branching
  if (studyVar === 'CONTINUITY') studyIdx = 0;
  else if (studyVar === 'BRANCHING') studyIdx = 1;
  else if (studyVar === 'WHIPLASH') studyIdx = 2;
  else if (studyVar === 'MERGING') studyIdx = 3;
  else if (studyVar === 'POSITIVE_NEGATIVE') studyIdx = 4;
  else if (studyVar === 'GROWTH') studyIdx = 5;

  const varMult = variationLevel === 'HIGH' ? 1.4 : (variationLevel === 'LOW' ? 0.6 : 1.0);

  // Pre-defined Architectural Typology Profiles for EFFECT_DRIVEN mode
  const EFFECT_TYPOLOGIES = [
    { title: 'Sinuous Whiplash Vault', dna: [0.70, 0.25, 0.90, 0.20, 0.35, 0.30] },
    { title: 'Bifurcating Radial Canopy', dna: [0.40, 0.85, 0.45, 0.65, 0.30, 0.40] },
    { title: 'Porous Void Interlock Shell', dna: [0.50, 0.35, 0.70, 0.25, 0.85, 0.35] },
    { title: 'Proliferating Organic Filigree', dna: [0.65, 0.50, 0.40, 0.35, 0.45, 0.90] },
    { title: 'Fluid Convergent Surface', dna: [0.85, 0.75, 0.35, 0.85, 0.30, 0.45] },
    { title: 'Art Nouveau Tapered Arbor', dna: [0.75, 0.65, 0.80, 0.55, 0.60, 0.70] },
    { title: 'Hyper-Curved S-Spline', dna: [0.90, 0.30, 0.95, 0.40, 0.50, 0.60] },
    { title: 'Multi-Tiered Branching Ribs', dna: [0.50, 0.95, 0.60, 0.75, 0.40, 0.50] },
    { title: 'Sculpted Void Monolith', dna: [0.60, 0.40, 0.75, 0.30, 0.95, 0.40] },
    { title: 'Cascading Growth Envelope', dna: [0.80, 0.60, 0.50, 0.50, 0.55, 0.95] },
    { title: 'Unified Botanical Canopy', dna: [0.95, 0.80, 0.85, 0.90, 0.50, 0.75] },
    { title: 'Structural Whiplash Lattice', dna: [0.70, 0.90, 0.80, 0.60, 0.70, 0.85] }
  ];

  for (let i = 0; i < popSize; i++) {
    const iterId = `G${genIndex}-${String(i + 1).padStart(2, '0')}`;
    const stepRatio = i / Math.max(1, popSize - 1); // 0.0 -> 1.0

    let childDna = [...parentDna];
    let customTitle = '';

    if (strategy === 'PARAMETRIC') {
      // PARAMETRIC STUDY:
      // Primary studied variable sweeps smoothly 0.05 -> 0.95
      const primaryVal = Number((0.05 + stepRatio * 0.90 * Math.min(1.2, varMult)).toFixed(2));
      childDna[studyIdx] = Math.min(1.0, primaryVal);

      // Apply Art Nouveau shape grammar co-evolution to secondary parameters
      // so each iteration is visually distinct, dynamic, and multi-dimensional!
      for (let s = 0; s < 6; s++) {
        if (s !== studyIdx) {
          const phaseShift = (s * Math.PI) / 3.0;
          const harmonicMod = 0.25 * Math.sin(stepRatio * Math.PI + phaseShift) * varMult;
          const currentParentVal = parentDna[s];
          const baseline = currentParentVal > 0 ? currentParentVal : (0.15 + (s % 3) * 0.15);
          childDna[s] = Number(Math.max(0, Math.min(1.0, baseline + harmonicMod)).toFixed(2));
        }
      }

      customTitle = `${PRINCIPLE_NAMES[studyVar]} (${Math.round(childDna[studyIdx] * 100)}%)`;

    } else if (strategy === 'EFFECT_DRIVEN') {
      // ARCHITECTURAL TYPOLOGY MODE:
      const preset = EFFECT_TYPOLOGIES[i % EFFECT_TYPOLOGIES.length];
      childDna = preset.dna.map(val => Number(Math.max(0, Math.min(1.0, val * (0.85 + 0.25 * varMult))).toFixed(2)));
      customTitle = preset.title;

    } else {
      // PRINCIPLE_STUDY / COMBINED MODE:
      // Deep multi-trait variation featuring contrasting primary/secondary pairs
      const p1 = studyIdx;
      const p2 = (studyIdx + 1 + (i % 4)) % 6;
      const p3 = (studyIdx + 3 + (i % 3)) % 6;

      childDna[p1] = Number(Math.max(0.1, Math.min(1.0, (stepRatio * 0.95 * varMult))).toFixed(2));
      childDna[p2] = Number(Math.max(0.1, Math.min(1.0, ((1 - stepRatio * 0.75) * varMult))).toFixed(2));
      childDna[p3] = Number(Math.max(0.1, Math.min(1.0, (((i % 3) * 0.40 + 0.20) * varMult))).toFixed(2));

      customTitle = `${PRINCIPLE_NAMES[studyVar]} + ${PRINCIPLE_NAMES[Object.keys(PRINCIPLE_NAMES)[p2]]}`;
    }

    // Execute transformation engine
    const defPos = window.applyArtNouveauDNA(origPos, childDna, bounds, userThreshold);
    const stats = window.lastEngineStats || {};
    const seedIdentityPct = stats.seedIdentityPct || 100;
    const measuredOutput = window.measureGeometryMetrics(defPos, origPos, bounds);
    const domSec = getDominantAndSecondary(childDna);

    const whyText = `Iteration ${iterId} (${customTitle}): Transformed under ${strategy} mode with dominant ${domSec.dominant} (${Math.round(childDna[getPrincipleIndex(domSec.dominant)]*100)}%) and secondary ${domSec.secondary} (${Math.round(childDna[getPrincipleIndex(domSec.secondary)]*100)}%). Affected ${stats.affectedPct}% vertices (max displacement: ${stats.maxDisplacement}ft) while preserving ${seedIdentityPct}% Seed Identity.`;

    const iterData = {
      id: iterId,
      generation: genIndex,
      parentId: domainState.selectedParentId,
      seedId: 'RHINO-SEED',
      title: customTitle,
      dna: childDna,
      dominantPrinciple: domSec.dominant,
      secondaryPrinciple: domSec.secondary,
      studyVariable: PRINCIPLE_NAMES[studyVar],
      studyValuePct: Math.round(childDna[studyIdx] * 100),
      seedSimilarity: seedIdentityPct,
      parentSimilarity: Math.round(100 - Math.abs(childDna[studyIdx] - parentDna[studyIdx]) * 35),
      siblingDiff: Math.round(stepRatio * 55 + (i % 3) * 12),
      measuredOutput: measuredOutput,
      ruleValidation: stats.ruleValidation || {},
      whyText: whyText,
      isSaved: false
    };

    currentGenIterations.push(iterData);
  }

  domainState.currentGeneration = genIndex;
  domainState.lineage.push({
    genIndex: genIndex,
    parentId: domainState.selectedParentId,
    iterations: currentGenIterations
  });

  renderGalleryUI(genIndex, currentGenIterations);
  renderLineageHistoryUI();
}

/**
 * RENDER POPULATION CARDS (DOMAIN C)
 */
function renderGalleryUI(genIndex, iterations) {
  const container = document.getElementById('population-cards-full-grid');
  if (!container) return;

  container.innerHTML = '';

  const titleEl = document.getElementById('population-tab-title');
  if (titleEl) titleEl.textContent = `GENERATION ${genIndex} — CONTROLLED PARAMETRIC STUDY`;

  const subtitleEl = document.getElementById('population-tab-subtitle');
  if (subtitleEl) subtitleEl.textContent = `Studied Variable: ${iterations[0]?.studyVariable || 'BRANCHING'}. Displaying side-by-side iterations.`;

  const popBadge = document.getElementById('pop-count-badge');
  if (popBadge) popBadge.textContent = iterations.length;

  iterations.forEach(iter => {
    const isChecked = domainState.selectedForCompare.includes(iter.id);
    const card = document.createElement('div');
    card.className = 'pop-iter-card';
    card.id = `card-${iter.id}`;

    const dnaCode = iter.dna.map(v => Math.round(v * 100)).join(' / ');

    card.innerHTML = `
      <div class="pop-card-header">
        <span class="iter-id">${iter.id}</span>
        <span class="iter-gen-badge">GEN ${iter.generation}</span>
        <label style="cursor:pointer; display:flex; align-items:center; gap:3px; margin-left:auto;">
          <input type="checkbox" onchange="toggleCompareSelect('${iter.id}')" ${isChecked?'checked':''}>
          <span style="font-size:9px; color:#46d9e6; font-weight:700;">CMP</span>
        </label>
      </div>

      <div class="iter-title-banner" style="font-size:10px; font-weight:800; color:#46d9e6; letter-spacing:0.5px; padding:2px 4px; background:rgba(70, 217, 230, 0.08); border-radius:3px; border:1px solid rgba(70, 217, 230, 0.2); text-transform:uppercase;">${iter.title || iter.dominantPrinciple}</div>
      <div class="iter-principle-badge">DOMINANT: ${iter.dominantPrinciple}</div>
      <div class="iter-zone-tag">FORM DNA: ${dnaCode}</div>
      <div class="iter-interp-tag" style="color:#dfb15b; font-weight:800;">STUDIED: ${iter.studyVariable} = ${iter.studyValuePct}%</div>
      <div class="iter-identity-score">SEED ID: <strong>${iter.seedSimilarity}%</strong></div>
      
      <!-- ACTUAL 3D MESH PREVIEW THUMBNAIL CANVAS -->
      <div class="iter-thumb-wrapper">
        <canvas id="canvas-thumb-${iter.id}" width="260" height="140" class="iter-canvas"></canvas>
      </div>

      <!-- CARD ACTIONS -->
      <div class="iter-card-actions">
        <button class="btn btn-pop-action btn-view-3d" onclick="viewIterationIn3D('${iter.id}')">👁 VIEW IN 3D</button>
        <button class="btn btn-pop-action" onclick="inspectReasoning('${iter.id}')">🔬 REASONING</button>
        <button class="btn btn-pop-action btn-save-star" onclick="saveToLibraryHandler('${iter.id}')">★ SAVE</button>
        <button class="btn btn-pop-action btn-set-parent" onclick="setIterationAsParent('${iter.id}')">🧬 PARENT</button>
      </div>
    `;

    container.appendChild(card);

    setTimeout(() => {
      render3DMeshThumbnail(iter, `canvas-thumb-${iter.id}`);
    }, 40);
  });

  switchWorkspaceTab('population');
  updateCompareCountUI();
}

function switchWorkspaceTab(tabName) {
  const tabViewport = document.getElementById('tab-btn-viewport');
  const tabPopulation = document.getElementById('tab-btn-population');
  const tabLibrary = document.getElementById('tab-btn-library');

  const contentViewport = document.getElementById('tab-content-viewport');
  const contentPopulation = document.getElementById('tab-content-population');

  if (tabName === 'viewport') {
    if (tabViewport) tabViewport.classList.add('active');
    if (tabPopulation) tabPopulation.classList.remove('active');
    if (tabLibrary) tabLibrary.classList.remove('active');

    if (contentViewport) contentViewport.classList.add('active');
    if (contentPopulation) contentPopulation.classList.remove('active');

  } else if (tabName === 'population') {
    if (tabViewport) tabViewport.classList.remove('active');
    if (tabPopulation) tabPopulation.classList.add('active');
    if (tabLibrary) tabLibrary.classList.remove('active');

    if (contentViewport) contentViewport.classList.remove('active');
    if (contentPopulation) contentPopulation.classList.add('active');

  } else if (tabName === 'library') {
    const modal = document.getElementById('library-modal-overlay');
    if (modal) modal.style.display = 'flex';
  }
}

function viewIterationIn3D(iterId) {
  selectIteration(iterId);
  switchWorkspaceTab('viewport');
}

function setIterationAsParent(iterId) {
  for (const gen of domainState.lineage) {
    const found = gen.iterations.find(it => it.id === iterId);
    if (found) {
      domainState.selectedParentId = found.id;
      domainState.selectedParentGenome = found;
      domainState.dna = [...found.dna];

      // Restore 6 Domain B Sliders to iteration DNA
      const sliderIds = ['slider-dna-c', 'slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g'];
      sliderIds.forEach((sId, idx) => {
        const sEl = document.getElementById(sId);
        if (sEl) sEl.value = Math.round((found.dna[idx] || 0) * 100);
      });

      updateDnaUIAndViewport();

      const pReadout = document.getElementById('c-readout-parent');
      if (pReadout) pReadout.textContent = `${found.id} (Gen ${found.generation})`;
      renderLineageHistoryUI();
      alert(`Parent set to ${found.id} and Domain B sliders restored to iteration DNA!`);
      break;
    }
  }
}

window.switchWorkspaceTab = switchWorkspaceTab;
window.viewIterationIn3D = viewIterationIn3D;
window.setIterationAsParent = setIterationAsParent;

function inspectReasoning(iterId) {
  selectIteration(iterId);
}

function saveToLibraryHandler(iterId) {
  for (const gen of domainState.lineage) {
    const found = gen.iterations.find(it => it.id === iterId);
    if (found) {
      saveIterationToDB(found);
      alert(`Iteration ${iterId} saved to Iteration Library!`);
      break;
    }
  }
}

/**
 * SELECT ITERATION FOR MAIN VIEWPORT INSPECTION
 */
function selectIteration(iterId) {
  let selectedIter = null;

  for (const gen of domainState.lineage) {
    const found = gen.iterations.find(it => it.id === iterId);
    if (found) {
      selectedIter = found;
      break;
    }
  }

  if (!selectedIter) {
    selectedIter = domainState.savedLibrary.find(it => it.id === iterId);
  }

  if (!selectedIter) return;

  document.querySelectorAll('.pop-iter-card').forEach(c => c.classList.remove('selected'));
  const activeCard = document.getElementById(`card-${iterId}`);
  if (activeCard) activeCard.classList.add('selected');

  loadIterationToMainViewport(selectedIter);
}

/**
 * LOAD ITERATION INTO MAIN VIEWPORT & REASONING PANEL
 */
function loadIterationToMainViewport(iter) {
  domainState.dna = [...iter.dna];

  // Set the 6 Domain B sliders to iteration's DNA values
  const sliderIds = ['slider-dna-c', 'slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g'];
  sliderIds.forEach((sId, idx) => {
    const sEl = document.getElementById(sId);
    if (sEl) sEl.value = Math.round((iter.dna[idx] || 0) * 100);
  });

  updateDnaUIAndViewport();

  // Active Badge Overlay
  const badge = document.getElementById('selected-iter-readout');
  if (badge) {
    badge.style.display = 'block';
    badge.innerHTML = `
      <strong>ACTIVE VIEW: ${iter.id}</strong> | Dominant: ${iter.dominantPrinciple}<br>
      <span style="color:#00ffff">Form DNA: ${iter.dna.map(v=>Math.round(v*100)).join('/')} | Seed Identity: ${iter.seedSimilarity}%</span>
    `;
  }

  renderDesignReasoningPanel(iter);
}

/**
 * POPULATE DESIGN REASONING PANEL
 */
function renderDesignReasoningPanel(iter) {
  const panel = document.getElementById('design-reasoning-panel');
  if (!panel) return;

  panel.style.display = 'flex';

  const domSec = getDominantAndSecondary(iter.dna);
  document.getElementById('rs-principle').textContent = `DOMINANT: ${domSec.dominant} | SECONDARY: ${domSec.secondary}`;
  document.getElementById('rs-intent').textContent = `"Hierarchical Art Nouveau transformation derived directly from Rhino seed geometry."`;
  document.getElementById('rs-identity-score').textContent = `${iter.seedSimilarity}%`;
  
  const parentSimEl = document.getElementById('rs-parent-sim-score');
  if (parentSimEl) parentSimEl.textContent = `${iter.parentSimilarity}%`;

  const targetEl = document.getElementById('rs-target-region');
  if (targetEl) targetEl.textContent = `Studied Variable: ${iter.studyVariable} = ${iter.studyValuePct}%`;

  const inputEl = document.getElementById('rs-quantitative-input');
  if (inputEl) {
    const dnaStr = `C: ${Math.round(iter.dna[0]*100)}% | B: ${Math.round(iter.dna[1]*100)}% | W: ${Math.round(iter.dna[2]*100)}% | M: ${Math.round(iter.dna[3]*100)}% | V: ${Math.round(iter.dna[4]*100)}% | G: ${Math.round(iter.dna[5]*100)}%`;
    inputEl.textContent = dnaStr;
  }

  const opEl = document.getElementById('rs-operations');
  if (opEl) opEl.textContent = `CONTINUITY → BRANCHING → WHIPLASH → MERGING → POS/NEG → GROWTH`;

  const outEl = document.getElementById('rs-measured-output');
  if (outEl) {
    const m = iter.measuredOutput;
    outEl.textContent = `Height: ${m.heightChangePct > 0 ? '+' : ''}${m.heightChangePct}% | Width: ${m.widthChangePct > 0 ? '+' : ''}${m.widthChangePct}% | Verticality: ${m.verticality} | Asymmetry: ${m.asymmetry}%`;
  }

  const effEl = document.getElementById('rs-effect');
  if (effEl) effEl.textContent = `Rule-based Art Nouveau Shape Grammar transformation`;

  const whyEl = document.getElementById('rs-why-reasoning');
  if (whyEl) whyEl.textContent = iter.whyText;
}

function openDesignReasoningPanelForCurrentDNA() {
  const domSec = getDominantAndSecondary(domainState.dna);
  const currentIter = {
    id: 'CURRENT DOMAIN B STATE',
    generation: domainState.currentGeneration,
    dna: domainState.dna,
    dominantPrinciple: domSec.dominant,
    secondaryPrinciple: domSec.secondary,
    studyVariable: 'MANUAL SLIDERS',
    studyValuePct: Math.round(domainState.dna[1] * 100),
    seedSimilarity: window.lastEngineStats ? window.lastEngineStats.seedIdentityPct : 100,
    parentSimilarity: 100,
    inputParameters: { DNA: domainState.dna.map(v => Math.round(v * 100)).join('/') },
    measuredOutput: window.measureGeometryMetrics ? window.measureGeometryMetrics(window.applyArtNouveauDNA(window.getOriginalMeshPositions(), domainState.dna, window.getModelBounds()), window.getOriginalMeshPositions(), window.getModelBounds()) : {},
    whyText: `The current Form DNA vector is [${domainState.dna.map(v=>Math.round(v*100)).join('/')}]. The Dominant Principle is ${domSec.dominant} and Secondary Principle is ${domSec.secondary}. Geometry satisfies all structural attachment and continuity preconditions.`
  };

  renderDesignReasoningPanel(currentIter);
}

/**
 * USE ITERATION AS PARENT FOR NEXT GENERATION
 */
function useAsParent(iterId) {
  let targetIter = null;
  for (const gen of domainState.lineage) {
    const found = gen.iterations.find(it => it.id === iterId);
    if (found) { targetIter = found; break; }
  }
  if (!targetIter) {
    targetIter = domainState.savedLibrary.find(it => it.id === iterId);
  }

  if (!targetIter) return;

  domainState.selectedParentId = targetIter.id;
  domainState.selectedParentGenome = targetIter;
  domainState.dna = [...targetIter.dna];

  // Restore 6 Domain B Sliders to iteration DNA
  const sliderIds = ['slider-dna-c', 'slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g'];
  sliderIds.forEach((sId, idx) => {
    const sEl = document.getElementById(sId);
    if (sEl) sEl.value = Math.round((targetIter.dna[idx] || 0) * 100);
  });

  updateDnaUIAndViewport();

  renderLineageHistoryUI();
  alert(`Current Parent set to ${targetIter.id}! Domain B sliders updated to parent DNA.`);
}

/**
 * VISUAL LINEAGE HISTORY TREE
 */
function renderLineageHistoryUI() {
  const container = document.getElementById('lineage-history-tree');
  if (!container) return;

  let html = `<span class="lineage-node ${domainState.selectedParentId === 'RHINO-SEED' ? 'active' : ''}" onclick="selectSeedParent()">RHINO SEED (GEN 0)</span>`;

  domainState.lineage.forEach(gen => {
    html += ` <span class="lineage-arrow">→</span> `;
    html += `<div class="lineage-gen-group">`;
    html += `<span class="lineage-gen-label">GEN ${gen.genIndex}</span>`;
    gen.iterations.forEach(it => {
      const isSel = (domainState.selectedParentId === it.id);
      html += `<span class="lineage-node ${isSel ? 'active' : ''}" onclick="selectIteration('${it.id}')">${it.id}</span>`;
    });
    html += `</div>`;
  });

  container.innerHTML = html;
}

function selectSeedParent() {
  domainState.selectedParentId = 'RHINO-SEED';
  domainState.selectedParentGenome = null;
  domainState.dna = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];

  const sliderIds = ['slider-dna-c', 'slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g'];
  sliderIds.forEach(sId => {
    const sEl = document.getElementById(sId);
    if (sEl) sEl.value = 0;
  });

  updateDnaUIAndViewport();

  const badge = document.getElementById('selected-iter-readout');
  if (badge) badge.style.display = 'none';

  const panel = document.getElementById('design-reasoning-panel');
  if (panel) panel.style.display = 'none';

  renderLineageHistoryUI();
}

/**
 * COMPARE SELECTION LOGIC
 */
function toggleCompareSelect(iterId) {
  const idx = domainState.selectedForCompare.indexOf(iterId);
  if (idx >= 0) {
    domainState.selectedForCompare.splice(idx, 1);
  } else {
    if (domainState.selectedForCompare.length >= 4) {
      alert('You can compare a maximum of 4 iterations simultaneously.');
      return;
    }
    domainState.selectedForCompare.push(iterId);
  }
  updateCompareCountUI();
}

function updateCompareCountUI() {
  const cnt = domainState.selectedForCompare.length;
  const btn = document.getElementById('btn-compare-selected');
  const cntSpan = document.getElementById('compare-count');
  if (btn && cntSpan) {
    cntSpan.textContent = cnt;
    btn.style.display = cnt >= 2 ? 'inline-block' : 'none';
  }

  const tabBtn = document.getElementById('btn-tab-compare-selected');
  const tabCntSpan = document.getElementById('tab-compare-count');
  if (tabBtn && tabCntSpan) {
    tabCntSpan.textContent = cnt;
    tabBtn.style.display = cnt >= 2 ? 'inline-block' : 'none';
  }
}

function openCompareModalFromTab() {
  renderCompareModalUI();
}

window.openCompareModalFromTab = openCompareModalFromTab;

/**
 * RENDER MULTI-ITERATION COMPARE MODAL
 */
function renderCompareModal() {
  const modal = document.getElementById('compare-modal-overlay');
  const cardsGrid = document.getElementById('compare-cards-grid');
  const tableContainer = document.getElementById('compare-table-container');

  if (!modal || !cardsGrid || !tableContainer) return;

  const compareItems = [];
  domainState.selectedForCompare.forEach(id => {
    let found = null;
    for (const gen of domainState.lineage) {
      found = gen.iterations.find(it => it.id === id);
      if (found) break;
    }
    if (!found) found = domainState.savedLibrary.find(it => it.id === id);
    if (found) compareItems.push(found);
  });

  if (compareItems.length < 2) {
    alert('Select at least 2 iterations to compare.');
    return;
  }

  modal.style.display = 'flex';
  cardsGrid.innerHTML = '';

  compareItems.forEach(iter => {
    const card = document.createElement('div');
    card.className = 'compare-card';
    card.innerHTML = `
      <div style="display:flex; justify-space-between; align-items:center;">
        <strong style="color:#ffffff; font-family:monospace; font-size:12px;">${iter.id}</strong>
        <span class="badge badge-seed">GEN ${iter.generation}</span>
      </div>
      <div style="font-size:9px; color:#00ffff; font-weight:700;">${iter.dominantPrinciple}</div>
      <div style="font-size:8px; color:#aaaaaa;">FORM DNA: ${iter.dna.map(v=>Math.round(v*100)).join('/')}</div>
      
      <div class="iter-thumb-wrapper" style="height:90px;">
        <canvas id="canvas-compare-${iter.id}" width="200" height="120" class="iter-canvas"></canvas>
      </div>

      <div style="font-size:9px; color:#ffd700;">Seed Identity: ${iter.seedSimilarity}%</div>
      <div style="font-size:8px; color:#cccccc; line-height:1.3;">Study: ${iter.studyVariable} = ${iter.studyValuePct}%</div>
      <button class="btn btn-iter-select" style="margin-top:4px;" onclick="useAsParent('${iter.id}')">USE AS PARENT</button>
    `;
    cardsGrid.appendChild(card);

    setTimeout(() => {
      render3DMeshThumbnail(iter, `canvas-compare-${iter.id}`);
    }, 40);
  });

  // Parameter Comparison Table
  let tableHtml = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>METRIC / PARAMETER</th>
          ${compareItems.map(it => `<th>${it.id}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Dominant Principle</td>
          ${compareItems.map(it => `<td>${it.dominantPrinciple}</td>`).join('')}
        </tr>
        <tr>
          <td>Form DNA</td>
          ${compareItems.map(it => `<td>${it.dna.map(v=>Math.round(v*100)).join('/')}</td>`).join('')}
        </tr>
        <tr>
          <td>Studied Variable</td>
          ${compareItems.map(it => `<td>${it.studyVariable} = ${it.studyValuePct}%</td>`).join('')}
        </tr>
        <tr>
          <td>Seed Identity %</td>
          ${compareItems.map(it => `<td style="color:#ffd700; font-weight:700;">${it.seedSimilarity}%</td>`).join('')}
        </tr>
        <tr>
          <td>Verticality</td>
          ${compareItems.map(it => `<td>${it.measuredOutput.verticality}</td>`).join('')}
        </tr>
        <tr>
          <td>Asymmetry</td>
          ${compareItems.map(it => `<td>${it.measuredOutput.asymmetry}%</td>`).join('')}
        </tr>
      </tbody>
    </table>
  `;

  tableContainer.innerHTML = tableHtml;
}

/**
 * RENDER PERSISTENT ITERATION LIBRARY UI
 */
function updateLibraryUI() {
  const badge = document.getElementById('lib-count-badge');
  if (badge) badge.textContent = domainState.savedLibrary.length;
  const tabBadge = document.getElementById('lib-tab-count-badge');
  if (tabBadge) tabBadge.textContent = domainState.savedLibrary.length;

  const grid = document.getElementById('library-cards-grid');
  if (!grid) return;

  let items = [...domainState.savedLibrary];

  // Filtering
  if (domainState.filterPrinciple !== 'ALL') {
    items = items.filter(it => it.dominantPrinciple === domainState.filterPrinciple);
  }
  if (domainState.filterGeneration !== 'ALL') {
    items = items.filter(it => it.generation === parseInt(domainState.filterGeneration));
  }
  if (domainState.favoritesOnly) {
    items = items.filter(it => it.isFavorite);
  }

  // Sorting
  switch (domainState.sortBy) {
    case 'HIGHEST_IDENTITY': items.sort((a, b) => b.seedSimilarity - a.seedSimilarity); break;
    case 'HIGHEST_DIFFERENCE': items.sort((a, b) => (b.siblingDiff || 0) - (a.siblingDiff || 0)); break;
    case 'PRINCIPLE': items.sort((a, b) => (a.dominantPrinciple || '').localeCompare(b.dominantPrinciple || '')); break;
    case 'GENERATION': items.sort((a, b) => b.generation - a.generation); break;
    default: items.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); break;
  }

  grid.innerHTML = '';
  if (items.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color:#777777; font-family:monospace; text-align:center; padding:30px;">No saved iterations match the current filters.</div>`;
    return;
  }

  items.forEach(iter => {
    const card = document.createElement('div');
    card.className = 'lib-card';
    card.innerHTML = `
      <div class="lib-card-fav ${iter.isFavorite?'active':''}" onclick="toggleFavoriteLibrary('${iter.id}')">★</div>
      <div class="lib-card-title">${iter.id} <span style="font-size:9px; color:#888888;">(GEN ${iter.generation})</span></div>
      
      <div class="iter-thumb-wrapper" style="height:85px;">
        <canvas id="canvas-lib-${iter.id}" width="180" height="110" class="iter-canvas"></canvas>
      </div>

      <div style="font-size:9px; color:#00ffff; font-weight:700;">${iter.dominantPrinciple}</div>
      <div style="font-size:8px; color:#aaaaaa;">DNA: ${iter.dna.map(v=>Math.round(v*100)).join('/')}</div>
      <div style="font-size:8px; color:#ffd700;">Seed Identity: ${iter.seedSimilarity}%</div>
      <div style="font-size:8px; color:#ffffff;">${iter.studyVariable} = ${iter.studyValuePct}%</div>

      <div class="lib-card-actions">
        <button class="btn-lib-action highlight" onclick="openLibraryDetail('${iter.id}')">OPEN</button>
        <button class="btn-lib-action" onclick="toggleCompareSelect('${iter.id}'); renderCompareModal();">COMPARE</button>
        <button class="btn-lib-action" onclick="useAsParent('${iter.id}')">USE PARENT</button>
        <button class="btn-lib-action" style="color:#ff4444;" onclick="deleteIterationFromDB('${iter.id}')">DELETE</button>
      </div>
    `;

    grid.appendChild(card);

    setTimeout(() => {
      render3DMeshThumbnail(iter, `canvas-lib-${iter.id}`);
    }, 40);
  });
}

function toggleFavoriteLibrary(iterId) {
  const item = domainState.savedLibrary.find(it => it.id === iterId);
  if (item) {
    item.isFavorite = !item.isFavorite;
    saveIterationToDB(item);
  }
}

/**
 * OPEN LIBRARY DETAIL MODAL (WITH INTERACTIVE 3D CANVAS)
 */
let detailThreeScene = null;
let detailThreeCamera = null;
let detailThreeRenderer = null;
let detailThreeControls = null;

function openLibraryDetail(iterId) {
  const iter = domainState.savedLibrary.find(it => it.id === iterId);
  if (!iter) return;

  const modal = document.getElementById('library-detail-modal-overlay');
  if (!modal) return;

  modal.style.display = 'flex';

  document.getElementById('det-title').textContent = `SAVED ITERATION: ${iter.id} (GEN ${iter.generation})`;
  document.getElementById('det-principle').textContent = `DOMINANT: ${iter.dominantPrinciple}`;
  document.getElementById('det-intent').textContent = `"Hierarchical Art Nouveau Shape Grammar transformation."`;
  document.getElementById('det-seed-id').textContent = `${iter.seedSimilarity}%`;
  document.getElementById('det-parent-sim').textContent = `${iter.parentSimilarity || 100}%`;
  document.getElementById('det-target-region').textContent = `Studied Variable: ${iter.studyVariable} = ${iter.studyValuePct}%`;

  document.getElementById('det-recipe-seq').textContent = `CONTINUITY → BRANCHING → WHIPLASH → MERGING → POS/NEG → GROWTH`;

  const m = iter.measuredOutput || {};
  document.getElementById('det-measured-out').textContent = `Height: ${m.heightChangePct > 0 ? '+' : ''}${m.heightChangePct || 0}% | Width: ${m.widthChangePct > 0 ? '+' : ''}${m.widthChangePct || 0}% | Verticality: ${m.verticality || 0} | Asymmetry: ${m.asymmetry || 0}%`;

  document.getElementById('det-why-text').textContent = iter.whyText;
  document.getElementById('det-lineage-path').textContent = `Rhino Seed → Parent: ${iter.parentId} → ${iter.id}`;

  const btnUse = document.getElementById('det-btn-use-parent');
  if (btnUse) btnUse.onclick = () => { useAsParent(iter.id); modal.style.display = 'none'; };

  const btnDel = document.getElementById('det-btn-delete');
  if (btnDel) btnDel.onclick = () => { deleteIterationFromDB(iter.id); modal.style.display = 'none'; };

  initDetail3DCanvas(iter);
}

function initDetail3DCanvas(iter) {
  const container = document.getElementById('detail-3d-container');
  if (!container || !window.getOriginalMeshPositions || !window.applyArtNouveauDNA) return;

  container.innerHTML = '';

  const w = container.clientWidth || 450;
  const h = container.clientHeight || 450;

  detailThreeScene = new THREE.Scene();
  detailThreeScene.background = new THREE.Color(0x080808);

  detailThreeCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  detailThreeCamera.position.set(20, 20, 30);

  detailThreeRenderer = new THREE.WebGLRenderer({ antialias: true });
  detailThreeRenderer.setSize(w, h);
  container.appendChild(detailThreeRenderer.domElement);

  if (window.THREE && THREE.OrbitControls) {
    detailThreeControls = new THREE.OrbitControls(detailThreeCamera, detailThreeRenderer.domElement);
  }

  const ambLight = new THREE.AmbientLight(0xffffff, 0.6);
  detailThreeScene.add(ambLight);
  const dirLight = new THREE.DirectionalLight(0x00ffff, 0.8);
  dirLight.position.set(10, 20, 15);
  detailThreeScene.add(dirLight);

  // Build Geometry Mesh
  const origPos = window.getOriginalMeshPositions();
  const bounds = window.getModelBounds();
  const defPos = window.applyArtNouveauDNA(origPos, iter.dna, bounds, domainState.seedIdentityThreshold);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(defPos, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    wireframe: true,
    roughness: 0.4
  });

  const mesh = new THREE.Mesh(geometry, material);
  detailThreeScene.add(mesh);

  function animate() {
    if (modalIsVisible('library-detail-modal-overlay')) {
      requestAnimationFrame(animate);
      if (detailThreeControls) detailThreeControls.update();
      detailThreeRenderer.render(detailThreeScene, detailThreeCamera);
    }
  }
  animate();
}

function modalIsVisible(id) {
  const el = document.getElementById(id);
  return el && el.style.display !== 'none';
}

/**
 * EXPORT / IMPORT LIBRARY JSON
 */
function exportLibraryToJSON() {
  const exportData = {
    seedIdentifier: 'RHINO-SEED-GEN-0',
    exportTimestamp: new Date().toISOString(),
    savedIterations: domainState.savedLibrary
  };
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `art_nouveau_design_library_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importLibraryFromJSON(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    const items = parsed.savedIterations || (Array.isArray(parsed) ? parsed : []);
    items.forEach(item => {
      saveIterationToDB(item);
    });
    alert(`Successfully imported ${items.length} saved iterations into your Iteration Library!`);
  } catch(e) {
    alert('Failed to import JSON library file. Format invalid.');
  }
}

/**
 * RENDER ACTUAL 3D MESH THUMBNAIL ON CANVAS
 */
function render3DMeshThumbnail(iter, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.getOriginalMeshPositions || !window.applyArtNouveauDNA) return;

  const origPos = window.getOriginalMeshPositions();
  const bounds = window.getModelBounds();
  if (!origPos || !bounds) return;

  const defPos = window.applyArtNouveauDNA(origPos, iter.dna, bounds, domainState.seedIdentityThreshold);

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 1.2;
  ctx.beginPath();

  const minY = bounds.min ? bounds.min.y : (bounds.minY || -10);
  const maxY = bounds.max ? bounds.max.y : (bounds.maxY || 10);
  const centerX = bounds.center ? bounds.center.x : (bounds.centerX || 0);

  const heightSpan = Math.max(1.0, Math.abs(maxY - minY));
  const sampleStep = 5;

  for (let i = 0; i < defPos.length; i += sampleStep * 9) {
    const x1 = defPos[i];
    const y1 = defPos[i + 1];
    const x2 = defPos[i + 3];
    const y2 = defPos[i + 4];

    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) continue;

    const px1 = (w / 2) + ((x1 - centerX) / heightSpan) * (w * 0.65);
    const py1 = h * 0.85 - ((y1 - minY) / heightSpan) * (h * 0.70);
    const px2 = (w / 2) + ((x2 - centerX) / heightSpan) * (w * 0.65);
    const py2 = h * 0.85 - ((y2 - minY) / heightSpan) * (h * 0.70);

    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
  }
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.fillText(iter.id, 6, 14);
}

// INITIALIZE EVENT LISTENERS FOR DOMAIN B & C
window.addEventListener('DOMContentLoaded', () => {
  initIndexedDB();
  setupDnaSliderListeners();

  // Variation Range Segmented Control
  const varBtns = document.querySelectorAll('#group-variation-range .btn-segment');
  varBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      varBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      domainState.variationRange = btn.dataset.val;
    });
  });

  // Generation Strategy Segmented Control
  const stratBtns = document.querySelectorAll('#group-generation-strategy .btn-segment');
  stratBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      stratBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      domainState.generationStrategy = btn.dataset.val;
    });
  });

  // Pop Size Segmented Control
  const popBtns = document.querySelectorAll('#group-pop-size .btn-segment');
  popBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      popBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      domainState.populationSize = parseInt(btn.dataset.val);
    });
  });

  // Generate Button
  const genBtn = document.getElementById('btn-generate-iterations');
  if (genBtn) {
    genBtn.addEventListener('click', () => {
      generatePopulation();
    });
  }

  // Open Library Button
  const openLibBtn = document.getElementById('btn-open-library');
  if (openLibBtn) {
    openLibBtn.addEventListener('click', () => {
      const modal = document.getElementById('library-modal-overlay');
      if (modal) {
        modal.style.display = 'flex';
        updateLibraryUI();
      }
    });
  }

  // Close Library Button
  const closeLibBtn = document.getElementById('btn-close-library');
  if (closeLibBtn) {
    closeLibBtn.addEventListener('click', () => {
      const modal = document.getElementById('library-modal-overlay');
      if (modal) modal.style.display = 'none';
    });
  }

  // Library Filter & Sort Handlers
  const libFiltPrinc = document.getElementById('lib-filter-principle');
  if (libFiltPrinc) {
    libFiltPrinc.addEventListener('change', (e) => {
      domainState.filterPrinciple = e.target.value;
      updateLibraryUI();
    });
  }
  const libFiltGen = document.getElementById('lib-filter-gen');
  if (libFiltGen) {
    libFiltGen.addEventListener('change', (e) => {
      domainState.filterGeneration = e.target.value;
      updateLibraryUI();
    });
  }
  const libSort = document.getElementById('lib-sort-by');
  if (libSort) {
    libSort.addEventListener('change', (e) => {
      domainState.sortBy = e.target.value;
      updateLibraryUI();
    });
  }
  const btnFavToggle = document.getElementById('btn-toggle-favorites');
  if (btnFavToggle) {
    btnFavToggle.addEventListener('click', () => {
      domainState.favoritesOnly = !domainState.favoritesOnly;
      btnFavToggle.classList.toggle('active', domainState.favoritesOnly);
      updateLibraryUI();
    });
  }

  // Export / Import JSON Handlers
  const btnExport = document.getElementById('btn-export-library');
  if (btnExport) btnExport.addEventListener('click', exportLibraryToJSON);

  const inputImport = document.getElementById('import-json-input');
  if (inputImport) {
    inputImport.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => importLibraryFromJSON(evt.target.result);
        reader.readAsText(file);
      }
    });
  }

  // Compare Selected Button
  const btnCompare = document.getElementById('btn-compare-selected');
  if (btnCompare) btnCompare.addEventListener('click', renderCompareModal);

  const closeCompare = document.getElementById('btn-close-compare');
  if (closeCompare) {
    closeCompare.addEventListener('click', () => {
      const modal = document.getElementById('compare-modal-overlay');
      if (modal) modal.style.display = 'none';
    });
  }

  // Close Reasoning Panel Button
  const closeReasoning = document.getElementById('btn-close-reasoning');
  if (closeReasoning) {
    closeReasoning.addEventListener('click', () => {
      const panel = document.getElementById('design-reasoning-panel');
      if (panel) panel.style.display = 'none';
    });
  }

  // Close Detail View Button
  const closeDetail = document.getElementById('btn-close-detail');
  if (closeDetail) {
    closeDetail.addEventListener('click', () => {
      const modal = document.getElementById('library-detail-modal-overlay');
      if (modal) modal.style.display = 'none';
    });
  }

  // Initial UI sync
  updateDnaUIAndViewport();
});

// EXPOSE GLOBALLY
window.domainState = domainState;
window.generatePopulation = generatePopulation;
window.analyzeSeedIdentity = analyzeSeedIdentity;
window.selectIteration = selectIteration;
window.selectSeedParent = selectSeedParent;
window.useAsParent = useAsParent;
window.toggleCompareSelect = toggleCompareSelect;
window.renderCompareModal = renderCompareModal;
window.saveToLibraryHandler = saveToLibraryHandler;
window.openLibraryDetail = openLibraryDetail;
window.toggleFavoriteLibrary = toggleFavoriteLibrary;
window.deleteIterationFromDB = deleteIterationFromDB;
window.updateDnaUIAndViewport = updateDnaUIAndViewport;

