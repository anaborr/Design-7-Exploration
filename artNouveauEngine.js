/**
 * ============================================================================
 * ART NOUVEAU FORM-FINDING ENGINE
 * Applies Art Nouveau structural transformations (whiplash curves, S-curves,
 * continuous floor-wall-ceiling transitions, branching supports, variable tapering)
 * directly onto the spatial topology graph.
 * ============================================================================
 */

function generateArtNouveauGeometry(topology, width, height, seed, designIntent, directives) {
  const datumY = topology.plates[0]?.y1 || height * 0.82;
  const spanWidth = width * 0.8;
  const marginX = width * 0.1;

  const whiplashCurvature = designIntent.dynamic === 'HIGH' || designIntent.dynamic === 'PRIMARY' ? 65 : 40;
  const primaryDominance = designIntent.hierarchy === 'PRIMARY' || designIntent.hierarchy === 'HIGH' ? 1.4 : 1.0;
  const scaleMult = directives?.ceilingDisplacement || 1.0;

  // 1. Calculate Primary Ceiling Vault Nodes from Spatial Topology
  const points = [];
  const ribCount = Math.max(5, topology.plates.length * 2 + 2);
  const baselineY = height * 0.42 / scaleMult;

  for (let i = 0; i < ribCount; i++) {
    const t = i / (ribCount - 1);
    const x = marginX + t * spanWidth;

    // Art Nouveau S-Curve Whiplash Inflection
    const waveDirection = (i % 2 === 0) ? -1 : 1;
    const amp = (whiplashCurvature / 100) * (height * 0.22);
    const yOffset = waveDirection * amp * (0.6 + seededRandom(seed + i * 11) * 0.5) * primaryDominance;

    let y = baselineY + yOffset;

    // Adapt ceiling height to spatial voids
    topology.voids.forEach(v => {
      const dist = Math.abs(x - v.cx);
      if (dist < v.rx * 1.5) {
        y -= (1 - dist / (v.rx * 1.5)) * (v.ry * 0.7 * (directives?.voidScale || 1.0));
      }
    });

    points.push({ x: clamp(x, marginX, width - marginX), y: clamp(y, height * 0.1, datumY - 45) });
  }

  // 2. Primary Vault Structural Spline
  const primarySplineD = getCatmullRomBezierPath(points);

  // 3. Tapering Secondary Structural Offset (Variable Thickness)
  const offsetPoints = points.map((pt, idx) => {
    const taperThickness = 12 + Math.sin(idx * 0.8) * 8; // Tapered cross-section
    return { x: pt.x, y: pt.y + taperThickness };
  });
  const secondarySplineD = getCatmullRomBezierPath(offsetPoints);

  // 4. Branching Support Columns & Curving Ribs
  const branchingRibs = [];
  const columns = [];

  topology.plates.forEach((plate, idx) => {
    // Structural columns connecting floor plates to ceiling vault
    const colX = (plate.x1 + plate.x2) / 2;
    const ceilingY = baselineY - 20;
    
    // Art Nouveau Whiplash Column (S-curve stem)
    const midX = colX + (idx % 2 === 0 ? 18 : -18);
    const midY = (plate.y1 + ceilingY) / 2;
    const colPathD = `M ${colX.toFixed(1)},${plate.y1.toFixed(1)} Q ${midX.toFixed(1)},${midY.toFixed(1)} ${colX.toFixed(1)},${ceilingY.toFixed(1)}`;
    
    columns.push({ pathD: colPathD, x: colX, y1: plate.y1, y2: ceilingY });

    if (idx > 0) {
      const startPt = { x: plate.x1, y: plate.y1 };
      const endPt = { x: plate.x2, y: plate.y2 };
      const ribMidX = (startPt.x + endPt.x) / 2;
      const ribMidY = (startPt.y + endPt.y) / 2 - 35;
      branchingRibs.push({
        pathD: `M ${startPt.x.toFixed(1)},${startPt.y.toFixed(1)} Q ${ribMidX.toFixed(1)},${ribMidY.toFixed(1)} ${endPt.x.toFixed(1)},${endPt.y.toFixed(1)}`
      });
    }
  });

  // 5. Section Solid Fill Envelope Path
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const sectionFillD = `${primarySplineD} L ${lastPt.x.toFixed(1)},${datumY.toFixed(1)} L ${firstPt.x.toFixed(1)},${datumY.toFixed(1)} Z`;

  // 6. Human Scale References (1.8m scale figures = 35px height in canvas scale)
  const humanFigures = [
    { x: marginX + 30, y: datumY, label: '1.8m Human Reference' },
    { x: width * 0.5, y: datumY, label: '1.8m Human' }
  ];
  if (topology.plates.length > 2) {
    const mez = topology.plates[2];
    humanFigures.push({ x: (mez.x1 + mez.x2) / 2, y: mez.y1, label: '1.8m Human' });
  }

  // 7. Spatial Zones (Occupied spatial areas)
  const spatialZones = [
    { name: 'Ground Entrance Vestibule', x1: marginX, y1: datumY - 70, x2: marginX + spanWidth * 0.25, y2: datumY },
    { name: 'Primary Gathering Volume', x1: marginX + spanWidth * 0.3, y1: height * 0.25, x2: marginX + spanWidth * 0.7, y2: datumY },
    { name: 'Upper Mezzanine Zone', x1: marginX + spanWidth * 0.72, y1: height * 0.45, x2: marginX + spanWidth, y2: datumY - 100 }
  ];

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
    columns,
    humanFigures,
    spatialZones,
    topology
  };
}
