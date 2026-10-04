$filePath = "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\app.js"
$content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)

$startMarker = "function applyArtNouveauDNA(positions, dna, bounds, identityThreshold = 75, isMesh = true, typologyKey = null) {"
$endMarker = "function executeRecipeDeformation(positions, recipeOrDna, bounds, isMesh = true, typologyKey = null) {"

$startIndex = $content.IndexOf($startMarker)
$endIndex = $content.IndexOf($endMarker)

if ($startIndex -lt 0 -or $endIndex -lt 0) {
    Write-Error "Markers not found! startIndex: $startIndex, endIndex: $endIndex"
    exit 1
}

$replacement = @'
function computeMeshVertexNormals(positions, bounds) {
  const vNormals = new Map();
  const getKey = (x, y, z) => x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2);
  const minX = bounds?.min?.x ?? bounds?.minX ?? -15.1;
  const maxX = bounds?.max?.x ?? bounds?.maxX ?? 15.1;
  const minY = bounds?.min?.y ?? bounds?.minY ?? -10.0;
  const maxY = bounds?.max?.y ?? bounds?.maxY ?? 10.0;
  const minZ = bounds?.min?.z ?? bounds?.minZ ?? -5.35;
  const maxZ = bounds?.max?.z ?? bounds?.maxZ ?? 5.35;
  const cX = (minX + maxX) / 2, cY = (minY + maxY) / 2, cZ = (minZ + maxZ) / 2;

  for (let i = 0; i < positions.length; i += 9) {
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

  const getKey = (x, y, z) => x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2);
  const out = new Float32Array(mesh);
  const upperRule = (ruleName || '').toUpperCase();

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 1: GROWTH (G)
  // ══════════════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 2: BRANCHING (B)
  // ══════════════════════════════════════════════════════════════════════════
  else if (upperRule === 'BRANCHING' || upperRule === 'B') {
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let dx = x - centerX, dz = z - centerZ;
      let rCenter = Math.sqrt(dx * dx + dz * dz);
      let rNorm = rCenter / transSpan;
      let domVal = (domAxis === 'X') ? x : ((domAxis === 'Z') ? z : y);
      let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));

      let k = getKey(x, y, z);
      let n = vNormals ? (vNormals.get(k) || { x: dx / (rCenter || 1), y: 0, z: dz / (rCenter || 1) }) : { x: dx / (rCenter || 1), y: 0, z: dz / (rCenter || 1) };

      if (grammar.branchingConstraint === 'VOID_CLEAR') {
        // Branching + Vertical Void:
        // Branches organize around/up the void; central void stays strictly clear!
        if (rNorm >= 0.25) {
          let bDist = strength * 0.14 * transSpan;
          let spiralAngle = Math.atan2(dz, dx) + Math.PI * 0.5;
          out[i] += Math.cos(spiralAngle) * bDist * 0.35;
          out[i+2] += Math.sin(spiralAngle) * bDist * 0.35;
          out[i+1] += strength * spanY * 0.18 * Math.sin(Math.PI * u);
        }
      } else if (grammar.branchingConstraint === 'BROAD_DENDRITIC' || grammar.branchingConstraint === 'LOW_PRIORITY') {
        // Branching + Continuous Hall:
        // Few BROAD horizontal branches along perimeter, leaving center clear
        if (rNorm >= 0.20) {
          const contactPts = [0.25, 0.75];
          for (let cp of contactPts) {
            let du = Math.abs(u - cp);
            if (du < 0.12) {
              let flare = Math.cos(du / 0.12 * Math.PI * 0.5) * strength * 0.16 * transSpan;
              out[i] += n.x * flare * 0.40;
              out[i+2] += n.z * flare * 0.40;
              break;
            }
          }
        }
      } else if (grammar.branchingConstraint === 'SECONDARY_AXIAL') {
        // Branching + Linear Gallery:
        // Secondary branches come off the primary directional path (laterally in +/- Z)
        const spineNodes = [0.25, 0.50, 0.75];
        for (let sp of spineNodes) {
          let du = Math.abs(u - sp);
          if (du < 0.08) {
            let latDist = Math.cos(du / 0.08 * Math.PI * 0.5) * strength * 0.22 * spanZ;
            out[i+2] += (dz >= 0 ? 1 : -1) * latDist;
            out[i] += n.x * latDist * 0.15;
            break;
          }
        }
      } else if (grammar.branchingConstraint === 'TERRACE_CANTILEVERS') {
        // Branching + Cascaded Plates:
        // Branches become offset plate-like cantilever extensions
        let tier = Math.floor(u * 5) / 5;
        let flare = strength * 0.15 * transSpan;
        out[i] += (dx >= 0 ? 1 : -1) * flare * 0.35;
        out[i+1] += strength * spanY * 0.12 * tier;
        out[i+2] += n.z * flare * 0.35;
      } else if (grammar.branchingConstraint === 'GROUND_DIVIDE') {
        // Branching + Topographic Ground:
        // Subdivides circulation across ground plane
        let isGround = (y <= centerY + 0.1 * spanY);
        if (isGround) {
          let flare = strength * 0.15 * transSpan;
          out[i] += n.x * flare * 0.35;
          out[i+2] += n.z * flare * 0.35;
        }
      } else if (grammar.branchingConstraint === 'IN_PLANE_SUBDIVIDE') {
        // Branching + Flat Deep-Plan:
        // In-plane plate subdivision only (no vertical deformation)
        let flare = strength * 0.12 * transSpan;
        out[i] += n.x * flare * 0.30;
        out[i+2] += n.z * flare * 0.30;
      } else if (grammar.branchingConstraint === 'OUTWARD_FROM_VOID') {
        // Branching + Void-Edge:
        // Extends outward from void edge, never inward
        if (rNorm >= 0.25) {
          let flare = strength * 0.15 * transSpan;
          let dirX = dx / (rCenter + 0.001), dirZ = dz / (rCenter + 0.001);
          out[i] += dirX * flare * 0.35;
          out[i+2] += dirZ * flare * 0.35;
        }
      } else {
        const contactPts = [0.20, 0.40, 0.60, 0.80];
        for (let cp of contactPts) {
          let du = Math.abs(u - cp);
          if (du < 0.06) {
            let flare = Math.cos(du / 0.06 * Math.PI * 0.5) * strength * 0.12 * transSpan;
            out[i] += n.x * flare * 0.25;
            out[i+1] += n.y * flare * 0.25;
            out[i+2] += n.z * flare * 0.25;
            break;
          }
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 3: WHIPLASH (W)
  // ══════════════════════════════════════════════════════════════════════════
  else if (upperRule === 'WHIPLASH' || upperRule === 'W') {
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let dx = x - centerX, dz = z - centerZ;
      let rCenter = Math.sqrt(dx * dx + dz * dz);
      let rNorm = rCenter / transSpan;
      let domVal = (domAxis === 'X') ? x : ((domAxis === 'Z') ? z : y);
      let t = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));

      let totalDY = 0, dX = 0, dZ = 0;

      if (grammar.whiplashStyle === 'UPWARD_CURVATURE') {
        // Curves surfaces upward around the vertical void
        let upwardArc = Math.sin(Math.PI * t) * (1.0 + 0.40 * Math.sin(2.0 * Math.PI * t));
        let voidFactor = Math.min(1.5, 0.4 + rNorm);
        totalDY = strength * spanY * 0.44 * upwardArc * voidFactor;
        dZ = strength * transSpan * 0.18 * Math.sin(1.8 * Math.PI * t);
        dX = -strength * domSpan * 0.04 * Math.sin(2.0 * Math.PI * t);
      } else if (grammar.whiplashStyle === 'CHOKE_RELEASE_INFLECTION') {
        // Controls curved transitions between compression (choke) and release
        let sChoke = Math.sin(4.0 * Math.PI * t - Math.PI * 0.5);
        totalDY = strength * spanY * 0.36 * sChoke;
        dZ = strength * transSpan * 0.24 * sChoke * (z >= centerZ ? 1 : -1);
        dX = -strength * domSpan * 0.05 * Math.cos(4.0 * Math.PI * t);
      } else if (grammar.whiplashStyle === 'FLOOR_TOPOGRAPHY' || grammar.whiplashStyle === 'WARPED_TERRAIN') {
        // Acts primarily on floor geometry: creates gradual rises/falls, slopes
        let floorWeight = Math.max(0, Math.min(1.0, 1.2 - (y - minY) / (0.50 * spanY)));
        totalDY = strength * spanY * 0.40 * floorWeight * (Math.sin(2.2 * Math.PI * t) + 0.35 * Math.cos(2.8 * Math.PI * (z - minZ) / spanZ));
        dZ = strength * transSpan * 0.18 * floorWeight * Math.sin(1.8 * Math.PI * t);
        dX = strength * domSpan * 0.04 * floorWeight * Math.cos(2.0 * Math.PI * t);
      } else if (grammar.whiplashStyle === 'IN_PLANE_FLAT') {
        // Flat level plate: vertical deformation minimal (dY ~ 0), bends laterally in-plane
        totalDY = 0;
        dZ = strength * transSpan * 0.28 * Math.sin(2.0 * Math.PI * t);
        dX = strength * domSpan * 0.08 * Math.sin(Math.PI * t) * Math.cos(Math.PI * t);
      } else if (grammar.whiplashStyle === 'GENTLE_AXIAL' || grammar.whiplashStyle === 'OVERLOOK_GALLERY') {
        // Gently curves directional path / overlook ribbon
        totalDY = strength * spanY * 0.08 * Math.sin(Math.PI * t);
        dZ = strength * transSpan * 0.22 * Math.sin(Math.PI * t);
        dX = strength * domSpan * 0.05 * Math.sin(2.0 * Math.PI * t);
      } else if (grammar.whiplashStyle === 'ACOUSTIC_BOWL' || grammar.whiplashStyle === 'STEPPED_RISERS') {
        // Acoustic crests and tiered seating curvature
        let bowlCurve = Math.pow(Math.sin(Math.PI * t), 1.4);
        totalDY = strength * spanY * 0.32 * bowlCurve;
        dZ = strength * transSpan * 0.20 * Math.cos(Math.PI * t);
        dX = -strength * domSpan * 0.06 * bowlCurve;
      } else {
        totalDY = strength * spanY * 0.32 * Math.sin(Math.PI * t);
        dZ = strength * transSpan * 0.20 * Math.sin(1.6 * Math.PI * t);
        dX = -strength * domSpan * 0.03 * Math.sin(2.0 * Math.PI * t);
      }

      if (domAxis === 'X') {
        out[i] += dX; out[i+1] += totalDY; out[i+2] += dZ;
      } else if (domAxis === 'Y') {
        out[i] += totalDY; out[i+1] += dX; out[i+2] += dZ;
      } else {
        out[i] += totalDY; out[i+1] += dZ; out[i+2] += dX;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 4: MERGING (M)
  // ══════════════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 5: POSITIVE / NEGATIVE SPACE (V)
  // ══════════════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 6: CONTINUITY (C)
  // ══════════════════════════════════════════════════════════════════════════
  else if (upperRule === 'CONTINUITY' || upperRule === 'C') {
    let transAxis1, transAxis2;
    if (domAxis === 'Y') { transAxis1 = 0; transAxis2 = 2; }
    else if (domAxis === 'X') { transAxis1 = 1; transAxis2 = 2; }
    else { transAxis1 = 0; transAxis2 = 1; }

    const endZoneWidth = domSpan * (grammar.continuityMode === 'CONTINUOUS_SHELL' ? 0.32 : 0.22);
    
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let domVal = (domAxis === 'X') ? x : ((domAxis === 'Z') ? z : y);
      let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));

      let tVal1 = out[i + transAxis1];
      let tVal2 = out[i + transAxis2];
      let tCenter1 = (domAxis === 'X') ? centerY : centerX;
      let tCenter2 = (domAxis === 'Z') ? centerY : centerZ;
      if (domAxis === 'Y') { tCenter1 = centerX; tCenter2 = centerZ; }
      let dTrans1 = tVal1 - tCenter1;
      let dTrans2 = tVal2 - tCenter2;
      let transRadial = Math.sqrt(dTrans1*dTrans1 + dTrans2*dTrans2);

      if (grammar.continuityMode === 'VERTICAL_CONNECTIONS') {
        let dyFromCenter = y - centerY;
        let vertPull = strength * 0.18 * spanY * Math.sign(-dyFromCenter) * Math.min(1.0, Math.abs(dyFromCenter) / (0.45 * spanY));
        out[i+1] += vertPull;
      } else if (grammar.continuityMode === 'RISER_CONNECT' || grammar.continuityMode === 'CIRCULATION_STEPS') {
        let tierU = (u * 5) % 1.0;
        if (tierU > 0.85 || tierU < 0.15) {
          let stepSmooth = strength * 0.10 * spanY * Math.sin(tierU * Math.PI * 2);
          out[i+1] -= stepSmooth;
        }
      }

      // Right End Closure
      if (u > (1.0 - endZoneWidth / domSpan) && strength > 0.05) {
        let endFrac = Math.min(1.0, (u - (1.0 - endZoneWidth / domSpan)) / (endZoneWidth / domSpan));
        let curve = endFrac * endFrac * (3 - 2 * endFrac);
        let pullBack = Math.min(1.0, strength * 2.0) * curve * endZoneWidth;
        if (domAxis === 'X') out[i] -= pullBack;
        else if (domAxis === 'Y') out[i+1] -= pullBack;
        else out[i+2] -= pullBack;
      }

      // Left End Closure
      if (u < (endZoneWidth / domSpan) && strength > 0.40) {
        let endFrac = Math.min(1.0, 1.0 - (u / (endZoneWidth / domSpan)));
        let curve = endFrac * endFrac * (3 - 2 * endFrac);
        let pullForward = Math.min(1.0, (strength - 0.40) / 0.55) * curve * endZoneWidth;
        if (domAxis === 'X') out[i] += pullForward;
        else if (domAxis === 'Y') out[i+1] += pullForward;
        else out[i+2] += pullForward;
      }

      if (grammar.continuityMode === 'CONTINUOUS_SHELL') {
        let edgePull = strength * 0.08 * domSpan * Math.sin(Math.PI * u);
        out[i + transAxis2] += (dTrans2 > 0 ? -1 : 1) * edgePull * 0.15;
      }
    }
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
    scaledMagnitude: 100,
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

'@

$newContent = $content.Substring(0, $startIndex) + $replacement + "`r`n`r`n" + $content.Substring($endIndex)
[System.IO.File]::WriteAllText($filePath, $newContent, [System.Text.Encoding]::UTF8)
Write-Output "Successfully updated app.js! New length: $($newContent.Length)"
