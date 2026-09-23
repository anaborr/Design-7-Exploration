/**
 * ============================================================================
 * DESIGN REASONING ENGINE
 * Synthesizes Typology selection and Descriptor Priorities into an architectural
 * Design Strategy and resolves spatial trade-offs / conflicts.
 * ============================================================================
 */

function reasonAboutDesign(typologyKey, descriptorTargets) {
  const primaryIntents = [];
  const highIntents = [];

  // Categorize targets
  Object.keys(descriptorTargets).forEach(desc => {
    const val = descriptorTargets[desc];
    if (val === 'PRIMARY') primaryIntents.push(desc);
    else if (val === 'HIGH') highIntents.push(desc);
  });

  const conflicts = [];
  const strategySteps = [];

  // 1. Conflict Resolution Checks
  const isHigh = (desc) => descriptorTargets[desc] === 'HIGH' || descriptorTargets[desc] === 'PRIMARY';

  // Conflict 1: High Intimacy + High Porosity
  if (isHigh('intimacy') && isHigh('porosity')) {
    conflicts.push({
      conflict: 'HIGH INTIMACY + HIGH POROSITY',
      resolution: 'Maintain spatial enclosure using compressed ceiling proportions while introducing smaller, strategically placed view portals to balance intimacy with visual connectivity.'
    });
  }

  // Conflict 2: High Dynamic + High Clarity
  if (isHigh('dynamic') && isHigh('clarity')) {
    conflicts.push({
      conflict: 'HIGH DYNAMIC + HIGH CLARITY',
      resolution: 'Create one continuous curving, winding route with changing spatial vistas, while strictly minimizing secondary decision branches to maintain legibility.'
    });
  }

  // Conflict 3: High Communal + High Intimacy
  if (isHigh('communal') && isHigh('intimacy')) {
    conflicts.push({
      conflict: 'HIGH COMMUNAL + HIGH INTIMACY',
      resolution: 'Establish a dominant shared gathering floor plate anchored by smaller, protected secondary alcoves and lowered ceiling pockets.'
    });
  }

  // Conflict 4: High Connectivity + High Clarity
  if (isHigh('connectivity') && isHigh('clarity')) {
    conflicts.push({
      conflict: 'HIGH CONNECTIVITY + HIGH CLARITY',
      resolution: 'Increase direct visual connections across levels while maintaining a single dominant circulation spine.'
    });
  }

  // Conflict 5: High Carved + High Hierarchy
  if (isHigh('carved') && isHigh('hierarchy')) {
    conflicts.push({
      conflict: 'HIGH CARVED + HIGH HIERARCHY',
      resolution: 'Subtract secondary spatial voids directly from a clearly readable primary vaulted mass.'
    });
  }

  // Conflict 6: High Rhythm + High Dynamic
  if (isHigh('rhythm') && isHigh('dynamic')) {
    conflicts.push({
      conflict: 'HIGH RHYTHM + HIGH DYNAMIC',
      resolution: 'Use repeated structural ribs whose spacing or orientation gradually transforms along the curving circulation route.'
    });
  }

  // Conflict 7: High Layered + High Clarity
  if (isHigh('layered') && isHigh('clarity')) {
    conflicts.push({
      conflict: 'HIGH LAYERED + HIGH CLARITY',
      resolution: 'Allow visual overlap between mezzanine plates while keeping the primary circulation path visually unobstructed.'
    });
  }

  // 2. Synthesize Architectural Strategy Steps based on Typology & Intent
  strategySteps.push(`Establish base spatial topology for ${typologyKey.replace(/_/g, ' ')}.`);

  if (isHigh('clarity')) {
    strategySteps.push('Create one legible primary circulation route from entrance to main destination.');
  }

  if (isHigh('intimacy') || typologyKey.includes('COMPRESSED')) {
    strategySteps.push('Introduce two compressed threshold conditions with lowered ceiling proportions before opening into larger volumes.');
  } else {
    strategySteps.push('Establish open vertical proportions for generous spatial scale.');
  }

  if (isHigh('dynamic')) {
    strategySteps.push('Curve the primary circulation route to produce changing vistas while avoiding unnecessary decision intersections.');
  }

  if (isHigh('porosity')) {
    strategySteps.push('Distribute strategic openings across structural partitions to maintain sightlines across levels.');
  } else {
    strategySteps.push('Maintain solid wall boundaries to emphasize enclosure and private zones.');
  }

  if (isHigh('carved')) {
    strategySteps.push('Carve double-height voids into the primary mass to reveal internal multi-level section conditions.');
  }

  if (isHigh('rhythm')) {
    strategySteps.push('Arrange structural rib modules at regular intervals along the main span.');
  }

  strategySteps.push('Use continuous Art Nouveau branching transitions where structural ribs merge with floor plates and datum supports.');

  return {
    typologyKey,
    primaryIntents: primaryIntents.map(s => s.toUpperCase()),
    highIntents: highIntents.map(s => s.toUpperCase()),
    conflicts,
    strategySteps,
    timestamp: new Date().toLocaleTimeString()
  };
}
