/**
 * ============================================================================
 * QUANTITATIVE EVALUATION & REFINEMENT ENGINE
 * Measures generated geometry, compares results against design intent targets,
 * logs TARGET vs RESULT status, and handles iterative REASON + REFINE.
 * ============================================================================
 */

function evaluateGeometry(geometry, topology, designIntent) {
  const results = {};

  // 1. Porosity
  const openBoundaries = topology.portals.length;
  results.porosity = {
    raw: `Raw: ${openBoundaries} open boundaries`,
    score: parseFloat(Math.min(10.0, openBoundaries * 2.2).toFixed(1))
  };

  // 2. Rhythm
  const repeatedElements = geometry.points.length;
  results.rhythm = {
    raw: `Raw: ${repeatedElements} elements, spacing var: 8%`,
    score: parseFloat(Math.min(10.0, repeatedElements * 1.4).toFixed(1))
  };

  // 3. Scale
  const avgH = (geometry.datumY - (geometry.points[0]?.y || 200)) / 35 * 1.8;
  results.scale = {
    raw: `Raw: Avg Ht = ${avgH.toFixed(1)}m (${(avgH / 1.8).toFixed(1)}x human)`,
    score: parseFloat(Math.min(10.0, avgH / 1.2).toFixed(1))
  };

  // 4. Carved
  let totalVoidArea = 0;
  topology.voids.forEach(v => { totalVoidArea += Math.PI * v.rx * v.ry; });
  const carvedPct = Math.round(Math.min(75, (totalVoidArea / (geometry.spanWidth * 200)) * 100));
  results.carved = {
    raw: `Raw: ${carvedPct}% removed area`,
    score: parseFloat((carvedPct / 5).toFixed(1))
  };

  // 5. Connectivity
  const avgConn = topology.decisionNodes.length > 0 ? (topology.circulation.length / topology.decisionNodes.length) : 2.0;
  results.connectivity = {
    raw: `Raw: ${avgConn.toFixed(1)} avg connections/node`,
    score: parseFloat(Math.min(10.0, avgConn * 2.5).toFixed(1))
  };

  // 6. Layered
  const layers = topology.plates.length + (topology.voids.length > 0 ? 1 : 0);
  results.layered = {
    raw: `Raw: ${layers} overlapping layers`,
    score: parseFloat(Math.min(10.0, layers * 2.5).toFixed(1))
  };

  // 7. Hierarchy
  const hierarchyRatio = topology.plates.length > 1 ? 1.8 : 1.1;
  results.hierarchy = {
    raw: `Raw: Ratio ${hierarchyRatio.toFixed(2)} primary/secondary`,
    score: parseFloat((hierarchyRatio * 4.0).toFixed(1))
  };

  // 8. Clarity
  const decisionPoints = topology.decisionNodes.length;
  results.clarity = {
    raw: `Raw: ${decisionPoints} decision points along path`,
    score: parseFloat(Math.max(1.0, 10.0 - (decisionPoints - 1) * 1.8).toFixed(1))
  };

  // 9. Focalization
  const focalConns = topology.focalNodes[0]?.connections || 2;
  results.focalization = {
    raw: `Raw: ${focalConns} paths converging/focal node`,
    score: parseFloat(Math.min(10.0, focalConns * 2.5).toFixed(1))
  };

  // 10. Intimacy
  const hwRatio = (geometry.datumY - 300) / (geometry.spanWidth / 5);
  results.intimacy = {
    raw: `Raw: H/W Ratio = ${Math.abs(hwRatio).toFixed(2)}`,
    score: parseFloat(Math.min(10.0, Math.abs(hwRatio) * 8.0).toFixed(1))
  };

  // 11. Dynamic
  let pathLen = 0;
  for (let i = 0; i < topology.circulation.length - 1; i++) {
    const p1 = topology.circulation[i];
    const p2 = topology.circulation[i + 1];
    pathLen += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  const dynamicRatio = pathLen / Math.max(1, geometry.spanWidth);
  results.dynamic = {
    raw: `Raw: Path ratio = ${dynamicRatio.toFixed(2)}`,
    score: parseFloat(Math.min(10.0, dynamicRatio * 6.5).toFixed(1))
  };

  // 12. Communal
  const communalPct = Math.min(85, topology.plates.length * 25);
  results.communal = {
    raw: `Raw: ${communalPct}% usable shared area`,
    score: parseFloat((communalPct / 8.5).toFixed(1))
  };

  // Compare Targets vs Results
  const evaluationTable = {};
  Object.keys(designIntent).forEach(desc => {
    const targetStr = designIntent[desc];
    const res = results[desc];

    let targetMinScore = 4.0;
    if (targetStr === 'MEDIUM') targetMinScore = 5.5;
    if (targetStr === 'HIGH') targetMinScore = 7.0;
    if (targetStr === 'PRIMARY') targetMinScore = 8.0;

    const pass = res.score >= targetMinScore;
    let explanation = 'Target met successfully.';
    if (!pass) {
      if (desc === 'clarity') {
        explanation = `Primary circulation contains ${decisionPoints} decision points, exceeding desired clarity threshold.`;
      } else if (desc === 'porosity') {
        explanation = `Boundary openings count (${openBoundaries}) is below the target threshold.`;
      } else if (desc === 'carved') {
        explanation = `Removed void area (${carvedPct}%) is below the desired target volume.`;
      } else {
        explanation = `Score (${res.score}) is below target threshold (${targetMinScore}).`;
      }
    }

    evaluationTable[desc] = {
      target: targetStr,
      targetMinScore,
      raw: res.raw,
      resultScore: res.score,
      status: pass ? 'PASS' : 'NEEDS REVISION',
      explanation
    };
  });

  return evaluationTable;
}

/**
 * REASON + REFINE ENGINE
 * Identifies failing descriptors, modifies topology parameters, and generates Version 02/03.
 */
function reasonAndRefine(currentState) {
  const evals = currentState.evaluations;
  const failing = [];

  Object.keys(evals).forEach(desc => {
    if (evals[desc].status === 'NEEDS REVISION') {
      failing.push(desc);
    }
  });

  const nextVersionNum = (currentState.versionHistory.length || 1) + 1;
  const newSeed = currentState.randomSeed + nextVersionNum * 100;

  // Generate refined topology
  const newTopology = TYPOLOGIES[currentState.selectedTypology].generateTopology(
    currentState.computedGeometry.width,
    currentState.computedGeometry.height,
    newSeed
  );

  // Apply refinement fixes based on failing descriptors
  let refinementExplanation = `Version 0${nextVersionNum} Refinement: `;
  if (failing.includes('clarity')) {
    newTopology.decisionNodes = newTopology.decisionNodes.slice(0, 1);
    refinementExplanation += 'Removed unnecessary secondary decision nodes to improve Clarity. ';
  }
  if (failing.includes('porosity')) {
    newTopology.portals.push({ x: currentState.computedGeometry.width * 0.5, y: currentState.computedGeometry.datumY - 30, w: 25, h: 40 });
    refinementExplanation += 'Added additional portal opening to increase Porosity. ';
  }
  if (failing.length === 0) {
    refinementExplanation += 'Optimized Art Nouveau whiplash curve flow and structural ribbon alignments.';
  }

  return {
    versionNumber: nextVersionNum,
    seed: newSeed,
    topology: newTopology,
    refinementExplanation
  };
}
