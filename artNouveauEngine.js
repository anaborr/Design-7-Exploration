/**
 * ============================================================================
 * ART NOUVEAU FORM-FINDING ENGINE
 * Applies Art Nouveau structural transformations (whiplash curves, S-curves,
 * continuous floor-wall-ceiling transitions, branching supports) directly onto the
 * spatial topology graph.
 * ============================================================================
 */

function generateArtNouveauGeometry(topology, width, height, seed, designIntent) {
  const datumY = topology.plates[0]?.y1 || height * 0.82;
  const spanWidth = width * 0.8;
  const marginX = width * 0.1;

  // Curvature & structural strength derived from design intent
  const whiplashCurvature = designIntent.dynamic === 'HIGH' || designIntent.dynamic === 'PRIMARY' ? 55 : 35;
  const primaryDominance = designIntent.hierarchy === 'PRIMARY' || designIntent.hierarchy === 'HIGH' ? 1.4 : 1.0;

  // 1. Primary Vault Profile derived from Topology Plates & Voids
  const points = [];
  const ribCount = Math.max(5, topology.plates.length * 2 + 2);
  const baselineY = height * 0.42;

  for (let i = 0; i < ribCount; i++) {
    const t = i / (ribCount - 1);
    const x = marginX + t * spanWidth;

    // Calculate vertical position: Art Nouveau whiplash S-curve inflection
    const waveDirection = (i % 2 === 0) ? -1 : 1;
    const amp = (whiplashCurvature / 100) * (height * 0.28);
    const yOffset = waveDirection * amp * (0.6 + seededRandom(seed + i * 11) * 0.5) * primaryDominance;

    let y = baselineY + yOffset;

    // Adjust height for typology plates & voids
    topology.voids.forEach(v => {
      const dist = Math.abs(x - v.cx);
      if (dist < v.rx * 1.5) {
        y -= (1 - dist / (v.rx * 1.5)) * (v.ry * 0.8);
      }
    });

    points.push({ x: clamp(x, marginX, width - marginX), y: clamp(y, height * 0.12, datumY - 35) });
  }

  // 2. Continuous Floor-Wall-Ceiling Structural Spline
  const primarySplineD = getCatmullRomBezierPath(points);

  // 3. Secondary Offset Line (Slab & Wall Thickness)
  const offsetPoints = points.map(pt => ({ x: pt.x, y: pt.y + 16 }));
  const secondarySplineD = getCatmullRomBezierPath(offsetPoints);

  // 4. Branching Support Ribs
  const branchingRibs = [];
  topology.plates.forEach((plate, idx) => {
    if (idx > 0) {
      const startPt = { x: plate.x1, y: plate.y1 };
      const endPt = { x: plate.x2, y: plate.y2 };
      const midX = (startPt.x + endPt.x) / 2;
      const midY = (startPt.y + endPt.y) / 2 - 40;

      branchingRibs.push({
        pathD: `M ${startPt.x.toFixed(1)},${startPt.y.toFixed(1)} Q ${midX.toFixed(1)},${midY.toFixed(1)} ${endPt.x.toFixed(1)},${endPt.y.toFixed(1)}`
      });
    }
  });

  // 5. Section Fill Path
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const sectionFillD = `${primarySplineD} L ${lastPt.x.toFixed(1)},${datumY.toFixed(1)} L ${firstPt.x.toFixed(1)},${datumY.toFixed(1)} Z`;

  return {
    datumY,
    width,
    height,
    spanWidth,
    points,
    primarySplineD,
    secondarySplineD,
    sectionFillD,
    branchingRibs,
    topology
  };
}
