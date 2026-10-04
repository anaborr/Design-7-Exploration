$c = Get-Content 'branchingEngine.js' -Raw -Encoding UTF8

$markerStart = "// 1. Primary Branch 1: Left Vertical Column / Wall with flared base & crown"
$markerEnd = "if (g >= 0.24) {"

$idx1 = $c.IndexOf($markerStart)
$idx2 = $c.IndexOf($markerEnd, $idx1)

if ($idx1 -lt 0 -or $idx2 -lt 0) {
    Write-Error "Markers not found in branchingEngine.js: idx1=$idx1, idx2=$idx2"
    exit 1
}

$replacement = @"
const activeTypo = params.activeTypology || branchingSystemState.activeTypology || (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID';

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

    } else if (activeTypo === 'CONTINUOUS_HALL') {
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

    } else if (activeTypo === 'TOPOGRAPHIC_GROUND') {
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
    
"@

$newCode = $c.Substring(0, $idx1) + $replacement + $c.Substring($idx2)
Set-Content 'branchingEngine.js' -Value $newCode -Encoding UTF8
Write-Output "Successfully updated generateOrganicSpatialArchitecture in branchingEngine.js!"
