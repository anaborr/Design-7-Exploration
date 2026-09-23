/**
 * ============================================================================
 * DESIGN 7 EXPLORATION - DESCRIPTOR-DRIVEN ARCHITECTURAL EVOLUTION SYSTEM
 * MINIMAL DIAGNOSTIC RHINO .3DM IMPORTER (STEP-BY-STEP STAGE PIPELINE)
 * - Tests 1-6 Diagnostic Importer Pipeline
 * - Single Entry Point: parseRhino3dm(arrayBuffer, filename)
 * - Updates RHINO IMPORT PIPELINE Debug Box sequentially without resetting state
 * - Logs exact stages:
 *   [RHINO] 1 File selected
 *   [RHINO] 2 ArrayBuffer loaded
 *   [RHINO] 3 rhino3dm initialized
 *   [RHINO] 4 File3dm parsed
 *   [RHINO] 5 Object table found
 *   [RHINO] 6 Raw objects retrieved
 * ============================================================================
 */

// Global Rhino3dm Module Reference
let rhino = null;

// Application State
let appState = {
  originalRhinoGeometry: null,
  objectVisibilityMap: {}
};

// DOM Element References
const btnRhinoFileInput = document.getElementById('rhino-file-input');
const btnRhinoFileInputMain = document.getElementById('rhino-file-input-main');
const btnLoadSampleSeed = document.getElementById('btn-load-sample-seed');
const btnStartSample = document.getElementById('btn-start-sample');

const diagFilename = document.getElementById('diag-filename');
const diagObjects = document.getElementById('diag-objects');
const diagStatus = document.getElementById('diag-status');

const rawFileName = document.getElementById('raw-file-name');
const rawFileSize = document.getElementById('raw-file-size');
const rawDocStatus = document.getElementById('raw-doc-status');
const rawTableStatus = document.getElementById('raw-table-status');
const rawObjectCount = document.getElementById('raw-object-count');
const rawGeomRetrieved = document.getElementById('raw-geom-retrieved');
const rawNullGeom = document.getElementById('raw-null-geom');
const rawClassified = document.getElementById('raw-classified');
const rawUnclassified = document.getElementById('raw-unclassified');

// ============================================================================
// 1. INITIALIZATION & EVENT LISTENERS
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  console.log('[SYSTEM] Initializing Minimal Diagnostic Rhino Importer...');

  // Initialize rhino3dm library
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
// 3. MAIN DIAGNOSTIC PARSER: parseRhino3dm(arrayBuffer, filename)
// ============================================================================

/**
 * Single Entry Point Parser for user files and sample seed
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

  // TEST 2: ARRAY BUFFER CHECK
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    console.error('[RHINO ERROR] Failed at Stage 2: ArrayBuffer byteLength is 0');
    if (dbgErrors) dbgErrors.textContent = 'Stage 2: ArrayBuffer is 0 bytes';
    return;
  }

  // TEST 3: RHINO3DM INITIALIZATION CHECK
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

  // Get raw count safely
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

  // TEST 6: PRINT RAW OBJECTS
  let geomCount = 0;
  let nullCount = 0;
  const rawObjectsList = [];

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
      if (attributes) {
        if (typeof attributes.id === 'function') {
          objId = attributes.id();
        } else if (attributes.id) {
          objId = attributes.id;
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

      rawObjectsList.push({
        index: i,
        id: objId,
        hasGeometry: !!geom,
        constructor: ctorName
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
    objects: rawObjectsList
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
}

// ============================================================================
// 4. SAMPLE SEED GENERATOR (USES SAME parseRhino3dm PIPELINE)
// ============================================================================

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
      } catch (e) {
        console.error('[RHINO ERROR] Failed loading rhino3dm for sample seed:', e);
      }
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
