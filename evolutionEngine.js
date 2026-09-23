/**
 * ============================================================================
 * DESCRIPTOR-DRIVEN ARCHITECTURAL EVOLUTION ENGINE
 * Handles parent geometry cloning, 6 descriptor strategy synthesis,
 * real control-point mutations, parent vs child quantitative delta analysis,
 * and multi-generation branching.
 * ============================================================================
 */

/**
 * Deep clones parent geometry structure for mutation.
 */
function cloneGeometry(parent) {
  return {
    id: 'gen_' + Math.random().toString(36).substr(2, 6),
    datumY: parent.datumY,
    width: parent.width,
    height: parent.height,
    spanWidth: parent.spanWidth,
    points: parent.points.map(pt => ({ x: pt.x, y: pt.y })),
    plates: parent.plates ? parent.plates.map(p => ({ ...p })) : [],
    voids: parent.voids ? parent.voids.map(v => ({ ...v })) : [],
    portals: parent.portals ? parent.portals.map(p => ({ ...p })) : [],
    circulation: parent.circulation ? parent.circulation.map(c => ({ ...c })) : [],
    decisionNodes: parent.decisionNodes ? parent.decisionNodes.map(n => ({ ...n })) : [],
    focalNodes: parent.focalNodes ? parent.focalNodes.map(f => ({ ...f })) : []
  };
}

/**
 * Synthesizes 6 distinct architectural descriptor strategies for an iteration generation.
 */
function createSixDescriptorStrategies(parent, qualitativeFeedback = {}) {
  return [
    {
      index: 1,
      id: '01',
      name: 'Porosity + Connectivity',
      focus: ['porosity', 'connectivity'],
      title: 'ITERATION 01: Porosity + Connectivity',
      description: 'Expands boundary openings and connects separated spatial nodes across levels.',
      operations: ['Enlarge boundary portals', 'Connect adjacent spatial nodes', 'Increase visual continuity']
    },
    {
      index: 2,
      id: '02',
      name: 'Rhythm + Hierarchy',
      focus: ['rhythm', 'hierarchy'],
      title: 'ITERATION 02: Rhythm + Hierarchy',
      description: 'Establishes rhythmic structural rib intervals while reinforcing primary vault dominance.',
      operations: ['Repeat structural rib modules', 'Regularize spacing', 'Strengthen primary vault dominance']
    },
    {
      index: 3,
      id: '03',
      name: 'Carved + Layered',
      focus: ['carved', 'layered'],
      title: 'ITERATION 03: Carved + Layered',
      description: 'Subtracts double-height voids and overlaps mezzanine floor plates.',
      operations: ['Subtract carved voids', 'Overlap secondary floor plates', 'Create sectional depth']
    },
    {
      index: 4,
      id: '04',
      name: 'Intimacy + Dynamic',
      focus: ['intimacy', 'dynamic'],
      title: 'ITERATION 04: Intimacy + Dynamic',
      description: 'Introduces continuous S-curves along circulation while creating compressed spatial pockets.',
      operations: ['Bend circulation into S-curves', 'Lower ceiling locally', 'Create compression and release']
    },
    {
      index: 5,
      id: '05',
      name: 'Focalization + Communal',
      focus: ['focalization', 'communal'],
      title: 'ITERATION 05: Focalization + Communal',
      description: 'Orients circulation and openings toward a central shared gathering hearth.',
      operations: ['Converge sightlines to focal node', 'Enlarge shared gathering plate', 'Connect secondary spaces']
    },
    {
      index: 6,
      id: '06',
      name: 'Balanced Synthesis',
      focus: ['clarity', 'scale', 'dynamic'],
      title: 'ITERATION 06: Balanced Synthesis',
      description: 'Harmonious balance of circulation legibility, human scale, and smooth whiplash curves.',
      operations: ['Simplify decision nodes', 'Scale spatial height to 1.8m human figure', 'Smooth whiplash transitions']
    }
  ];
}

/**
 * Applies real control-point geometric mutations onto cloned child geometry based on strategy.
 */
function applyDescriptorMutations(parent, strategy, iterationIndex, seed) {
  const child = cloneGeometry(parent);
  const prng = createSeededRandom(seed + iterationIndex * 100);

  const focus = strategy.focus;

  // 1. Dynamic Mutation: Bend control points into controlled Art Nouveau S-curves
  if (focus.includes('dynamic')) {
    child.points.forEach((pt, idx) => {
      if (idx > 0 && idx < child.points.length - 1) {
        const wave = (idx % 2 === 0 ? -1 : 1) * (25 + prng() * 20);
        pt.y = clamp(pt.y + wave, child.height * 0.15, child.datumY - 40);
      }
    });

    if (child.circulation.length > 2) {
      child.circulation[1].y -= 25;
    }
  }

  // 2. Rhythm Mutation: Add structural rib points and regularize spacing
  if (focus.includes('rhythm')) {
    const extraPt = {
      x: (child.points[1].x + child.points[2].x) / 2,
      y: (child.points[1].y + child.points[2].y) / 2 - 20
    };
    child.points.splice(2, 0, extraPt);
  }

  // 3. Carved Mutation: Subtract/enlarge spatial void
  if (focus.includes('carved')) {
    if (child.voids.length > 0) {
      child.voids[0].rx *= 1.35;
      child.voids[0].ry *= 1.35;
    } else {
      child.voids.push({
        cx: child.width * 0.5,
        cy: child.height * 0.45,
        rx: child.width * 0.14,
        ry: child.height * 0.18,
        name: 'Mutated Carved Void'
      });
    }
  }

  // 4. Intimacy Mutation: Lower local ceiling height to compress spatial proportions
  if (focus.includes('intimacy')) {
    child.points.forEach((pt, idx) => {
      if (idx === Math.floor(child.points.length / 2)) {
        pt.y += 35; // Lower ceiling
      }
    });
  }

  // 5. Porosity Mutation: Add / enlarge portal openings
  if (focus.includes('porosity')) {
    child.portals.push({
      x: child.width * (0.3 + prng() * 0.4),
      y: child.datumY - 35,
      w: 28,
      h: 45
    });
  }

  // Regenerate SVG Paths from mutated points
  child.primarySplineD = getCatmullRomBezierPath(child.points);
  child.secondarySplineD = getCatmullRomBezierPath(child.points.map(pt => ({ x: pt.x, y: pt.y + 16 })));
  
  const firstPt = child.points[0];
  const lastPt = child.points[child.points.length - 1];
  child.sectionFillD = `${child.primarySplineD} L ${lastPt.x.toFixed(1)},${child.datumY.toFixed(1)} L ${firstPt.x.toFixed(1)},${child.datumY.toFixed(1)} Z`;

  // Branching Ribs
  child.branchingRibs = [];
  if (child.plates && child.plates.length > 1) {
    child.plates.forEach((plate, idx) => {
      if (idx > 0) {
        const startPt = { x: plate.x1, y: plate.y1 };
        const endPt = { x: plate.x2, y: plate.y2 };
        const midX = (startPt.x + endPt.x) / 2;
        const midY = (startPt.y + endPt.y) / 2 - 35;
        child.branchingRibs.push({
          pathD: `M ${startPt.x.toFixed(1)},${startPt.y.toFixed(1)} Q ${midX.toFixed(1)},${midY.toFixed(1)} ${endPt.x.toFixed(1)},${endPt.y.toFixed(1)}`
        });
      }
    });
  }

  return child;
}

/**
 * Quantitative Analysis comparing Parent vs Child metrics (% deltas).
 */
function analyzeGeometryDeltas(parent, child) {
  // 1. Dynamic Ratio (Path Length / Direct Distance)
  let pLen = 0, cLen = 0;
  for (let i = 0; i < parent.circulation.length - 1; i++) {
    pLen += Math.hypot(parent.circulation[i+1].x - parent.circulation[i].x, parent.circulation[i+1].y - parent.circulation[i].y);
  }
  for (let i = 0; i < child.circulation.length - 1; i++) {
    cLen += Math.hypot(child.circulation[i+1].x - child.circulation[i].x, child.circulation[i+1].y - child.circulation[i].y);
  }
  const pDynamic = pLen / Math.max(1, parent.spanWidth);
  const cDynamic = cLen / Math.max(1, child.spanWidth);
  const dynamicDelta = Math.round(((cDynamic - pDynamic) / Math.max(0.1, pDynamic)) * 100);

  // 2. Intimacy Ratio (Avg Height / Width)
  let pTotalH = 0, cTotalH = 0;
  parent.points.forEach(pt => pTotalH += (parent.datumY - pt.y));
  child.points.forEach(pt => cTotalH += (child.datumY - pt.y));
  const pIntimacy = (pTotalH / parent.points.length) / (parent.spanWidth / 5);
  const cIntimacy = (cTotalH / child.points.length) / (child.spanWidth / 5);
  const intimacyDelta = Math.round(((cIntimacy - pIntimacy) / Math.max(0.1, pIntimacy)) * 100);

  // 3. Porosity (Boundaries count)
  const pPorosity = parent.portals.length;
  const cPorosity = child.portals.length;

  // 4. Rhythm (Rib count)
  const pRhythm = parent.points.length;
  const cRhythm = child.points.length;

  return {
    dynamic: { parent: pDynamic.toFixed(2), child: cDynamic.toFixed(2), deltaPct: dynamicDelta },
    intimacy: { parent: pIntimacy.toFixed(2), child: cIntimacy.toFixed(2), deltaPct: intimacyDelta },
    porosity: { parent: pPorosity, child: cPorosity },
    rhythm: { parent: pRhythm, child: cRhythm }
  };
}

/**
 * Master Evolutionary Generator: Takes parent geometry and returns 6 descendant iterations.
 */
function evolve(parent, qualitativeFeedback = {}, seed = 1024) {
  const strategies = createSixDescriptorStrategies(parent, qualitativeFeedback);

  return strategies.map((strategy, idx) => {
    const child = applyDescriptorMutations(parent, strategy, idx + 1, seed);
    const deltas = analyzeGeometryDeltas(parent, child);

    return {
      iterationId: strategy.id,
      strategy,
      child,
      deltas,
      qualitativeFeedback: { porosity: 'MEDIUM', rhythm: 'MEDIUM', dynamic: 'MEDIUM' }
    };
  });
}
