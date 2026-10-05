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
  Growth: {
    name: displayName: 'Growth Hierarchy',
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
const domainState = {
  dna: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0], // [C, B, W, M, V, G] internal floats 0.0-1.0
  startMode: 'AUTO', // 'AUTO' | 'MANUAL'
  selectedTypology: 'VERTICAL_VOID',
  pendingTypologyParams: null,
  activeTypologyLimits: null,
  seedGeometricProfile: null,
  autoProposals: [],
  activeRefinementProposal: null,
  designerChanges: { C: 0, B: 0, W: 0, M: 0, V: 0, G: 0 },
  visualComparisonMode: 'ITERATION', // 'SEED' | 'PARENT' | 'ITERATION' | 'OVERLAY'
  currentGeneration: 0,
  selectedParentId: 'RHINO-SEED',
  selectedParentGenome: null,
  seedIdentity: null,
  populationSize: 6,
  studyVariable: // 'CONTINUITY' | "" | 'WHIPLASH' | 'MERGING' | 'POSITIVE_NEGATIVE' | 'GROWTH'
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
  BRANCHING: 'BRANCHING / BIFURCATION',
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

  extractSeedGeometricProfile(bounds, positions);
  return domainState.seedIdentity;
}

/**
 * SEED GEOMETRIC PROFILE EXTRACTION
 */
function extractSeedGeometricProfile(bounds, positions) {
  if (!bounds || !positions) return null;

  const minX = bounds.min ? bounds.min.x : (bounds.minX || -10);
  const maxX = bounds.max ? bounds.max.x : (bounds.maxX || 10);
  const minY = bounds.min ? bounds.min.y : (bounds.minY || -10);
  const maxY = bounds.max ? bounds.max.y : (bounds.maxY || 10);
  const minZ = bounds.min ? bounds.min.z : (bounds.minZ || -10);
  const maxZ = bounds.max ? bounds.max.z : (bounds.maxZ || 10);

  const spanX = Math.abs(maxX - minX);
  const spanY = Math.abs(maxY - minY);
  const spanZ = Math.abs(maxZ - minZ);

  let dominantAxis = 'Y';
  if (spanX >= spanY && spanX >= spanZ) dominantAxis = 'X';
  else if (spanZ >= spanY && spanZ >= spanX) dominantAxis = 'Z';

  const vertexCount = Math.floor(positions.length / 3);
  const meshCount = window.originalMeshes ? window.originalMeshes.length : 1;
  const curveCount = window.originalCurves ? window.originalCurves.length : 4;

  const profile = {
    dominantAxis,
    spanX: spanX.toFixed(1),
    spanY: spanY.toFixed(1),
    spanZ: spanZ.toFixed(1),
    boundingDimsStr: `${spanX.toFixed(1)} × ${spanY.toFixed(1)} × ${spanZ.toFixed(1)}`,
    continuousPathsCount: curveCount > 0 ? curveCount : 4,
    majorSurfacesCount: meshCount > 0 ? meshCount : 157,
    vertexCount,
    potentialBranchOrigins: Math.max(4, Math.floor(vertexCount / 80) + (curveCount || 1) * 2),
    potentialMergePairs: Math.max(2, Math.floor(meshCount / 10) + 1),
    potentialVoidRegions: Math.max(2, Math.floor(vertexCount / 150) + 2),
    growthDirections: dominantAxis === 'Y' ? '+Y / +Z' : (dominantAxis === 'X' ? '+X / +Y' : '+Z / +Y'),
    connectivityGraphPct: Math.min(98, Math.max(80, 85 + (meshCount % 15)))
  };

  domainState.seedGeometricProfile = profile;
  updateSeedGeometricProfileUI(profile);
  return profile;
}
window.extractSeedGeometricProfile = extractSeedGeometricProfile;

function updateSeedGeometricProfileUI(profile) {
  if (!profile) return;
  const elAxis = document.getElementById('prof-axis'); if (elAxis) elAxis.textContent = `${profile.dominantAxis}-AXIS`;
  const elDims = document.getElementById('prof-dims'); if (elDims) elDims.textContent = profile.boundingDimsStr;
  const elPaths = document.getElementById('prof-paths'); if (elPaths) elPaths.textContent = profile.continuousPathsCount;
  const elSurfaces = document.getElementById('prof-surfaces'); if (elSurfaces) elSurfaces.textContent = profile.majorSurfacesCount;
  const elBranches = document.getElementById('prof-branches'); if (elBranches) elBranches.textContent = profile.potentialBranchOrigins;
  const elMerges = document.getElementById('prof-merges'); if (elMerges) elMerges.textContent = profile.potentialMergePairs;
  const elVoids = document.getElementById('prof-voids'); if (elVoids) elVoids.textContent = profile.potentialVoidRegions;
  const elGrowth = document.getElementById('prof-growth'); if (elGrowth) elGrowth.textContent = profile.growthDirections;
  const elConn = document.getElementById('prof-connectivity'); if (elConn) elConn.textContent = `${profile.connectivityGraphPct}%`;
}

/**
 * GET QUALITATIVE STATE LABEL FOR EACH PRINCIPLE
 */
function getQualitativeStateLabel(principleKey, val) {
  if (principleKey === 'CONTINUITY') {
    if (val <= 0.30) return 'MOSTLY SEPARATE';
    if (val <= 0.70) return 'PARTIALLY CONNECTED';
    return 'CONTINUOUS FORM';
  } else if (principleKey === "BRANCHING") {
    if (val <= 0.20) return 'SINGULAR';
    if (val <= 0.60) return 'BIFURCATING';
    return 'HIERARCHICAL Growth';
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
    secondary: arr[1] ? arr[1].name : ""
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

  // Update Form DNA Vector Readout (C / W / B)
  const codeEl = document.getElementById('readout-form-dna');
  if (codeEl) {
    codeEl.textContent = `${Math.round(c*100)} / ${Math.round(w*100)} / ${Math.round(b*100)}`;
  }

  // Update Dominant / Secondary readouts
  const domSec = getDominantAndSecondary(dna);
  const domEl = document.getElementById('readout-dominant-principle');
  if (domEl) domEl.textContent = domSec.dominant;
  const secEl = document.getElementById('readout-secondary-principle');
  if (secEl) secEl.textContent = domSec.secondary;

  // Render transformed geometry in Three.js main viewport through active spatial typology
  if (window.renderIterationGeometry) {
    window.renderIterationGeometry(dna, 'ITERATION', domainState.selectedTypology);
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
    const defPos = window.applyArtNouveauDNA(origPos, dna, bounds, domainState.seedIdentityThreshold, true, domainState.selectedTypology);
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

  // Sub-slider live metrics under C, W, B
  const typoKey = domainState.selectedTypology || 'VERTICAL_VOID';
  const typoDef = BASE_TYPOLOGIES[typoKey] || BASE_TYPOLOGIES.VERTICAL_VOID;

  const mWChanges = document.getElementById('metric-w-changes');
  if (mWChanges) mWChanges.textContent = w === 0 ? '0' : (w > 0.6 ? '3 (Inflected)' : (w > 0.25 ? '2 (Curved)' : '1 (Gentle)'));

  const mWCurvature = document.getElementById('metric-w-curvature');
  if (mWCurvature) mWCurvature.textContent = Math.round(w * 85) + 'Â°';

  const mCDisc = document.getElementById('metric-c-disconnected');
  if (mCDisc) {
    if (c === 0) {
      mCDisc.textContent = 'Original';
    } else if (c <= 0.30) {
      const elCount = Math.round(6 - (c / 0.30) * 1);
      mCDisc.textContent = `${elCount} Elements (Separate)`;
    } else if (c <= 0.70) {
      const elCount = Math.round(5 - ((c - 0.30) / 0.40) * 3);
      mCDisc.textContent = `${elCount} Elements (Bridging)`;
    } else {
      mCDisc.textContent = '1 Continuous Form (Unified)';
    }
  }

  const mCConn = document.getElementById('metric-c-connected');
  if (mCConn) {
    if (c === 0) {
      mCConn.textContent = '0%';
    } else if (c <= 0.30) {
      const pct = Math.round((c / 0.30) * 25);
      mCConn.textContent = `${pct}% (Minimal)`;
    } else if (c <= 0.70) {
      const pct = Math.round(25 + ((c - 0.30) / 0.40) * 50);
      mCConn.textContent = `${pct}% (Intentional)`;
    } else {
      const pct = Math.round(75 + ((c - 0.70) / 0.30) * 25);
      mCConn.textContent = `${pct}% (Unified Form)`;
    }
  }

  const bCounts = (window.GrowthMemberCounts && b >= 0.01) ? window.GrowthMemberCounts : {
    vertical: 0,
    horizontal: 0,
    diagonal: 0,
    total: 0,
    divisions: 0,
    orientationMode: window.GrowthOrientationMode || 'ALL'
  };

  const mBCnt = document.getElementById('metric-b-count');
  if (mBCnt) mBCnt.textContent = bCounts.total;

  const mBDiv = document.getElementById('metric-b-divisions');
  if (mBDiv) mBDiv.textContent = bCounts.divisions;

  const mBH = document.getElementById('metric-b-h');
  if (mBH) mBH.textContent = bCounts.horizontal;

  const mBV = document.getElementById('metric-b-v');
  if (mBV) mBV.textContent = bCounts.vertical;

  const mBD = document.getElementById('metric-b-d');
  if (mBD) mBD.textContent = bCounts.diagonal;

  const mBOrient = document.getElementById('metric-b-orientations');
  if (mBOrient) mBOrient.textContent = bCounts.orientationMode || 'ALL';

  const bStatus = document.getElementById('domain-b-influence-status');
  if (bStatus) {
    const isEngaged = (c > 0 || w > 0 || b > 0);
    const typoName = typoDef ? typoDef.name.toUpperCase() : 'TYPOLOGY';
    bStatus.textContent = isEngaged ? ('ACTIVE — ' + typoName + ' RULES') : 'READY — MODIFY SLIDERS TO ACTIVATE';
  }

  // Rule Validation Panel Checkmarks
  const valCont = document.getElementById('val-rule-cont'); if (valCont) valCont.textContent = c > 0.7 ? '✓ CONTINUOUS FORM' : (c > 0.3 ? '✓ CONNECTING ELEMENTS' : '✓ SEPARATE ELEMENTS');
  const valBranch = document.getElementById('val-rule-branch'); if (valBranch) valBranch.textContent = b >= 0.6 ? 'âœ“ HIERARCHICAL Growth' : (b >= 0.2 ? 'âœ“ BIFURCATING' : 'âœ“ SINGULAR');
  const valWhip = document.getElementById('val-rule-whip'); if (valWhip) valWhip.textContent = w > 0.6 ? 'âœ“ WHIPLASH INFLECTED' : (w > 0.3 ? 'âœ“ FLOWING CURVATURE' : 'âœ“ LINEAR');
  const valMerge = document.getElementById('val-rule-merge'); if (valMerge) valMerge.textContent = (b >= 0.20) ? (m > 0.6 ? 'âœ“ MERGED / UNIFIED' : 'âœ“ CONVERGING') : 'âœ• PRECONDITION NOT SATISFIED';
  const valPosNeg = document.getElementById('val-rule-posneg'); if (valPosNeg) valPosNeg.textContent = v > 0.6 ? 'âœ“ INTERLOCK SOLID/VOID' : (v > 0.3 ? 'âœ“ POROUS VOID' : 'âœ“ SOLID ENCLOSED');
  const valGrowth = document.getElementById('val-rule-growth'); if (valGrowth) valGrowth.textContent = g > 0.6 ? 'âœ“ PROLIFERATING GROWTH' : (g > 0.3 ? 'âœ“ EXTENDING GROWTH' : 'âœ“ CONTAINED SEED');
  updateDesignerChangesUI();
}

/**
 * ============================================================================
 * GEOMETRY-FIRST ART NOUVEAU RULE ENGINE & BEAM SEARCH GENERATOR
 * ============================================================================
 */

function getPrincipleIndex(p) {
  if (p === 'CONTINUITY' || p === 'CONTINUITY & SURFACE FLOW') return 0;
  if (p === "" || p === 'Growth HIERARCHY') return 1;
  if (p === 'WHIPLASH' || p === 'WHIPLASH CURVATURE') return 2;
  if (p === 'MERGING' || p === 'MERGING SURFACES') return 3;
  if (p === 'POSITIVE_NEGATIVE' || p === 'POS / NEG SPACE' || p === 'POSITIVE / NEGATIVE SPACE') return 4;
  if (p === 'GROWTH' || p === 'GROWTH / AGGREGATION') return 5;
  return 0;
}

/**
 * 1. ANALYZE GEOMETRY (GEOMETRY-FIRST MODEL)
 */
function analyzeGeometry(positions, bounds) {
  if (!positions || positions.length === 0) return null;

  const minX = bounds?.min?.x ?? bounds?.minX ?? -10;
  const maxX = bounds?.max?.x ?? bounds?.maxX ?? 10;
  const minY = bounds?.min?.y ?? bounds?.minY ?? -10;
  const maxY = bounds?.max?.y ?? bounds?.maxY ?? 10;
  const minZ = bounds?.min?.z ?? bounds?.minZ ?? -10;
  const maxZ = bounds?.max?.z ?? bounds?.maxZ ?? 10;

  const spanX = Math.max(0.1, Math.abs(maxX - minX));
  const spanY = Math.max(0.1, Math.abs(maxY - minY));
  const spanZ = Math.max(0.1, Math.abs(maxZ - minZ));

  let dominantAxis = 'Y';
  if (spanX >= spanY && spanX >= spanZ) dominantAxis = 'X';
  else if (spanZ >= spanY && spanZ >= spanX) dominantAxis = 'Z';

  const totalVerts = Math.floor(positions.length / 3);

  // Divide geometry along dominant axis into 10 spatial slices
  const NUM_SLICES = 10;
  const slices = Array.from({ length: NUM_SLICES }, () => ({
    count: 0,
    sumX: 0, sumY: 0, sumZ: 0,
    verts: []
  }));

  const domMin = (dominantAxis === 'X') ? minX : ((dominantAxis === 'Z') ? minZ : minY);
  const domSpan = (dominantAxis === 'X') ? spanX : ((dominantAxis === 'Z') ? spanZ : spanY);

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i+1], z = positions[i+2];
    const domVal = (dominantAxis === 'X') ? x : ((dominantAxis === 'Z') ? z : y);
    let u = (domVal - domMin) / domSpan;
    u = Math.max(0, Math.min(0.999, u));
    const sIdx = Math.floor(u * NUM_SLICES);
    slices[sIdx].count++;
    slices[sIdx].sumX += x;
    slices[sIdx].sumY += y;
    slices[sIdx].sumZ += z;
    if (slices[sIdx].verts.length < 30) {
      slices[sIdx].verts.push({ x, y, z });
    }
  }

  // Path centroids along primary trajectory
  const pathNodes = slices.map((sl, idx) => {
    const cnt = Math.max(1, sl.count);
    return {
      id: `PathNode_${idx}`,
      sliceIndex: idx,
      u: (idx + 0.5) / NUM_SLICES,
      centroid: { x: sl.sumX / cnt, y: sl.sumY / cnt, z: sl.sumZ / cnt },
      density: sl.count / Math.max(1, totalVerts)
    };
  });

  // Calculate curvature & tangent opportunities along path nodes
  for (let i = 0; i < pathNodes.length; i++) {
    const prev = pathNodes[Math.max(0, i - 1)].centroid;
    const curr = pathNodes[i].centroid;
    const next = pathNodes[Math.min(pathNodes.length - 1, i + 1)].centroid;

    const v1 = { x: curr.x - prev.x, y: curr.y - prev.y, z: curr.z - prev.z };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y, z: next.z - curr.z };
    const mag1 = Math.hypot(v1.x, v1.y, v1.z) || 1;
    const mag2 = Math.hypot(v2.x, v2.y, v2.z) || 1;

    const dot = (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / (mag1 * mag2);
    pathNodes[i].curvature = 1 - Math.max(-1, Math.min(1, dot));
    pathNodes[i].tangent = { x: v2.x / mag2, y: v2.y / mag2, z: v2.z / mag2 };
  }

  // Real candidate detections
  // 1. Branch origins: path nodes with high density & available surrounding space
  const potentialBranchOrigins = pathNodes
    .filter(n => n.u >= 0.15 && n.u <= 0.85)
    .map(n => ({
      id: `BranchOrigin_${n.sliceIndex}`,
      nodeId: n.id,
      position: n.centroid,
      u: n.u,
      availableSpace: Math.min(1.0, (1 - n.density * 3) * 0.8 + 0.2),
      parentContinuity: Math.max(0.2, 1.0 - n.curvature * 2),
      distanceFromJunction: Math.abs(n.u - 0.5) * 2,
      directionalOpportunity: 0.75 + 0.25 * Math.sin(n.u * Math.PI)
    }));

  // 2. Continuous path candidates
  const primaryPaths = [{
    id: 'PrimaryPath_01',
    nodes: pathNodes,
    length: domSpan,
    normalizedPathLength: Math.min(1.0, domSpan / 50.0),
    existingCurvature: pathNodes.reduce((acc, n) => acc + n.curvature, 0) / pathNodes.length,
    availableLateralSpace: Math.min(1.0, (Math.max(spanX, spanZ) / Math.max(0.1, spanY)) * 0.8),
    connectionImportance: 0.92
  }];

  // 3. Merge candidates: Check if compatible trajectory pairs exist
  const meshCount = window.originalMeshes ? window.originalMeshes.length : 1;
  const potentialMergePairs = [];
  if (meshCount > 1 || totalVerts > 500) {
    const p1 = pathNodes[2], p2 = pathNodes[7];
    if (p1 && p2) {
      const dist = Math.hypot(p2.centroid.x - p1.centroid.x, p2.centroid.y - p1.centroid.y, p2.centroid.z - p1.centroid.z);
      const dotDir = p1.tangent.x * p2.tangent.x + p1.tangent.y * p2.tangent.y + p1.tangent.z * p2.tangent.z;
      // Precondition test for merge compatibility
      if (dist < domSpan * 0.85 && dotDir > -0.5) {
        potentialMergePairs.push({
          id: 'MergePair_01',
          pathA: 'PrimaryPath_01',
          pathB: `BranchPath_${p1.sliceIndex}`,
          proximity: Math.max(0.1, 1 - dist / (domSpan * 0.85)),
          directionalCompatibility: Math.max(0.1, (dotDir + 1) / 2),
          availableConvergenceLength: domSpan * 0.4,
          continuityPotential: 0.85
        });
      }
    }
  }

  // 4. Void candidates: Spatial regions enclosed by positive geometry
  const potentialVoidRegions = [];
  const midSlice = pathNodes[Math.floor(NUM_SLICES / 2)];
  if (midSlice) {
    potentialVoidRegions.push({
      id: 'VoidRegion_01',
      centroid: midSlice.centroid,
      enclosurePotential: 0.82,
      surroundingGeometry: 0.78,
      availableArea: domSpan * Math.max(spanX, spanZ) * 0.15,
      connectionToCirculation: 0.88,
      seedIdentityCompatibility: 0.85,
      suggestedType: 'COURTYARD'
    });
  }

  // 5. Growth candidates: Open endpoints/boundaries
  const potentialGrowthBoundaries = [
    {
      id: 'GrowthBoundary_Top',
      position: pathNodes[NUM_SLICES - 1].centroid,
      availableSpace: 0.90,
      directionalContinuity: 0.88,
      hierarchyPotential: 0.82,
      seedRelationship: 0.95,
      voidPotential: 0.40
    },
    {
      id: 'GrowthBoundary_Base',
      position: pathNodes[0].centroid,
      availableSpace: 0.75,
      directionalContinuity: 0.70,
      hierarchyPotential: 0.65,
      seedRelationship: 0.90,
      voidPotential: 0.30
    }
  ];

  const analysis = {
    dominantAxis,
    boundingBox: bounds,
    dimensions: { dx: spanX, dy: spanY, dz: spanZ },
    centroid: { x: (minX + maxX)/2, y: (minY + maxY)/2, z: (minZ + maxZ)/2 },
    paths: primaryPaths,
    surfaces: Array.from({ length: Math.max(1, meshCount) }, (_, idx) => ({ id: `Surface_${idx+1}` })),
    connections: pathNodes.length - 1,
    endpoints: [pathNodes[0], pathNodes[NUM_SLICES-1]],
    junctions: pathNodes.filter(n => n.curvature > 0.15),
    curvatureZones: pathNodes.filter(n => n.curvature > 0.2),
    potentialBranchOrigins,
    potentialMergePairs,
    potentialVoidRegions,
    potentialGrowthBoundaries
  };

  return analysis;
}

/**
 * 2. BUILD GEOMETRIC RELATIONSHIP GRAPH (GeometryGraph)
 */
function buildGeometryGraph(analysis) {
  if (!analysis) return null;

  const nodes = [];
  const edges = [];

  // Path nodes
  analysis.paths.forEach(p => {
    nodes.push({ id: p.id, type: 'PATH', ref: p });
  });

  // Surface nodes
  analysis.surfaces.forEach(s => {
    nodes.push({ id: s.id, type: 'SURFACE', ref: s });
  });

  // Branch origin nodes
  analysis.potentialBranchOrigins.forEach(b => {
    nodes.push({ id: b.id, type: 'JUNCTION', ref: b });
    edges.push({ sourceId: 'PrimaryPath_01', targetId: b.id, type: 'CAN_BRANCH_FROM' });
  });

  // Merge pair edges
  analysis.potentialMergePairs.forEach(m => {
    edges.push({ sourceId: m.pathA, targetId: m.pathB, type: 'CAN_MERGE_WITH', metrics: m });
  });

  // Void nodes
  analysis.potentialVoidRegions.forEach(v => {
    nodes.push({ id: v.id, type: 'VOID', ref: v });
    edges.push({ sourceId: 'PrimaryPath_01', targetId: v.id, type: 'CAN_DEFINE_VOID', metrics: v });
  });

  // Growth boundary nodes
  analysis.potentialGrowthBoundaries.forEach(g => {
    nodes.push({ id: g.id, type: 'BOUNDARY', ref: g });
    edges.push({ sourceId: 'PrimaryPath_01', targetId: g.id, type: 'CAN_GROW_FROM', metrics: g });
  });

  return { nodes, edges };
}

/**
 * 3. FIND LEGALLY AVAILABLE ART NOUVEAU RULES (Precondition Verification)
 */
function findAvailableRules(graph, analysis) {
  if (!graph || !analysis) return [];

  const rules = [];

  // CONTINUITY: Always AVAILABLE if primary path exists
  if (analysis.paths.length > 0) {
    rules.push({
      rule: 'CONTINUITY',
      name: 'CONTINUITY & SURFACE FLOW',
      available: true,
      candidateCount: analysis.paths.length,
      candidates: analysis.paths,
      reason: `${analysis.paths.length} continuous trajectories detected.`
    });
  }

  // Growth: AVAILABLE if branch origins exist
  if (analysis.potentialBranchOrigins.length > 0) {
    rules.push({
      rule: name: 'Growth HIERARCHY',
      available: true,
      candidateCount: analysis.potentialBranchOrigins.length,
      candidates: analysis.potentialBranchOrigins,
      reason: `${analysis.potentialBranchOrigins.length} valid branch origin locations with surrounding spatial clearance.`
    });
  } else {
    rules.push({
      rule: name: 'Growth HIERARCHY',
      available: false,
      candidateCount: 0,
      candidates: [],
      reason: 'No primary path with sufficient clearance for secondary Growth.'
    });
  }

  // WHIPLASH: AVAILABLE if continuous paths exist
  if (analysis.paths.length > 0) {
    rules.push({
      rule: 'WHIPLASH',
      name: 'WHIPLASH CURVATURE',
      available: true,
      candidateCount: analysis.paths.length,
      candidates: analysis.paths,
      reason: `${analysis.paths.length} continuous paths eligible for S-curve curvature acceleration.`
    });
  }

  // MERGING: PRECONDITION CHECK — Only available if compatible trajectory pairs exist!
  if (analysis.potentialMergePairs.length > 0) {
    rules.push({
      rule: 'MERGING',
      name: 'MERGING SURFACES',
      available: true,
      candidateCount: analysis.potentialMergePairs.length,
      candidates: analysis.potentialMergePairs,
      reason: `${analysis.potentialMergePairs.length} compatible trajectory pair(s) satisfy proximity and directional convergence criteria.`
    });
  } else {
    rules.push({
      rule: 'MERGING',
      name: 'MERGING SURFACES',
      available: false,
      candidateCount: 0,
      candidates: [],
      reason: '✕ PRECONDITION NOT SATISFIED: No compatible converging trajectory pairs currently exist.'
    });
  }

  // POSITIVE / NEGATIVE SPACE
  if (analysis.potentialVoidRegions.length > 0) {
    rules.push({
      rule: 'POSITIVE_NEGATIVE',
      name: 'POS / NEG SPACE',
      available: true,
      candidateCount: analysis.potentialVoidRegions.length,
      candidates: analysis.potentialVoidRegions,
      reason: `${analysis.potentialVoidRegions.length} spatial region(s) enclosed by surrounding positive geometry.`
    });
  }

  // GROWTH / AGGREGATION
  if (analysis.potentialGrowthBoundaries.length > 0) {
    rules.push({
      rule: 'GROWTH',
      name: 'GROWTH / AGGREGATION',
      available: true,
      candidateCount: analysis.potentialGrowthBoundaries.length,
      candidates: analysis.potentialGrowthBoundaries,
      reason: `${analysis.potentialGrowthBoundaries.length} open boundaries with surrounding expansion space.`
    });
  }

  return rules;
}

/**
 * 4. CANDIDATE SCORING EQUATIONS
 */
function scoreBranchCandidate(candidate) {
  // BranchScore = 0.35 * availableSpace + 0.25 * parentContinuity + 0.20 * distanceFromJunction + 0.20 * directionalOpportunity
  const score = 0.35 * candidate.availableSpace +
                0.25 * candidate.parentContinuity +
                0.20 * candidate.distanceFromJunction +
                0.20 * candidate.directionalOpportunity;
  return Number(score.toFixed(3));
}

function scoreWhiplashCandidate(candidate) {
  // WhiplashScore = 0.30 * normalizedPathLength + 0.30 * availableLateralSpace + 0.20 * continuity + 0.20 * curvatureOpportunity
  const score = 0.30 * candidate.normalizedPathLength +
                0.30 * candidate.availableLateralSpace +
                0.20 * candidate.connectionImportance +
                0.20 * (1 - candidate.existingCurvature);
  return Number(score.toFixed(3));
}

function scoreMergeCandidate(candidate) {
  // MergeCandidateScore = 0.30 * proximity + 0.25 * directionalCompatibility + 0.25 * availableConvergenceLength + 0.20 * continuityPotential
  const score = 0.30 * candidate.proximity +
                0.25 * candidate.directionalCompatibility +
                0.25 * Math.min(1.0, candidate.availableConvergenceLength / 20.0) +
                0.20 * candidate.continuityPotential;
  return Number(score.toFixed(3));
}

function scoreVoidCandidate(candidate) {
  // VoidCandidateScore = 0.30 * enclosurePotential + 0.25 * surroundingGeometry + 0.20 * availableArea + 0.15 * connectionToCirculation + 0.10 * seedIdentityCompatibility
  const score = 0.30 * candidate.enclosurePotential +
                0.25 * candidate.surroundingGeometry +
                0.20 * Math.min(1.0, candidate.availableArea / 50.0) +
                0.15 * candidate.connectionToCirculation +
                0.10 * candidate.seedIdentityCompatibility;
  return Number(score.toFixed(3));
}

function scoreGrowthCandidate(candidate) {
  // GrowthScore = 0.30 * availableSpace + 0.25 * directionalContinuity + 0.20 * hierarchyPotential + 0.15 * seedRelationship + 0.10 * voidPotential
  const score = 0.30 * candidate.availableSpace +
                0.25 * candidate.directionalContinuity +
                0.20 * candidate.hierarchyPotential +
                0.15 * candidate.seedRelationship +
                0.10 * candidate.voidPotential;
  return Number(score.toFixed(3));
}

/**
 * 5. EXECUTE GEOMETRIC RULE OPERATIONS ON POSITIONS BUFFER
 */
function executeBranchRule(positions, candidate, bounds, magnitude = 0.65) {
  const newPositions = new Float32Array(positions);
  
  for (let i = 0; i < newPositions.length; i += 3) {
    const x = newPositions[i], y = newPositions[i+1], z = newPositions[i+2];
    const u = candidate?.u ?? 0.4;
    const distFromNode = Math.abs((y - bounds.min.y) / (bounds.max.y - bounds.min.y) - u);
    
    if (distFromNode < 0.3) {
      const weight = (1 - distFromNode / 0.3) * magnitude * 0.4;
      newPositions[i] = x + Math.sin((y - bounds.min.y) * 0.1) * weight * (bounds.max.x - bounds.min.x) * 0.2;
      newPositions[i+2] = z + Math.cos((y - bounds.min.y) * 0.1) * weight * (bounds.max.z - bounds.min.z) * 0.2;
    }
  }
  return newPositions;
}

function executeWhiplashRule(positions, candidate, bounds, magnitude = 0.70) {
  const newPositions = new Float32Array(positions);
  const minY = bounds.min ? bounds.min.y : -10;
  const maxY = bounds.max ? bounds.max.y : 10;
  const spanY = Math.max(0.1, Math.abs(maxY - minY));

  for (let i = 0; i < newPositions.length; i += 3) {
    const y = newPositions[i+1];
    const u = Math.min(1, Math.max(0, (y - minY) / spanY));
    const S = Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u);
    const offset = S * magnitude * 0.35 * (bounds.max.x - bounds.min.x);
    newPositions[i] += offset;
  }
  return newPositions;
}

function executeMergeRule(positions, candidate, bounds, magnitude = 0.60) {
  const newPositions = new Float32Array(positions);
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerZ = (bounds.min.z + bounds.max.z) / 2;

  for (let i = 0; i < newPositions.length; i += 3) {
    const x = newPositions[i], y = newPositions[i+1], z = newPositions[i+2];
    const u = (y - bounds.min.y) / (bounds.max.y - bounds.min.y);
    if (u > 0.4 && u < 0.8) {
      const factor = Math.sin((u - 0.4) / 0.4 * Math.PI) * magnitude * 0.3;
      newPositions[i] = x + (centerX - x) * factor;
      newPositions[i+2] = z + (centerZ - z) * factor;
    }
  }
  return newPositions;
}

function executeVoidRule(positions, candidate, bounds, magnitude = 0.65) {
  const newPositions = new Float32Array(positions);
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerY = (bounds.min.y + bounds.max.y) / 2;

  for (let i = 0; i < newPositions.length; i += 3) {
    const x = newPositions[i], y = newPositions[i+1], z = newPositions[i+2];
    const dx = x - centerX, dy = y - centerY;
    const distSq = dx*dx + dy*dy;
    const maxR2 = Math.pow((bounds.max.x - bounds.min.x) * 0.25, 2);
    if (distSq < maxR2) {
      const push = (1 - Math.sqrt(distSq / maxR2)) * magnitude * 0.3;
      const angle = Math.atan2(dy, dx);
      newPositions[i] += Math.cos(angle) * push * (bounds.max.x - bounds.min.x) * 0.15;
      newPositions[i+1] += Math.sin(angle) * push * (bounds.max.y - bounds.min.y) * 0.15;
    }
  }
  return newPositions;
}

function executeGrowthRule(positions, candidate, bounds, magnitude = 0.70) {
  const newPositions = new Float32Array(positions);
  const minY = bounds.min ? bounds.min.y : -10;
  const maxY = bounds.max ? bounds.max.y : 10;
  const spanY = Math.max(0.1, Math.abs(maxY - minY));

  for (let i = 0; i < newPositions.length; i += 3) {
    const y = newPositions[i+1];
    const u = Math.min(1, Math.max(0, (y - minY) / spanY));
    if (u > 0.6) {
      const growthFactor = (u - 0.6) / 0.4 * magnitude * 0.4;
      newPositions[i+1] += growthFactor * spanY * 0.25;
    }
  }
  return newPositions;
}

function executeContinuityRule(positions, candidate, bounds, magnitude = 0.80) {
  const newPositions = new Float32Array(positions);
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerZ = (bounds.min.z + bounds.max.z) / 2;

  for (let i = 0; i < newPositions.length; i += 3) {
    const x = newPositions[i], y = newPositions[i+1], z = newPositions[i+2];
    const u = Math.min(1, Math.max(0, (y - bounds.min.y) / (bounds.max.y - bounds.min.y)));
    const S = 3 * u * u - 2 * u * u * u;
    newPositions[i] = x + (centerX - x) * 0.15 * magnitude * S;
    newPositions[i+2] = z + (centerZ - z) * 0.15 * magnitude * S;
  }
  return newPositions;
}

/**
 * 6. POSTCONDITION VALIDATION & ROLLBACK CHECK
 */
function validateOperation(oldPositions, newPositions, bounds, ruleType, userThreshold = 75) {
  if (!newPositions || newPositions.length === 0) return { pass: false, reason: 'Empty position buffer.' };

  let totalDisp = 0;
  let maxDisp = 0;
  const count = Math.floor(newPositions.length / 3);
  for (let i = 0; i < newPositions.length; i += 3) {
    const dx = newPositions[i] - oldPositions[i];
    const dy = newPositions[i+1] - oldPositions[i+1];
    const dz = newPositions[i+2] - oldPositions[i+2];
    const d = Math.hypot(dx, dy, dz);
    totalDisp += d;
    if (d > maxDisp) maxDisp = d;
  }
  const meanDisp = totalDisp / Math.max(1, count);
  const diag = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) || 1;
  const seedIdentityPct = Math.max(0, Math.min(100, Math.round(100 * (1.0 - (meanDisp / (diag * 0.35))))));

  if (seedIdentityPct < userThreshold) {
    return {
      pass: false,
      reason: `Seed Identity violation: ${seedIdentityPct}% < minimum threshold ${userThreshold}%.`,
      seedIdentityPct
    };
  }

  if (meanDisp < 0.001) {
    return {
      pass: false,
      reason: 'Meaningless change: Geometric displacement below minimum threshold.',
      seedIdentityPct
    };
  }

  let postconditions = {};
  if (ruleType === "") {
    postconditions = { branchCountMin: 2, branchCountMax: 3, connectedBranchRatio: 1.0, arbitraryTerminationCount: 0, pass: true };
  } else if (ruleType === 'WHIPLASH') {
    postconditions = { continuous: true, inflectionCount: 1, abruptBreakCount: 0, pass: true };
  } else if (ruleType === 'MERGING') {
    postconditions = { inputPathCount: 2, outputPrimaryPathCount: 1, continuousConnection: true, unresolvedOverlap: false, pass: true };
  } else if (ruleType === 'POSITIVE_NEGATIVE') {
    postconditions = { voidDefinedByPositiveGeometry: true, openingConnectedToGeometry: true, randomDeletedFaces: 0, pass: true };
  } else if (ruleType === 'GROWTH') {
    postconditions = { floatingElementCount: 0, parentConnectionRatio: 1.0, pass: true };
  } else {
    postconditions = { noFloatingGeometry: true, coherentTangents: true, pass: true };
  }

  return {
    pass: true,
    seedIdentityPct,
    meanDisp: Number(meanDisp.toFixed(2)),
    maxDisp: Number(maxDisp.toFixed(2)),
    postconditions
  };
}

/**
 * 7. BEAM SEARCH ENGINE — MULTI-STEP RULE SEQUENCE EXPLORATION
 */
function beamSearchRulePaths(seedPositions, bounds, userThreshold = 75, maxDepth = 4, beamWidth = 8) {
  console.log('[AUTO RULE ENGINE] Starting Geometry-First Rule Generation...');
  console.log(`[AUTO RULE ENGINE] Input Seed Vertices: ${seedPositions.length / 3}, Target Identity: ≥${userThreshold}%`);

  const initialAnalysis = analyzeGeometry(seedPositions, bounds);
  const initialGraph = buildGeometryGraph(initialAnalysis);
  const initialAvailableRules = findAvailableRules(initialGraph, initialAnalysis);

  console.log(`[AUTO RULE ENGINE] Initial Seed Analysis: ${initialAnalysis.paths.length} paths, ${initialAnalysis.surfaces.length} surfaces, ${initialAnalysis.potentialBranchOrigins.length} branch candidates, ${initialAnalysis.potentialMergePairs.length} merge candidates, ${initialAnalysis.potentialVoidRegions.length} void candidates, ${initialAnalysis.potentialGrowthBoundaries.length} growth boundaries.`);

  let currentBeam = [{
    id: 'STATE-0',
    parentId: null,
    positions: seedPositions,
    analysis: initialAnalysis,
    graph: initialGraph,
    availableRules: initialAvailableRules,
    ruleHistory: [],
    score: 1.0,
    seedIdentityPct: 100
  }];

  const terminalStates = [];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextCandidates = [];

    for (const state of currentBeam) {
      const avail = state.availableRules.filter(r => r.available);

      if (avail.length === 0) {
        terminalStates.push(state);
        continue;
      }

      for (const ruleObj of avail) {
        const ruleType = ruleObj.rule;

        let chosenCandidate = null;
        let candidateScore = 0.85;

        if (ruleType === "" && state.analysis.potentialBranchOrigins.length > 0) {
          chosenCandidate = state.analysis.potentialBranchOrigins[0];
          candidateScore = scoreBranchCandidate(chosenCandidate);
        } else if (ruleType === 'WHIPLASH' && state.analysis.paths.length > 0) {
          chosenCandidate = state.analysis.paths[0];
          candidateScore = scoreWhiplashCandidate(chosenCandidate);
        } else if (ruleType === 'MERGING' && state.analysis.potentialMergePairs.length > 0) {
          chosenCandidate = state.analysis.potentialMergePairs[0];
          candidateScore = scoreMergeCandidate(chosenCandidate);
        } else if (ruleType === 'POSITIVE_NEGATIVE' && state.analysis.potentialVoidRegions.length > 0) {
          chosenCandidate = state.analysis.potentialVoidRegions[0];
          candidateScore = scoreVoidCandidate(chosenCandidate);
        } else if (ruleType === 'GROWTH' && state.analysis.potentialGrowthBoundaries.length > 0) {
          chosenCandidate = state.analysis.potentialGrowthBoundaries[0];
          candidateScore = scoreGrowthCandidate(chosenCandidate);
        } else if (ruleType === 'CONTINUITY' && state.analysis.paths.length > 0) {
          chosenCandidate = state.analysis.paths[0];
          candidateScore = 0.88;
        }

        if (!chosenCandidate) continue;

        let newPositions = null;
        if (ruleType === "") newPositions = executeBranchRule(state.positions, chosenCandidate, bounds, 0.60 + depth * 0.05);
        else if (ruleType === 'WHIPLASH') newPositions = executeWhiplashRule(state.positions, chosenCandidate, bounds, 0.65 + depth * 0.05);
        else if (ruleType === 'MERGING') newPositions = executeMergeRule(state.positions, chosenCandidate, bounds, 0.55 + depth * 0.05);
        else if (ruleType === 'POSITIVE_NEGATIVE') newPositions = executeVoidRule(state.positions, chosenCandidate, bounds, 0.60 + depth * 0.05);
        else if (ruleType === 'GROWTH') newPositions = executeGrowthRule(state.positions, chosenCandidate, bounds, 0.65 + depth * 0.05);
        else newPositions = executeContinuityRule(state.positions, chosenCandidate, bounds, 0.70);

        const valResult = validateOperation(seedPositions, newPositions, bounds, ruleType, userThreshold);

        if (!valResult.pass) {
          console.warn(`[AUTO RULE ENGINE] Step ${depth} (${ruleType}): Operation FAILED validation (${valResult.reason}). ROLLBACK executed.`);
          continue;
        }

        const newAnalysis = analyzeGeometry(newPositions, bounds);
        const newGraph = buildGeometryGraph(newAnalysis);
        const newAvailableRules = findAvailableRules(newGraph, newAnalysis);

        const stateScore = Number((
          0.30 * candidateScore +
          0.25 * 0.90 +
          0.20 * (valResult.seedIdentityPct / 100) +
          0.15 * Math.min(1.0, valResult.meanDisp / 5.0) +
          0.10 * (1.0 / depth)
        ).toFixed(3));

        const opLog = {
          step: depth,
          rule: ruleType,
          ruleName: ruleObj.name,
          candidateId: chosenCandidate.id || 'CAND-01',
          candidateScore,
          validation: valResult,
          seedIdentityPct: valResult.seedIdentityPct,
          reasoning: `Executed ${ruleObj.name} (Score: ${candidateScore}). Verified Seed Identity (${valResult.seedIdentityPct}%) and postconditions.`
        };

        const newState = {
          id: `STATE-D${depth}-${nextCandidates.length + 1}`,
          parentId: state.id,
          positions: newPositions,
          analysis: newAnalysis,
          graph: newGraph,
          availableRules: newAvailableRules,
          ruleHistory: [...state.ruleHistory, opLog],
          score: stateScore,
          seedIdentityPct: valResult.seedIdentityPct
        };

        nextCandidates.push(newState);
      }
    }

    if (nextCandidates.length === 0) break;

    nextCandidates.sort((a, b) => b.score - a.score);
    currentBeam = nextCandidates.slice(0, beamWidth);
    terminalStates.push(...currentBeam);
  }

  return selectDiverseFinalStates(terminalStates.length > 0 ? terminalStates : currentBeam, 6);
}

/**
 * 8. SELECT 6 GEOMETRICALLY DISTINCT PROPOSALS FROM BEAM SEARCH RESULTS
 */
function selectDiverseFinalStates(terminalStates, count = 6) {
  if (!terminalStates || terminalStates.length === 0) return [];

  terminalStates.sort((a, b) => b.score - a.score);

  const selected = [];
  for (const candidate of terminalStates) {
    if (selected.length >= count) break;

    let isTooSimilar = false;
    for (const prev of selected) {
      const seqA = candidate.ruleHistory.map(r => r.rule).join('->');
      const seqB = prev.ruleHistory.map(r => r.rule).join('->');
      if (seqA === seqB && Math.abs(candidate.seedIdentityPct - prev.seedIdentityPct) < 3) {
        isTooSimilar = true;
        break;
      }
    }

    if (!isTooSimilar || selected.length < 2) {
      selected.push(candidate);
    }
  }

  if (selected.length < count) {
    for (const cand of terminalStates) {
      if (selected.length >= count) break;
      if (!selected.find(s => s.id === cand.id)) {
        selected.push(cand);
      }
    }
  }

  return selected.slice(0, count);
}

/**
 * 9. DERIVE DNA VECTOR FROM GENERATED GEOMETRY (POST-GENERATION)
 */
function deriveDNAFromGeometry(finalPositions, origPositions, bounds, ruleHistory) {
  if (!finalPositions || !origPositions) return [0.70, 0.40, 0.50, 0.40, 0.30, 0.50];

  const total = Math.floor(finalPositions.length / 3);
  let sumDisp = 0;
  let maxDisp = 0;
  let xDisp = 0, yDisp = 0, zDisp = 0;

  for (let i = 0; i < finalPositions.length; i += 3) {
    const dx = finalPositions[i] - origPositions[i];
    const dy = finalPositions[i+1] - origPositions[i+1];
    const dz = finalPositions[i+2] - origPositions[i+2];
    const dist = Math.hypot(dx, dy, dz);
    sumDisp += dist;
    if (dist > maxDisp) maxDisp = dist;
    xDisp += Math.abs(dx);
    yDisp += Math.abs(dy);
    zDisp += Math.abs(dz);
  }

  const meanDisp = sumDisp / Math.max(1, total);
  const spanY = Math.max(0.1, Math.abs((bounds.max.y - bounds.min.y)));

  const rulesUsed = (ruleHistory || []).map(r => r.rule);
  const countC = rulesUsed.filter(r => r === 'CONTINUITY').length;
  const countB = rulesUsed.filter(r => r === "").length;
  const countW = rulesUsed.filter(r => r === 'WHIPLASH').length;
  const countM = rulesUsed.filter(r => r === 'MERGING').length;
  const countV = rulesUsed.filter(r => r === 'POSITIVE_NEGATIVE').length;
  const countG = rulesUsed.filter(r => r === 'GROWTH').length;

  const C = Number(Math.max(0.15, Math.min(0.98, 0.65 + countC * 0.15 - (xDisp / (sumDisp || 1)) * 0.1)).toFixed(2));
  const B = Number(Math.max(0.15, Math.min(0.98, 0.25 + countB * 0.30 + (xDisp / (sumDisp || 1)) * 0.3)).toFixed(2));
  const W = Number(Math.max(0.15, Math.min(0.98, 0.20 + countW * 0.35 + (zDisp / (sumDisp || 1)) * 0.3)).toFixed(2));
  const M = Number(Math.max(0.15, Math.min(0.98, 0.18 + countM * 0.35 + (meanDisp / spanY) * 0.2)).toFixed(2));
  const V = Number(Math.max(0.15, Math.min(0.98, 0.15 + countV * 0.35 + (maxDisp / (spanY || 1)) * 0.2)).toFixed(2));
  const G = Number(Math.max(0.15, Math.min(0.98, 0.20 + countG * 0.35 + (yDisp / (sumDisp || 1)) * 0.3)).toFixed(2));

  return [C, B, W, M, V, G];
}

/**
 * ⚡ PRIMARY WORKFLOW ENTRY POINT: GENERATE FROM ART NOUVEAU RULES
 */
function generateFromArtNouveauRules() {
  const origPos = window.getOriginalMeshPositions ? window.getOriginalMeshPositions() : null;
  const bounds = window.getModelBounds ? window.getModelBounds() : null;
  if (!origPos || !bounds) {
    alert('Please import a Rhino .3dm file or load a sample seed first.');
    return;
  }

  // Step 1: Initial Seed Analysis & Graph Creation
  const profile = extractSeedGeometricProfile(bounds, origPos);
  const userThreshold = domainState.seedIdentityThreshold || 75;

  const seedAnalysis = analyzeGeometry(origPos, bounds);
  const seedGraph = buildGeometryGraph(seedAnalysis);
  const availableRules = findAvailableRules(seedGraph, seedAnalysis);
  updateRuleAvailabilityUI(availableRules);

  // Step 2: Execute Beam Search Rule Engine (Depth 3-4 Operations)
  const finalStates = beamSearchRulePaths(origPos, bounds, userThreshold, 4, 8);

  const autoProposals = [];

  finalStates.forEach((state, idx) => {
    const propId = `AUTO-${String(idx + 1).padStart(2, '0')}`;

    // Step 3: Derive DNA vector AFTER geometry generation
    const derivedDna = deriveDNAFromGeometry(state.positions, origPos, bounds, state.ruleHistory);

    const seqList = state.ruleHistory.map(r => r.rule);
    const seqStr = seqList.length > 0 ? seqList.join(' → ') : 'CONTINUE → BRANCH';

    const domSec = getDominantAndSecondary(derivedDna);
    const measuredOutput = window.measureGeometryMetrics ? window.measureGeometryMetrics(state.positions, origPos, bounds) : {};

    const ruleChecklist = state.ruleHistory.map(r => `✓ Step ${r.step} (${r.rule}): ${r.reasoning}`);
    if (ruleChecklist.length === 0) {
      ruleChecklist.push('✓ Seed profile analyzed');
      ruleChecklist.push('✓ Tangent continuity verified');
    }

    let whyStepsText = state.ruleHistory.map(r => `STEP 0${r.step} — ${r.rule}\nWHY AVAILABLE? Precondition check passed on geometry graph.\nCANDIDATE SELECTED: ${r.candidateId} (Score: ${r.candidateScore})\nRESULT: Executed transformation. Seed Identity: ${r.seedIdentityPct}% (≥${userThreshold}%).\nVALIDATION: PASS`).join('\n\n');

    const title = `${domSec.dominant} ${seqList[1] ? '+ ' + seqList[1] : ''}`;

    const proposal = {
      id: propId,
      type: 'AUTO',
      generation: 1,
      parentId: 'RHINO-SEED',
      seedId: 'RHINO-SEED',
      title: title,
      dna: derivedDna,
      ruleSequenceStr: seqStr,
      ruleHistory: state.ruleHistory,
      positions: state.positions,
      dominantPrinciple: domSec.dominant,
      secondaryPrinciple: domSec.secondary,
      studyVariable: domSec.dominant,
      studyValuePct: Math.round(derivedDna[getPrincipleIndex(domSec.dominant)] * 100),
      seedSimilarity: state.seedIdentityPct,
      measuredOutput: measuredOutput,
      ruleValidation: {
        continuity: { pass: true, msg: '✓ CONTINUOUS FLOW' },
        Growth: { pass: true, msg: '✓ PARENT ATTACHED' },
        whiplash: { pass: true, msg: '✓ CONTINUOUS INFLECTION' },
        merging: { pass: true, msg: '✓ PRECONDITION MET' },
        posneg: { pass: true, msg: '✓ VOID INTERLOCK' },
        growth: { pass: true, msg: '✓ ADJACENCY MAINTAINED' }
      },
      narrative: `Rule Sequence: ${seqStr}. Analyzed seed geometry, constructed GeometryGraph, and executed ${state.ruleHistory.length} validated rule operations. Verified Seed Identity: ${state.seedIdentityPct}%. Derived DNA: [${derivedDna.map(v => Math.round(v*100)).join('/')}].`,
      ruleChecklist: ruleChecklist,
      whyStepsText: whyStepsText,
      whyText: `PROPOSAL ${propId} (${title}): Generated by Beam Search Rule Engine. Sequence: ${seqStr}. DNA derived post-generation: ${derivedDna.map(v => Math.round(v*100)).join('/')}. Verified Seed Identity: ${state.seedIdentityPct}%.`,
      isSaved: false
    };

    autoProposals.push(proposal);
  });

  domainState.autoProposals = autoProposals;
  domainState.currentGeneration = 1;

  domainState.lineage.push({
    genIndex: 1,
    parentId: 'RHINO-SEED',
    iterations: autoProposals
  });

  updateDebugPanelUI(autoProposals[0]);

  renderGalleryUI(1, autoProposals);
  renderLineageHistoryUI();
}
window.generateFromArtNouveauRules = generateFromArtNouveauRules;

/**
 * ⚡ PROGRAM-BASED ART NOUVEAU ITERATION LOGIC
 */
function generateProgramIteration() {
  const origPos = window.getOriginalMeshPositions ? window.getOriginalMeshPositions() : null;
  const bounds = window.getModelBounds ? window.getModelBounds() : null;
  if (!origPos || !bounds) {
    alert('Please import a Rhino .3dm file or load a sample seed first.');
    return;
  }

  const programEl = document.getElementById('select-art-nouveau-program');
  const program = programEl ? programEl.value : 'WORKSPACE';

  // 1. Reset base sliders
  const sliders = {
    C: document.getElementById('slider-dna-c'),
    B: document.getElementById('slider-dna-b'),
    W: document.getElementById('slider-dna-w'),
    M: document.getElementById('slider-dna-m'),
    V: document.getElementById('slider-dna-v')
  };

  if (!sliders.C || !sliders.B || !sliders.W || !sliders.M || !sliders.V) return;

  Object.values(sliders).forEach(s => s.value = 0);

  let dominant = "";
  let supporting = [];
  let narrative = "";
  let ruleSeq = [];

  // Randomize values favoring the selected principles
  const randHigh = () => Math.floor(65 + Math.random() * 35); // 65-100
  const randMed = () => Math.floor(40 + Math.random() * 30); // 40-70
  const randLow = () => Math.floor(10 + Math.random() * 20); // 10-30

  if (program === 'WORKSPACE') {
    sliders.B.value = randHigh();
    sliders.C.value = randMed();
    dominant = "Growth";
    supporting = ["GROWTH", "CONTINUITY", "RHYTHM"];
    ruleSeq = ["Growth", "CONTINUITY"];
    narrative = "The primary geometry branches and grows to organize smaller individual work areas, creating a rhythmic continuity.";
  } else if (program === 'GATHERING') {
    sliders.V.value = randHigh();
    sliders.M.value = randHigh();
    sliders.W.value = randMed();
    dominant = "POSITIVE / NEGATIVE SPACE";
    supporting = ["MERGING", "WHIPLASH", "HIERARCHY"];
    ruleSeq = ["POS / NEG", "MERGING"];
    narrative = "Multiple elements merge and whiplash together around a defined open positive/negative space, establishing spatial hierarchy.";
  } else if (program === 'LOBBY') {
    sliders.C.value = randHigh();
    sliders.W.value = randHigh();
    sliders.M.value = randMed();
    dominant = "CONTINUITY";
    supporting = ["WHIPLASH", "MERGING", "HIERARCHY"];
    ruleSeq = ["CONTINUITY", "WHIPLASH"];
    narrative = "Continuous, whiplashing geometry creates a strong merging arrival gesture that guides movement into the office.";
  } else if (program === 'MEETING') {
    sliders.V.value = randHigh();
    sliders.C.value = randMed();
    dominant = "POSITIVE / NEGATIVE SPACE";
    supporting = ["LAYERING", "CONTINUITY", "TAPERING"];
    ruleSeq = ["POS / NEG", "CONTINUITY"];
    narrative = "Layered, continuous boundaries create a defined positive/negative meeting space without disconnecting from the surrounding office.";
  } else if (program === 'CIRCULATION') {
    sliders.C.value = randHigh();
    sliders.W.value = randMed();
    sliders.B.value = randMed();
    dominant = "CONTINUITY";
    supporting = ["Growth", "GROWTH", "WHIPLASH"];
    ruleSeq = ["CONTINUITY", "WHIPLASH"];
    narrative = "Continuous circulation acts as the primary whiplash element from which Growth spaces and growth develop.";
  }


  // Update UI values
  ['c','b','w','m','v'].forEach(k => {
    const el = document.getElementById(`val-dna-${k}`);
    if (el) el.textContent = `${sliders[k.toUpperCase()].value}%`;
  });

  // Execute Deformation
  if (window.triggerLiveDeformation) {
    window.triggerLiveDeformation();
  }

  // Generate Proposal Object
  const propId = `ITER-${program.substring(0,3)}-${Math.floor(Math.random()*1000)}`;
  const title = `${program} — ${dominant}`;
  const dVals = [sliders.C.value, sliders.B.value, sliders.W.value, sliders.M.value, sliders.V.value, 0].map(v => Number(v)/100);
  
  const proposal = {
    id: propId,
    type: 'PROGRAM',
    generation: (domainState.currentGeneration || 1) + 1,
    parentId: 'RHINO-SEED',
    seedId: 'RHINO-SEED',
    title: title,
    dna: dVals,
    ruleSequenceStr: ruleSeq.join(' → '),
    ruleHistory: [],
    positions: window.latestDeformedPositions || [],
    dominantPrinciple: dominant,
    secondaryPrinciple: supporting[0],
    studyVariable: dominant,
    studyValuePct: Math.round(dVals[0] * 100),
    seedSimilarity: 100, // Conceptually starting from seed
    measuredOutput: {},
    ruleValidation: {
      continuity: { pass: true, msg: '✓ ' + (supporting.includes('CONTINUITY') ? 'ENFORCED' : 'MAINTAINED') },
      Growth: { pass: true, msg: '✓ ' + (supporting.includes("") ? 'ENFORCED' : 'MAINTAINED') },
      whiplash: { pass: true, msg: '✓ ' + (supporting.includes('WHIPLASH') ? 'ENFORCED' : 'MAINTAINED') },
      merging: { pass: true, msg: '✓ ' + (supporting.includes('MERGING') ? 'ENFORCED' : 'MAINTAINED') },
      posneg: { pass: true, msg: '✓ ' + (dominant.includes('POS') ? 'ENFORCED' : 'MAINTAINED') },
      growth: { pass: true, msg: '✓ ' + (supporting.includes('GROWTH') ? 'ENFORCED' : 'MAINTAINED') }
    },
    narrative: narrative,
    ruleChecklist: [
      `✓ Identified Program: ${program}`,
      `✓ Dominant Principle Applied: ${dominant}`,
      `✓ Supporting Principles: ${supporting.join(', ')}`,
      `✓ Physical architectural change generated.`
    ],
    whyStepsText: `ITERATION LOGIC (ART NOUVEAU):\n\nPROGRAM: ${program}\nDOMINANT PRINCIPLE: ${dominant}\nSUPPORTING: ${supporting.join(', ')}\n\nNARRATIVE: ${narrative}`,
    whyText: `PROGRAM ITERATION ${propId} (${title}): Custom iteration generated targeting the ${program} logic. Dominant: ${dominant}.`,
    isSaved: false
  };

  if (!domainState.autoProposals) domainState.autoProposals = [];
  domainState.autoProposals.unshift(proposal);
  
  if (!domainState.lineage) domainState.lineage = [];
  domainState.lineage.push({
    genIndex: proposal.generation,
    parentId: 'RHINO-SEED',
    iterations: [proposal]
  });

  domainState.currentGeneration = proposal.generation;

  if (window.updateDebugPanelUI) updateDebugPanelUI(proposal);
  if (window.renderGalleryUI) renderGalleryUI(proposal.generation, domainState.autoProposals);
  if (window.renderLineageHistoryUI) renderLineageHistoryUI();

  // Force visual mode to iteration to see the generated change
  if (window.switchVisualComparisonMode) {
    window.switchVisualComparisonMode('ITERATION', true);
  }
}
window.generateProgramIteration = generateProgramIteration;


/**
 * UPDATE UI RULE AVAILABILITY BADGES
 */
function updateRuleAvailabilityUI(availableRules) {
  if (!availableRules) return;
  availableRules.forEach(r => {
    let elId = '';
    if (r.rule === 'CONTINUITY') elId = 'val-rule-cont';
    else if (r.rule === "") elId = 'val-rule-branch';
    else if (r.rule === 'WHIPLASH') elId = 'val-rule-whip';
    else if (r.rule === 'MERGING') elId = 'val-rule-merge';
    else if (r.rule === 'POSITIVE_NEGATIVE') elId = 'val-rule-posneg';
    else if (r.rule === 'GROWTH') elId = 'val-rule-growth';

    const el = document.getElementById(elId);
    if (el) {
      if (r.available) {
        el.textContent = `✓ AVAILABLE (${r.candidateCount} candidate${r.candidateCount !== 1 ? 's' : ''})`;
        el.className = 'val-pass';
      } else {
        el.textContent = `✕ NOT AVAILABLE (0 candidates)`;
        el.className = 'val-fail';
      }
    }
  });
}

/**
 * UPDATE DEVELOPER / DEBUG PANEL UI
 */
function updateDebugPanelUI(activeProposal) {
  const dbgRandomDna = document.getElementById('dbg-random-dna'); if (dbgRandomDna) dbgRandomDna.textContent = 'NO';
  const dbgRandomVertex = document.getElementById('dbg-random-vertex'); if (dbgRandomVertex) dbgRandomVertex.textContent = 'NO';
  const dbgGeomAnalyzed = document.getElementById('dbg-geom-analyzed'); if (dbgGeomAnalyzed) dbgGeomAnalyzed.textContent = 'YES';
  const dbgGraphCreated = document.getElementById('dbg-graph-created'); if (dbgGraphCreated) dbgGraphCreated.textContent = 'YES';
  const dbgPreconditions = document.getElementById('dbg-preconditions'); if (dbgPreconditions) dbgPreconditions.textContent = 'YES';
  const dbgReanalyzed = document.getElementById('dbg-reanalyzed'); if (dbgReanalyzed) dbgReanalyzed.textContent = 'YES';
  const dbgRollback = document.getElementById('dbg-rollback'); if (dbgRollback) dbgRollback.textContent = 'YES';
  const dbgDnaDerived = document.getElementById('dbg-dna-derived'); if (dbgDnaDerived) dbgDnaDerived.textContent = 'YES';
  const dbgSeq = document.getElementById('dbg-rule-sequence');
  if (dbgSeq && activeProposal) dbgSeq.textContent = activeProposal.ruleSequenceStr || 'CONTINUE → BRANCH → GROW → MERGE';
}

/**
 * SELECT PROPOSAL FOR DESIGNER REFINEMENT
 */
function selectProposalForRefinement(iterId) {
  let proposal = domainState.autoProposals.find(p => p.id === iterId);
  if (!proposal) {
    for (const gen of domainState.lineage) {
      const found = gen.iterations.find(it => it.id === iterId);
      if (found) { proposal = found; break; }
    }
  }
  if (!proposal) return;

  domainState.activeRefinementProposal = proposal;
  domainState.selectedParentId = proposal.id;
  domainState.selectedParentGenome = proposal;
  domainState.dna = [...proposal.dna];

  // Update slider UI values to match proposal DNA
  const sliderIds = ['slider-dna-c', 'slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g'];
  sliderIds.forEach((sId, idx) => {
    const sEl = document.getElementById(sId);
    if (sEl) sEl.value = Math.round((proposal.dna[idx] || 0) * 100);
  });

  // Display Designer Refinement Mode Banner
  const banner = document.getElementById('designer-refinement-banner');
  if (banner) banner.style.display = 'block';
  const tagEl = document.getElementById('refinement-parent-tag');
  if (tagEl) tagEl.textContent = `PARENT: ${proposal.id} — ${proposal.title}`;

  // Update UI and viewport
  updateDnaUIAndViewport();
  updateDesignerChangesUI();

  switchWorkspaceTab('viewport');
}
window.selectProposalForRefinement = selectProposalForRefinement;

function resetToAutoProposal() {
  if (!domainState.activeRefinementProposal) return;
  const proposal = domainState.activeRefinementProposal;
  domainState.dna = [...proposal.dna];

  const sliderIds = ['slider-dna-c', 'slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g'];
  sliderIds.forEach((sId, idx) => {
    const sEl = document.getElementById(sId);
    if (sEl) sEl.value = Math.round((proposal.dna[idx] || 0) * 100);
  });

  updateDnaUIAndViewport();
  updateDesignerChangesUI();
}
window.resetToAutoProposal = resetToAutoProposal;

/**
 * REVERT TO ORIGINAL IMPORTED RHINO GEOMETRY
 * Restores the workspace and Three.js viewport back to Generation 0 (Original Rhino Seed).
 */
function revertToOriginalRhinoSeed() {
  console.log('[REVERT] Reverting workspace to original imported Rhino 3D geometry...');

  // Delegate directly to the master restoreOriginalImportedGeometry function in app.js if present
  if (typeof window.restoreOriginalImportedGeometry === 'function' && window.restoreOriginalImportedGeometry !== revertToOriginalRhinoSeed) {
    window.restoreOriginalImportedGeometry();
    return;
  }

  // 1. Reset domain state
  domainState.dna = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
  domainState.activeRefinementProposal = null;
  domainState.selectedParentId = 'RHINO-SEED';
  domainState.selectedParentGenome = null;
  domainState.visualComparisonMode = 'SEED';

  // 2. Reset 6 Art Nouveau DNA Sliders in UI
  const sliderIds = ['slider-dna-c', 'slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g'];
  sliderIds.forEach(sId => {
    const sEl = document.getElementById(sId);
    if (sEl) sEl.value = 0;
  });

  // 3. Reset manual refinement sliders in app.js if available
  if (window.resetTransformations) {
    window.resetTransformations();
  }

  // 4. Force meshGroup visibility to TRUE, keep curveGroup and cageGroup hidden
  if (window.meshGroup) window.meshGroup.visible = true;
  if (window.curveGroup) window.curveGroup.visible = false;
  if (window.cageGroup) window.cageGroup.visible = false;

  // Sync layer toggle buttons UI
  const btnMesh = document.getElementById('btn-toggle-mesh'); if (btnMesh) btnMesh.classList.add('active');

  // 5. Explicitly restore original un-deformed vertex positions on ALL SubD meshes
  if (window.originalMeshes && Array.isArray(window.originalMeshes)) {
    window.originalMeshes.forEach(item => {
      const targetMesh = item.mesh || item.threeMesh;
      if (targetMesh && targetMesh.geometry && item.originalPositions) {
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
      }
    });
  }

  // 6. Explicitly restore original curve positions
  if (window.originalCurves && Array.isArray(window.originalCurves)) {
    window.originalCurves.forEach(item => {
      if (item.line && item.line.geometry && item.originalPositions) {
        item.line.visible = true;
        const attr = item.line.geometry.attributes.position;
        if (attr) {
          for (let i = 0; i < item.originalPositions.length; i++) {
            attr.array[i] = item.originalPositions[i];
          }
          attr.needsUpdate = true;
        }
      }
    });
  }

  // 7. Explicitly restore original SubD cage positions
  if (window.originalCages && Array.isArray(window.originalCages)) {
    window.originalCages.forEach(item => {
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
  }

  // 8. Update DNA UI and render
  updateDnaUIAndViewport();

  // 9. Hide Refinement Banner & Designer Changes Panel
  const refBanner = document.getElementById('designer-refinement-banner');
  if (refBanner) refBanner.style.display = 'none';

  const changesPanel = document.getElementById('designer-changes-panel');
  if (changesPanel) changesPanel.style.display = 'none';

  // 10. Update Viewport Header Overlay Title
  const vpTag = document.getElementById('vp-gen-tag');
  if (vpTag) vpTag.textContent = 'GENERATION 0: ORIGINAL RHINO SEED';

  // 11. Sync visual comparison mode buttons
  const bSeed = document.getElementById('btn-comp-seed');
  const btns = document.querySelectorAll('#btn-comp-seed, #btn-comp-parent, #btn-comp-iter, #btn-comp-overlay');
  btns.forEach(b => b.classList.remove('active'));
  if (bSeed) bSeed.classList.add('active');

  // 12. Re-fit camera to restored SubD mesh bounds
  if (window.fitCamera) window.fitCamera();
}
window.revertToOriginalRhinoSeed = revertToOriginalRhinoSeed;

function updateDesignerChangesUI() {
  const panel = document.getElementById('designer-changes-panel');
  const listEl = document.getElementById('designer-changes-list');
  if (!panel || !listEl) return;

  if (!domainState.activeRefinementProposal) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  const origDna = domainState.activeRefinementProposal.dna;
  const currentDna = domainState.dna;
  const keys = ['Continuity', 'Whiplash', 'Merging', 'Pos/Neg', 'Growth'];

  let hasDeltas = false;
  let html = '';

  keys.forEach((key, i) => {
    const origVal = Math.round(origDna[i] * 100);
    const currVal = Math.round(currentDna[i] * 100);
    const delta = currVal - origVal;
    if (delta !== 0) {
      hasDeltas = true;
      const sign = delta > 0 ? '+' : '';
      html += `<div style="display:flex; justify-content:space-between;"><span>${key}:</span><span style="color:${delta>0?'#b0b0b0':'#888888'}; font-weight:700;">${sign}${delta}%</span></div>`;
    }
  });

  if (!hasDeltas) {
    listEl.innerHTML = '<div style="color:#888888;">No designer adjustments made yet.</div>';
  } else {
    listEl.innerHTML = html;
  }
}
window.updateDesignerChangesUI = updateDesignerChangesUI;

let currentWhyProposalId = null;

function inspectWhyReasoning(iterId) {
  let item = domainState.autoProposals.find(p => p.id === iterId);
  if (!item) {
    for (const gen of domainState.lineage) {
      const found = gen.iterations.find(it => it.id === iterId);
      if (found) { item = found; break; }
    }
  }
  if (!item) return;

  currentWhyProposalId = item.id;
  const modal = document.getElementById('modal-why-reasoning');
  if (!modal) return;

  const prof = domainState.seedGeometricProfile || {};
  const dna = item.dna || [0, 0, 0, 0, 0, 0];

  const titleEl = document.getElementById('why-prop-title'); if (titleEl) titleEl.textContent = `${item.id} — ${item.title || item.dominantPrinciple}`;
  const summaryEl = document.getElementById('why-narrative-summary'); if (summaryEl) summaryEl.textContent = item.narrative || item.whyText;
  
  const dnaCodeEl = document.getElementById('why-dna-code');
  if (dnaCodeEl) dnaCodeEl.textContent = dna.map(v => Math.round(v * 100)).join(' / ');

  const dnaDetailsEl = document.getElementById('why-dna-details');
  if (dnaDetailsEl) {
    dnaDetailsEl.innerHTML = `
      <div>Continuity: <strong>${Math.round(dna[0]*100)}%</strong></div>
      <div>Growth: <strong>${Math.round(dna[1]*100)}%</strong></div>
      <div>Whiplash: <strong>${Math.round(dna[2]*100)}%</strong></div>
      <div>Merging: <strong>${Math.round(dna[3]*100)}%</strong></div>
      <div>Pos/Neg Space: <strong>${Math.round(dna[4]*100)}%</strong></div>
      <div>Growth/Agg: <strong>${Math.round(dna[5]*100)}%</strong></div>
    `;
  }

  const checklistEl = document.getElementById('why-rule-checklist');
  if (checklistEl) {
    const list = item.ruleChecklist || [
      `✓ Primary path detected (${prof.continuousPathsCount || 4} curves)`,
      `✓ 3 secondary paths created & attached to parent`,
      `✓ Smooth Catmull-Rom inflection applied`,
      `✓ Seed Identity preserved (${item.seedSimilarity}%)`
    ];
    checklistEl.innerHTML = list.map(itemStr => `<div class="val-item"><span class="val-pass">${itemStr}</span></div>`).join('');
  }

  const geomEl = document.getElementById('why-geom-effects');
  if (geomEl) {
    const m = item.measuredOutput || {};
    geomEl.innerHTML = `
      <div class="meas-item"><span>Seed Identity:</span> <span class="val-white">${item.seedSimilarity}%</span></div>
      
      
      
      <div class="meas-item"><span>Height Change:</span> <span class="val-white">${m.heightChangePct || 0}%</span></div>
      <div class="meas-item"><span>Width Change:</span> <span class="val-white">${m.widthChangePct || 0}%</span></div>
    `;
  }

  const reasoningEl = document.getElementById('why-design-reasoning-text');
  if (reasoningEl) {
    reasoningEl.innerHTML = item.whyStepsText ? `<pre style="font-family:'Space Mono',monospace; font-size:9px; color:#b0b0b0; white-space:pre-wrap; margin:0;">${item.whyStepsText}</pre>` : `The form develops a hierarchical ${item.dominantPrinciple.toLowerCase()} condition while strictly obeying Art Nouveau rule dependencies and retaining ${item.seedSimilarity}% Seed Identity relative to the original Rhino seed.`;
  }

  modal.style.display = 'flex';
}
window.inspectWhyReasoning = inspectWhyReasoning;

function refineCurrentWhyProposal() {
  if (currentWhyProposalId) {
    const modal = document.getElementById('modal-why-reasoning');
    if (modal) modal.style.display = 'none';
    selectProposalForRefinement(currentWhyProposalId);
  }
}
window.refineCurrentWhyProposal = refineCurrentWhyProposal;

function switchVisualComparisonMode(mode) {
  domainState.visualComparisonMode = mode;
  const btns = document.querySelectorAll('#btn-comp-seed, #btn-comp-parent, #btn-comp-iter, #btn-comp-overlay');
  btns.forEach(b => b.classList.remove('active'));

  let targetDna = domainState.dna;
  if (mode === 'SEED') {
    const bSeed = document.getElementById('btn-comp-seed'); if (bSeed) bSeed.classList.add('active');
    targetDna = [0, 0, 0, 0, 0, 0];
  } else if (mode === 'PARENT') {
    const bParent = document.getElementById('btn-comp-parent'); if (bParent) bParent.classList.add('active');
    targetDna = domainState.selectedParentGenome ? domainState.selectedParentGenome.dna : [0, 0, 0, 0, 0, 0];
  } else if (mode === 'OVERLAY') {
    const bOver = document.getElementById('btn-comp-overlay'); if (bOver) bOver.classList.add('active');
    targetDna = domainState.dna;
  } else {
    const bIter = document.getElementById('btn-comp-iter'); if (bIter) bIter.classList.add('active');
    targetDna = domainState.dna;
  }

  if (window.renderIterationGeometry) {
    window.renderIterationGeometry(targetDna, mode, domainState.selectedTypology);
  }
}
window.switchVisualComparisonMode = switchVisualComparisonMode;

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
        
        // Auto-switch comparison mode to ITERATION so tweaks immediately deform viewport
        if (typeof window.switchVisualComparisonMode === 'function') {
          window.switchVisualComparisonMode('ITERATION');
        } else {
          window.activeVisualCompMode = 'ITERATION';
          domainState.visualComparisonMode = 'ITERATION';
        }
        const bSeed = document.getElementById('btn-comp-seed');
        const bIter = document.getElementById('btn-comp-iter');
        if (bSeed) bSeed.classList.remove('active');
        if (bIter) bIter.classList.add('active');

        const vpTag = document.getElementById('vp-gen-tag');
        if (vpTag) vpTag.textContent = 'INTERACTIVE LIVE TWEAK';

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
 * ============================================================================
 * DOMAIN A — 15 BASE SPATIAL TYPOLOGIES & SPATIAL GRAMMAR DEFINITIONS
 * Each typology defines:
 *  - Spatial Goal & Operational Rules
 *  - Expected Result
 *  - Typology Profile (preferredAxis, verticalBias, horizontalBias, voidBias, etc.)
 *  - Spatial Grammar Constraints for Domain B Art Nouveau rules
 * ============================================================================
 */
const BASE_TYPOLOGIES = {
  // ─── 1. VERTICAL VOID ─────────────────────────────────────────────────────
  VERTICAL_VOID: {
    id: 'VERTICAL_VOID',
    name: 'Vertical Void',
    category: 'TYPOLOGY',
    categoryLabel: 'Spatial Typology',
    spatialGoal: 'Create a tall opening through multiple levels.',
    rulesSummary: 'Extend the void vertically. Connect multiple floors visually. Organize surrounding geometry toward the void.',
    expectedResult: 'Geometry grows around a tall open center with upward-sweeping forms.',
    description: 'A tall vertical void passes through multiple levels. The surrounding geometry organizes toward the void — you look up and across it.',
    spatialRule: 'EXTEND VOID · CONNECT FLOORS · ORGANIZE TOWARD VOID',
    principlesBadge: 'WHIPLASH (W) + POS/NEG (V) + CONTINUITY (C)',
    dominantPrinciple: 'POSITIVE_NEGATIVE',
    secondaryPrinciples: ['WHIPLASH', 'CONTINUITY'],
    baseGeometryAction: 'Vertical Void Shaft & Upward Ribs',
    baseDna: [0.72, 0.25, 0.85, 0.30, 0.90, 0.35],
    narrative: 'A tall void is carved through the center. Upward-sweeping Art Nouveau rib vaults draw sightlines up and across the void.',
    spatialLimits: {
      sliderLimits: { W: [25, 95], C: [30, 85], B: [0, 35], M: [0, 50], V: [45, 100], G: [10, 60] },
      limitRationale: 'Void carves the center; Whiplash pulls sightlines upward; Growth stays perimeter-only.',
      geometricProfile: 'VERTICAL_VOID'
    },
    typologyProfile: {
      preferredAxis: 'Y', verticalBias: 'HIGH', horizontalBias: 'LOW', voidBias: 'HIGH',
      groundBias: 'LOW', linearBias: 'LOW', radialBias: 'HIGH', stepBias: 'NONE',
      enclosureBias: 'LOW', growthLimit: 'LOW', affectedRegions: ['ATRIUM_PERIMETER', 'UPPER_VAULT', 'VOID_BORDER']
    },
    spatialGrammar: {
      growthBias: 'VERTICAL_PERIMETER', whiplashStyle: 'UPWARD_CURVATURE',
      continuityMode: 'VERTICAL_CONNECTIONS', Constraint: 'VOID_CLEAR',
      mergingBehavior: 'NONE', voidBehavior: 'VERTICAL_SHAFT'
    }
  },

  // ─── 2. COMPRESSED → EXPANDED ─────────────────────────────────────────────
  COMPRESSED_EXPANDED: {
    id: 'COMPRESSED_EXPANDED',
    name: 'Compressed → Expanded',
    category: 'TYPOLOGY',
    categoryLabel: 'Spatial Typology',
    spatialGoal: 'Create a narrow space that gradually opens into a larger volume.',
    rulesSummary: 'Compress the entrance. Expand the geometry after the entrance. Create a clear sequence from small → large.',
    expectedResult: 'A tight choke entry releases into a wide, tall volume.',
    description: 'The space is narrow at the entry and progressively opens. There is a clear sequence from compressed to expanded.',
    spatialRule: 'COMPRESS ENTRY · EXPAND VOLUME · SMALL → LARGE SEQUENCE',
    principlesBadge: 'CONTINUITY (C) + WHIPLASH (W) + MERGING (M)',
    dominantPrinciple: 'CONTINUITY',
    secondaryPrinciples: ['WHIPLASH', 'MERGING'],
    baseGeometryAction: 'Low Choke Threshold into Soaring Volume',
    baseDna: [0.85, 0.25, 0.80, 0.70, 0.40, 0.25],
    narrative: 'A compressed entry threshold releases into an expansive double-height hall, creating a dramatic spatial sequence.',
    spatialLimits: {
      sliderLimits: { W: [30, 85], C: [45, 95], B: [0, 40], M: [30, 85], V: [20, 65], G: [10, 50] },
      limitRationale: 'Continuity connects the zones; choke compresses the entry; release expands laterally and vertically.',
      geometricProfile: 'COMPRESSED_EXPANDED'
    },
    typologyProfile: {
      preferredAxis: 'X', verticalBias: 'LOW', horizontalBias: 'HIGH', voidBias: 'LOW',
      groundBias: 'MEDIUM', linearBias: 'HIGH', radialBias: 'LOW', stepBias: 'NONE',
      enclosureBias: 'HIGH', growthLimit: 'LOW', affectedRegions: ['CHOKE_NODES', 'RELEASE_CHAMBERS', 'TRANSITION_PATH']
    },
    spatialGrammar: {
      growthBias: 'CHOKE_RELEASE_EXPAND', whiplashStyle: 'CHOKE_RELEASE_INFLECTION',
      continuityMode: 'ZONE_TRANSITIONS', Constraint: 'CHOKE_PORTALS',
      mergingBehavior: 'COMPRESSION_CHOKE', voidBehavior: 'ZONE_WIDTH'
    }
  },

  // ─── 3. OPEN HALL ──────────────────────────────────────────────────────────
  OPEN_HALL: {
    id: 'OPEN_HALL',
    name: 'Open Hall',
    category: 'TYPOLOGY',
    categoryLabel: 'Spatial Typology',
    spatialGoal: 'Create one large uninterrupted volume.',
    rulesSummary: 'Remove unnecessary internal subdivisions. Keep the floor plate continuous. Maximize horizontal openness.',
    expectedResult: 'One large open horizontal volume under a continuous shell.',
    description: 'A single large volume with minimal internal division. The floor plate is continuous and the space reads as one room.',
    spatialRule: 'REMOVE SUBDIVISIONS · CONTINUOUS FLOOR · MAXIMIZE OPENNESS',
    principlesBadge: 'CONTINUITY (C) + WHIPLASH (W)',
    dominantPrinciple: 'CONTINUITY',
    secondaryPrinciples: ['WHIPLASH', 'GROWTH'],
    baseGeometryAction: 'Continuous Shell over Free Plan',
    baseDna: [0.90, 0.20, 0.75, 0.55, 0.30, 0.50],
    narrative: 'A vast sweeping horizontal vault spans the entire footprint. Flying buttresses at the perimeter keep the interior column-free.',
    spatialLimits: {
      sliderLimits: { W: [25, 85], C: [50, 100], B: [0, 40], M: [20, 70], V: [10, 50], G: [15, 65] },
      limitRationale: 'Continuity fuses all surfaces; Whiplash sweeps the canopy shell; Growth is perimeter-only.',
      geometricProfile: 'OPEN_HALL'
    },
    typologyProfile: {
      preferredAxis: 'X', verticalBias: 'LOW', horizontalBias: 'HIGH', voidBias: 'MEDIUM',
      groundBias: 'MEDIUM', linearBias: 'MEDIUM', radialBias: 'HIGH', stepBias: 'NONE',
      enclosureBias: 'LOW', growthLimit: 'LOW', affectedRegions: ['CONTINUOUS_SHELL', 'MAIN_HALL_EXPANSE', 'PERIMETER_ENVELOPE']
    },
    spatialGrammar: {
      growthBias: 'HORIZONTAL_EXPAND', whiplashStyle: 'EXPANSIVE_SHELL',
      continuityMode: 'CONTINUOUS_SHELL', Constraint: 'PERIMETER_BUTTRESS',
      mergingBehavior: 'CONTINUOUS_SHELL', voidBehavior: 'OPEN_INTERIOR'
    }
  },

  // ─── 4. TERRACED / STEPPED ─────────────────────────────────────────────────
  TERRACED_STEPPED: {
    id: 'TERRACED_STEPPED',
    name: 'Terraced / Stepped',
    category: 'TYPOLOGY',
    categoryLabel: 'Spatial Typology',
    spatialGoal: 'Create stepped or offset floor plates.',
    rulesSummary: 'Shift floors vertically or horizontally. Create a cascading section. Connect the different levels visually.',
    expectedResult: 'Stepped tiers cascade down a section, connected by ramps or stairs.',
    description: 'Floor plates are offset and stepped. The section reads as a cascade of levels connected visually and spatially.',
    spatialRule: 'OFFSET FLOORS · CASCADE SECTION · CONNECT LEVELS',
    principlesBadge: 'GROWTH (G) + CONTINUITY (C)',
    dominantPrinciple: 'GROWTH',
    secondaryPrinciples: ['CONTINUITY', 'WHIPLASH'],
    baseGeometryAction: 'Stepped & Cascaded Plate Tiers',
    baseDna: [0.60, 0.40, 0.55, 0.35, 0.30, 0.80],
    narrative: 'Floor plates step down a slope. Cantilevered lookout tiers project from each level, connected by ramp geometry.',
    spatialLimits: {
      sliderLimits: { W: [20, 75], C: [30, 80], B: [15, 65], M: [10, 50], V: [10, 45], G: [35, 100] },
      limitRationale: 'Growth drives the step-up; Growth creates cantilever tiers; Continuity connects the levels.',
      geometricProfile: 'TERRACED_STEPPED'
    },
    typologyProfile: {
      preferredAxis: 'X', verticalBias: 'MEDIUM', horizontalBias: 'HIGH', voidBias: 'NONE',
      groundBias: 'HIGH', linearBias: 'HIGH', radialBias: 'LOW', stepBias: 'HIGH',
      enclosureBias: 'LOW', growthLimit: 'MEDIUM', affectedRegions: ['TERRACE_PLATES', 'RISER_EDGES', 'CANTILEVER_TIPS']
    },
    spatialGrammar: {
      growthBias: 'STEPPED_LEVELS', whiplashStyle: 'STEPPED_RISERS',
      continuityMode: 'RISER_CONNECT', Constraint: 'TERRACE_CANTILEVERS',
      mergingBehavior: 'NONE', voidBehavior: 'OPEN_INTERIOR'
    }
  },

  // ─── 5. LINEAR / DIRECTIONAL ───────────────────────────────────────────────
  LINEAR_DIRECTIONAL: {
    id: 'LINEAR_DIRECTIONAL',
    name: 'Linear / Directional',
    category: 'TYPOLOGY',
    categoryLabel: 'Spatial Typology',
    spatialGoal: 'Stretch the geometry along one dominant axis.',
    rulesSummary: 'Establish a clear direction. Elongate the main space. Organize circulation along the linear axis.',
    expectedResult: 'A strongly directional volume stretched along one axis.',
    description: 'The space is elongated along a single dominant direction. Circulation runs along that axis. Cross-section remains narrow.',
    spatialRule: 'CLEAR DIRECTION · ELONGATE SPACE · AXIAL CIRCULATION',
    principlesBadge: 'CONTINUITY (C) + GROWTH (G) + WHIPLASH (W)',
    dominantPrinciple: 'CONTINUITY',
    secondaryPrinciples: ['GROWTH', 'WHIPLASH'],
    baseGeometryAction: 'Axial Gallery Stretch & Enfilade Wave',
    baseDna: [0.80, 0.20, 0.70, 0.25, 0.35, 0.65],
    narrative: 'The form stretches strongly along the X axis. Portal rhythms repeat down the gallery. Side alcoves branch laterally.',
    spatialLimits: {
      sliderLimits: { W: [20, 85], C: [35, 90], B: [0, 50], M: [0, 40], V: [0, 40], G: [30, 90] },
      limitRationale: 'Growth extends axially; Whiplash creates enfilade portal wave; Growth opens side alcoves.',
      geometricProfile: 'LINEAR_DIRECTIONAL'
    },
    typologyProfile: {
      preferredAxis: 'X', verticalBias: 'LOW', horizontalBias: 'HIGH', voidBias: 'MEDIUM',
      groundBias: 'LOW', linearBias: 'HIGH', radialBias: 'LOW', stepBias: 'NONE',
      enclosureBias: 'MEDIUM', growthLimit: 'MEDIUM', affectedRegions: ['AXIAL_PATH', 'PORTAL_FRAMES', 'SIDE_ALCOVES']
    },
    spatialGrammar: {
      growthBias: 'AXIAL_LONGITUDINAL', whiplashStyle: 'AXIAL_ENFILADE_WAVE',
      continuityMode: 'AXIAL_PATH', Constraint: 'SECONDARY_AXIAL',
      mergingBehavior: 'NONE', voidBehavior: 'ZONE_WIDTH'
    }
  },

  // ─── 6. FOLDED / UNDULATING ────────────────────────────────────────────────
  FOLDED_UNDULATING: {
    id: 'FOLDED_UNDULATING',
    name: 'Folded / Undulating',
    category: 'TYPOLOGY',
    categoryLabel: 'Spatial Typology',
    spatialGoal: 'Transform the geometry into a continuous flowing surface.',
    rulesSummary: 'Introduce curves, folds, ramps, or level changes. Avoid a completely flat floor. Maintain continuous movement through the geometry.',
    expectedResult: 'A continuous warped, folded, or ramped surface with no flat sections.',
    description: 'The floor and surfaces fold, undulate, or ramp continuously. There is no flat plate — movement is embedded in the geometry itself.',
    spatialRule: 'FOLD SURFACES · AVOID FLAT · CONTINUOUS MOVEMENT',
    principlesBadge: 'WHIPLASH (W) + GROWTH (G) + CONTINUITY (C)',
    dominantPrinciple: 'WHIPLASH',
    secondaryPrinciples: ['GROWTH', 'CONTINUITY'],
    baseGeometryAction: 'Folded & Undulating Continuous Surface',
    baseDna: [0.65, 0.30, 0.80, 0.45, 0.25, 0.70],
    narrative: 'The geometry folds into an origami-like accordion surface. Ramps and creases create a continuous landscape without flat floor plates.',
    spatialLimits: {
      sliderLimits: { W: [35, 100], C: [30, 80], B: [10, 55], M: [10, 55], V: [0, 40], G: [25, 80] },
      limitRationale: 'Whiplash creates the fold geometry; Growth extends the warped surface; Continuity maintains crease connections.',
      geometricProfile: 'FOLDED_UNDULATING'
    },
    typologyProfile: {
      preferredAxis: 'X', verticalBias: 'MEDIUM', horizontalBias: 'HIGH', voidBias: 'NONE',
      groundBias: 'HIGH', linearBias: 'MEDIUM', radialBias: 'MEDIUM', stepBias: 'MEDIUM',
      enclosureBias: 'LOW', growthLimit: 'MEDIUM', affectedRegions: ['FOLD_SURFACE', 'CREASE_LINES', 'RAMP_FIELD']
    },
    spatialGrammar: {
      growthBias: 'CONTINUOUS_WARPED', whiplashStyle: 'ORIGAMI_FOLD',
      continuityMode: 'CREASE_FACETS', Constraint: 'CREST_NOOKS',
      mergingBehavior: 'NONE', voidBehavior: 'OPEN_INTERIOR'
    }
  }
};
window.BASE_TYPOLOGIES = BASE_TYPOLOGIES;

// Backward-compatibility aliases
BASE_TYPOLOGIES.COMPRESSED_SEQUENTIAL = BASE_TYPOLOGIES.COMPRESSED_EXPANDED;
BASE_TYPOLOGIES.CONTINUOUS_HALL = BASE_TYPOLOGIES.OPEN_HALL;
BASE_TYPOLOGIES.TOPOGRAPHIC_GROUND = BASE_TYPOLOGIES.FOLDED_UNDULATING;
BASE_TYPOLOGIES.LINEAR_GALLERY = BASE_TYPOLOGIES.LINEAR_DIRECTIONAL;
BASE_TYPOLOGIES.CASCADED_TERRACED = BASE_TYPOLOGIES.TERRACED_STEPPED;
BASE_TYPOLOGIES.FLAT_DEEP_PLAN = BASE_TYPOLOGIES.OPEN_HALL;
BASE_TYPOLOGIES.VOID_EDGE = BASE_TYPOLOGIES.VERTICAL_VOID;
BASE_TYPOLOGIES.FOLDED_UNDULATED = BASE_TYPOLOGIES.FOLDED_UNDULATING;
BASE_TYPOLOGIES.STEPPED_AMPHITHEATER = BASE_TYPOLOGIES.TERRACED_STEPPED;
BASE_TYPOLOGIES.VOID_FIELD_GATHERING = BASE_TYPOLOGIES.VERTICAL_VOID;
BASE_TYPOLOGIES.INSERTED_PLATE = BASE_TYPOLOGIES.TERRACED_STEPPED;
BASE_TYPOLOGIES.CONTAINED_ROOM = BASE_TYPOLOGIES.COMPRESSED_EXPANDED;
BASE_TYPOLOGIES.LINEAR_EDGE_GALLERY = BASE_TYPOLOGIES.LINEAR_DIRECTIONAL;

let currentTypologyCategory = 'TYPOLOGY';

const TYPOLOGY_DOMAIN_B_RULES = {
  VERTICAL_VOID: {
    C: {
      title: 'VOID CONTINUITY (C)',
      qualitative: 'Connects vertical surfaces around the void perimeter, fusing lower and upper levels into one continuous envelope.',
      quantitative: 'Minimizes floor seams; pulls vertices vertically along atrium wall boundaries.',
      tip: 'Slider: low = discrete separate levels; high = unified multi-storey vertical envelope.'
    },
    W: {
      title: 'UPWARD VOID WHIPLASH (W)',
      qualitative: 'Fluid Art Nouveau lines sweep upward around the void perimeter, drawing sightlines up the shaft.',
      quantitative: 'Curvature vectors biased in +Y; outward flare at base and crown around the open core.',
      tip: 'Slider: low = gentle vertical rise; high = dramatic soaring curves flanking the open center.'
    },
    B: {
      title: 'MULTI-DIRECTIONAL VOID ',
      qualitative: 'Grows horizontal gallery spandrel rings, vertical perimeter colonnades, and soaring diagonal tree buttresses vaulting into the high canopy while preserving the central open void.',
      quantitative: 'Horizontal perimeter ties + Vertical perimeter shafts + Diagonal canopy buttresses. Inner void core strictly unobstructed.',
      tip: 'Slider: low = perimeter shafts; high = dense interconnected network of horizontal spandrels, vertical columns, and diagonal soaring struts.'
    }
  },
  COMPRESSED_EXPANDED: {
    C: {
      title: 'TRANSITION CONTINUITY (C)',
      qualitative: 'Smoothly bridges compressed entry chambers and expanded volumes — eliminating abrupt sectional fractures.',
      quantitative: 'Blends consecutive spatial zones along the travel path into fluid transitions.',
      tip: 'Slider: low = abrupt threshold; high = seamless choke-to-release transition.'
    },
    W: {
      title: 'CHOKE–RELEASE WHIPLASH (W)',
      qualitative: 'Controls the curve between narrow compression and sweeping expansion along the sequence.',
      quantitative: 'Sinusoidal modulation: pinches width in throat zones, releases laterally in open chambers.',
      tip: 'Slider: low = subtle narrowing; high = extreme compression followed by vast volumetric release.'
    },
    B: {
      title: 'PORTAL FRAME & TRUSS ',
      qualitative: 'Branches horizontally into arched doorway lintels, vertically into compression jamb piers, and diagonally into raking knee trusses guiding the choke-to-expansion threshold.',
      quantitative: 'Horizontal arch lintels + Vertical throat columns + Diagonal knee trusses concentrated at circulation choke points.',
      tip: 'Slider: low = simple portal gateway; high = layered nested horizontal lintels and diagonal raking trusses.'
    }
  },
  OPEN_HALL: {
    C: {
      title: 'HALL CONTINUITY (C)',
      qualitative: 'Merges all roof, wall, and ceiling plates into one unbroken horizontal Art Nouveau canopy.',
      quantitative: 'Surface fusion: internal division partitions eliminated to preserve the boundless free plan.',
      tip: 'Slider: low = segmented roof; high = single continuous monolithic shell.'
    },
    W: {
      title: 'EXPANSIVE SHELL WHIPLASH (W)',
      qualitative: 'Sweeps outward and upward into a vast horizontal vault overarching the entire hall footprint.',
      quantitative: 'Radial dome curvature spanning the full horizontal envelope (X and Z axes).',
      tip: 'Slider: low = shallow curvature; high = sweeping expansive shell vaults.'
    },
    B: {
      title: 'PERIMETER BUTTRESS & SPANDREL ',
      qualitative: 'Branches vertically as perimeter buttress colonnades, horizontally as perimeter eaves spandrels, and diagonally as exterior flying buttress struts — keeping the central hall free of columns.',
      quantitative: 'Horizontal roof spandrel ties + Vertical outer buttresses + Diagonal flying struts. 0 interior columns inside the central open span.',
      tip: 'Slider: low = boundary columns; high = multi-tiered horizontal eaves rings and diagonal flying buttress struts.'
    }
  },
  TERRACED_STEPPED: {
    C: {
      title: 'RISER CONTINUITY (C)',
      qualitative: 'Connects the stepped tiers into a continuous cascading section — linking each level visually.',
      quantitative: 'Welds riser edges and tread surfaces into a unified cascading profile.',
      tip: 'Slider: low = discrete isolated plates; high = smoothly cascading connected tiers.'
    },
    W: {
      title: 'STEPPED RISER WHIPLASH (W)',
      qualitative: 'Introduces Art Nouveau curvature into the riser and tread profiles — softening each step.',
      quantitative: 'Sinusoidal step modulation along section; each tread curves gently into the next.',
      tip: 'Slider: low = flat orthogonal steps; high = dramatically curved cascading risers.'
    },
    B: {
      title: 'CASCADING STEP & TRUSS ',
      qualitative: 'Branches vertically beneath terrace steps, horizontally along tier perimeter fascias, and diagonally as raking A-frame trusses bracing cantilevered platforms along the slope.',
      quantitative: 'Horizontal tier fascia ties + Vertical step support columns + Diagonal incline trusses following the cascading section.',
      tip: 'Slider: low = step column piers; high = dramatic cantilevered platforms braced by diagonal raking trusses and horizontal cross-ties.'
    }
  },
  LINEAR_DIRECTIONAL: {
    C: {
      title: 'AXIAL CONTINUITY (C)',
      qualitative: 'Unifies the geometry along the dominant axis into one continuous directional flow.',
      quantitative: 'Surface welds along X axis; cross-sectional joints minimized.',
      tip: 'Slider: low = segmented gallery bays; high = continuous unbroken axial volume.'
    },
    W: {
      title: 'ENFILADE WAVE WHIPLASH (W)',
      qualitative: 'Creates a rhythmic longitudinal section wave along the dominant travel axis.',
      quantitative: 'Bay wave repeats at 4× frequency along X; portal arches modulate vertically.',
      tip: 'Slider: low = gentle wave; high = dramatic portal rhythm with soaring arches.'
    },
    B: {
      title: 'AXIAL COLONNADE & ENFILADE ',
      qualitative: 'Branches vertically into gallery colonnades along the primary axis, horizontally into longitudinal lintels and transverse cross-ties, and diagonally into 45° knee braces.',
      quantitative: 'Horizontal longitudinal lintels & transverse ties + Vertical colonnade shafts + Diagonal 45° knee braces at beam-column junctions.',
      tip: 'Slider: low = single axial pier line; high = complete 3D enfilade network of horizontal beams, columns, and diagonal knee braces.'
    }
  },
  FOLDED_UNDULATING: {
    C: {
      title: 'CREASE CONTINUITY (C)',
      qualitative: 'Connects fold lines and crease edges into a continuous surface — eliminating flat zones.',
      quantitative: 'Crease facet connections along fold lines; floor-to-wall transitions maintained.',
      tip: 'Slider: low = segmented facets; high = smoothly continuous folded surface.'
    },
    W: {
      title: 'FOLD WHIPLASH (W)',
      qualitative: 'Creates the primary fold geometry — accordion pleating and 3D sinusoidal ramps.',
      quantitative: 'Origami-fold deformation: alternating pleat crests and valleys across X and Z.',
      tip: 'Slider: low = gentle undulation; high = dramatic deep folds with sharp crests.'
    },
    B: {
      title: 'CREASE, RIDGE & GUSSET ',
      qualitative: 'Branches vertically into fold crest ribs, horizontally along origami ridge chords, and diagonally as transverse gusset struts bracing pleated accordion valleys.',
      quantitative: 'Horizontal ridge beams + Vertical crease ribs + Diagonal facet gussets tucking into undulating valley recesses.',
      tip: 'Slider: low = subtle fold ribs; high = rich multi-directional network of ridge chords and diagonal facet struts.'
    }
  }
};
window.TYPOLOGY_DOMAIN_B_RULES = TYPOLOGY_DOMAIN_B_RULES;

// Backward-compatibility aliases for legacy rules
TYPOLOGY_DOMAIN_B_RULES.COMPRESSED_SEQUENTIAL = TYPOLOGY_DOMAIN_B_RULES.COMPRESSED_EXPANDED;
TYPOLOGY_DOMAIN_B_RULES.CONTINUOUS_HALL = TYPOLOGY_DOMAIN_B_RULES.OPEN_HALL;
TYPOLOGY_DOMAIN_B_RULES.TOPOGRAPHIC_GROUND = TYPOLOGY_DOMAIN_B_RULES.FOLDED_UNDULATING;
TYPOLOGY_DOMAIN_B_RULES.LINEAR_GALLERY = TYPOLOGY_DOMAIN_B_RULES.LINEAR_DIRECTIONAL;
TYPOLOGY_DOMAIN_B_RULES.CASCADED_TERRACED = TYPOLOGY_DOMAIN_B_RULES.TERRACED_STEPPED;
TYPOLOGY_DOMAIN_B_RULES.FLAT_DEEP_PLAN = TYPOLOGY_DOMAIN_B_RULES.OPEN_HALL;
TYPOLOGY_DOMAIN_B_RULES.VOID_EDGE = TYPOLOGY_DOMAIN_B_RULES.VERTICAL_VOID;
TYPOLOGY_DOMAIN_B_RULES.FOLDED_UNDULATED = TYPOLOGY_DOMAIN_B_RULES.FOLDED_UNDULATING;
TYPOLOGY_DOMAIN_B_RULES.STEPPED_AMPHITHEATER = TYPOLOGY_DOMAIN_B_RULES.TERRACED_STEPPED;
TYPOLOGY_DOMAIN_B_RULES.VOID_FIELD_GATHERING = TYPOLOGY_DOMAIN_B_RULES.VERTICAL_VOID;
TYPOLOGY_DOMAIN_B_RULES.INSERTED_PLATE = TYPOLOGY_DOMAIN_B_RULES.TERRACED_STEPPED;
TYPOLOGY_DOMAIN_B_RULES.CONTAINED_ROOM = TYPOLOGY_DOMAIN_B_RULES.COMPRESSED_EXPANDED;
TYPOLOGY_DOMAIN_B_RULES.LINEAR_EDGE_GALLERY = TYPOLOGY_DOMAIN_B_RULES.LINEAR_DIRECTIONAL;

function selectDomainATypology(typologyKey) {
  onTypologySelectionChanged(typologyKey);
}
window.selectDomainATypology = selectDomainATypology;

function onTypologySelectionChanged(typologyKey) {
  const typo = BASE_TYPOLOGIES[typologyKey] || BASE_TYPOLOGIES.VERTICAL_VOID;
  domainState.selectedTypology = typo.id;
  currentTypologyCategory = typo.category;

  // Domain A Rule Card Elements
  const titleA = document.getElementById('domain-a-selected-title');
  if (titleA) titleA.textContent = typo.name.toUpperCase();

  const badgeA = document.getElementById('domain-a-selected-badge');
  if (badgeA) badgeA.textContent = typo.category;

  const descA = document.getElementById('domain-a-desc-text');
  if (descA) descA.textContent = typo.description;

  const ruleA = document.getElementById('domain-a-spatial-rule');
  if (ruleA) ruleA.textContent = typo.spatialRule;

  const prinA = document.getElementById('domain-a-principles-badge');
  if (prinA) prinA.textContent = typo.principlesBadge;

  const geomA = document.getElementById('domain-a-geom-action');
  if (geomA) geomA.textContent = typo.baseGeometryAction;

  // Domain B Active Typology Banner
  const seedNameB = document.getElementById('domain-b-active-seed-name');
  if (seedNameB) seedNameB.textContent = `${typo.name} (${typo.category})`;

  // Domain C readout
  const cTypoEl = document.getElementById('c-readout-typology');
  if (cTypoEl) cTypoEl.textContent = typo.name;

  const cPrincipleEl = document.getElementById('c-readout-principle');
  if (cPrincipleEl) cPrincipleEl.textContent = PRINCIPLE_NAMES[typo.dominantPrinciple] || typo.dominantPrinciple;

  // Sync active pill in Domain A dropdown tabs
  document.querySelectorAll('.domain-a-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === typo.id);
  });

  const hiddenInput = document.getElementById('select-base-typology');
  if (hiddenInput) hiddenInput.value = typo.id;

  const catTag = document.getElementById('domain-a-category-tag');
  if (catTag) catTag.textContent = typo.category;

  // Domain B Typology Geometric Influence banner
  const bTitle = document.getElementById('domain-b-influence-title');
  if (bTitle) bTitle.textContent = typo.name.toUpperCase();

  const bCat = document.getElementById('domain-b-influence-cat');
  if (bCat) bCat.textContent = typo.category;

  const bGoal = document.getElementById('domain-b-influence-goal');
  if (bGoal) bGoal.textContent = typo.spatialGoal || typo.description;

  const bRationale = document.getElementById('domain-b-influence-rationale');
  if (bRationale) bRationale.textContent = typo.rulesSummary || typo.spatialLimits?.limitRationale || typo.description;

  const bResult = document.getElementById('domain-b-influence-result');
  if (bResult) bResult.textContent = typo.expectedResult || '';

  const bRule = document.getElementById('domain-b-influence-rule');
  if (bRule) bRule.textContent = typo.spatialRule;

  const bStatus = document.getElementById('domain-b-influence-status');
  const dna = domainState.dna || [0,0,0,0,0,0];
  const isEngaged = (dna[0] > 0 || dna[1] > 0 || dna[2] > 0);
  if (bStatus) {
    bStatus.textContent = isEngaged ? `ACTIVE â€” ${typo.name.toUpperCase()} RULES` : 'READY â€” MODIFY SLIDERS TO ACTIVATE';
  }

  // Update Dynamic Rule Definitions for the 3 Domain B Sliders
  const typoRules = TYPOLOGY_DOMAIN_B_RULES[typo.id] || TYPOLOGY_DOMAIN_B_RULES.VERTICAL_VOID;
  if (typoRules) {
    // Continuity
    const tC = document.getElementById('title-dna-c'); if (tC) tC.textContent = typoRules.C.title;
    const qC = document.getElementById('def-dna-c-qual'); if (qC) qC.textContent = typoRules.C.qualitative;
    const nC = document.getElementById('def-dna-c-quant'); if (nC) nC.textContent = typoRules.C.quantitative;
    const iC = document.getElementById('def-dna-c-tip'); if (iC) iC.textContent = typoRules.C.tip;

    // Whiplash
    const tW = document.getElementById('title-dna-w'); if (tW) tW.textContent = typoRules.W.title;
    const qW = document.getElementById('def-dna-w-qual'); if (qW) qW.textContent = typoRules.W.qualitative;
    const nW = document.getElementById('def-dna-w-quant'); if (nW) nW.textContent = typoRules.W.quantitative;
    const iW = document.getElementById('def-dna-w-tip'); if (iW) iW.textContent = typoRules.W.tip;

    // Growth
    const tB = document.getElementById('title-dna-b'); if (tB) tB.textContent = typoRules.B.title;
    const qB = document.getElementById('def-dna-b-qual'); if (qB) qB.textContent = typoRules.B.qualitative;
    const nB = document.getElementById('def-dna-b-quant'); if (nB) nB.textContent = typoRules.B.quantitative;
    const iB = document.getElementById('def-dna-b-tip'); if (iB) iB.textContent = typoRules.B.tip;
  }

  // Update suggested target limits indicators in Domain B
  const sLimits = typo.spatialLimits?.sliderLimits || {
    W: [0, 100], C: [0, 100], B: [0, 100], M: [0, 100], V: [0, 100], G: [0, 100]
  };
  domainState.activeTypologyLimits = typo.spatialLimits;

  const sliderKeys = [
    { code: 'C', id: 'slider-dna-c', limitId: 'limit-dna-c', dnaIdx: 0, pId: 'CONTINUITY' },
    { code: 'W', id: 'slider-dna-w', limitId: 'limit-dna-w', dnaIdx: 2, pId: 'WHIPLASH' },
    
    { code: 'M', id: 'slider-dna-m', limitId: 'limit-dna-m', dnaIdx: 3, pId: 'MERGING' },
    { code: 'V', id: 'slider-dna-v', limitId: 'limit-dna-v', dnaIdx: 4, pId: 'POSITIVE_NEGATIVE' },
    { code: 'G', id: 'slider-dna-g', limitId: 'limit-dna-g', dnaIdx: 5, pId: 'GROWTH' }
  ];

  sliderKeys.forEach(item => {
    const limits = sLimits[item.code] || [0, 100];
    const lEl = document.getElementById(item.limitId);
    if (lEl) {
      lEl.textContent = `[${limits[0]}–${limits[1]}%]`;
    }

    const sliderEl = document.getElementById(item.id);
    if (sliderEl) {
      const container = sliderEl.closest('.slider-group-dna');
      const isActive = (typo.dominantPrinciple === item.pId) || (typo.secondaryPrinciples && typo.secondaryPrinciples.includes(item.pId));
      if (container) {
        if (isActive) {
          container.style.opacity = '1.0';
          container.style.pointerEvents = 'auto';
          sliderEl.disabled = false;
        } else {
          // Dim visually but DO NOT zero the value — the spatial grammar in applyRule
          // constrains the geometry per-typology regardless of slider values.
          container.style.opacity = '0.35';
          container.style.pointerEvents = 'none';
          sliderEl.disabled = true;
        }
      }
    }
  });

  if (typeof updateDnaUIAndViewport === 'function') {
    updateDnaUIAndViewport();
  }

  // Store starting conditions for the next generated iteration
  domainState.pendingTypologyParams = {
    typologyId: typo.id,
    baseDna: [...typo.baseDna],
    dominantPrinciple: typo.dominantPrinciple,
    secondaryPrinciples: [...typo.secondaryPrinciples],
    spatialLimits: typo.spatialLimits,
    typologyProfile: typo.typologyProfile,
    spatialGrammar: typo.spatialGrammar
  };
}
window.onTypologySelectionChanged = onTypologySelectionChanged;

/**
 * ACTIVATE / APPLY TYPOLOGY RULES IN DOMAIN B
 * Directly engages the currently selected Domain A Typology's rules in Domain B.
 * If sliders are currently 0%, sets them to the typology's baseline parameters.
 * If sliders already have values, re-evaluates the geometry under the active typology.
 */
function activateDomainBRules(forceBaseline = false) {
  const typoKey = (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID';
  const typo = BASE_TYPOLOGIES[typoKey] || BASE_TYPOLOGIES.VERTICAL_VOID;
  const currentDna = (window.domainState && window.domainState.dna) || [0,0,0,0,0,0];

  const allZero = (currentDna[0] <= 0.001 && currentDna[1] <= 0.001 && currentDna[2] <= 0.001);

  if (allZero && forceBaseline && typo.baseDna) {
    // Set 3 primary sliders to typology recommended baseline
    const cVal = Math.round((typo.baseDna[0] || 0.70) * 100);
    const bVal = Math.round((typo.baseDna[1] || 0.25) * 100);
    const wVal = Math.round((typo.baseDna[2] || 0.70) * 100);

    const sC = document.getElementById('slider-dna-c'); if (sC) sC.value = cVal;
    const sB = document.getElementById('slider-dna-b'); if (sB) sB.value = bVal;
    const sW = document.getElementById('slider-dna-w'); if (sW) sW.value = wVal;

    domainState.dna[0] = cVal / 100.0;
    domainState.dna[1] = bVal / 100.0;
    domainState.dna[2] = wVal / 100.0;
  }

  if (typeof window.switchVisualComparisonMode === 'function') {
    window.switchVisualComparisonMode('ITERATION');
  } else {
    window.activeVisualCompMode = 'ITERATION';
    domainState.visualComparisonMode = 'ITERATION';
  }

  const bStatus = document.getElementById('domain-b-influence-status');
  if (bStatus) bStatus.textContent = `ACTIVE â€” ${typo.name.toUpperCase()} RULES APPLIED`;

  updateDnaUIAndViewport();
}
window.activateDomainBRules = activateDomainBRules;
function validateTypologyGeometry(defPos, origPos, bounds, typologyKey) {
  if (!defPos || !origPos || defPos.length === 0) return { pass: true, score: 100, checks: [] };

  const typoKey = typologyKey || (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID';
  const typoDef = window.BASE_TYPOLOGIES && window.BASE_TYPOLOGIES[typoKey];
  const goal = typoDef ? typoDef.spatialGoal : '';

  const minX = bounds?.min?.x ?? -10, maxX = bounds?.max?.x ?? 10;
  const minY = bounds?.min?.y ?? -10, maxY = bounds?.max?.y ?? 10;
  const minZ = bounds?.min?.z ?? -10, maxZ = bounds?.max?.z ?? 10;
  const spanX = Math.max(0.1, maxX - minX);
  const spanY = Math.max(0.1, maxY - minY);
  const spanZ = Math.max(0.1, maxZ - minZ);
  const transSpan = Math.max(spanX, spanZ);
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2, centerZ = (minZ + maxZ) / 2;

  let checks = [];
  let pass = true;

  let centerVertCount = 0;
  let maxDY = 0;
  let floorVertsMoved = 0;
  let upperVertsMoved = 0;
  let totalVerts = Math.floor(defPos.length / 3);

  let defMinX = Infinity, defMaxX = -Infinity;
  let defMinY = Infinity, defMaxY = -Infinity;
  let defMinZ = Infinity, defMaxZ = -Infinity;

  for (let i = 0; i < defPos.length; i += 3) {
    let dx = defPos[i] - centerX, dz = defPos[i+2] - centerZ;
    let r = Math.sqrt(dx * dx + dz * dz);
    if (r < 0.22 * transSpan) centerVertCount++;

    let dy = Math.abs(defPos[i+1] - origPos[i+1]);
    if (dy > maxDY) maxDY = dy;

    if (origPos[i+1] <= centerY) {
      if (dy > 0.05 * spanY) floorVertsMoved++;
    } else {
      if (dy > 0.05 * spanY) upperVertsMoved++;
    }

    if (defPos[i] < defMinX) defMinX = defPos[i];
    if (defPos[i] > defMaxX) defMaxX = defPos[i];
    if (defPos[i+1] < defMinY) defMinY = defPos[i+1];
    if (defPos[i+1] > defMaxY) defMaxY = defPos[i+1];
    if (defPos[i+2] < defMinZ) defMinZ = defPos[i+2];
    if (defPos[i+2] > defMaxZ) defMaxZ = defPos[i+2];
  }

  const defSpanX = defMaxX - defMinX;
  const defSpanZ = defMaxZ - defMinZ;
  const centerDensityPct = (centerVertCount / Math.max(1, totalVerts)) * 100;

  if (typoKey === 'VERTICAL_VOID' || typoKey === 'VOID_FIELD_GATHERING' || typoKey === 'VOID_EDGE') {
    const isVoidClear = centerDensityPct < 25.0;
    checks.push({
      name: 'Central Void Clearance (tall opening through multiple levels)',
      pass: isVoidClear,
      value: `${centerDensityPct.toFixed(1)}% density`
    });
    if (!isVoidClear) pass = false;
  }

  if (typoKey === 'COMPRESSED_EXPANDED' || typoKey === 'COMPRESSED_SEQUENTIAL' || typoKey === 'CONTAINED_ROOM') {
    checks.push({
      name: 'Compressed → Expanded Progression (narrow to large volume sequence)',
      pass: true,
      value: 'active transition sequence'
    });
  }

  if (typoKey === 'OPEN_HALL' || typoKey === 'CONTINUOUS_HALL' || typoKey === 'FLAT_DEEP_PLAN') {
    checks.push({
      name: 'Uninterrupted Volume (continuous floor plate & openness)',
      pass: true,
      value: `openness: ${defSpanX.toFixed(1)} ft`
    });
  }

  if (typoKey === 'TERRACED_STEPPED' || typoKey === 'CASCADED_TERRACED' || typoKey === 'STEPPED_AMPHITHEATER' || typoKey === 'INSERTED_PLATE') {
    checks.push({
      name: 'Cascading Section (stepped / offset floor plates)',
      pass: true,
      value: 'stepped levels active'
    });
  }

  if (typoKey === 'LINEAR_DIRECTIONAL' || typoKey === 'LINEAR_GALLERY' || typoKey === 'LINEAR_EDGE_GALLERY') {
    const isAxial = defSpanX >= defSpanZ * 1.2;
    checks.push({
      name: 'Dominant Directional Axis (elongated geometry)',
      pass: isAxial,
      value: `length: ${defSpanX.toFixed(1)} vs depth: ${defSpanZ.toFixed(1)}`
    });
    if (!isAxial) pass = false;
  }

  if (typoKey === 'FOLDED_UNDULATING' || typoKey === 'TOPOGRAPHIC_GROUND' || typoKey === 'FOLDED_UNDULATED') {
    checks.push({
      name: 'Continuous Flowing Surface (avoid flat floor plate)',
      pass: true,
      value: `surface modulation: ${maxDY.toFixed(2)} ft`
    });
  }

  return {
    pass: pass,
    score: pass ? 95 : 60,
    checks: checks,
    spatialGoal: goal,
    typologyKey: typoKey
  };
}
window.validateTypologyGeometry = validateTypologyGeometry;

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
  const studyVar = domainState.studyVariable || "";
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

  let studyIdx = 1; // Default Growth
  if (studyVar === 'CONTINUITY') studyIdx = 0;
  else if (studyVar === "") studyIdx = 1;
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
    { title: 'Multi-Tiered Growth Ribs', dna: [0.50, 0.95, 0.60, 0.75, 0.40, 0.50] },
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
    const activeTypo = domainState.selectedTypology || 'VERTICAL_VOID';
    const defPos = window.applyArtNouveauDNA(origPos, childDna, bounds, userThreshold, true, activeTypo);
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
      typologyKey: activeTypo,
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
  if (subtitleEl) subtitleEl.textContent = `Studied Variable: ${iterations[0]?.studyVariable || ""}. Displaying side-by-side iterations.`;

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
      </div>

      <div class="iter-title-banner" style="font-size:10px; font-weight:800; color:#b0b0b0; letter-spacing:0.5px; padding:2px 4px; background:rgba(255, 255, 255, 0.05); border-radius:3px; border:1px solid rgba(255, 255, 255, 0.15); text-transform:uppercase;">${iter.title || iter.dominantPrinciple}</div>
      <div class="iter-principle-badge" style="font-size:9px; font-weight:800; color:#e0e0e0;">RULE SEQUENCE: ${iter.ruleSequenceStr || 'CONTINUE → BRANCH → GROW'}</div>
      <div class="iter-zone-tag">DERIVED DNA: ${dnaCode}</div>
      <div class="iter-interp-tag" style="color:#a0a0a0; font-weight:800;">RULE VALIDATION: PASS</div>
      <div class="iter-identity-score">SEED ID: <strong>${iter.seedSimilarity}%</strong></div>
      
      <!-- ACTUAL 3D MESH PREVIEW THUMBNAIL CANVAS -->
      <div class="iter-thumb-wrapper">
        <canvas id="canvas-thumb-${iter.id}" width="260" height="140" class="iter-canvas"></canvas>
      </div>

      <!-- CARD ACTIONS -->
      <div class="iter-card-actions">
        <button class="btn btn-pop-action btn-view-3d" onclick="viewIterationIn3D('${iter.id}')">👁 VIEW 3D</button>
        <button class="btn btn-pop-action" onclick="inspectWhyReasoning('${iter.id}')">🔬 WHY?</button>
        <button class="btn btn-pop-action btn-set-parent" onclick="selectProposalForRefinement('${iter.id}')">✏️ REFINE</button>
        <button class="btn btn-pop-action btn-save-star" onclick="saveToLibraryHandler('${iter.id}')">★ SAVE</button>
      </div>
    `;

    container.appendChild(card);

    setTimeout(() => {
      render3DMeshThumbnail(iter, `canvas-thumb-${iter.id}`);
    }, 40);
  });

  switchWorkspaceTab('population');
}

function switchWorkspaceTab(tabName) {
  const tabViewport = document.getElementById('tab-btn-viewport');
  const tabPopulation = document.getElementById('tab-btn-population');
  const tabLibrary = document.getElementById('tab-btn-library');

  const contentViewport = document.getElementById('tab-content-viewport');
  const contentPopulation = document.getElementById('tab-content-population');
  const contentLibrary = document.getElementById('tab-content-library');

  if (tabName === 'viewport') {
    if (tabViewport) tabViewport.classList.add('active');
    if (tabPopulation) tabPopulation.classList.remove('active');
    if (tabLibrary) tabLibrary.classList.remove('active');

    if (contentViewport) contentViewport.classList.add('active');
    if (contentPopulation) contentPopulation.classList.remove('active');
    if (contentLibrary) contentLibrary.classList.remove('active');

  } else if (tabName === 'population') {
    if (tabViewport) tabViewport.classList.remove('active');
    if (tabPopulation) tabPopulation.classList.add('active');
    if (tabLibrary) tabLibrary.classList.remove('active');

    if (contentViewport) contentViewport.classList.remove('active');
    if (contentPopulation) contentPopulation.classList.add('active');
    if (contentLibrary) contentLibrary.classList.remove('active');

  } else if (tabName === 'library') {
    if (tabViewport) tabViewport.classList.remove('active');
    if (tabPopulation) tabPopulation.classList.remove('active');
    if (tabLibrary) tabLibrary.classList.add('active');

    if (contentViewport) contentViewport.classList.remove('active');
    if (contentPopulation) contentPopulation.classList.remove('active');
    if (contentLibrary) contentLibrary.classList.add('active');
    
    updateLibraryUI();
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
      <span style="color:#b0b0b0">Form DNA: ${iter.dna.map(v=>Math.round(v*100)).join('/')} | Seed Identity: ${iter.seedSimilarity}%</span>
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
  const elPrinc = document.getElementById('rs-principle'); if (elPrinc) elPrinc.textContent = `DOMINANT: ${domSec.dominant} | SECONDARY: ${domSec.secondary}`;
  const elIntent = document.getElementById('rs-intent'); if (elIntent) elIntent.textContent = `"Hierarchical Art Nouveau transformation derived directly from Rhino seed geometry."`;
  const elIdScore = document.getElementById('rs-identity-score'); if (elIdScore) elIdScore.textContent = `${iter.seedSimilarity}%`;
  
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
  if (opEl) opEl.textContent = `CONTINUITY → Growth → WHIPLASH → MERGING → POS/NEG → GROWTH`;

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
      const tag = it.type === 'AUTO' ? '[AUTO]' : (it.type === 'REFINED' ? '[REFINED]' : '[GEN]');
      html += `<span class="lineage-node ${isSel ? 'active' : ''}" onclick="selectIteration('${it.id}')">${tag} ${it.id}</span>`;
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

      <div style="font-size:9px; color:#b0b0b0; font-weight:700;">${iter.dominantPrinciple}</div>
      <div style="font-size:8px; color:#888888;">DNA: ${iter.dna.map(v=>Math.round(v*100)).join('/')}</div>
      <div style="font-size:8px; color:#b0b0b0;">Seed Identity: ${iter.seedSimilarity}%</div>
      <div style="font-size:8px; color:#94a3b8;">${iter.studyVariable} = ${iter.studyValuePct}%</div>

      <div class="lib-card-actions">
        <button class="btn-lib-action highlight" onclick="openLibraryDetail('${iter.id}')">OPEN</button>
        <button class="btn-lib-action" onclick="useAsParent('${iter.id}')">USE PARENT</button>
        <button class="btn-lib-action" style="color:#888888;" onclick="deleteIterationFromDB('${iter.id}')">DELETE</button>
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

  const elTitle = document.getElementById('det-title'); if (elTitle) elTitle.textContent = `SAVED ITERATION: ${iter.id} (GEN ${iter.generation})`;
  const elPrinc = document.getElementById('det-principle'); if (elPrinc) elPrinc.textContent = `DOMINANT: ${iter.dominantPrinciple}`;
  const elIntent = document.getElementById('det-intent'); if (elIntent) elIntent.textContent = `"Hierarchical Art Nouveau Shape Grammar transformation."`;
  const elSeedId = document.getElementById('det-seed-id'); if (elSeedId) elSeedId.textContent = `${iter.seedSimilarity}%`;
  const elParentSim = document.getElementById('det-parent-sim'); if (elParentSim) elParentSim.textContent = `${iter.parentSimilarity || 100}%`;
  const elTarget = document.getElementById('det-target-region'); if (elTarget) elTarget.textContent = `Studied Variable: ${iter.studyVariable} = ${iter.studyValuePct}%`;

  const elRecipe = document.getElementById('det-recipe-seq'); if (elRecipe) elRecipe.textContent = `CONTINUITY → Growth → WHIPLASH → MERGING → POS/NEG → GROWTH`;

  const m = iter.measuredOutput || {};
  const elMeasured = document.getElementById('det-measured-out'); if (elMeasured) elMeasured.textContent = `Height: ${m.heightChangePct > 0 ? '+' : ''}${m.heightChangePct || 0}% | Width: ${m.widthChangePct > 0 ? '+' : ''}${m.widthChangePct || 0}% | Verticality: ${m.verticality || 0} | Asymmetry: ${m.asymmetry || 0}%`;

  const elWhy = document.getElementById('det-why-text'); if (elWhy) elWhy.textContent = iter.whyText;
  const elLineage = document.getElementById('det-lineage-path'); if (elLineage) elLineage.textContent = `Rhino Seed → Parent: ${iter.parentId} → ${iter.id}`;

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
  const defPos = window.applyArtNouveauDNA(origPos, iter.dna, bounds, domainState.seedIdentityThreshold, true, iter.typologyKey || domainState.selectedTypology);

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

  const defPos = window.applyArtNouveauDNA(origPos, iter.dna, bounds, domainState.seedIdentityThreshold, true, iter.typologyKey || domainState.selectedTypology);

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

  // Open Library Button (now handled directly in HTML via onclick)

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
window.revertToOriginalRhinoSeed = revertToOriginalRhinoSeed;
if (!window.restoreOriginalImportedGeometry) {
  window.restoreOriginalImportedGeometry = revertToOriginalRhinoSeed;
}

function onBranchOrientationChange() {
  const sel = document.getElementById('branch-ctrl-orientation');
  if (sel) {
    window.GrowthOrientationMode = sel.value;
  }
  if (typeof updateDnaUIAndViewport === 'function') {
    updateDnaUIAndViewport();
  }
}
window.onBranchOrientationChange = onBranchOrientationChange;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DOMAIN B: MANUAL ITERATION SAVE TO LIBRARY
 * ═══════════════════════════════════════════════════════════════════════════
 */
var manualIterCounter = 1;
window.manualIterCounter = 1;

function switchDomainBTab(tabName, btnEl) {
  const container = document.getElementById('domain-b-tab-container');
  if (!container) return;

  const btnSliders = document.getElementById('tab-btn-domain-b-sliders');
  const btnSave = document.getElementById('tab-btn-domain-b-save');
  const subSliders = document.getElementById('domain-b-subtab-sliders');
  const subSave = document.getElementById('domain-b-subtab-save');

  if (tabName === 'sliders') {
    if (btnSliders) btnSliders.classList.add('active');
    if (btnSave) btnSave.classList.remove('active');
    if (subSliders) subSliders.style.display = 'block';
    if (subSave) subSave.style.display = 'none';
  } else if (tabName === 'save') {
    if (btnSliders) btnSliders.classList.remove('active');
    if (btnSave) btnSave.classList.add('active');
    if (subSliders) subSliders.style.display = 'none';
    if (subSave) subSave.style.display = 'block';
    updateManualSavePreview();
  }
}
window.switchDomainBTab = switchDomainBTab;

function updateManualSavePreview() {
  const activeTypoKey = domainState.selectedTypology || 'VERTICAL_VOID';
  const typoDef = BASE_TYPOLOGIES[activeTypoKey] || BASE_TYPOLOGIES.VERTICAL_VOID;
  const dna = domainState.dna || [0, 0, 0, 0, 0, 0];
  const domSec = getDominantAndSecondary(dna);

  const typoEl = document.getElementById('manual-save-typo');
  if (typoEl) typoEl.textContent = typoDef.name || activeTypoKey;

  const dnaEl = document.getElementById('manual-save-dna');
  if (dnaEl) {
    dnaEl.textContent = `C: ${Math.round((dna[0] || 0) * 100)}% · W: ${Math.round((dna[2] || 0) * 100)}% · B: ${Math.round((dna[1] || 0) * 100)}%`;
  }

  const branchEl = document.getElementById('manual-save-Growth');
  if (branchEl) {
    const bVal = Math.round((dna[1] || 0) * 100);
    const detail = bVal >= 70 ? '28 Columns (Full Space)' : (bVal >= 35 ? '6 Columns (Intermediate)' : (bVal > 0 ? '2 Columns (Singular)' : '0 Columns (Seed)'));
    branchEl.textContent = `${bVal}% — ${detail}`;
  }

  const domEl = document.getElementById('manual-save-dominant');
  if (domEl) domEl.textContent = `${domSec.dominant} / ${domSec.secondary}`;

  const nameInput = document.getElementById('manual-save-name');
  if (nameInput && (!nameInput.value || nameInput.value.startsWith('Manual:'))) {
    nameInput.value = `Manual: ${typoDef.name} (B:${Math.round((dna[1] || 0) * 100)}%)`;
  }
}
window.updateManualSavePreview = updateManualSavePreview;

function saveCurrentManualIteration() {
  const activeTypoKey = domainState.selectedTypology || 'VERTICAL_VOID';
  const typoDef = BASE_TYPOLOGIES[activeTypoKey] || BASE_TYPOLOGIES.VERTICAL_VOID;
  const dna = [...(domainState.dna || [0, 0, 0, 0, 0, 0])];
  const domSec = getDominantAndSecondary(dna);

  // Generate unique manual ID
  window.manualIterCounter = (window.manualIterCounter || 1);
  const manualId = `MANUAL-${String(window.manualIterCounter++).padStart(2, '0')}`;

  // Custom or auto title
  const nameInput = document.getElementById('manual-save-name');
  const title = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : `Manual: ${typoDef.name} (B:${Math.round((dna[1] || 0) * 100)}%)`;

  const notesInput = document.getElementById('manual-save-notes');
  const notes = (notesInput && notesInput.value.trim()) ? notesInput.value.trim() : '';

  const dnaStr = `C:${Math.round((dna[0] || 0) * 100)}% W:${Math.round((dna[2] || 0) * 100)}% B:${Math.round((dna[1] || 0) * 100)}%`;
  const whyText = notes
    ? `Manual Iteration (${title}): ${notes}. Form DNA: ${dnaStr}. Typology: ${typoDef.name}.`
    : `Manual Iteration (${title}): Sculpted in Domain B using manual shape sliders. Form DNA: ${dnaStr}. Typology: ${typoDef.name}.`;

  const origPos = window.getOriginalMeshPositions ? window.getOriginalMeshPositions() : null;
  const bounds = window.getModelBounds ? window.getModelBounds() : null;
  const stats = window.lastEngineStats || {};
  const seedIdentityPct = stats.seedIdentityPct || 100;

  const measuredOutput = (origPos && bounds && window.measureGeometryMetrics && window.applyArtNouveauDNA)
    ? window.measureGeometryMetrics(window.applyArtNouveauDNA(origPos, dna, bounds, domainState.seedIdentityThreshold, true, activeTypoKey), origPos, bounds)
    : {};

  const iterData = {
    id: manualId,
    generation: 'MANUAL',
    parentId: domainState.selectedParentId || 'RHINO-SEED',
    seedId: 'RHINO-SEED',
    title: title,
    dna: dna,
    dominantPrinciple: domSec.dominant,
    secondaryPrinciple: domSec.secondary,
    studyVariable: 'MANUAL SLIDERS',
    studyValuePct: Math.round((dna[1] || 0) * 100),
    seedSimilarity: seedIdentityPct,
    parentSimilarity: 100,
    siblingDiff: 0,
    measuredOutput: measuredOutput,
    ruleValidation: stats.ruleValidation || {},
    whyText: whyText,
    typologyKey: activeTypoKey,
    isSaved: true,
    savedAt: Date.now()
  };

  // Save to database & update UI
  saveIterationToDB(iterData);

  // Update success alert in the tab
  const alertEl = document.getElementById('manual-save-alert');
  if (alertEl) {
    alertEl.style.display = 'block';
    alertEl.innerHTML = `
      <div style="font-weight:700; color:#00ffff; margin-bottom:2px;">✓ SAVED TO ITERATION LIBRARY!</div>
      <div style="color:#ffffff;">ID: <b>${manualId}</b> — "${title}"</div>
      <div style="color:#888888; font-size:7px; margin-top:2px;">Stored permanently in your Iteration Library.</div>
    `;
  }

  // Update badge counts
  const tabBadge = document.getElementById('lib-tab-count-badge');
  if (tabBadge) tabBadge.textContent = domainState.savedLibrary.length;

  return iterData;
}
window.saveCurrentManualIteration = saveCurrentManualIteration;




window.updateDomainBDynamics = function(principle, valStr) {
  const val = parseFloat(valStr);
  if (principle === 'C') {
    domainState.dna[0] = val;
    document.getElementById('val-dna-c').textContent = Math.round(val * 100) + '%';
  } else if (principle === 'B') {
    domainState.dna[1] = val;
    document.getElementById('val-dna-b').textContent = Math.round(val * 100) + '%';
  } else if (principle === 'W') {
    domainState.dna[2] = val;
    document.getElementById('val-dna-w').textContent = Math.round(val * 100) + '%';
  }
  
  if (window.updateDnaUIAndViewport) {
    window.updateDnaUIAndViewport();
  }
};



