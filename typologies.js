/**
 * ============================================================================
 * TYPOLOGY ENGINE & SPATIAL TOPOLOGY GENERATOR
 * Contains definitions and topological graph generators for all 16 Typologies.
 * Generates nodes, edges, floor plates, voids, circulation routes, and spatial zones
 * BEFORE applying Art Nouveau form-finding curves.
 * ============================================================================
 */

const TYPOLOGIES = {
  // --------------------------------------------------------------------------
  // LOBBY
  // --------------------------------------------------------------------------
  VERTICAL_VOID: {
    name: 'Vertical Void',
    category: 'LOBBY',
    description: 'Vertical organization centered around a dominant continuous void space.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'VERTICAL_VOID',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.38, y2: datumY, name: 'Ground Entry' },
          { x1: w * 0.62, y1: datumY, x2: w * 0.9, y2: datumY, name: 'Ground Reception' },
          { x1: w * 0.1, y1: datumY - 100, x2: w * 0.35, y2: datumY - 100, name: 'Mezzanine West' },
          { x1: w * 0.65, y1: datumY - 120, x2: w * 0.9, y2: datumY - 120, name: 'Mezzanine East' }
        ],
        voids: [
          { cx: w * 0.5, cy: h * 0.45, rx: w * 0.18, ry: h * 0.28, name: 'Central Atrium Void' }
        ],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.35, y: datumY - 15 },
          { x: w * 0.48, y: datumY - 80 },
          { x: w * 0.68, y: datumY - 120 },
          { x: w * 0.88, y: datumY - 120 }
        ],
        decisionNodes: [
          { x: w * 0.35, y: datumY - 15, id: 1 },
          { x: w * 0.68, y: datumY - 120, id: 2 }
        ],
        focalNodes: [
          { x: w * 0.5, y: h * 0.35, name: 'Atrium Lightwell', connections: 4 }
        ],
        portals: [
          { x: w * 0.38, y: datumY - 30, w: 25, h: 45 },
          { x: w * 0.62, y: datumY - 30, w: 25, h: 45 }
        ]
      };
    }
  },

  COMPRESSED_SEQUENTIAL: {
    name: 'Compressed Sequential',
    category: 'LOBBY',
    description: 'Sequence of spatial compression -> threshold transition -> volume release.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'COMPRESSED_SEQUENTIAL',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.9, y2: datumY, name: 'Continuous Datum Plate' },
          { x1: w * 0.25, y1: datumY - 60, x2: w * 0.45, y2: datumY - 60, name: 'Low Threshold Ceiling' }
        ],
        voids: [
          { cx: w * 0.7, cy: h * 0.4, rx: w * 0.16, ry: h * 0.22, name: 'Release Dome Void' }
        ],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.3, y: datumY - 15 },
          { x: w * 0.5, y: datumY - 15 },
          { x: w * 0.72, y: datumY - 15 },
          { x: w * 0.88, y: datumY - 15 }
        ],
        decisionNodes: [
          { x: w * 0.3, y: datumY - 15, id: 1 },
          { x: w * 0.5, y: datumY - 15, id: 2 }
        ],
        focalNodes: [
          { x: w * 0.72, y: datumY - 90, name: 'Main Hall Volume', connections: 3 }
        ],
        portals: [
          { x: w * 0.25, y: datumY - 30, w: 20, h: 35 },
          { x: w * 0.55, y: datumY - 40, w: 35, h: 60 }
        ]
      };
    }
  },

  CONTINUOUS_HALL: {
    name: 'Continuous Hall',
    category: 'LOBBY',
    description: 'Dominant continuous horizontal volume with minimal interior subdivision.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'CONTINUOUS_HALL',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.9, y2: datumY, name: 'Great Hall Plate' }
        ],
        voids: [],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.5, y: datumY - 15 },
          { x: w * 0.88, y: datumY - 15 }
        ],
        decisionNodes: [
          { x: w * 0.5, y: datumY - 15, id: 1 }
        ],
        focalNodes: [
          { x: w * 0.5, y: h * 0.38, name: 'Central Vault Peak', connections: 2 }
        ],
        portals: [
          { x: w * 0.12, y: datumY - 35, w: 30, h: 50 },
          { x: w * 0.88, y: datumY - 35, w: 30, h: 50 }
        ]
      };
    }
  },

  TOPOGRAPHIC_GROUND: {
    name: 'Topographic / Ground-Field',
    category: 'LOBBY',
    description: 'Floor elevation and sectional stepping organize the spatial experience.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'TOPOGRAPHIC_GROUND',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.35, y2: datumY, name: 'Lower Entry Tier' },
          { x1: w * 0.35, y1: datumY - 30, x2: w * 0.65, y2: datumY - 30, name: 'Mid Terrace' },
          { x1: w * 0.65, y1: datumY - 65, x2: w * 0.9, y2: datumY - 65, name: 'Upper Podium' }
        ],
        voids: [
          { cx: w * 0.5, cy: h * 0.45, rx: w * 0.12, ry: h * 0.15, name: 'Step Void' }
        ],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.35, y: datumY - 30 },
          { x: w * 0.65, y: datumY - 65 },
          { x: w * 0.88, y: datumY - 80 }
        ],
        decisionNodes: [
          { x: w * 0.35, y: datumY - 30, id: 1 },
          { x: w * 0.65, y: datumY - 65, id: 2 }
        ],
        focalNodes: [
          { x: w * 0.65, y: datumY - 110, name: 'Podium Vista', connections: 3 }
        ],
        portals: [
          { x: w * 0.35, y: datumY - 45, w: 25, h: 40 },
          { x: w * 0.65, y: datumY - 80, w: 25, h: 40 }
        ]
      };
    }
  },

  LINEAR_GALLERY: {
    name: 'Linear Gallery',
    category: 'LOBBY',
    description: 'Strong directional sequence along an elongated spatial path.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'LINEAR_GALLERY',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.9, y2: datumY, name: 'Gallery Promenade Plate' }
        ],
        voids: [
          { cx: w * 0.3, cy: h * 0.42, rx: w * 0.08, ry: h * 0.15, name: 'Bay Void 1' },
          { cx: w * 0.7, cy: h * 0.42, rx: w * 0.08, ry: h * 0.15, name: 'Bay Void 2' }
        ],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.35, y: datumY - 15 },
          { x: w * 0.65, y: datumY - 15 },
          { x: w * 0.88, y: datumY - 15 }
        ],
        decisionNodes: [
          { x: w * 0.35, y: datumY - 15, id: 1 },
          { x: w * 0.65, y: datumY - 15, id: 2 }
        ],
        focalNodes: [
          { x: w * 0.88, y: datumY - 60, name: 'Terminal Destination', connections: 2 }
        ],
        portals: [
          { x: w * 0.35, y: datumY - 35, w: 20, h: 45 },
          { x: w * 0.65, y: datumY - 35, w: 20, h: 45 }
        ]
      };
    }
  },

  // --------------------------------------------------------------------------
  // WORKSPACE
  // --------------------------------------------------------------------------
  OPEN_HALL: {
    name: 'Open Hall',
    category: 'WORKSPACE',
    description: 'Large continuous occupiable workplace field.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'OPEN_HALL',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.9, y2: datumY, name: 'Open Work Floor' }
        ],
        voids: [],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.5, y: datumY - 15 },
          { x: w * 0.88, y: datumY - 15 }
        ],
        decisionNodes: [
          { x: w * 0.5, y: datumY - 15, id: 1 }
        ],
        focalNodes: [
          { x: w * 0.5, y: datumY - 70, name: 'Central Collaborative Hub', connections: 4 }
        ],
        portals: []
      };
    }
  },

  CASCADED_TERRACED: {
    name: 'Cascaded / Terraced',
    category: 'WORKSPACE',
    description: 'Multiple connected plates changing elevation in a stepped cascade.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'CASCADED_TERRACED',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.35, y2: datumY, name: 'Tier 1' },
          { x1: w * 0.32, y1: datumY - 45, x2: w * 0.65, y2: datumY - 45, name: 'Tier 2' },
          { x1: w * 0.62, y1: datumY - 90, x2: w * 0.9, y2: datumY - 90, name: 'Tier 3' }
        ],
        voids: [
          { cx: w * 0.48, cy: h * 0.45, rx: w * 0.1, ry: h * 0.18, name: 'Terrace Void' }
        ],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.33, y: datumY - 45 },
          { x: w * 0.63, y: datumY - 90 },
          { x: w * 0.88, y: datumY - 105 }
        ],
        decisionNodes: [
          { x: w * 0.33, y: datumY - 45, id: 1 },
          { x: w * 0.63, y: datumY - 90, id: 2 }
        ],
        focalNodes: [
          { x: w * 0.63, y: datumY - 130, name: 'Executive Overlook', connections: 3 }
        ],
        portals: [
          { x: w * 0.33, y: datumY - 60, w: 22, h: 35 },
          { x: w * 0.63, y: datumY - 105, w: 22, h: 35 }
        ]
      };
    }
  },

  FLAT_DEEP_PLAN: {
    name: 'Flat Deep-Plan Plate',
    category: 'WORKSPACE',
    description: 'Dominant horizontal plate with depth and distributed team zones.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'FLAT_DEEP_PLAN',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.9, y2: datumY, name: 'Deep Floor Plate' }
        ],
        voids: [
          { cx: w * 0.35, cy: h * 0.48, rx: w * 0.08, ry: h * 0.12, name: 'Court 1' },
          { cx: w * 0.65, cy: h * 0.48, rx: w * 0.08, ry: h * 0.12, name: 'Court 2' }
        ],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.35, y: datumY - 15 },
          { x: w * 0.65, y: datumY - 15 },
          { x: w * 0.88, y: datumY - 15 }
        ],
        decisionNodes: [
          { x: w * 0.35, y: datumY - 15, id: 1 },
          { x: w * 0.65, y: datumY - 15, id: 2 }
        ],
        focalNodes: [
          { x: w * 0.5, y: datumY - 60, name: 'Central Spine Node', connections: 3 }
        ],
        portals: []
      };
    }
  },

  VOID_EDGE: {
    name: 'Void-Edge Workspace',
    category: 'WORKSPACE',
    description: 'Occupied workspace zones organized around a dominant central void.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'VOID_EDGE',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.35, y2: datumY, name: 'West Wing' },
          { x1: w * 0.65, y1: datumY, x2: w * 0.9, y2: datumY, name: 'East Wing' },
          { x1: w * 0.1, y1: datumY - 110, x2: w * 0.38, y2: datumY - 110, name: 'Upper West' },
          { x1: w * 0.62, y1: datumY - 110, x2: w * 0.9, y2: datumY - 110, name: 'Upper East' }
        ],
        voids: [
          { cx: w * 0.5, cy: h * 0.45, rx: w * 0.16, ry: h * 0.25, name: 'Central Lightwell Void' }
        ],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.35, y: datumY - 15 },
          { x: w * 0.5, y: datumY - 120 },
          { x: w * 0.65, y: datumY - 15 },
          { x: w * 0.88, y: datumY - 15 }
        ],
        decisionNodes: [
          { x: w * 0.35, y: datumY - 15, id: 1 },
          { x: w * 0.65, y: datumY - 15, id: 2 }
        ],
        focalNodes: [
          { x: w * 0.5, y: h * 0.45, name: 'Lightwell Core', connections: 4 }
        ],
        portals: [
          { x: w * 0.35, y: datumY - 30, w: 25, h: 45 },
          { x: w * 0.65, y: datumY - 30, w: 25, h: 45 }
        ]
      };
    }
  },

  FOLDED_UNDULATED: {
    name: 'Folded / Undulated Surface',
    category: 'WORKSPACE',
    description: 'Continuous work surface changing elevation in fluid, undulating folds.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'FOLDED_UNDULATED',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.9, y2: datumY, name: 'Folded Base Surface' }
        ],
        voids: [
          { cx: w * 0.5, cy: h * 0.5, rx: w * 0.14, ry: h * 0.15, name: 'Fold Void' }
        ],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.35, y: datumY - 40 },
          { x: w * 0.65, y: datumY - 20 },
          { x: w * 0.88, y: datumY - 60 }
        ],
        decisionNodes: [
          { x: w * 0.35, y: datumY - 40, id: 1 },
          { x: w * 0.65, y: datumY - 20, id: 2 }
        ],
        focalNodes: [
          { x: w * 0.88, y: datumY - 90, name: 'Peak Work Platform', connections: 2 }
        ],
        portals: []
      };
    }
  },

  // --------------------------------------------------------------------------
  // GATHERING
  // --------------------------------------------------------------------------
  STEPPED: {
    name: 'Stepped Amphitheater',
    category: 'GATHERING',
    description: 'Gathering organized through sectional stepping and seating tiers.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'STEPPED',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.4, y2: datumY, name: 'Stage Area' },
          { x1: w * 0.42, y1: datumY - 25, x2: w * 0.55, y2: datumY - 25, name: 'Tier 1' },
          { x1: w * 0.57, y1: datumY - 50, x2: w * 0.7, y2: datumY - 50, name: 'Tier 2' },
          { x1: w * 0.72, y1: datumY - 75, x2: w * 0.9, y2: datumY - 75, name: 'Tier 3' }
        ],
        voids: [],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.4, y: datumY - 15 },
          { x: w * 0.72, y: datumY - 75 },
          { x: w * 0.88, y: datumY - 90 }
        ],
        decisionNodes: [
          { x: w * 0.4, y: datumY - 15, id: 1 }
        ],
        focalNodes: [
          { x: w * 0.25, y: datumY - 40, name: 'Stage Focus Point', connections: 5 }
        ],
        portals: []
      };
    }
  },

  VOID_GATHERING: {
    name: 'Void Gathering',
    category: 'GATHERING',
    description: 'Gathering organized within or around a central dominant void.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'VOID_GATHERING',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.9, y2: datumY, name: 'Ring Floor' }
        ],
        voids: [
          { cx: w * 0.5, cy: h * 0.42, rx: w * 0.2, ry: h * 0.25, name: 'Assembly Void' }
        ],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.5, y: datumY - 15 },
          { x: w * 0.88, y: datumY - 15 }
        ],
        decisionNodes: [
          { x: w * 0.5, y: datumY - 15, id: 1 }
        ],
        focalNodes: [
          { x: w * 0.5, y: h * 0.42, name: 'Central Void Hearth', connections: 4 }
        ],
        portals: []
      };
    }
  },

  INSERTED_PLATE: {
    name: 'Inserted Horizontal Plate',
    category: 'GATHERING',
    description: 'A distinct horizontal plate inserted within a larger spatial volume.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'INSERTED_PLATE',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.9, y2: datumY, name: 'Main Ground Volume' },
          { x1: w * 0.3, y1: datumY - 90, x2: w * 0.7, y2: datumY - 90, name: 'Inserted Floating Plate' }
        ],
        voids: [
          { cx: w * 0.2, cy: h * 0.45, rx: w * 0.08, ry: h * 0.18, name: 'West Void' },
          { cx: w * 0.8, cy: h * 0.45, rx: w * 0.08, ry: h * 0.18, name: 'East Void' }
        ],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.3, y: datumY - 90 },
          { x: w * 0.7, y: datumY - 90 },
          { x: w * 0.88, y: datumY - 15 }
        ],
        decisionNodes: [
          { x: w * 0.3, y: datumY - 90, id: 1 },
          { x: w * 0.7, y: datumY - 90, id: 2 }
        ],
        focalNodes: [
          { x: w * 0.5, y: datumY - 120, name: 'Inserted Lounge Core', connections: 3 }
        ],
        portals: [
          { x: w * 0.3, y: datumY - 45, w: 24, h: 40 },
          { x: w * 0.7, y: datumY - 45, w: 24, h: 40 }
        ]
      };
    }
  },

  ROOM_IN_VOLUME: {
    name: 'Room Within a Volume',
    category: 'GATHERING',
    description: 'Contained spatial enclosure nested inside a larger spatial field.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'ROOM_IN_VOLUME',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.9, y2: datumY, name: 'Outer Volume Plate' },
          { x1: w * 0.38, y1: datumY - 10, x2: w * 0.62, y2: datumY - 10, name: 'Nested Room Floor' }
        ],
        voids: [],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.38, y: datumY - 15 },
          { x: w * 0.62, y: datumY - 15 },
          { x: w * 0.88, y: datumY - 15 }
        ],
        decisionNodes: [
          { x: w * 0.38, y: datumY - 15, id: 1 },
          { x: w * 0.62, y: datumY - 15, id: 2 }
        ],
        focalNodes: [
          { x: w * 0.5, y: datumY - 60, name: 'Nested Enclosure Core', connections: 2 }
        ],
        portals: [
          { x: w * 0.38, y: datumY - 30, w: 20, h: 35 },
          { x: w * 0.62, y: datumY - 30, w: 20, h: 35 }
        ]
      };
    }
  },

  LINEAR_EDGE_GALLERY: {
    name: 'Linear Edge Gallery',
    category: 'GATHERING',
    description: 'Gathering spaces distributed along a directional linear edge.',
    generateTopology: (w, h, seed) => {
      const datumY = h * 0.82;
      return {
        type: 'LINEAR_EDGE_GALLERY',
        plates: [
          { x1: w * 0.1, y1: datumY, x2: w * 0.9, y2: datumY, name: 'Edge Promenade Plate' }
        ],
        voids: [
          { cx: w * 0.5, cy: h * 0.45, rx: w * 0.18, ry: h * 0.2, name: 'Edge Void' }
        ],
        circulation: [
          { x: w * 0.12, y: datumY - 15 },
          { x: w * 0.5, y: datumY - 15 },
          { x: w * 0.88, y: datumY - 15 }
        ],
        decisionNodes: [
          { x: w * 0.5, y: datumY - 15, id: 1 }
        ],
        focalNodes: [
          { x: w * 0.88, y: datumY - 60, name: 'Edge Gathering Node', connections: 2 }
        ],
        portals: []
      };
    }
  }
};
