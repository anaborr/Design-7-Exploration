$c = Get-Content 'app.js' -Raw
$markerStart = "  else if (upperRule === 'BRANCHING' || upperRule === 'B') {"
$markerEnd = "  return out;"

$idx1 = $c.IndexOf($markerStart)
$idx2 = $c.IndexOf($markerEnd, $idx1)

if ($idx1 -lt 0 -or $idx2 -lt 0) {
    Write-Error "Markers not found: idx1=$idx1, idx2=$idx2"
    exit 1
}

$newCode = @"
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 2: BRANCHING (B)
  // ══════════════════════════════════════════════════════════════════════════
  else if (upperRule === 'BRANCHING' || upperRule === 'B') {
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let dx = x - centerX, dy = y - centerY, dz = z - centerZ;
      let rXZ = Math.sqrt(dx * dx + dz * dz);
      let rNorm = rXZ / (transSpan * 0.5);
      let theta = Math.atan2(dz, dx);
      let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
      let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
      let uZ = Math.min(1, Math.max(0, (z - minZ) / spanZ));

      if (grammar.branchingConstraint === 'VOID_CLEAR') {
        // Vertical Void: branches organize along outer perimeter walls; central atrium stays clear!
        if (rNorm >= 0.28) {
          let bDist = strength * 0.20 * transSpan;
          let spiral = theta + Math.PI * 0.5;
          out[i] += Math.cos(spiral) * bDist * 0.40;
          out[i+2] += Math.sin(spiral) * bDist * 0.40;
          out[i+1] += strength * spanY * 0.25 * Math.sin(Math.PI * uY);
        }
      } else if (grammar.branchingConstraint === 'CHOKE_PORTALS') {
        // Compressed Sequential: branches form portal arch frames at choke thresholds
        let sChoke = Math.sin(3.0 * Math.PI * uX - Math.PI * 0.5);
        if (Math.abs(sChoke) > 0.55) {
          let archW = strength * spanZ * 0.38 * (Math.abs(sChoke) - 0.55);
          out[i+2] += (dz >= 0 ? 1 : -1) * archW;
          out[i+1] += strength * spanY * 0.28 * Math.abs(Math.sin(Math.PI * uX));
        }
      } else if (grammar.branchingConstraint === 'PERIMETER_BUTTRESS') {
        // Continuous Hall: branches lean outward around perimeter as flying buttresses
        if (rNorm >= 0.35) {
          let buttress = strength * 0.30 * transSpan;
          out[i] += (dx / (rXZ + 0.01)) * buttress * 0.50;
          out[i+2] += (dz / (rXZ + 0.01)) * buttress * 0.50;
        }
      } else if (grammar.branchingConstraint === 'GROUND_DIVIDE') {
        // Topographic Ground: branches form low landscape retaining curbs and dividing paths
        if (uY < 0.55) {
          let curb = strength * 0.24 * transSpan * Math.sin(4.0 * Math.PI * uX);
          out[i+2] += curb;
          out[i+1] += Math.abs(curb) * 0.45;
        }
      } else if (grammar.branchingConstraint === 'SECONDARY_AXIAL') {
        // Linear Gallery: branches project laterally (+/- Z) forming enfilade side alcoves
        let bayNode = Math.sin(4.0 * Math.PI * uX);
        if (Math.abs(bayNode) > 0.45) {
          let latBranch = strength * spanZ * 0.42 * (Math.abs(bayNode) - 0.45);
          out[i+2] += (dz >= 0 ? 1 : -1) * latBranch;
        }
      } else if (grammar.branchingConstraint === 'PERIMETER_ALCOVES') {
        // Open Hall Workspace: perimeter alcove ribs leaving center work field open
        if (rNorm >= 0.32) {
          let alcove = strength * 0.22 * transSpan * Math.sin(6.0 * theta);
          out[i] += Math.cos(theta) * alcove;
          out[i+2] += Math.sin(theta) * alcove;
        }
      } else if (grammar.branchingConstraint === 'TERRACE_CANTILEVERS') {
        // Cascaded Terraces: cantilevered lookout balconies projecting forward from tiers
        let cant = strength * spanX * 0.32 * Math.sin(4.0 * Math.PI * uX);
        if (cant > 0) {
          out[i] += cant;
          out[i+1] += strength * spanY * 0.16;
        }
      } else if (grammar.branchingConstraint === 'RADIAL_SPINES') {
        // Flat Deep-Plan: radial spine ribs branching outward from cores
        let spine = strength * 0.25 * transSpan * Math.sin(4.0 * theta);
        out[i] += Math.cos(theta) * spine;
        out[i+2] += Math.sin(theta) * spine;
      } else if (grammar.branchingConstraint === 'OUTWARD_BAYS') {
        // Void-Edge: workstation bays projecting outward away from the void
        if (rNorm >= 0.40) {
          let bay = strength * 0.28 * transSpan;
          out[i] += (dx / (rXZ + 0.01)) * bay;
          out[i+2] += (dz / (rXZ + 0.01)) * bay;
        }
      } else if (grammar.branchingConstraint === 'CREST_NOOKS') {
        // Folded Undulated: work nooks branching along fold crests
        let nook = strength * 0.24 * transSpan * Math.sin(5.0 * Math.PI * uX);
        out[i+2] += nook;
        out[i+1] += Math.abs(nook) * 0.35;
      } else if (grammar.branchingConstraint === 'RADIAL_AISLES') {
        // Stepped Amphitheater: radial aisle stairs slicing through seating tiers
        let aisle = Math.sin(5.0 * theta);
        if (Math.abs(aisle) < 0.28) {
          out[i+1] -= strength * spanY * 0.28 * (1.0 - Math.abs(aisle) / 0.28);
        }
      } else if (grammar.branchingConstraint === 'MEETING_CLUSTERS') {
        // Void-Field Gathering: circular meeting pods at path crossroads
        let cluster = strength * 0.28 * transSpan * Math.cos(3.0 * theta);
        out[i] += Math.cos(theta) * cluster;
        out[i+2] += Math.sin(theta) * cluster;
      } else if (grammar.branchingConstraint === 'PYLON_SUPPORTS') {
        // Inserted Plate: tripod support pylons and cantilever stairs
        let pylon = strength * 0.30 * spanY * Math.cos(Math.PI * uY);
        out[i] += (dx >= 0 ? 1 : -1) * pylon * 0.45;
        out[i+2] += (dz >= 0 ? 1 : -1) * pylon * 0.45;
      } else if (grammar.branchingConstraint === 'SCREEN_LOUVERS') {
        // Contained Room: acoustic louvers and privacy fins wrapped around pod
        let louver = strength * 0.25 * transSpan * Math.sin(8.0 * theta);
        out[i] += Math.cos(theta) * louver;
        out[i+2] += Math.sin(theta) * louver;
      } else if (grammar.branchingConstraint === 'OUTLOOK_PROWS') {
        // Linear Edge Gallery: angular viewing spurs projecting over the drop
        let prow = strength * spanZ * 0.42 * Math.sin(3.0 * Math.PI * uX);
        out[i+2] += (dz >= 0 ? 1 : -1) * prow;
      } else {
        let bDist = strength * 0.18 * transSpan;
        out[i] += Math.cos(theta) * bDist;
        out[i+2] += Math.sin(theta) * bDist;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RULE 3: WHIPLASH (W)
  // ══════════════════════════════════════════════════════════════════════════
  else if (upperRule === 'WHIPLASH' || upperRule === 'W') {
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let dx = x - centerX, dy = y - centerY, dz = z - centerZ;
      let rXZ = Math.sqrt(dx * dx + dz * dz);
      let rNorm = rXZ / (transSpan * 0.5);
      let theta = Math.atan2(dz, dx);
      let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
      let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
      let uZ = Math.min(1, Math.max(0, (z - minZ) / spanZ));

      if (grammar.whiplashStyle === 'UPWARD_CURVATURE') {
        // Vertical Void Lobby:
        // Curves surfaces upward (+Y) around vertical void, drawing sightlines up atrium shaft
        let upwardArc = Math.sin(Math.PI * Math.min(1.0, uY + 0.15)) * (0.6 + 0.8 * Math.min(1.5, rNorm));
        let dY = strength * spanY * 0.54 * upwardArc;
        let flare = strength * transSpan * 0.24 * (1.0 - Math.min(1.0, uY * 0.6));
        let dX = (dx / (rXZ + 0.1)) * flare;
        let dZ = (dz / (rXZ + 0.1)) * flare;
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'CHOKE_RELEASE_INFLECTION') {
        // Compressed Sequential Lobby:
        // Controls curved transitions between compression (choke) and release (expansion)
        let sChoke = Math.sin(3.0 * Math.PI * uX - Math.PI * 0.5);
        if (sChoke < 0) {
          let cFactor = Math.abs(sChoke);
          out[i+2] -= (dz >= 0 ? 1 : -1) * spanZ * 0.42 * strength * cFactor;
          out[i+1] -= spanY * 0.26 * strength * cFactor;
        } else {
          let rFactor = sChoke;
          out[i+2] += (dz >= 0 ? 1 : -1) * spanZ * 0.48 * strength * rFactor;
          out[i+1] += spanY * 0.52 * strength * rFactor;
          out[i] += Math.sin(Math.PI * 2 * uX) * spanX * 0.14 * strength;
        }
      } else if (grammar.whiplashStyle === 'EXPANSIVE_SHELL') {
        // Continuous Hall Lobby:
        // Vast sweeping horizontal vault canopy overarching the entire free plan
        let domeX = Math.cos(Math.PI * (uX - 0.5));
        let domeZ = Math.cos(Math.PI * (uZ - 0.5));
        let shellArch = Math.max(0, domeX * domeZ);
        let dY = strength * spanY * 0.46 * shellArch;
        let dX = strength * spanX * 0.30 * Math.sin(Math.PI * (uX - 0.5)) * domeZ;
        let dZ = strength * spanZ * 0.30 * Math.sin(Math.PI * (uZ - 0.5)) * domeX;
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'FLOOR_TOPOGRAPHY') {
        // Topographic / Ground-Field Lobby:
        // Floor becomes primary geometry: gradual rises/falls, sloped terraces across ground plane
        let floorWeight = Math.max(0, Math.min(1.0, 1.3 - uY * 2.0));
        let wave1 = Math.sin(2.5 * Math.PI * uX) * Math.cos(2.0 * Math.PI * uZ);
        let wave2 = 0.35 * Math.sin(5.0 * Math.PI * uX);
        let dY = strength * spanY * 0.52 * floorWeight * (wave1 + wave2);
        let dX = strength * spanX * 0.20 * floorWeight * Math.cos(2.5 * Math.PI * uX);
        let dZ = strength * spanZ * 0.20 * floorWeight * Math.sin(2.0 * Math.PI * uZ);
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'AXIAL_ENFILADE_WAVE') {
        // Linear Gallery Lobby:
        // Rhythmic longitudinal section wave along dominant travel axis (X)
        let bayWave = Math.sin(4.0 * Math.PI * uX);
        let portalArch = Math.abs(Math.cos(4.0 * Math.PI * uX));
        let dZ = strength * spanZ * 0.44 * bayWave;
        let dY = strength * spanY * 0.36 * portalArch;
        let dX = strength * spanX * 0.15 * Math.sin(2.0 * Math.PI * uX);
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'HORIZONTAL_UNDULATION') {
        // Open Hall Workspace:
        // Gentle horizontal roof undulation maintaining continuous open floor under one roof
        let wave = Math.sin(3.0 * Math.PI * uX) * 0.6 + Math.cos(3.0 * Math.PI * uZ) * 0.4;
        let dY = strength * spanY * 0.30 * wave * Math.max(0, uY - 0.2);
        let dX = strength * spanX * 0.16 * Math.cos(3.0 * Math.PI * uX);
        let dZ = strength * spanZ * 0.16 * Math.sin(3.0 * Math.PI * uZ);
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'STEPPED_RISERS') {
        // Cascaded / Terraced Plates:
        // Natural stepped contour risers descending across section
        let stepFrac = (uX * 4.0) % 1.0;
        let stepLevel = Math.floor(uX * 4.0) / 4.0;
        let stepRise = (stepFrac < 0.25) ? (stepFrac / 0.25) : 1.0;
        let dY = -strength * spanY * 0.44 * (stepLevel + 0.25 * stepRise);
        let dX = strength * spanX * 0.18 * Math.sin(4.0 * Math.PI * uX);
        let dZ = strength * spanZ * 0.15 * Math.sin(2.0 * Math.PI * uZ);
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'CORE_RIM_CURVE') {
        // Flat Deep-Plan Plate:
        // Level floor plate strictly preserved (dY = 0), curvature acts in-plane around cores and daylight wells
        let dX = strength * spanX * 0.26 * Math.sin(3.0 * Math.PI * uZ) * (rNorm < 0.6 ? 1 : -0.7);
        let dZ = strength * spanZ * 0.26 * Math.cos(3.0 * Math.PI * uX) * (rNorm < 0.6 ? 1 : -0.7);
        out[i] += dX; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'VOID_RIM_SWEEP') {
        // Void-Edge Workspace:
        // Sweeps along the perimeter ring of the central void
        let rimDist = Math.abs(rNorm - 0.5);
        let rimWeight = Math.exp(-rimDist * rimDist / 0.05);
        let dY = strength * spanY * 0.38 * rimWeight * Math.sin(3.0 * theta);
        let dX = strength * spanX * 0.32 * rimWeight * Math.cos(theta + 0.6 * Math.sin(3.0 * theta));
        let dZ = strength * spanZ * 0.32 * rimWeight * Math.sin(theta + 0.6 * Math.sin(3.0 * theta));
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'ORIGAMI_FOLD') {
        // Folded / Undulating Work Surface:
        // Origami accordion pleating and 3D sinusoidal ramps
        let pleat = Math.sin(5.0 * Math.PI * uX) * Math.cos(2.0 * Math.PI * uZ);
        let dY = strength * spanY * 0.52 * pleat;
        let dX = -strength * spanX * 0.20 * pleat * Math.cos(5.0 * Math.PI * uX);
        let dZ = strength * spanZ * 0.24 * pleat;
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'ACOUSTIC_BOWL') {
        // Stepped Amphitheater:
        // Concave acoustic bowl curvature with seating risers focusing on performance stage
        let focusX = minX + spanX * 0.25;
        let focusZ = centerZ;
        let rF = Math.hypot(x - focusX, z - focusZ) / (transSpan * 0.9);
        let bowl = Math.pow(Math.min(1.2, rF), 1.6);
        let dY = strength * spanY * 0.60 * bowl + strength * spanY * 0.10 * Math.sin(10.0 * Math.PI * rF);
        let dX = -strength * spanX * 0.25 * ((x - focusX) / (rF * transSpan + 0.1)) * bowl;
        let dZ = -strength * spanZ * 0.25 * ((z - focusZ) / (rF * transSpan + 0.1)) * bowl;
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'SOARING_VAULT_RIBS') {
        // Void-Field Gathering:
        // Slender vertical ribs spring from ground crossroads and fan into vault canopies
        let hWeight = Math.pow(Math.max(0, uY - 0.15) / 0.85, 1.2);
        let dY = strength * spanY * 0.66 * hWeight * (1.0 + 0.35 * Math.sin(4.0 * Math.PI * uX));
        let dX = strength * spanX * 0.25 * hWeight * Math.cos(2.0 * Math.PI * uX);
        let dZ = strength * spanZ * 0.25 * hWeight * Math.sin(2.0 * Math.PI * uZ);
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'MEZZANINE_CRADLE') {
        // Inserted Horizontal Plate:
        // Suspends mezzanine platform cradled by organic curved hull ribs
        let midWeight = Math.exp(-Math.pow((uY - 0.48) / 0.18, 2));
        let plateRib = Math.cos(Math.PI * (uX - 0.5)) * Math.cos(Math.PI * (uZ - 0.5));
        let dY = strength * spanY * 0.42 * midWeight * plateRib;
        let dX = strength * spanX * 0.28 * midWeight * (x >= centerX ? 1 : -1);
        let dZ = strength * spanZ * 0.28 * midWeight * (z >= centerZ ? 1 : -1);
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'COCOON_POD') {
        // Contained Room-Within-Volume:
        // Bulbous, organic cocoon vessel enclosed inside larger hall
        let distPod = Math.hypot(x - centerX, (y - centerY) * 1.4, z - centerZ) / (transSpan * 0.45);
        let podWeight = Math.exp(-distPod * distPod / 0.35);
        let dY = -strength * (y - centerY) * 0.56 * podWeight;
        let dX = -strength * (x - centerX) * 0.52 * podWeight;
        let dZ = -strength * (z - centerZ) * 0.52 * podWeight;
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else if (grammar.whiplashStyle === 'BALUSTRADE_RIBBON') {
        // Linear Edge Gallery:
        // Serpentine cantilevered ribbon and undulating balustrade along perimeter overlook
        let edgeDist = Math.max(0, Math.abs(uZ - 0.5) * 2.0 - 0.25);
        let dY = strength * spanY * 0.34 * edgeDist * Math.sin(3.0 * Math.PI * uX);
        let dZ = strength * spanZ * 0.50 * edgeDist * Math.sin(2.0 * Math.PI * uX) * (z >= centerZ ? 1 : -1);
        let dX = strength * spanX * 0.20 * edgeDist * Math.cos(3.0 * Math.PI * uX);
        out[i] += dX; out[i+1] += dY; out[i+2] += dZ;
      } else {
        let dY = strength * spanY * 0.35 * Math.sin(Math.PI * uX);
        let dZ = strength * spanZ * 0.25 * Math.sin(2.0 * Math.PI * uX);
        out[i+1] += dY; out[i+2] += dZ;
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
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let dx = x - centerX, dy = y - centerY, dz = z - centerZ;
      let rXZ = Math.sqrt(dx * dx + dz * dz);
      let rNorm = rXZ / (transSpan * 0.5);
      let theta = Math.atan2(dz, dx);
      let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
      let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
      let uZ = Math.min(1, Math.max(0, (z - minZ) / spanZ));

      if (grammar.continuityMode === 'VERTICAL_CONNECTIONS') {
        // Vertical Void: connects lower and upper surfaces vertically across the atrium shaft
        let vertPull = strength * 0.35 * spanY * Math.sign(-dy) * Math.min(1.0, Math.abs(dy) / (0.45 * spanY));
        out[i+1] += vertPull;
      } else if (grammar.continuityMode === 'ZONE_TRANSITIONS') {
        // Compressed Sequential: smoothly bridges chamber-to-chamber transitions along X
        let tChoke = (uX * 3.0) % 1.0;
        let blend = Math.sin(tChoke * Math.PI * 2);
        out[i] += strength * spanX * 0.22 * blend;
      } else if (grammar.continuityMode === 'CONTINUOUS_SHELL') {
        // Continuous Hall: merges ceiling segments into one unbroken horizontal shell
        let edgePull = strength * 0.28 * spanY * Math.cos(Math.PI * (uX - 0.5));
        out[i+1] += edgePull;
        out[i+2] += (centerZ - z) * strength * 0.25;
      } else if (grammar.continuityMode === 'SLOPE_CONNECT') {
        // Topographic Ground: bridges stepped terraces into continuous walkable ramps
        if (uY < 0.65) {
          let rampBlend = strength * spanY * 0.30 * Math.sin(2.5 * Math.PI * uX) * (1.0 - uY);
          out[i+1] += rampBlend;
        }
      } else if (grammar.continuityMode === 'AXIAL_PATH') {
        // Linear Gallery: reinforces longitudinal enfilade path, aligning surfaces to main axis
        out[i] += strength * spanX * 0.28 * (uX - 0.5);
        out[i+2] += (centerZ - z) * strength * 0.35;
      } else if (grammar.continuityMode === 'FIELD_MERGE') {
        // Open Hall Workspace: eliminates interior seams into a continuous horizontal field
        out[i+1] += (centerY - y) * strength * 0.24;
      } else if (grammar.continuityMode === 'RISER_CONNECT') {
        // Cascaded Terraces: fillets riser faces to treads into continuous cascades
        let tierU = (uX * 4.0) % 1.0;
        if (tierU > 0.80 || tierU < 0.20) {
          out[i+1] -= strength * 0.20 * spanY * Math.sin(tierU * Math.PI * 2);
        }
      } else if (grammar.continuityMode === 'FLAT_PLATE') {
        // Flat Deep-Plan: enforces strict planar leveling of horizontal plates
        let targetLevel = (uY > 0.5) ? maxY - 0.2 * spanY : minY + 0.2 * spanY;
        out[i+1] += (targetLevel - y) * strength * 0.44;
      } else if (grammar.continuityMode === 'PERIMETER_RING') {
        // Void-Edge: closes annular ring surfaces into a seamless 360-degree ribbon
        let rTarget = 0.5 * transSpan;
        let deltaR = rTarget - rXZ;
        out[i] += (dx / (rXZ + 0.01)) * deltaR * strength * 0.38;
        out[i+2] += (dz / (rXZ + 0.01)) * deltaR * strength * 0.38;
      } else if (grammar.continuityMode === 'CREASE_FACETS') {
        // Folded Undulated: aligns origami creases into continuous diagonal ridges
        let diag = Math.sin(3.0 * Math.PI * (uX + uZ));
        out[i+1] += strength * spanY * 0.28 * diag;
      } else if (grammar.continuityMode === 'CIRCULATION_STEPS') {
        // Stepped Amphitheater: connects aisles and seating tiers into unified bowl
        let rF = Math.hypot(x - (minX + spanX * 0.25), z - centerZ);
        out[i+1] += strength * spanY * 0.18 * Math.cos(rF / transSpan * Math.PI * 6);
      } else if (grammar.continuityMode === 'CONVERGING_PATHS') {
        // Void-Field Gathering: blends converging floor spokes into a unified crossroads
        let spoke = Math.cos(4.0 * theta);
        out[i+1] += strength * spanY * 0.18 * spoke * (1.0 - uY);
      } else if (grammar.continuityMode === 'SUSPENSION_LINKS') {
        // Inserted Plate: draws tensile tendon lines connecting platform to upper structure
        if (uY > 0.40) {
          out[i+1] += strength * spanY * 0.25 * Math.sin(Math.PI * uX);
        }
      } else if (grammar.continuityMode === 'ENCLOSURE_SHELL') {
        // Contained Room: welds pod shell seams into an unbroken organic capsule
        let rPod = Math.hypot(dx, dy * 1.4, dz);
        let targetR = 0.35 * transSpan;
        let pull = (targetR - rPod) * strength * 0.44;
        out[i] += (dx / (rPod + 0.01)) * pull;
        out[i+1] += (dy / (rPod + 0.01)) * pull * 0.7;
        out[i+2] += (dz / (rPod + 0.01)) * pull;
      } else if (grammar.continuityMode === 'GALLERY_PATH') {
        // Linear Edge Gallery: smooths overlook ribbon into uninterrupted promenade
        out[i] += strength * spanX * 0.24 * (uX - 0.5);
      } else {
        out[i] += strength * spanX * 0.15 * (uX - 0.5);
      }
    }
  }

"@

$updated = $c.Substring(0, $idx1) + $newCode + "`n`n" + $c.Substring($idx2)
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'app.js'), $updated, [System.Text.Encoding]::UTF8)
Write-Output "Successfully updated app.js"
