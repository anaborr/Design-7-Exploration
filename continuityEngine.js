/**
 * ============================================================================
 * ORGANIC ARCHITECTURAL CONTINUITY ENGINE
 * Continuous Spatial Form, Inter-Element Bridging, Overlapping & G2 Flow
 * 
 * DESIGN PHILOSOPHY:
 * "Continuity is the degree to which separate geometric elements connect,
 * overlap, align, or flow into one another to create a unified and uninterrupted spatial form."
 * 
 * CORE RULES:
 * 1. Continuity does NOT squash or collapse vertical space/height clearance.
 * 2. It specifically increases the NUMBER and QUALITY of connections between separate elements:
 *    - Low Continuity (0 < C <= 0.30):
 *        * 1 physical connection: Terminal U-loop capping the cantilever extremity into a continuous ribbon (Stage 1 -> Stage 2).
 *        * Quality: G0 contact connection. Gaps elsewhere remain open.
 *        * Elements: Mostly separate (4 disconnected).
 *    - Medium Continuity (0.30 < C <= 0.70):
 *        * 3 physical connections: Terminal U-loop + Cantilever mid-span arch + Transition portal arch.
 *        * Quality: G1 tangent-continuous alignment with flared footings.
 *        * Elements: Partially connected (2 disconnected).
 *    - High Continuity (0.70 < C <= 1.0):
 *        * 7 physical connections: Linking cantilevers, transition portal, central atrium, and perimeter.
 *        * Quality: G2 smooth curvature-continuous flow with organic Gaudí flared footings.
 *        * Elements: 1 Continuous Unified System (0 disconnected).
 * ============================================================================
 */

(function() {
  'use strict';

  let continuityBridgeGroup = null;

  function getContinuityGroup() {
    if (window.continuityBridgeGroup) {
      continuityBridgeGroup = window.continuityBridgeGroup;
      return continuityBridgeGroup;
    }
    if (window.threeScene) {
      continuityBridgeGroup = new THREE.Group();
      continuityBridgeGroup.name = 'continuityBridgeGroup';
      window.threeScene.add(continuityBridgeGroup);
      window.continuityBridgeGroup = continuityBridgeGroup;
      return continuityBridgeGroup;
    }
    return null;
  }

  /**
   * Sample vertical datums from the imported seed geometry
   */
  function sampleSeedDatums(x) {
    // High-fidelity calibrated datums from empirical analysis of compressed.3dm
    if (x <= -8.0) return { yBot: 6.26, yTop: 10.88, zMin: -9.9, zMax: 0.35, zCenter: -4.78 };
    if (x <= -5.5) return { yBot: 6.46, yTop: 11.06, zMin: -10.0, zMax: 0.40, zCenter: -4.80 };
    if (x <= -2.0) return { yBot: 6.56, yTop: 10.62, zMin: -10.0, zMax: 0.38, zCenter: -4.81 };
    if (x <= 1.5)  return { yBot: 6.26, yTop: 11.28, zMin: -10.0, zMax: 0.42, zCenter: -4.79 };
    if (x <= 6.0)  return { yBot: 4.44, yTop: 9.50,  zMin: -9.9,  zMax: 0.49, zCenter: -4.70 };
    if (x <= 11.0) return { yBot: 2.65, yTop: 9.93,  zMin: -9.9,  zMax: 0.54, zCenter: -4.68 };
    return { yBot: 2.45, yTop: 14.59, zMin: -10.1, zMax: 0.49, zCenter: -4.80 };
  }

  /**
   * Builds the Terminal U-Loop capping the cantilever extremity
   */
  function buildTerminalULoop(C, quality) {
    const d = sampleSeedDatums(-9.5);
    const uSegs = 28; // Vertical U-curve
    const zSegs = 20; // Transverse width
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const indices = [];

    const zMin = d.zMin + 0.3;
    const zMax = d.zMax - 0.3;
    const zSpan = zMax - zMin;

    for (let i = 0; i <= uSegs; i++) {
      const u = i / uSegs; // 0 (bottom plate) to 1 (top plate)
      const curY = d.yBot + u * (d.yTop - d.yBot);

      // Organic C2 curve looping outward in -X
      const loop = Math.sin(u * Math.PI);
      const extendX = -9.6 - loop * (1.2 + 0.5 * C);

      // Flared footings for G1/G2 continuity where the loop touches the cantilever plates
      const footingFlare = (Math.pow(1 - u, 4) + Math.pow(u, 4)) * (quality === 'G2' ? 0.6 : 0.25);
      const curX = extendX + footingFlare * 0.4;

      for (let j = 0; j <= zSegs; j++) {
        const v = j / zSegs;
        const curZ = zMin + v * zSpan;
        positions.push(curX, curY, curZ);
      }
    }

    for (let i = 0; i < uSegs; i++) {
      for (let j = 0; j < zSegs; j++) {
        const a = i * (zSegs + 1) + j;
        const b = (i + 1) * (zSegs + 1) + j;
        const c = (i + 1) * (zSegs + 1) + (j + 1);
        const d = i * (zSegs + 1) + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
        // Double-sided rendering
        indices.push(d, b, a);
        indices.push(d, c, b);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const baseMat = window.originalMeshes && window.originalMeshes[0]?.mesh?.material;
    const mat = baseMat ? baseMat.clone() : new THREE.MeshStandardMaterial({
      color: 0xdcdcdc,
      roughness: 0.82,
      metalness: 0.0,
      side: THREE.DoubleSide
    });
    mat.side = THREE.DoubleSide;

    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Builds an intermediate structural connecting arch/strut between separate plates
   */
  function buildConnectingArch(xMid, zCenter, zWidth, bowX, C, quality, type) {
    const d = sampleSeedDatums(xMid);
    const uSegs = 22;
    const zSegs = 10;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const indices = [];

    const zMin = zCenter - zWidth / 2;
    const zMax = zCenter + zWidth / 2;
    const zSpan = zMax - zMin;

    for (let i = 0; i <= uSegs; i++) {
      const u = i / uSegs;
      const curY = d.yBot + u * (d.yTop - d.yBot);

      // Gaudí bell footing profile for G2 curvature continuity
      const flare = (Math.pow(1 - u, 3) + Math.pow(u, 3)) * (quality === 'G2' ? 0.75 : 0.35);
      
      let curX = xMid + Math.sin(u * Math.PI) * bowX;
      if (type === 'FLYING_BUTTRESS') {
        const sweep = Math.sin(u * Math.PI * 0.9);
        curX = xMid + (u - 0.5) * 1.8 - sweep * 1.4;
      }

      for (let j = 0; j <= zSegs; j++) {
        const v = j / zSegs;
        const fWidth = zSpan * (1.0 + flare);
        const curZ = zCenter - fWidth / 2 + v * fWidth;
        positions.push(curX, curY, curZ);
      }
    }

    for (let i = 0; i < uSegs; i++) {
      for (let j = 0; j < zSegs; j++) {
        const a = i * (zSegs + 1) + j;
        const b = (i + 1) * (zSegs + 1) + j;
        const c = (i + 1) * (zSegs + 1) + (j + 1);
        const d = i * (zSegs + 1) + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
        indices.push(d, b, a);
        indices.push(d, c, b);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const baseMat = window.originalMeshes && window.originalMeshes[0]?.mesh?.material;
    const mat = baseMat ? baseMat.clone() : new THREE.MeshStandardMaterial({
      color: 0xdcdcdc,
      roughness: 0.82,
      metalness: 0.0,
      side: THREE.DoubleSide
    });
    mat.side = THREE.DoubleSide;

    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Main synchronization function called whenever Continuity changes
   */
  function syncContinuityConnections(continuityStrength, activeTypologyKey) {
    const grp = getContinuityGroup();
    if (!grp) return;

    // Clear previous connections
    while (grp.children.length > 0) {
      const child = grp.children[0];
      grp.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    const C = typeof continuityStrength === 'number' ? Math.max(0, Math.min(1.0, continuityStrength)) : 0;
    if (C <= 0.04) {
      return;
    }

    const qual = C > 0.70 ? 'G2' : (C > 0.30 ? 'G1' : 'G0');

    // ─── 1. Terminal U-Loop at cantilever extremity (x = -9.6) ────────────────
    // Connects upper and lower cantilever plates into a continuous ribbon
    grp.add(buildTerminalULoop(C, qual));

    // ─── 2. Medium Continuity (C > 0.30): 2 more connections (Total 3) ────────
    if (C > 0.30) {
      // Cantilever Mid-Span Arch
      grp.add(buildConnectingArch(-5.5, -4.8, 6.0, 0.8, C, qual, 'ORGANIC_STRUT'));
      // Transition Portal Arch (Cantilever to terrace datum)
      grp.add(buildConnectingArch(1.0, -4.8, 5.5, -0.6, C, qual, 'PORTAL_ARCH'));
    }

    // ─── 3. High Continuity (C > 0.70): 4 more connections (Total 7) ──────────
    // Creates an uninterrupted continuous structural and spatial system
    if (C > 0.70) {
      // Outer Cantilever Bay Arch
      grp.add(buildConnectingArch(-7.5, -4.8, 5.0, -0.6, C, 'G2', 'ORGANIC_STRUT'));
      // Inner Cantilever Bay Arch
      grp.add(buildConnectingArch(-3.5, -4.8, 5.0, 0.5, C, 'G2', 'ORGANIC_STRUT'));
      // Soaring Atrium Flying Buttress (Floor to Sweeping Canopy)
      grp.add(buildConnectingArch(6.0, -4.8, 4.5, -1.0, C, 'G2', 'FLYING_BUTTRESS'));
      // East Perimeter Structural Pier
      grp.add(buildConnectingArch(14.5, -4.8, 6.0, 0.4, C, 'G2', 'PERIMETER_PIER'));
    }

    if (window.threeScene && window.threeRenderer && window.threeCamera) {
      window.threeRenderer.render(window.threeScene, window.threeCamera);
    }
  }

  function clearContinuityConnections() {
    const grp = getContinuityGroup();
    if (!grp) return;
    while (grp.children.length > 0) {
      const child = grp.children[0];
      grp.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
  }

  // Export to global window scope
  window.syncContinuityConnections = syncContinuityConnections;
  window.clearContinuityConnections = clearContinuityConnections;

})();
