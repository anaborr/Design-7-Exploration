  function generateOrganicSpatialArchitecture(branchSource, params) {
    const bnds = getEffectiveBounds();
    const g = params.growthFraction !== undefined ? Math.max(0.0, Math.min(1.0, params.growthFraction)) : 0.0;
    if (g <= 0.01) return null;

    const w = params.whiplash || 0.0;
    const c = params.continuity || 0.0;

    // Center Z corridor for branching members (aligned with terrace/cantilever plates)
    
    
    let numGrids = 4;
    if (activeTypo === 'OPEN_HALL') numGrids = 8;
    if (activeTypo === 'COMPRESSED_SEQUENTIAL') numGrids = 3;
    if (activeTypo === 'VERTICAL_VOID') numGrids = 5;
    
    const zSteps = [];
    for (let i = 1; i <= numGrids; i++) {
       zSteps.push(bnds.minZ + (bnds.spanZ * (i / (numGrids + 1))));
    }

    zSteps.forEach(zMid => {
    const depthZ = baseRadius * 1.5;

    const thickness = inchesToUnits(params.wallThicknessInches || 10.0);
    const baseRadius = Math.max(0.08, thickness * 0.15);

    const geometries = [];

    // Stage progression determination
    let branchCount = 0;
    let divisionCount = 0;
    let activeStage = 1;

    if (g <= 0.25) {
      activeStage = 1;
      branchCount = Math.round(2 + (g / 0.25) * 1); // 2 -> 3
      divisionCount = 0;
    } else if (g <= 0.50) {
      activeStage = 2;
      branchCount = 3;
      divisionCount = Math.round(1 + ((g - 0.25) / 0.25) * 3); // 1 -> 4
    } else if (g <= 0.75) {
      activeStage = 3;
      branchCount = Math.round(3 + ((g - 0.50) / 0.25) * 1); // 3 -> 4
      divisionCount = Math.round(4 + ((g - 0.50) / 0.25) * 4); // 4 -> 8
    } else {
      activeStage = 4;
      branchCount = Math.round(4 + ((g - 0.75) / 0.25) * 1); // 4 -> 5
      divisionCount = Math.round(8 + ((g - 0.75) / 0.25) * 8); // 8 -> 16
    }

    branchingSystemState.branchCount = branchCount;
    branchingSystemState.divisionCount = divisionCount;
    branchingSystemState.activeStage = activeStage;

    const commonOpts = {
      numSegments: 20,
      numRadial: 14,
      whiplash: w,
      continuity: c
    };

    // Key horizontal positions along longitudinal span
    const xP1 = bnds.minX + bnds.spanX * 0.16; // Left Upright
    const xLegL = bnds.minX + bnds.spanX * 0.35; // Center A-Frame left leg
    const xApex = bnds.minX + bnds.spanX * 0.48; // Center A-Frame apex
    const xLegR = bnds.minX + bnds.spanX * 0.62; // Center A-Frame right leg
    const xP3Top = bnds.minX + bnds.spanX * 0.74; // Right Flared top
    const xP3Bot = bnds.minX + bnds.spanX * 0.90; // Right Flared bot

    // Snap exact floor and ceiling datums for each member
    const fc1 = getFloorCeilingAt(xP1, zMid);
    const fcApex = getFloorCeilingAt(xApex, zMid);
    const fcLegL = getFloorCeilingAt(xLegL, zMid);
    const fcLegR = getFloorCeilingAt(xLegR, zMid);
    const fc3Top = getFloorCeilingAt(xP3Top, zMid);
    const fc3Bot = getFloorCeilingAt(xP3Bot, zMid);

    // Global reference datums for stage 4 infill
    const yBot = fcLegL.yBot;
    const yTop = fcApex.yTop;

    // ------------------------------------------------------------------------
    // STAGE 1: PRIMARY STRUCTURAL BRANCHES (0% - 100% active)
    // ------------------------------------------------------------------------
    const gStage1 = Math.min(1.0, g / 0.22);

    

    if (activeTypo === 'VERTICAL_VOID') {
      // VERTICAL VOID: Central atrium (xApex) is strictly preserved open!
      // Struts flank the outer atrium perimeter and spring into ceiling vaults
      const p1Curve = [
        new THREE.Vector3(xP1, fc1.yBot - 0.35, -depthZ * 0.8),
        new THREE.Vector3(xP1 + (w * 0.5), (fc1.yBot + fc1.yTop) * 0.55, -depthZ * 0.4),
        new THREE.Vector3(xP1, fc1.yTop + 0.35, 0)
      ];
      const g1 = buildStrutGeometry(p1Curve, baseRadius * 1.5, baseRadius * 0.9, baseRadius * 1.6, depthZ * 0.8, gStage1, commonOpts);
      if (g1) geometries.push(g1);

      const p2Curve = [
        new THREE.Vector3(xP3Bot, fc3Bot.yBot - 0.35, depthZ * 0.8),
        new THREE.Vector3(xP3Bot - (w * 0.5), (fc3Bot.yBot + fc3Top.yTop) * 0.55, depthZ * 0.4),
        new THREE.Vector3(xP3Top, fc3Top.yTop + 0.35, 0)
      ];
      const g2 = buildStrutGeometry(p2Curve, baseRadius * 1.5, baseRadius * 0.9, baseRadius * 1.6, depthZ * 0.8, gStage1, commonOpts);
      if (g2) geometries.push(g2);

      const p3Curve = [
        new THREE.Vector3(xP1, fc1.yBot - 0.35, depthZ * 0.8),
        new THREE.Vector3(xP1 + (w * 0.4), (fc1.yBot + fc1.yTop) * 0.5, depthZ * 0.4),
        new THREE.Vector3(xP1, fc1.yTop + 0.35, 0)
      ];
      const g3 = buildStrutGeometry(p3Curve, baseRadius * 1.3, baseRadius * 0.85, baseRadius * 1.4, depthZ * 0.8, gStage1, commonOpts);
      if (g3) geometries.push(g3);

    } else if (activeTypo === 'LINEAR_GALLERY') {
      // LINEAR GALLERY: Transverse portal frames spanning across the corridor along Z
      const p1Curve = [
        new THREE.Vector3(xP1, fc1.yBot - 0.2, -depthZ * 1.1),
        new THREE.Vector3(xP1, fc1.yTop + 0.45, 0),
        new THREE.Vector3(xP1, fc1.yBot - 0.2, depthZ * 1.1)
      ];
      const g1 = buildStrutGeometry(p1Curve, baseRadius * 1.2, baseRadius * 0.85, baseRadius * 1.2, depthZ * 0.6, gStage1, commonOpts);
      if (g1) geometries.push(g1);

      const p2Curve = [
        new THREE.Vector3(xApex, fcApex.yBot - 0.2, -depthZ * 1.1),
        new THREE.Vector3(xApex, fcApex.yTop + 0.45, 0),
        new THREE.Vector3(xApex, fcApex.yBot - 0.2, depthZ * 1.1)
      ];
      const g2 = buildStrutGeometry(p2Curve, baseRadius * 1.2, baseRadius * 0.85, baseRadius * 1.2, depthZ * 0.6, gStage1, commonOpts);
      if (g2) geometries.push(g2);

      const p3Curve = [
        new THREE.Vector3(xP3Top, fc3Top.yBot - 0.2, -depthZ * 1.1),
        new THREE.Vector3(xP3Top, fc3Top.yTop + 0.45, 0),
        new THREE.Vector3(xP3Top, fc3Top.yBot - 0.2, depthZ * 1.1)
      ];
      const g3 = buildStrutGeometry(p3Curve, baseRadius * 1.2, baseRadius * 0.85, baseRadius * 1.2, depthZ * 0.6, gStage1, commonOpts);
      if (g3) geometries.push(g3);

    } else if (activeTypo === 'OPEN_HALL') {
      // CONTINUOUS HALL: Perimeter flying buttresses leaning outward, center 100% open
      const p1Curve = [
        new THREE.Vector3(xP1 - 1.8, fc1.yBot - 0.35, zMid),
        new THREE.Vector3(xP1 - 0.8, (fc1.yBot + fc1.yTop) * 0.5, zMid + (w * 0.4)),
        new THREE.Vector3(xP1, fc1.yTop + 0.35, zMid)
      ];
      const g1 = buildStrutGeometry(p1Curve, baseRadius * 1.6, baseRadius * 0.9, baseRadius * 1.5, depthZ, gStage1, commonOpts);
      if (g1) geometries.push(g1);

      const p3Curve = [
        new THREE.Vector3(xP3Bot + 1.8, fc3Bot.yBot - 0.35, zMid),
        new THREE.Vector3(xP3Bot + 0.8, (fc3Bot.yBot + fc3Top.yTop) * 0.5, zMid - (w * 0.4)),
        new THREE.Vector3(xP3Top, fc3Top.yTop + 0.35, zMid)
      ];
      const g3 = buildStrutGeometry(p3Curve, baseRadius * 1.6, baseRadius * 0.9, baseRadius * 1.5, depthZ, gStage1, commonOpts);
      if (g3) geometries.push(g3);

    } else if (activeTypo === 'FOLDED_UNDULATED' || activeTypo === 'CASCADED_TERRACED') {
      // TOPOGRAPHIC GROUND: Low landscape retaining curbs and terrain dividers across floor
      const curbY1 = fc1.yBot + 2.8;
      const curbY2 = fcApex.yBot + 2.8;

      const p1Curve = [
        new THREE.Vector3(xP1, fc1.yBot - 0.2, -depthZ),
        new THREE.Vector3(xP1 + (w * 0.5), curbY1, 0),
        new THREE.Vector3(xP1, fc1.yBot - 0.2, depthZ)
      ];
      const g1 = buildStrutGeometry(p1Curve, baseRadius * 1.4, baseRadius * 1.1, baseRadius * 1.4, depthZ, gStage1, commonOpts);
      if (g1) geometries.push(g1);

      const p2Curve = [
        new THREE.Vector3(xLegL, fcLegL.yBot - 0.2, -depthZ * 0.8),
        new THREE.Vector3(xApex, curbY2, 0),
        new THREE.Vector3(xLegR, fcLegR.yBot - 0.2, depthZ * 0.8)
      ];
      const g2 = buildStrutGeometry(p2Curve, baseRadius * 1.4, baseRadius * 1.1, baseRadius * 1.4, depthZ, gStage1, commonOpts);
      if (g2) geometries.push(g2);

    } else {
      // STANDARD / DEFAULT: A-frame with left and right columns
      const p1Curve = [
        new THREE.Vector3(xP1, fc1.yBot - 0.35, zMid),
        new THREE.Vector3(xP1 + (w * 0.4), (fc1.yBot + fc1.yTop) / 2, zMid + (w * 0.3)),
        new THREE.Vector3(xP1, fc1.yTop + 0.35, zMid)
      ];
      const g1 = buildStrutGeometry(p1Curve, baseRadius * 1.5, baseRadius * 0.9, baseRadius * 1.5, depthZ, gStage1, commonOpts);
      if (g1) geometries.push(g1);

      const p2LCurve = [
        new THREE.Vector3(xLegL, fcLegL.yBot - 0.35, zMid),
        new THREE.Vector3((xLegL + xApex) / 2 - 0.15, (fcLegL.yBot + fcApex.yTop) / 2, zMid),
        new THREE.Vector3(xApex, fcApex.yTop + 0.35, zMid)
      ];
      const g2L = buildStrutGeometry(p2LCurve, baseRadius * 1.5, baseRadius * 0.85, baseRadius * 1.6, depthZ, gStage1, commonOpts);
      if (g2L) geometries.push(g2L);

      const p2RCurve = [
        new THREE.Vector3(xLegR, fcLegR.yBot - 0.35, zMid),
        new THREE.Vector3((xLegR + xApex) / 2 + 0.15, (fcLegR.yBot + fcApex.yTop) / 2, zMid),
        new THREE.Vector3(xApex, fcApex.yTop + 0.35, zMid)
      ];
      const g2R = buildStrutGeometry(p2RCurve, baseRadius * 1.5, baseRadius * 0.85, baseRadius * 1.6, depthZ, gStage1, commonOpts);
      if (g2R) geometries.push(g2R);

      const p3Curve = [
        new THREE.Vector3(xP3Top, fc3Top.yTop + 0.35, zMid),
        new THREE.Vector3(xP3Top + (xP3Bot - xP3Top) * 0.45, (fc3Top.yTop + fc3Bot.yBot) / 2, zMid),
        new THREE.Vector3(xP3Bot, fc3Bot.yBot - 0.35, zMid)
      ];
      const g3 = buildStrutGeometry(p3Curve, baseRadius * 1.35, baseRadius * 0.85, baseRadius * 1.9, depthZ, gStage1, commonOpts);
      if (g3) geometries.push(g3);
    }

    // 
    // STAGE 2: SECONDARY DIVISIONS (g >= 0.24)
    // 
    if (g >= 0.24) {
      const gStage2 = Math.min(1.0, (g - 0.24) / 0.26);

      // 4. Center Cross-Tie: Horizontal arched tie across A-frame legs at mid-height
      // Divides A-frame into top triangle and lower portal!
      const yCrossL = fcLegL.yBot + (fcApex.yTop - fcLegL.yBot) * 0.46;
      const yCrossR = fcLegR.yBot + (fcApex.yTop - fcLegR.yBot) * 0.46;
      const xCrossL = xLegL + (xApex - xLegL) * 0.46 - 0.2;
      const xCrossR = xLegR + (xApex - xLegR) * 0.46 + 0.2;
      const pCrossCurve = [
        new THREE.Vector3(xCrossL, yCrossL, zMid),
        new THREE.Vector3((xCrossL + xCrossR) / 2, (yCrossL + yCrossR) / 2 + 0.35, zMid),
        new THREE.Vector3(xCrossR, yCrossR, zMid)
      ];
      const gCross = buildStrutGeometry(pCrossCurve, baseRadius * 1.15, baseRadius * 0.72, baseRadius * 1.15, depthZ * 0.85, gStage2, commonOpts);
      if (gCross) geometries.push(gCross);

      // 5. Left Bay Diagonal: connects Left Upright to Left Leg of A-Frame
      const yDiagL1 = fc1.yBot + (fc1.yTop - fc1.yBot) * 0.32;
      const yDiagL2 = fcLegL.yBot + (fcApex.yTop - fcLegL.yBot) * 0.70;
      const xDiagL2 = xLegL + (xApex - xLegL) * 0.70 + 0.15;
      const pDiagLCurve = [
        new THREE.Vector3(xP1 - 0.15, yDiagL1, zMid),
        new THREE.Vector3((xP1 + xDiagL2) / 2, (yDiagL1 + yDiagL2) / 2 + 0.15, zMid),
        new THREE.Vector3(xDiagL2, yDiagL2, zMid)
      ];
      const gDiagL = buildStrutGeometry(pDiagLCurve, baseRadius * 1.05, baseRadius * 0.68, baseRadius * 1.05, depthZ * 0.8, gStage2, commonOpts);
      if (gDiagL) geometries.push(gDiagL);

      // 6. Right Bay Diagonal: connects Right Leg of A-Frame to Right Flared Strut
      const yDiagR1 = fcLegR.yBot + (fcApex.yTop - fcLegR.yBot) * 0.35;
      const xDiagR1 = xLegR + (xApex - xLegR) * 0.35 - 0.15;
      const yDiagR2 = fc3Bot.yBot + (fc3Top.yTop - fc3Bot.yBot) * 0.65;
      const xDiagR2 = xP3Top + (xP3Bot - xP3Top) * (1 - 0.65) + 0.15;
      const pDiagRCurve = [
        new THREE.Vector3(xDiagR1, yDiagR1, zMid),
        new THREE.Vector3((xDiagR1 + xDiagR2) / 2, (yDiagR1 + yDiagR2) / 2 + 0.15, zMid),
        new THREE.Vector3(xDiagR2, yDiagR2, zMid)
      ];
      const gDiagR = buildStrutGeometry(pDiagRCurve, baseRadius * 1.05, baseRadius * 0.68, baseRadius * 1.05, depthZ * 0.8, gStage2, commonOpts);
      if (gDiagR) geometries.push(gDiagR);
    }

    // ------------------------------------------------------------------------
    // STAGE 3: TERTIARY SUBDIVISIONS (g >= 0.48)
    // ------------------------------------------------------------------------
    if (g >= 0.48) {
      const gStage3 = Math.min(1.0, (g - 0.48) / 0.27);

      // 7. Left Bay Counter-Diagonal: creates X-brace triangulation in left bay
      const yCounterL1 = fc1.yBot + (fc1.yTop - fc1.yBot) * 0.68;
      const xCounterL2 = bnds.minX + bnds.spanX * 0.28;
      const fcCounterL2 = getFloorCeilingAt(xCounterL2, zMid);
      const pCounterLCurve = [
        new THREE.Vector3(xP1, yCounterL1, zMid),
        new THREE.Vector3((xP1 + xCounterL2) / 2, (yCounterL1 + fcCounterL2.yBot) / 2, zMid),
        new THREE.Vector3(xCounterL2, fcCounterL2.yBot, zMid)
      ];
      const gCounterL = buildStrutGeometry(pCounterLCurve, baseRadius * 0.9, baseRadius * 0.6, baseRadius * 1.1, depthZ * 0.75, gStage3, commonOpts);
      if (gCounterL) geometries.push(gCounterL);

      // 8. Upper A-Frame Vertical Spine: bisects upper triangle from cross-tie to apex
      const yCrossApex = fcLegL.yBot + (fcApex.yTop - fcLegL.yBot) * 0.46;
      const pSpineCurve = [
        new THREE.Vector3(xApex, yCrossApex + 0.35, zMid),
        new THREE.Vector3(xApex, (yCrossApex + fcApex.yTop) / 2, zMid),
        new THREE.Vector3(xApex, fcApex.yTop, zMid)
      ];
      const gSpine = buildStrutGeometry(pSpineCurve, baseRadius * 0.95, baseRadius * 0.65, baseRadius * 1.2, depthZ * 0.75, gStage3, commonOpts);
      if (gSpine) geometries.push(gSpine);

      // 9. Arched Knee Braces under cross-tie in the lower portal
      const xCrossMidL = xLegL + (xApex - xLegL) * 0.46;
      const pKneeLCurve = [
        new THREE.Vector3(xCrossMidL, yCrossApex, zMid),
        new THREE.Vector3(xCrossMidL + 0.3, yCrossApex - 0.3, zMid),
        new THREE.Vector3(xLegL + (xApex - xLegL) * 0.28, fcLegL.yBot + (fcApex.yTop - fcLegL.yBot) * 0.28, zMid)
      ];
      const gKneeL = buildStrutGeometry(pKneeLCurve, baseRadius * 0.8, baseRadius * 0.55, baseRadius * 0.8, depthZ * 0.7, gStage3, commonOpts);
      if (gKneeL) geometries.push(gKneeL);

      // 10. Right Bay Counter-Strut: subdividing right bay
      const yCounterR1 = fc3Bot.yBot + (fc3Top.yTop - fc3Bot.yBot) * 0.72;
      const xCounterR1 = xP3Top;
      const yCounterR2 = fcLegR.yBot + (fcApex.yTop - fcLegR.yBot) * 0.15;
      const xCounterR2 = xLegR + (xApex - xLegR) * 0.15;
      const pCounterRCurve = [
        new THREE.Vector3(xCounterR1, yCounterR1, zMid),
        new THREE.Vector3((xCounterR1 + xCounterR2) / 2, (yCounterR1 + yCounterR2) / 2, zMid),
        new THREE.Vector3(xCounterR2, yCounterR2, zMid)
      ];
      const gCounterR = buildStrutGeometry(pCounterRCurve, baseRadius * 0.9, baseRadius * 0.6, baseRadius * 1.1, depthZ * 0.75, gStage3, commonOpts);
      if (gCounterR) geometries.push(gCounterR);
    }

    // ------------------------------------------------------------------------
    // STAGE 4: QUATERNARY STRUCTURAL LATTICE (g >= 0.72)
    // ------------------------------------------------------------------------
    if (g >= 0.72) {
      const gStage4 = Math.min(1.0, (g - 0.72) / 0.28);

      // 11. Left Upper Bay Sub-strut
      const pSubL1 = [
        new THREE.Vector3(xP1 + 0.5, yTop - 0.3, zMid),
        new THREE.Vector3(xP1 + 1.2, yTop - 1.5, zMid),
        new THREE.Vector3(bnds.minX + bnds.spanX * 0.24, yBot + (yTop - yBot) * 0.70, zMid)
      ];
      const gSubL1 = buildStrutGeometry(pSubL1, baseRadius * 0.7, baseRadius * 0.45, baseRadius * 0.7, depthZ * 0.65, gStage4, commonOpts);
      if (gSubL1) geometries.push(gSubL1);

      // 12. Center Upper Triangle Diagonal Ribs (subdividing the two upper triangles)
      const yCrossApex = yBot + (yTop - yBot) * 0.48;
      const xCrossL = xLegL + (xApex - xLegL) * 0.48;
      const pSubTriL = [
        new THREE.Vector3(xCrossL + 0.3, yCrossApex + 0.3, zMid),
        new THREE.Vector3((xCrossL + xApex) / 2, (yCrossApex + yTop) / 2, zMid),
        new THREE.Vector3(xApex, (yCrossApex + yTop) / 2 + 0.5, zMid)
      ];
      const gSubTriL = buildStrutGeometry(pSubTriL, baseRadius * 0.65, baseRadius * 0.4, baseRadius * 0.65, depthZ * 0.6, gStage4, commonOpts);
      if (gSubTriL) geometries.push(gSubTriL);

      const xCrossR = xLegR + (xApex - xLegR) * 0.48;
      const pSubTriR = [
        new THREE.Vector3(xCrossR - 0.3, yCrossApex + 0.3, zMid),
        new THREE.Vector3((xCrossR + xApex) / 2, (yCrossApex + yTop) / 2, zMid),
        new THREE.Vector3(xApex, (yCrossApex + yTop) / 2 + 0.5, zMid)
      ];
      const gSubTriR = buildStrutGeometry(pSubTriR, baseRadius * 0.65, baseRadius * 0.4, baseRadius * 0.65, depthZ * 0.6, gStage4, commonOpts);
      if (gSubTriR) geometries.push(gSubTriR);

      // 13. Lower Portal Secondary Inner Arch Rib
      const pSubArch = [
        new THREE.Vector3(xLegL + 0.5, yBot + (yTop - yBot) * 0.20, zMid),
        new THREE.Vector3(xApex, yCrossApex - 0.4, zMid),
        new THREE.Vector3(xLegR - 0.5, yBot + (yTop - yBot) * 0.20, zMid)
      ];
      const gSubArch = buildStrutGeometry(pSubArch, baseRadius * 0.65, baseRadius * 0.45, baseRadius * 0.65, depthZ * 0.65, gStage4, commonOpts);
      if (gSubArch) geometries.push(gSubArch);

      // 14. Right Bay Fine Infill Struts
      const pSubR1 = [
        new THREE.Vector3(xP3Bot - 1.2, yBot + (yTop - yBot) * 0.35, zMid),
        new THREE.Vector3(xP3Bot - 0.6, yBot + (yTop - yBot) * 0.50, zMid),
        new THREE.Vector3(xP3Top + 0.8, yTop - 0.5, zMid)
      ];
      const gSubR1 = buildStrutGeometry(pSubR1, baseRadius * 0.65, baseRadius * 0.45, baseRadius * 0.65, depthZ * 0.65, gStage4, commonOpts);
      if (gSubR1) geometries.push(gSubR1);
    }

    });

    if (geometries.length === 0) return null;

    // Merge all branch member geometries into one single BufferGeometry

