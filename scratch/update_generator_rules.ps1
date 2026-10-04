$c = Get-Content 'generator.js' -Raw -Encoding UTF8

$markerStart = "let currentTypologyCategory = 'LOBBY';"
$markerEnd = "function validateTypologyGeometry(defPos, origPos, bounds, typologyKey) {"

$idxStart = $c.IndexOf($markerStart)
$idxEnd = $c.IndexOf($markerEnd)

if ($idxStart -lt 0 -or $idxEnd -lt 0) {
    Write-Error "Could not find markers: idxStart=$idxStart, idxEnd=$idxEnd"
    exit 1
}

$replacement = @'
let currentTypologyCategory = 'LOBBY';

const TYPOLOGY_DOMAIN_B_RULES = {
  VERTICAL_VOID: {
    C: {
      title: 'VERTICAL ATRIUM CONTINUITY (C)',
      qualitative: 'Draws vertical surface extensions connecting lower arrival levels to upper gallery levels around the perimeter of the vertical atrium shaft.',
      quantitative: 'Minimizes horizontal floor seams; pulls vertices vertically along atrium load-bearing wall boundaries.',
      tip: 'Slider: low = discrete separate levels; high = unified multi-storey vertical envelope.'
    },
    W: {
      title: 'UPWARD SHAFT WHIPLASH (W)',
      qualitative: 'Fluid Art Nouveau lines sweep upward (+Y) around the perimeter of the vertical void, drawing sightlines up the atrium shaft.',
      quantitative: 'Curvature vectors biased strongly in +Y; outward flare at base and crown around the open atrium core.',
      tip: 'Slider: low = gentle vertical rise; high = dramatic soaring curves flanking the open center.'
    },
    B: {
      title: 'PERIMETER ATRIUM BRANCHING (B)',
      qualitative: 'Structural rib branches hug perimeter boundary walls; central atrium void is kept strictly clear and unobstructed.',
      quantitative: 'Radial filter enforces 0 branches inside inner core (r < 0.28); outer ribs fan into ceiling arches.',
      tip: 'Slider: low = simple perimeter piers; high = dense perimeter flying ribs vaulting across upper levels.'
    }
  },
  COMPRESSED_SEQUENTIAL: {
    C: {
      title: 'CHOKE-RELEASE CONTINUITY (C)',
      qualitative: 'Smoothly bridges and welds the progressive transitions between narrow entry chambers and expanded double-height volumes.',
      quantitative: 'Blends consecutive spatial zones along the travel path, eliminating sudden sectional fractures.',
      tip: 'Slider: low = abrupt chamber thresholds; high = fluid serpentine spatial transitions.'
    },
    W: {
      title: 'CHOKE-RELEASE WHIPLASH (W)',
      qualitative: 'Controls curved transitions between narrow compression (choke) and sweeping expansion (release) along the arrival sequence.',
      quantitative: 'Sinusoidal section modulation: pinches width in throat zones, releases laterally in open chambers.',
      tip: 'Slider: low = subtle narrowing; high = extreme architectural compression followed by vast volumetric release.'
    },
    B: {
      title: 'PORTAL FRAME BRANCHING (B)',
      qualitative: 'Branches form structural portal arches that frame the choke thresholds, accentuating the sequential entrance experience.',
      quantitative: 'Concentrated branching nodes located at passage throat thresholds (uX = 0.33, 0.67).',
      tip: 'Slider: low = simple portal gateway; high = layered nested compression gateways.'
    }
  },
  CONTINUOUS_HALL: {
    C: {
      title: 'CONTINUOUS SHELL CONTINUITY (C)',
      qualitative: 'Merges and fuses all roof, wall, and ceiling plates into one unbroken, continuous horizontal Art Nouveau canopy.',
      quantitative: '100% surface fusion; internal division partitions are eliminated to preserve the boundless free plan.',
      tip: 'Slider: low = sectional roof segments; high = single continuous monolithic shell.'
    },
    W: {
      title: 'EXPANSIVE SHELL WHIPLASH (W)',
      qualitative: 'Sweeps outward and upward into a vast horizontal vault canopy overarching the entire hall footprint.',
      quantitative: 'Radial dome curvature spanning entire horizontal envelope (X and Z axes), keeping interior clear.',
      tip: 'Slider: low = shallow curvature; high = sweeping expansive shell vaults.'
    },
    B: {
      title: 'PERIMETER BUTTRESS BRANCHING (B)',
      qualitative: 'Branches lean outward around the perimeter as structural flying buttresses, leaving the central hall completely column-free.',
      quantitative: 'Interior column count = 0; branches pushed exclusively to outer perimeter envelope (rNorm >= 0.35).',
      tip: 'Slider: low = perimeter buttress piers; high = multi-tiered exterior flying arches.'
    }
  },
  TOPOGRAPHIC_GROUND: {
    C: {
      title: 'SLOPE CONTINUITY (C)',
      qualitative: 'Bridges stepped floor terraces into seamless, continuous walkable ramps and undulating topographical transitions.',
      quantitative: 'Eliminates sheer vertical drops by blending risers into gradual incline slopes (< 1:12).',
      tip: 'Slider: low = discrete stepped platforms; high = uninterrupted continuous walking terrain.'
    },
    W: {
      title: 'FLOOR TOPOGRAPHY WHIPLASH (W)',
      qualitative: 'Curves and sculpts the ground plane into flowing stepped contours, sloped landscape mounds, and undulating terraces.',
      quantitative: 'Displacement focused exclusively on lower geometry (uY < 0.65); upper roof remains calm and steady.',
      tip: 'Slider: low = gentle ground swells; high = dramatic terraced landscape contours.'
    },
    B: {
      title: 'GROUND DIVIDE BRANCHING (B)',
      qualitative: 'Branches form low landscape retaining curbs, sloped banks, and circulation dividers across the floor plane.',
      quantitative: 'Branch vertical height clamped near ground (yTop = yBot + 3.2 ft); branches partition pedestrian flow.',
      tip: 'Slider: low = low terrain edges; high = labyrinthine landscape retaining curbs.'
    }
  },
  LINEAR_GALLERY: {
    C: {
      title: 'AXIAL PATH CONTINUITY (C)',
      qualitative: 'Stretches and aligns all surfaces along the dominant longitudinal procession axis, creating an unbroken vista.',
      quantitative: 'Surfaces pulled into longitudinal alignment along X; lateral deviations consolidated into the axis.',
      tip: 'Slider: low = loosely aligned bays; high = strictly unified linear promenade.'
    },
    W: {
      title: 'AXIAL ENFILADE WHIPLASH (W)',
      qualitative: 'Creates a rhythmic longitudinal section wave along the dominant travel corridor, punctuating movement through space.',
      quantitative: 'Longitudinal sinusoidal wave (4 cycles along X); lateral spread kept tight to preserve gallery proportion.',
      tip: 'Slider: low = subtle sectional rhythm; high = pronounced rhythmic portal undulation.'
    },
    B: {
      title: 'SECONDARY AXIAL BRANCHING (B)',
      qualitative: 'Branches project laterally (+/- Z) from the main gallery spine, forming rhythmic side viewing alcoves and daylight bays.',
      quantitative: 'Lateral projections perpendicular to main spine; corridor width remains strictly preserved.',
      tip: 'Slider: low = shallow side niches; high = deep articulated exhibition alcoves.'
    }
  },
  OPEN_HALL: {
    C: {
      title: 'FIELD MERGE CONTINUITY (C)',
      qualitative: 'Eliminates interior seams and dividers, merging individual workspaces into an unbroken horizontal collective field.',
      quantitative: 'Harmonizes height datums into a single continuous working plane under one roof.',
      tip: 'Slider: low = compartmentalized zones; high = fully unified open work field.'
    },
    W: {
      title: 'HORIZONTAL UNDULATION WHIPLASH (W)',
      qualitative: 'Gentle horizontal roof undulation creating daylight billows while maintaining a completely flat, flexible floor.',
      quantitative: 'Roof undulates along X and Z; floor plane displacement is locked to 0.',
      tip: 'Slider: low = subtle roof waves; high = dynamic vaulted roof canopies.'
    },
    B: {
      title: 'PERIMETER ALCOVE BRANCHING (B)',
      qualitative: 'Branching forms quiet perimeter work alcoves and support ribs, keeping the vast central collaborative floor open.',
      quantitative: 'Branches restricted to outer 30% perimeter; central 70% floor remains completely open.',
      tip: 'Slider: low = perimeter pilasters; high = private focus nooks ringing the hall.'
    }
  },
  CASCADED_TERRACED: {
    C: {
      title: 'CASCADE FILLET CONTINUITY (C)',
      qualitative: 'Fillets riser faces to tread plates, transforming distinct stepped tiers into smooth, cascading architectural contours.',
      quantitative: 'Curved transitions bridge tier steps with smooth tangential fillets.',
      tip: 'Slider: low = sharp stepped edges; high = fluid waterfall cascades.'
    },
    W: {
      title: 'STEPPED RISER WHIPLASH (W)',
      qualitative: 'Sculpts natural stepped contour risers descending across the section, forming organic plate terraces.',
      quantitative: 'Sectional step function with Art Nouveau curved lip profiles on each terrace edge.',
      tip: 'Slider: low = flat horizontal plates; high = dynamic organic stepped plateaus.'
    },
    B: {
      title: 'TERRACE CANTILEVER BRANCHING (B)',
      qualitative: 'Branches project outward as cantilevered lookout balconies extending forward from intermediate tiers.',
      quantitative: 'Cantilever projections step down with section; branch count matches tier count.',
      tip: 'Slider: low = flush terrace edges; high = dramatic flying cantilever platforms.'
    }
  },
  FLAT_DEEP_PLAN: {
    C: {
      title: 'FLAT PLATE CONTINUITY (C)',
      qualitative: 'Enforces strict planar leveling across the entire floor plate, ensuring continuous commercial workspace.',
      quantitative: 'Vertical displacement locked to 0 on floor; continuity merges horizontal slab segments.',
      tip: 'Slider: low = segmented slabs; high = monolithic planar continuous floor.'
    },
    W: {
      title: 'CORE RIM WHIPLASH (W)',
      qualitative: 'Level floor is strictly preserved; fluid curvature acts entirely in-plane around service cores and daylight wells.',
      quantitative: 'Horizontal (X-Z) curvilinear boundary curves; dY = 0 ft.',
      tip: 'Slider: low = rectilinear cores; high = fluid organic light well boundaries.'
    },
    B: {
      title: 'RADIAL SPINE BRANCHING (B)',
      qualitative: 'Branches radiate outward from centralized vertical cores, organizing services and secondary circulation zones.',
      quantitative: 'Radial distribution centered on primary service cores.',
      tip: 'Slider: low = orthogonal distribution; high = organic radiating service spines.'
    }
  },
  VOID_EDGE: {
    C: {
      title: 'PERIMETER RING CONTINUITY (C)',
      qualitative: 'Closes annular ring surfaces into a seamless 360-degree ribbon wrapping around the central light well.',
      quantitative: 'Annular circumferential continuity; joins perimeter edge segments into a closed loop.',
      tip: 'Slider: low = segmented perimeter walkways; high = continuous circular ribbon.'
    },
    W: {
      title: 'VOID RIM SWEEP WHIPLASH (W)',
      qualitative: 'Sweeps dynamic fluid curvature along the perimeter ring of the central void, maximizing edge desk views.',
      quantitative: 'Radial weight function peaks at rim radius; curves modulate height and width along the ring.',
      tip: 'Slider: low = concentric circular edge; high = billowing organic void balustrade.'
    },
    B: {
      title: 'OUTWARD BAY BRANCHING (B)',
      qualitative: 'Workstation bays branch radially outward away from the void edge, creating semi-private team pods facing views.',
      quantitative: 'Branches project outward from rim toward outer facade.',
      tip: 'Slider: low = shallow desk alcoves; high = deep finger pods radiating outward.'
    }
  },
  FOLDED_UNDULATED: {
    C: {
      title: 'CREASE FACET CONTINUITY (C)',
      qualitative: 'Aligns origami creases into continuous diagonal ridges, unifying multi-faceted faceted plates.',
      quantitative: 'Diagonal crease continuity connecting high and low fold points across the space.',
      tip: 'Slider: low = faceted disjointed plates; high = continuous undulating ribbon.'
    },
    W: {
      title: 'ORIGAMI PLEAT WHIPLASH (W)',
      qualitative: 'Creates dynamic origami accordion pleating and 3D sinusoidal ramps that alternate up and down.',
      quantitative: 'Bivariate sinusoidal wave (5 cycles along X, 2 cycles along Z) with sharp crests and soft valleys.',
      tip: 'Slider: low = gentle rolls; high = dramatic angular pleats and folded peaks.'
    },
    B: {
      title: 'CREST NOOK BRANCHING (B)',
      qualitative: 'Work nooks and meeting niches branch along fold crests and valleys, utilizing topography for acoustic isolation.',
      quantitative: 'Branches sprout from high ridges (+Y) and nestle into low folds (-Y).',
      tip: 'Slider: low = simple fold ribs; high = articulated nooks embedded in folds.'
    }
  },
  STEPPED_AMPHITHEATER: {
    C: {
      title: 'CIRCULATION STEPS CONTINUITY (C)',
      qualitative: 'Connects radial aisles and circular seating tiers into a unified, continuous acoustic bowl geometry.',
      quantitative: 'Smooths connections between transverse aisles and circumferential seating steps.',
      tip: 'Slider: low = separated stair blocks; high = unified monolithic bowl.'
    },
    W: {
      title: 'ACOUSTIC BOWL WHIPLASH (W)',
      qualitative: 'Forms a concave acoustic bowl curvature with seating risers focusing directly on the presentation stage.',
      quantitative: 'Radial focal depression centered at stage point; parabolic curve ascends outward.',
      tip: 'Slider: low = shallow rake; high = dramatic steep amphitheater bowl.'
    },
    B: {
      title: 'RADIAL AISLE BRANCHING (B)',
      qualitative: 'Radial aisle steps and vomitory entrances branch through the seating bowl, organizing audience circulation.',
      quantitative: '5 radial vomitory aisles slicing symmetrically through seating tiers.',
      tip: 'Slider: low = single central stair; high = 5 articulated radial aisles and portal entries.'
    }
  },
  VOID_FIELD_GATHERING: {
    C: {
      title: 'CONVERGING PATHS CONTINUITY (C)',
      qualitative: 'Blends multiple converging floor spokes into a unified central gathering crossroads beneath a towering void.',
      quantitative: 'Radial path convergence merging at central civic node.',
      tip: 'Slider: low = crisscrossing floor paths; high = unified civic plaza floor.'
    },
    W: {
      title: 'SOARING VAULT RIBS WHIPLASH (W)',
      qualitative: 'Slender vertical ribs spring from ground crossroads and fan upward into organic vault canopies over the gathering.',
      quantitative: 'Vertical parabolic curvature fanning outward near ceiling.',
      tip: 'Slider: low = modest column shafts; high = soaring fanned vault canopies.'
    },
    B: {
      title: 'MEETING CLUSTER BRANCHING (B)',
      qualitative: 'Circular seating and meeting clusters branch at path crossroads, creating intimate gathering pockets in the vast hall.',
      quantitative: 'Radial cluster nodes positioned at circulation junctures.',
      tip: 'Slider: low = open crossroads; high = articulated gathering pods with integrated seating.'
    }
  },
  INSERTED_PLATE: {
    C: {
      title: 'SUSPENSION LINK CONTINUITY (C)',
      qualitative: 'Draws structural tensile lines and fluid connections linking the suspended mezzanine to the parent shell.',
      quantitative: 'Vertical tensile connections merging platform slab to upper primary structure.',
      tip: 'Slider: low = isolated floating plate; high = organically hung mezzanine.'
    },
    W: {
      title: 'MEZZANINE CRADLE WHIPLASH (W)',
      qualitative: 'Sculpts organic curved hull ribs that cradle the suspended platform floating mid-height within the volume.',
      quantitative: 'Catenary cradle curves supporting intermediate horizontal plate (y = 0.5 spanY).',
      tip: 'Slider: low = planar floating slab; high = organic curved hull cradle.'
    },
    B: {
      title: 'PYLON SUPPORT BRANCHING (B)',
      qualitative: 'Organic structural pylons branch upward from ground and downward from ceiling to cradle the inserted plate.',
      quantitative: 'Tree-like branching pylons supporting intermediate plate corners.',
      tip: 'Slider: low = vertical hanger rods; high = branching organic structural cradles.'
    }
  },
  CONTAINED_ROOM: {
    C: {
      title: 'POD ENCLOSURE CONTINUITY (C)',
      qualitative: 'Welds and seals pod shell seams into an unbroken, acoustically isolated organic room capsule.',
      quantitative: 'Enclosure shell closure; eliminates exterior air gaps to create a distinct room-within-a-room.',
      tip: 'Slider: low = open louvered pavilion; high = fully sealed organic cocoon.'
    },
    W: {
      title: 'COCOON POD WHIPLASH (W)',
      qualitative: 'Shapes a bulbous, organic cocoon vessel enclosed inside the larger hall volume for intimate gatherings.',
      quantitative: 'Spherical/ellipsoidal contraction and flaring creating an enclosed room pod volume.',
      tip: 'Slider: low = open curved screen; high = complete bulbous cocoon capsule.'
    },
    B: {
      title: 'SCREEN LOUVER BRANCHING (B)',
      qualitative: 'Branches wrap around the pod as decorative and structural screen louvers, modulating light and privacy.',
      quantitative: 'Circumferential rib cage branching encircling the pod volume.',
      tip: 'Slider: low = simple framing ribs; high = intricate Art Nouveau privacy brise-soleil.'
    }
  },
  LINEAR_EDGE_GALLERY: {
    C: {
      title: 'GALLERY PROMENADE CONTINUITY (C)',
      qualitative: 'Smooths the overlook ribbon into an uninterrupted linear promenade along the building perimeter.',
      quantitative: 'Continuous edge curve joining intermediate viewing bays into one seamless walkway.',
      tip: 'Slider: low = segmented balconies; high = uninterrupted continuous promenade.'
    },
    W: {
      title: 'BALUSTRADE RIBBON WHIPLASH (W)',
      qualitative: 'Sweeps an elongated Art Nouveau overlook balustrade along the building perimeter edge.',
      quantitative: 'Longitudinal edge undulation with continuous railing and cantilevers.',
      tip: 'Slider: low = straight perimeter edge; high = sweeping sinusoidal overlook balconies.'
    },
    B: {
      title: 'OUTLOOK PROW BRANCHING (B)',
      qualitative: 'Branches extend forward beyond the facade as dramatic outlook prows cantilevering over the view.',
      quantitative: 'Cantilevered lookout pods projecting outward from the linear gallery edge.',
      tip: 'Slider: low = subtle balcony swell; high = dramatic flying lookout prows.'
    }
  }
};
window.TYPOLOGY_DOMAIN_B_RULES = TYPOLOGY_DOMAIN_B_RULES;

function selectDomainATypology(typologyKey) {
  onTypologySelectionChanged(typologyKey);
}
window.selectDomainATypology = selectDomainATypology;

function onTypologySelectionChanged(typologyKey) {
  const typo = BASE_TYPOLOGIES[typologyKey] || BASE_TYPOLOGIES.VERTICAL_VOID;
  domainState.selectedTypology = typo.id;
  currentTypologyCategory = typo.category;

  // Domain A Rule Card Elements
  const titleA = document.getElementById('domain-a-selected-title');
  if (titleA) titleA.textContent = typo.name.toUpperCase();

  const badgeA = document.getElementById('domain-a-selected-badge');
  if (badgeA) badgeA.textContent = typo.category;

  const descA = document.getElementById('domain-a-desc-text');
  if (descA) descA.textContent = typo.description;

  const ruleA = document.getElementById('domain-a-spatial-rule');
  if (ruleA) ruleA.textContent = typo.spatialRule;

  const prinA = document.getElementById('domain-a-principles-badge');
  if (prinA) prinA.textContent = typo.principlesBadge;

  const geomA = document.getElementById('domain-a-geom-action');
  if (geomA) geomA.textContent = typo.baseGeometryAction;

  // Domain B Active Typology Banner
  const seedNameB = document.getElementById('domain-b-active-seed-name');
  if (seedNameB) seedNameB.textContent = `${typo.name} (${typo.category})`;

  // Domain C readout
  const cTypoEl = document.getElementById('c-readout-typology');
  if (cTypoEl) cTypoEl.textContent = typo.name;

  const cPrincipleEl = document.getElementById('c-readout-principle');
  if (cPrincipleEl) cPrincipleEl.textContent = PRINCIPLE_NAMES[typo.dominantPrinciple] || typo.dominantPrinciple;

  // Sync active pill in Domain A dropdown tabs
  document.querySelectorAll('.domain-a-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === typo.id);
  });

  const hiddenInput = document.getElementById('select-base-typology');
  if (hiddenInput) hiddenInput.value = typo.id;

  const catTag = document.getElementById('domain-a-category-tag');
  if (catTag) catTag.textContent = typo.category;

  // Domain B Typology Geometric Influence banner
  const bTitle = document.getElementById('domain-b-influence-title');
  if (bTitle) bTitle.textContent = typo.name.toUpperCase();

  const bCat = document.getElementById('domain-b-influence-cat');
  if (bCat) bCat.textContent = typo.category;

  const bGoal = document.getElementById('domain-b-influence-goal');
  if (bGoal) bGoal.textContent = typo.spatialGoal || typo.description;

  const bRationale = document.getElementById('domain-b-influence-rationale');
  if (bRationale) bRationale.textContent = typo.rulesSummary || typo.spatialLimits?.limitRationale || typo.description;

  const bResult = document.getElementById('domain-b-influence-result');
  if (bResult) bResult.textContent = typo.expectedResult || '';

  const bRule = document.getElementById('domain-b-influence-rule');
  if (bRule) bRule.textContent = typo.spatialRule;

  const bStatus = document.getElementById('domain-b-influence-status');
  const dna = domainState.dna || [0,0,0,0,0,0];
  const isEngaged = (dna[0] > 0 || dna[1] > 0 || dna[2] > 0);
  if (bStatus) {
    bStatus.textContent = isEngaged ? `ACTIVE — ${typo.name.toUpperCase()} RULES` : 'READY — MODIFY SLIDERS TO ACTIVATE';
  }

  // Update Dynamic Rule Definitions for the 3 Domain B Sliders
  const typoRules = TYPOLOGY_DOMAIN_B_RULES[typo.id] || TYPOLOGY_DOMAIN_B_RULES.VERTICAL_VOID;
  if (typoRules) {
    // Continuity
    const tC = document.getElementById('title-dna-c'); if (tC) tC.textContent = typoRules.C.title;
    const qC = document.getElementById('def-dna-c-qual'); if (qC) qC.textContent = typoRules.C.qualitative;
    const nC = document.getElementById('def-dna-c-quant'); if (nC) nC.textContent = typoRules.C.quantitative;
    const iC = document.getElementById('def-dna-c-tip'); if (iC) iC.textContent = typoRules.C.tip;

    // Whiplash
    const tW = document.getElementById('title-dna-w'); if (tW) tW.textContent = typoRules.W.title;
    const qW = document.getElementById('def-dna-w-qual'); if (qW) qW.textContent = typoRules.W.qualitative;
    const nW = document.getElementById('def-dna-w-quant'); if (nW) nW.textContent = typoRules.W.quantitative;
    const iW = document.getElementById('def-dna-w-tip'); if (iW) iW.textContent = typoRules.W.tip;

    // Branching
    const tB = document.getElementById('title-dna-b'); if (tB) tB.textContent = typoRules.B.title;
    const qB = document.getElementById('def-dna-b-qual'); if (qB) qB.textContent = typoRules.B.qualitative;
    const nB = document.getElementById('def-dna-b-quant'); if (nB) nB.textContent = typoRules.B.quantitative;
    const iB = document.getElementById('def-dna-b-tip'); if (iB) iB.textContent = typoRules.B.tip;
  }

  // Update suggested target limits indicators in Domain B
  const sLimits = typo.spatialLimits?.sliderLimits || {
    W: [0, 100], C: [0, 100], B: [0, 100], M: [0, 100], V: [0, 100], G: [0, 100]
  };
  domainState.activeTypologyLimits = typo.spatialLimits;

  const sliderKeys = [
    { code: 'C', id: 'slider-dna-c', limitId: 'limit-dna-c', dnaIdx: 0 },
    { code: 'W', id: 'slider-dna-w', limitId: 'limit-dna-w', dnaIdx: 2 },
    { code: 'B', id: 'slider-dna-b', limitId: 'limit-dna-b', dnaIdx: 1 },
    { code: 'M', id: 'slider-dna-m', limitId: 'limit-dna-m', dnaIdx: 3 },
    { code: 'V', id: 'slider-dna-v', limitId: 'limit-dna-v', dnaIdx: 4 },
    { code: 'G', id: 'slider-dna-g', limitId: 'limit-dna-g', dnaIdx: 5 }
  ];

  sliderKeys.forEach(item => {
    const limits = sLimits[item.code] || [0, 100];
    const lEl = document.getElementById(item.limitId);
    if (lEl) {
      lEl.textContent = `[${limits[0]}–${limits[1]}%]`;
    }
  });

  // Store starting conditions for the next generated iteration
  domainState.pendingTypologyParams = {
    typologyId: typo.id,
    baseDna: [...typo.baseDna],
    dominantPrinciple: typo.dominantPrinciple,
    secondaryPrinciples: [...typo.secondaryPrinciples],
    spatialLimits: typo.spatialLimits,
    typologyProfile: typo.typologyProfile,
    spatialGrammar: typo.spatialGrammar
  };
}
window.onTypologySelectionChanged = onTypologySelectionChanged;

/**
 * ACTIVATE / APPLY TYPOLOGY RULES IN DOMAIN B
 * Directly engages the currently selected Domain A Typology's rules in Domain B.
 * If sliders are currently 0%, sets them to the typology's baseline parameters.
 * If sliders already have values, re-evaluates the geometry under the active typology.
 */
function activateDomainBRules(forceBaseline = false) {
  const typoKey = (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID';
  const typo = BASE_TYPOLOGIES[typoKey] || BASE_TYPOLOGIES.VERTICAL_VOID;
  const currentDna = (window.domainState && window.domainState.dna) || [0,0,0,0,0,0];

  const allZero = (currentDna[0] <= 0.001 && currentDna[1] <= 0.001 && currentDna[2] <= 0.001);

  if (allZero && forceBaseline && typo.baseDna) {
    // Set 3 primary sliders to typology recommended baseline
    const cVal = Math.round((typo.baseDna[0] || 0.70) * 100);
    const bVal = Math.round((typo.baseDna[1] || 0.25) * 100);
    const wVal = Math.round((typo.baseDna[2] || 0.70) * 100);

    const sC = document.getElementById('slider-dna-c'); if (sC) sC.value = cVal;
    const sB = document.getElementById('slider-dna-b'); if (sB) sB.value = bVal;
    const sW = document.getElementById('slider-dna-w'); if (sW) sW.value = wVal;

    domainState.dna[0] = cVal / 100.0;
    domainState.dna[1] = bVal / 100.0;
    domainState.dna[2] = wVal / 100.0;
  }

  if (typeof window.switchVisualComparisonMode === 'function') {
    window.switchVisualComparisonMode('ITERATION');
  } else {
    window.activeVisualCompMode = 'ITERATION';
    domainState.visualComparisonMode = 'ITERATION';
  }

  const bStatus = document.getElementById('domain-b-influence-status');
  if (bStatus) bStatus.textContent = `ACTIVE — ${typo.name.toUpperCase()} RULES APPLIED`;

  updateDnaUIAndViewport();
}
window.activateDomainBRules = activateDomainBRules;

'@

$newCode = $c.Substring(0, $idxStart) + $replacement + $c.Substring($idxEnd)
Set-Content 'generator.js' -Value $newCode -Encoding UTF8
Write-Output "Successfully updated generator.js with TYPOLOGY_DOMAIN_B_RULES and activateDomainBRules!"
