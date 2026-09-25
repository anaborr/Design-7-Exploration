/**
 * ============================================================================
 * DESIGN REASONING ENGINE
 * Synthesizes Typology selection and 12-Descriptor Intent into an architectural
 * Design Reasoning System that determines geometry BEFORE generation.
 * Performs conflict resolution and translates priorities into geometric rules.
 * ============================================================================
 */

// 12 DESCRIPTOR RULE OBJECTS
const DESCRIPTOR_RULES = {
  porosity: {
    name: 'Porosity',
    qualitativeMeaning: 'Degree of visual and physical permeability between spatial zones.',
    quantitativeMeasurement: 'Ratio of open/view portals relative to solid structural partitions.',
    geometricActions: ['Increase boundary openings', 'Distribute openings across structural walls', 'Enhance sightlines between levels'],
    geometricConstraints: ['Must maintain structural load-bearing continuity', 'Do not compromise overall floor plate stability'],
    conflicts: ['intimacy']
  },
  rhythm: {
    name: 'Rhythm',
    qualitativeMeaning: 'Perception of repetition and structural cadences in spatial elements.',
    quantitativeMeasurement: 'Number of repeated structural ribs and variation coefficient of spacing.',
    geometricActions: ['Introduce repeated structural column/rib members', 'Control spacing cadence'],
    geometricConstraints: ['Spacing must align with floor plate structural bay spans'],
    conflicts: ['dynamic']
  },
  scale: {
    name: 'Scale',
    qualitativeMeaning: 'Spatial dimensions proportioned relative to a 1.8m human reference figure.',
    quantitativeMeasurement: 'Clear vertical ceiling height divided by 1.8m human height datum.',
    geometricActions: ['Manipulate vertical ceiling heights relative to 1.8m human figure datum'],
    geometricConstraints: ['Minimum clear height must exceed 2.4m (1.33x human datum)'],
    conflicts: ['intimacy']
  },
  carved: {
    name: 'Carved',
    qualitativeMeaning: 'Subtraction of voids and volumes from a primary solid structural mass.',
    quantitativeMeasurement: 'Percentage of total section envelope subtracted as interior voids.',
    geometricActions: ['Subtract larger double-height voids', 'Create recessed wall niches and ceiling pockets'],
    geometricConstraints: ['Subtracted voids must preserve floor plate structural continuity'],
    conflicts: ['hierarchy']
  },
  connectivity: {
    name: 'Connectivity',
    qualitativeMeaning: 'Direct movement and visual linkages between major spatial zones.',
    quantitativeMeasurement: 'Average number of direct circulation edges connected to each node.',
    geometricActions: ['Add direct circulation stairs and view portals between levels'],
    geometricConstraints: ['Limit path clutter to preserve spatial legibility'],
    conflicts: ['clarity']
  },
  layered: {
    name: 'Layered',
    qualitativeMeaning: 'Simultaneous visual perception of overlapping plates, zones, and screens.',
    quantitativeMeasurement: 'Number of overlapping horizontal floor/mezzanine plates in section view.',
    geometricActions: ['Create staggered mezzanine plates and floating walkway screens'],
    geometricConstraints: ['Ensure clear sightlines through screen layers'],
    conflicts: ['clarity']
  },
  hierarchy: {
    name: 'Hierarchy',
    qualitativeMeaning: 'Clear distinction between primary, secondary, and tertiary spatial volumes.',
    quantitativeMeasurement: 'Ratio of primary central volume area to secondary alcove volumes.',
    geometricActions: ['Expand primary central hall volume while scaling down secondary alcoves'],
    geometricConstraints: ['Primary space must dominate overall section composition'],
    conflicts: ['communal', 'carved']
  },
  clarity: {
    name: 'Clarity',
    qualitativeMeaning: 'Legibility of primary circulation and reduction of unnecessary decision points.',
    quantitativeMeasurement: 'Number of decision intersection points along main circulation path.',
    geometricActions: ['Prune secondary branching paths', 'Establish one uninterrupted primary spine'],
    geometricConstraints: ['Primary route must connect entry directly to main destination'],
    conflicts: ['dynamic', 'connectivity', 'layered']
  },
  focalization: {
    name: 'Focalization',
    qualitativeMeaning: 'Organization of paths and sightlines toward an identifiable spatial focal point.',
    quantitativeMeasurement: 'Number of circulation routes and sightlines converging on primary focal node.',
    geometricActions: ['Orient ceiling vault curves and circulation paths toward focal atrium node'],
    geometricConstraints: ['Focal point must be visually unblocked from entry threshold'],
    conflicts: []
  },
  intimacy: {
    name: 'Intimacy',
    qualitativeMeaning: 'Sensory enclosure achieved through compressed height-to-width proportions.',
    quantitativeMeasurement: 'Section height-to-width ratio in secondary alcove zones (< 0.8).',
    geometricActions: ['Lower ceiling heights in alcoves', 'Enclose secondary spatial boundaries'],
    geometricConstraints: ['Clear height must remain at or above 2.2m for human comfort'],
    conflicts: ['porosity', 'scale', 'communal']
  },
  dynamic: {
    name: 'Dynamic',
    qualitativeMeaning: 'Changing vistas, level changes, and spatial expansion/compression along movement.',
    quantitativeMeasurement: 'Ratio of actual curving circulation path length to straight-line distance.',
    geometricActions: ['Introduce curving level changes, ramps, and changing ceiling heights'],
    geometricConstraints: ['Curve slopes must remain comfortably navigable'],
    conflicts: ['clarity', 'rhythm']
  },
  communal: {
    name: 'Communal',
    qualitativeMeaning: 'Generous shared occupation areas organized around collective gathering.',
    quantitativeMeasurement: 'Percentage of usable floor plate area dedicated to shared occupation.',
    geometricActions: ['Expand central floor plate area and organize circulation around shared hall'],
    geometricConstraints: ['Shared areas must maintain clear access from primary entrance'],
    conflicts: ['intimacy', 'hierarchy']
  }
};

/**
 * REASON ABOUT DESIGN
 * Analyzes selected Typology and 12 Descriptor Targets to synthesize
 * geometric rules, resolve conflicts, and guide spatial diagram generation.
 */
function reasonAboutDesign(typologyKey, descriptorTargets) {
  const isHigh = (desc) => descriptorTargets[desc] === 'HIGH' || descriptorTargets[desc] === 'PRIMARY';
  const isLow = (desc) => descriptorTargets[desc] === 'LOW';

  const activeRules = [];
  const conflicts = [];
  const geometricDirectives = {
    targetVolume: 8000,          // ~8,000 cu. ft. target
    ceilingDisplacement: 1.0,   // Scale factor for ceiling height
    porosityCount: 2,           // Number of open portals
    circulationCurvature: 0.2,   // Path curvature
    decisionPointLimit: 2,      // Max decision nodes for clarity
    voidScale: 1.0,             // Void subtraction scale
    mezzanineCount: 1           // Extra floor plates
  };

  // 1. Conflict Resolution Checks
  if (isHigh('intimacy') && isHigh('porosity')) {
    conflicts.push({
      conflict: 'HIGH INTIMACY + HIGH POROSITY',
      resolution: 'Maintain spatial enclosure through compressed ceiling height (2.4m datum) while using smaller strategically positioned view portals to preserve visual permeability.'
    });
    geometricDirectives.ceilingDisplacement *= 0.75;
    geometricDirectives.porosityCount = 3;
  }

  if (isHigh('dynamic') && isHigh('clarity')) {
    conflicts.push({
      conflict: 'HIGH DYNAMIC + HIGH CLARITY',
      resolution: 'Use one legible primary circulation path with smooth curvature and level changes, while strictly limiting secondary decision branches to 1.'
    });
    geometricDirectives.circulationCurvature = 0.5;
    geometricDirectives.decisionPointLimit = 1;
  }

  if (isHigh('hierarchy') && isHigh('communal')) {
    conflicts.push({
      conflict: 'HIGH HIERARCHY + HIGH COMMUNAL',
      resolution: 'Create one dominant communal gathering hall supported by smaller secondary gathering alcoves.'
    });
    geometricDirectives.voidScale = 1.3;
  }

  if (isHigh('carved') && isHigh('hierarchy')) {
    conflicts.push({
      conflict: 'HIGH CARVED + HIGH HIERARCHY',
      resolution: 'Subtract secondary spatial voids directly from a clearly readable primary vaulted mass.'
    });
    geometricDirectives.voidScale = 1.4;
  }

  if (isHigh('connectivity') && isHigh('clarity')) {
    conflicts.push({
      conflict: 'HIGH CONNECTIVITY + HIGH CLARITY',
      resolution: 'Increase direct visual connections across levels while maintaining a single dominant circulation spine.'
    });
    geometricDirectives.decisionPointLimit = 1;
  }

  if (isHigh('rhythm') && isHigh('dynamic')) {
    conflicts.push({
      conflict: 'HIGH RHYTHM + HIGH DYNAMIC',
      resolution: 'Use repeated structural ribs whose spacing or height transforms dynamically along the curving circulation route.'
    });
  }

  if (isHigh('layered') && isHigh('clarity')) {
    conflicts.push({
      conflict: 'HIGH LAYERED + HIGH CLARITY',
      resolution: 'Allow visual overlap between mezzanine plates while keeping the primary circulation path visually unobstructed.'
    });
    geometricDirectives.mezzanineCount = 2;
  }

  // 2. Synthesize Descriptor Geometric Actions
  Object.keys(descriptorTargets).forEach(desc => {
    const target = descriptorTargets[desc];
    const ruleObj = DESCRIPTOR_RULES[desc];
    if (ruleObj) {
      if (target === 'HIGH' || target === 'PRIMARY') {
        activeRules.push({
          descriptor: ruleObj.name,
          target: target,
          action: ruleObj.geometricActions[0],
          constraint: ruleObj.geometricConstraints[0]
        });
      }
    }
  });

  // Apply Specific Directive Adjustments
  if (isHigh('porosity')) geometricDirectives.porosityCount = Math.max(3, geometricDirectives.porosityCount);
  if (isHigh('scale')) geometricDirectives.ceilingDisplacement *= 1.4;
  if (isHigh('intimacy')) geometricDirectives.ceilingDisplacement *= 0.7;
  if (isHigh('clarity')) geometricDirectives.decisionPointLimit = 1;
  if (isHigh('carved')) geometricDirectives.voidScale *= 1.3;
  if (isHigh('layered')) geometricDirectives.mezzanineCount = Math.max(2, geometricDirectives.mezzanineCount);

  return {
    typologyKey,
    descriptorTargets,
    conflicts,
    activeRules,
    geometricDirectives
  };
}
