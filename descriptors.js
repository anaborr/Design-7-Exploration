/**
 * ============================================================================
 * GLOBAL DETERMINISTIC UTILITIES (PRNG, CLAMP, BEZIER MATH)
 * Must be loaded FIRST so all subsequent modules can access them globally.
 * ============================================================================
 */

/**
 * Returns a repeatable pseudo-random float between 0.0 and 1.0 for a given numeric seed.
 * The SAME seed ALWAYS produces the exact SAME output.
 */
function seededRandom(seed) {
  const s = Math.sin(Number(seed) * 9999 + 1) * 10000;
  return s - Math.floor(s);
}

/**
 * Returns a stateful PRNG function initialized with a seed.
 */
function createSeededRandom(initialSeed) {
  let s = Number(initialSeed) || 42;
  return function() {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Clamps a numeric value between min and max limits.
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Convert points array [{x,y}, ...] to smooth Catmull-Rom Bezier SVG path string.
 */
function getCatmullRomBezierPath(points) {
  if (!points || points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
  }

  let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  const k = 0.5;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / (6 * k);
    const cp1y = p1.y + (p2.y - p0.y) / (6 * k);

    const cp2x = p2.x - (p3.x - p1.x) / (6 * k);
    const cp2y = p2.y - (p3.y - p1.y) / (6 * k);

    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return path;
}

/**
 * ============================================================================
 * DESCRIPTOR KNOWLEDGE MODEL
 * Defines the 12 Architectural Descriptors, definitions, targets, priority ratings,
 * geometric action rules, constraints, and conflict resolution rules.
 * ============================================================================
 */

const DESCRIPTOR_KNOWLEDGE = {
  // --------------------------------------------------------------------------
  // FORMAL / GEOMETRIC
  // --------------------------------------------------------------------------
  porosity: {
    name: 'Porosity',
    category: 'FORMAL / GEOMETRIC',
    qualitativeDefinition: 'Degree to which boundaries allow visual and physical passage between spaces.',
    quantitativeDefinition: 'Number of boundaries open to movement or views.',
    highActions: [
      'Increase boundary openings',
      'Distribute openings across multiple structural boundaries',
      'Strengthen visual continuity between interior zones',
      'Connect adjacent spatial volumes'
    ],
    lowActions: [
      'Increase enclosure',
      'Reduce structural openings',
      'Create stronger solid separation'
    ]
  },

  rhythm: {
    name: 'Rhythm',
    category: 'FORMAL / GEOMETRIC',
    qualitativeDefinition: 'Perception of repetition and pattern created by spatial or architectural elements.',
    quantitativeDefinition: 'Number and spacing of repeated elements such as columns, openings, stairs, or structural ribs.',
    highActions: [
      'Introduce repeated ribs, openings, supports, steps, or branches',
      'Regulate spacing across horizontal span',
      'Establish recognizable structural intervals'
    ],
    lowActions: [
      'Reduce repetition',
      'Increase spacing variation and asymmetric rhythm'
    ]
  },

  scale: {
    name: 'Scale',
    category: 'FORMAL / GEOMETRIC',
    qualitativeDefinition: 'Relationship between the size of a space, surrounding elements, and the human occupant.',
    quantitativeDefinition: 'Dimensions and area relative to surrounding spaces compared to a 1.8 m human reference figure.',
    highActions: [
      'Expand ceiling height',
      'Expand spatial width',
      'Modify floor plate dimensions',
      'Benchmark spatial height against 1.8m human silhouette'
    ],
    lowActions: [
      'Compress vertical proportions',
      'Reduce floor envelope width'
    ]
  },

  carved: {
    name: 'Carved',
    category: 'FORMAL / GEOMETRIC',
    qualitativeDefinition: 'Degree to which spaces appear removed, cut into, or recessed from a larger primary form.',
    quantitativeDefinition: 'Percentage of total envelope area removed from the primary mass.',
    highActions: [
      'Establish a recognizable primary solid mass',
      'Subtract meaningful architectural spatial voids',
      'Create deep recesses and double-height penetrations'
    ],
    lowActions: [
      'Maintain monolithic solid envelope',
      'Minimize void subtractions'
    ]
  },

  // --------------------------------------------------------------------------
  // ORGANIZATIONAL / SPATIAL
  // --------------------------------------------------------------------------
  connectivity: {
    name: 'Connectivity',
    category: 'ORGANIZATIONAL / SPATIAL',
    qualitativeDefinition: 'Degree to which spaces are physically and visually linked into a continuous spatial system.',
    quantitativeDefinition: 'Number of direct connections each major spatial node has to other spaces or levels.',
    highActions: [
      'Create meaningful links between spatial zones',
      'Reconnect secondary circulation paths to main nodes',
      'Increase direct spatial relationships across levels'
    ],
    lowActions: [
      'Isolate secondary zones',
      'Limit cross-connections between spatial nodes'
    ]
  },

  layered: {
    name: 'Layered',
    category: 'ORGANIZATIONAL / SPATIAL',
    qualitativeDefinition: 'Degree to which multiple spatial zones, levels, or structural systems overlap and interact.',
    quantitativeDefinition: 'Number of overlapping spatial layers visible or accessible from a given location.',
    highActions: [
      'Overlap floor plates and mezzanines',
      'Establish foreground, middle-ground, and background section relationships',
      'Create simultaneous sectional conditions'
    ],
    lowActions: [
      'Single-layer spatial layout',
      'Minimize sectional overlap'
    ]
  },

  hierarchy: {
    name: 'Hierarchy',
    category: 'ORGANIZATIONAL / SPATIAL',
    qualitativeDefinition: 'Clarity of distinction between primary, secondary, and tertiary spaces.',
    quantitativeDefinition: 'Ratio of size and connectivity between primary and secondary spaces.',
    highActions: [
      'Create one dominant primary spatial element',
      'Establish secondary supporting spaces',
      'Vary scale, wall thickness, and connectivity between primary and secondary zones'
    ],
    lowActions: [
      'Equalize spatial volumes across all zones'
    ]
  },

  clarity: {
    name: 'Clarity',
    category: 'ORGANIZATIONAL / SPATIAL',
    qualitativeDefinition: 'Ease with which users understand spatial organization and determine circulation direction.',
    quantitativeDefinition: 'Number of decision points along the primary circulation route from entry to destination.',
    highActions: [
      'Establish one understandable primary circulation path',
      'Reduce unnecessary intersections and secondary branches',
      'Maintain visible destination or directional logic'
    ],
    lowActions: [
      'Increase decision points and complex labyrinthine circulation branches'
    ]
  },

  // --------------------------------------------------------------------------
  // EXPERIENTIAL / ATMOSPHERIC
  // --------------------------------------------------------------------------
  focalization: {
    name: 'Focalization',
    category: 'EXPERIENTIAL / ATMOSPHERIC',
    qualitativeDefinition: 'Strength of attention toward identifiable spatial, visual, or social focal points.',
    quantitativeDefinition: 'Number of circulation paths or sightlines converging on each designated focal point.',
    highActions: [
      'Establish a primary focal node',
      'Orient circulation paths toward the focal node',
      'Converge spatial geometry around designated focal points'
    ],
    lowActions: [
      'Disperse sightlines evenly across space'
    ]
  },

  intimacy: {
    name: 'Intimacy',
    category: 'EXPERIENTIAL / ATMOSPHERIC',
    qualitativeDefinition: 'Degree of perceived enclosure, closeness, and separation from larger collective spaces.',
    quantitativeDefinition: 'Ceiling height divided by spatial width (compressed spatial proportions contribute to greater intimacy).',
    highActions: [
      'Create compressed spatial zones',
      'Lower ceiling height locally',
      'Reduce spatial width in secondary alcoves',
      'Increase enclosure'
    ],
    lowActions: [
      'Expand ceiling height to produce lofty, open spatial scale'
    ]
  },

  dynamic: {
    name: 'Dynamic',
    category: 'EXPERIENTIAL / ATMOSPHERIC',
    qualitativeDefinition: 'Degree to which movement produces changing views, levels, orientations, or spatial conditions.',
    quantitativeDefinition: 'Circulation path length divided by straight-line distance between start and destination.',
    highActions: [
      'Introduce controlled curvature into circulation paths',
      'Change elevation across levels',
      'Create compression and release sequences'
    ],
    lowActions: [
      'Direct, linear, short circulation path'
    ]
  },

  communal: {
    name: 'Communal',
    category: 'EXPERIENTIAL / ATMOSPHERIC',
    qualitativeDefinition: 'Degree to which spatial organization encourages shared occupation and social interaction.',
    quantitativeDefinition: 'Percentage of total usable floor area dedicated to shared or gathering space.',
    highActions: [
      'Enlarge shared spatial nodes',
      'Orient circulation toward shared gathering zones',
      'Connect secondary spaces into open gathering fields'
    ],
    lowActions: [
      'Dedicating floor area primarily to private or circulation zones'
    ]
  }
};
