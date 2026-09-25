/**
 * ============================================================================
 * QUANTITATIVE EVALUATION & REFINEMENT ENGINE
 * Measures generated geometry, compares results against design intent targets,
 * logs TARGET vs RESULT status, and handles iterative REASON + REFINE.
 * ============================================================================
 */

function evaluateGeometry(geometry, topology, designIntent) {
  const results = {};

  // Helper function to grade score against target priority
  function evaluateTarget(score, target) {
    if (target === 'HIGH' || target === 'PRIMARY') {
      if (score >= 7.0) return { status: 'PASS', reason: 'Meets high target requirements' };
      if (score >= 5.0) return { status: 'WARN', reason: 'Slightly below target performance' };
      return { status: 'FAIL', reason: 'Fails to meet high intent threshold' };
    }
    if (target === 'MEDIUM') {
      if (score >= 4.5 && score <= 7.5) return { status: 'PASS', reason: 'Optimal medium range' };
      return { status: 'WARN', reason: 'Deviates from moderate balance' };
    }
    // LOW target
    if (score <= 5.0) return { status: 'PASS', reason: 'Restrained low intent maintained' };
    return { status: 'WARN', reason: 'Exceeds intended low threshold' };
  }

  // 1. Porosity
  const openBoundaries = topology.portals ? topology.portals.length : 2;
  const porosityScore = parseFloat(Math.min(10.0, openBoundaries * 2.5).toFixed(1));
  const porosityEval = evaluateTarget(porosityScore, designIntent.porosity || 'MEDIUM');
  results.porosity = {
    target: designIntent.porosity || 'MEDIUM',
    raw: `${openBoundaries} open portals`,
    score: porosityScore,
    status: porosityEval.status,
    reason: porosityEval.reason
  };

  // 2. Rhythm
  const ribCount = geometry.points ? geometry.points.length : 6;
  const rhythmScore = parseFloat(Math.min(10.0, ribCount * 1.3).toFixed(1));
  const rhythmEval = evaluateTarget(rhythmScore, designIntent.rhythm || 'MEDIUM');
  results.rhythm = {
    target: designIntent.rhythm || 'MEDIUM',
    raw: `${ribCount} structural ribs`,
    score: rhythmScore,
    status: rhythmEval.status,
    reason: rhythmEval.reason
  };

  // 3. Scale (Relative to 1.8m human reference)
  const avgHeightM = (geometry.datumY - (geometry.points[0]?.y || 200)) / 35 * 1.8;
  const scaleScore = parseFloat(Math.min(10.0, avgHeightM / 1.1).toFixed(1));
  const scaleEval = evaluateTarget(scaleScore, designIntent.scale || 'MEDIUM');
  results.scale = {
    target: designIntent.scale || 'MEDIUM',
    raw: `Avg height = ${avgHeightM.toFixed(1)}m (${(avgHeightM / 1.8).toFixed(1)}x human)`,
    score: scaleScore,
    status: scaleEval.status,
    reason: scaleEval.reason
  };

  // 4. Carved
  let totalVoidArea = 0;
  if (topology.voids) topology.voids.forEach(v => { totalVoidArea += Math.PI * v.rx * v.ry; });
  const carvedPct = Math.round(Math.min(75, (totalVoidArea / (geometry.spanWidth * 180)) * 100));
  const carvedScore = parseFloat((carvedPct / 5).toFixed(1));
  const carvedEval = evaluateTarget(carvedScore, designIntent.carved || 'MEDIUM');
  results.carved = {
    target: designIntent.carved || 'MEDIUM',
    raw: `${carvedPct}% void subtraction`,
    score: carvedScore,
    status: carvedEval.status,
    reason: carvedEval.reason
  };

  // 5. Connectivity
  const avgConn = topology.decisionNodes && topology.decisionNodes.length > 0 ? (topology.circulation.length / topology.decisionNodes.length) : 2.0;
  const connScore = parseFloat(Math.min(10.0, avgConn * 2.5).toFixed(1));
  const connEval = evaluateTarget(connScore, designIntent.connectivity || 'MEDIUM');
  results.connectivity = {
    target: designIntent.connectivity || 'MEDIUM',
    raw: `${avgConn.toFixed(1)} links/node`,
    score: connScore,
    status: connEval.status,
    reason: connEval.reason
  };

  // 6. Layered
  const layers = (topology.plates ? topology.plates.length : 1) + (topology.voids && topology.voids.length > 0 ? 1 : 0);
  const layeredScore = parseFloat(Math.min(10.0, layers * 2.5).toFixed(1));
  const layeredEval = evaluateTarget(layeredScore, designIntent.layered || 'MEDIUM');
  results.layered = {
    target: designIntent.layered || 'MEDIUM',
    raw: `${layers} overlapping floor/screen layers`,
    score: layeredScore,
    status: layeredEval.status,
    reason: layeredEval.reason
  };

  // 7. Hierarchy
  const hierarchyRatio = topology.plates && topology.plates.length > 1 ? 1.8 : 1.1;
  const hierarchyScore = parseFloat((hierarchyRatio * 4.0).toFixed(1));
  const hierarchyEval = evaluateTarget(hierarchyScore, designIntent.hierarchy || 'MEDIUM');
  results.hierarchy = {
    target: designIntent.hierarchy || 'MEDIUM',
    raw: `Ratio ${hierarchyRatio.toFixed(2)} primary/secondary`,
    score: hierarchyScore,
    status: hierarchyEval.status,
    reason: hierarchyEval.reason
  };

  // 8. Clarity
  const decisionPoints = topology.decisionNodes ? topology.decisionNodes.length : 1;
  const clarityScore = parseFloat(Math.max(1.0, 10.0 - (decisionPoints - 1) * 2.5).toFixed(1));
  const clarityEval = evaluateTarget(clarityScore, designIntent.clarity || 'MEDIUM');
  if (decisionPoints > 2 && (designIntent.clarity === 'HIGH' || designIntent.clarity === 'PRIMARY')) {
    results.clarity = {
      target: designIntent.clarity || 'MEDIUM',
      raw: `${decisionPoints} decision points`,
      score: clarityScore,
      status: 'FAIL',
      reason: `Excessive decision points (${decisionPoints} nodes along primary route).`
    };
  } else {
    results.clarity = {
      target: designIntent.clarity || 'MEDIUM',
      raw: `${decisionPoints} decision points`,
      score: clarityScore,
      status: clarityEval.status,
      reason: clarityEval.reason
    };
  }

  // 9. Focalization
  const focalConns = topology.focalNodes && topology.focalNodes[0] ? topology.focalNodes[0].connections : 2;
  const focalScore = parseFloat(Math.min(10.0, focalConns * 2.5).toFixed(1));
  const focalEval = evaluateTarget(focalScore, designIntent.focalization || 'MEDIUM');
  results.focalization = {
    target: designIntent.focalization || 'MEDIUM',
    raw: `${focalConns} converging routes`,
    score: focalScore,
    status: focalEval.status,
    reason: focalEval.reason
  };

  // 10. Intimacy
  const hwRatio = (geometry.datumY - 300) / (geometry.spanWidth / 5);
  const intimacyScore = parseFloat(Math.min(10.0, Math.abs(hwRatio) * 8.0).toFixed(1));
  const intimacyEval = evaluateTarget(intimacyScore, designIntent.intimacy || 'MEDIUM');
  results.intimacy = {
    target: designIntent.intimacy || 'MEDIUM',
    raw: `H/W ratio = ${Math.abs(hwRatio).toFixed(2)}`,
    score: intimacyScore,
    status: intimacyEval.status,
    reason: intimacyEval.reason
  };

  // 11. Dynamic
  let pathLen = 0;
  if (topology.circulation) {
    for (let i = 0; i < topology.circulation.length - 1; i++) {
      const p1 = topology.circulation[i];
      const p2 = topology.circulation[i + 1];
      pathLen += Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }
  }
  const dynamicRatio = pathLen / Math.max(1, geometry.spanWidth);
  const dynamicScore = parseFloat(Math.min(10.0, dynamicRatio * 6.5).toFixed(1));
  const dynamicEval = evaluateTarget(dynamicScore, designIntent.dynamic || 'MEDIUM');
  results.dynamic = {
    target: designIntent.dynamic || 'MEDIUM',
    raw: `Path ratio = ${dynamicRatio.toFixed(2)}`,
    score: dynamicScore,
    status: dynamicEval.status,
    reason: dynamicEval.reason
  };

  // 12. Communal
  const communalPct = Math.min(85, (topology.plates ? topology.plates.length : 1) * 25);
  const communalScore = parseFloat((communalPct / 8.5).toFixed(1));
  const communalEval = evaluateTarget(communalScore, designIntent.communal || 'MEDIUM');
  results.communal = {
    target: designIntent.communal || 'MEDIUM',
    raw: `${communalPct}% shared occupation area`,
    score: communalScore,
    status: communalEval.status,
    reason: communalEval.reason
  };

  return results;
}
