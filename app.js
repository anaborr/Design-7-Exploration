/**
 * ARCHITECTURAL MORPHOGENESIS LABORATORY — DESIGN-7-EXPLORATION
 * Agent-based Voronoi Emergent System for Architectural Organization
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. STATE & CONFIGURATION
  // =========================================================================
  const state = {
    // Simulation
    running: true,
    iteration: 0,
    timeStep: 1,

    // Visualization mode: 'agents' | 'behavior' | 'voronoi' | 'spatial' | 'architecture' | 'all'
    viewMode: 'architecture',

    // Interaction tool: 'select' | 'add-attractor' | 'add-repulsor' | 'edit-site'
    activeTool: 'select',

    // Layers visibility
    layers: {
      site: true,
      agents: true,
      trails: true,
      voronoi: true,
      forces: true,
      programs: true,
      walls: true,
      circulation: true,
      labels: true,
    },

    // Parameters
    params: {
      agentCount: 120,
      speed: 1.8,
      randomness: 0.25,
      influenceRadius: 75,

      // Forces
      attractionEnabled: true,
      attractionStrength: 1.2,
      repulsionEnabled: true,
      repulsionStrength: 1.5,
      separationEnabled: true,
      separationStrength: 1.4,
      alignmentEnabled: true,
      alignmentStrength: 0.6,
      boundaryEnabled: true,
      boundaryStrength: 1.8,

      // Architectural translation
      wallThickness: 3.0,
      openingThreshold: 0.45,
      publicThreshold: 0.50,
      circulationInfluence: 0.70,

      // Feedback Loop
      feedbackEnabled: true,
      feedbackStrength: 0.8,
    },

    // Geometry & Entities
    sitePolygon: [], // [{x, y}, ...]
    agents: [],
    attractors: [],
    repulsors: [],
    cells: [], // computed Voronoi cells with architectural properties
    circulationSpines: [],

    // Viewport Transform (Pan & Zoom)
    view: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      isPanning: false,
      panStartX: 0,
      panStartY: 0,
    },

    // Dragging & Interaction
    draggedEntity: null, // { type: 'force' | 'site-vertex', item, index }
    hoveredEntity: null,

    // Telemetry
    stats: {
      avgArea: 0,
      densityVariance: 0,
      flux: 0,
      progDist: { public: 25, studio: 35, private: 25, service: 15 },
    },

    // Saved snapshots
    snapshots: [],
  };

  // Canvas and contexts
  let canvas, ctx;
  let animFrameId = null;

  // =========================================================================
  // 2. VECTOR & POLYGON GEOMETRY UTILITIES
  // =========================================================================
  const Vec = {
    distSq: (p1, p2) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2,
    dist: (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y),
    len: (v) => Math.hypot(v.x, v.y),
    normalize: (v) => {
      const l = Math.hypot(v.x, v.y);
      return l > 1e-6 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
    },
    clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
    centroid: (pts) => {
      if (!pts || pts.length === 0) return { x: 0, y: 0 };
      let cx = 0, cy = 0;
      for (const p of pts) { cx += p.x; cy += p.y; }
      return { x: cx / pts.length, y: cy / pts.length };
    },
    polygonArea: (pts) => {
      if (!pts || pts.length < 3) return 0;
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      }
      return Math.abs(area) * 0.5;
    },
    pointInPolygon: (pt, poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
          (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    },
    distToSegment: (p, v, w) => {
      const l2 = Vec.distSq(v, w);
      if (l2 === 0) return { dist: Vec.dist(p, v), closest: { x: v.x, y: v.y } };
      let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      const closest = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
      return { dist: Vec.dist(p, closest), closest };
    },
  };

  /**
   * Sutherland-Hodgman Polygon Clipper
   * Clips subject polygon against convex half planes of clip polygon
   */
  function clipPolygon(subjectPoly, clipPoly) {
    let outputList = subjectPoly.map(p => ({ x: p.x, y: p.y }));

    for (let i = 0; i < clipPoly.length; i++) {
      const cp1 = clipPoly[i];
      const cp2 = clipPoly[(i + 1) % clipPoly.length];
      const inputList = outputList;
      outputList = [];
      if (inputList.length === 0) break;

      let s = inputList[inputList.length - 1];
      for (let j = 0; j < inputList.length; j++) {
        const e = inputList[j];
        if (isInside(e, cp1, cp2)) {
          if (isInside(s, cp1, cp2)) {
            outputList.push(e);
          } else {
            outputList.push(intersection(s, e, cp1, cp2));
            outputList.push(e);
          }
        } else if (isInside(s, cp1, cp2)) {
          outputList.push(intersection(s, e, cp1, cp2));
        }
        s = e;
      }
    }
    return outputList;

    function isInside(p, cp1, cp2) {
      return (cp2.x - cp1.x) * (p.y - cp1.y) - (cp2.y - cp1.y) * (p.x - cp1.x) <= 0;
    }

    function intersection(p1, p2, cp1, cp2) {
      const A1 = p2.y - p1.y;
      const B1 = p1.x - p2.x;
      const C1 = A1 * p1.x + B1 * p1.y;
      const A2 = cp2.y - cp1.y;
      const B2 = cp1.x - cp2.x;
      const C2 = A2 * cp1.x + B2 * cp1.y;
      const det = A1 * B2 - A2 * B1;
      if (Math.abs(det) < 1e-8) return { x: p1.x, y: p1.y };
      return {
        x: (B2 * C1 - B1 * C2) / det,
        y: (A1 * C2 - A2 * C1) / det,
      };
    }
  }

  // =========================================================================
  // 3. AGENT MODEL & BEHAVIOR
  // =========================================================================
  class Agent {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.5 + Math.random() * 0.8) * state.params.speed;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.ax = 0;
      this.ay = 0;
      this.wanderAngle = angle;
      this.trail = [{ x, y }];
      this.trafficScore = 0.5; // smoothed movement activity
      this.assignedCell = null;
    }

    applyForce(fx, fy) {
      this.ax += fx;
      this.ay += fy;
    }

    update(boundsPoly) {
      // Apply velocity
      this.vx += this.ax;
      this.vy += this.ay;

      // Limit speed
      const speed = Math.hypot(this.vx, this.vy);
      const maxSpd = state.params.speed * 1.5;
      if (speed > maxSpd) {
        this.vx = (this.vx / speed) * maxSpd;
        this.vy = (this.vy / speed) * maxSpd;
      }

      this.x += this.vx;
      this.y += this.vy;

      // Reset accelerations
      this.ax = 0;
      this.ay = 0;

      // Update trail & traffic
      const displacement = Math.hypot(this.vx, this.vy);
      this.trafficScore = this.trafficScore * 0.96 + displacement * 0.04;

      if (state.iteration % 2 === 0) {
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 24) {
          this.trail.shift();
        }
      }

      // Hard containment safeguard inside site polygon
      if (!Vec.pointInPolygon(this, boundsPoly)) {
        // Find closest edge and project inside
        let minDist = Infinity;
        let closestPoint = null;
        for (let i = 0; i < boundsPoly.length; i++) {
          const p1 = boundsPoly[i];
          const p2 = boundsPoly[(i + 1) % boundsPoly.length];
          const seg = Vec.distToSegment(this, p1, p2);
          if (seg.dist < minDist) {
            minDist = seg.dist;
            closestPoint = seg.closest;
          }
        }
        if (closestPoint) {
          const center = Vec.centroid(boundsPoly);
          const dir = Vec.normalize({ x: center.x - closestPoint.x, y: center.y - closestPoint.y });
          this.x = closestPoint.x + dir.x * 6;
          this.y = closestPoint.y + dir.y * 6;
          this.vx = dir.x * state.params.speed * 0.5;
          this.vy = dir.y * state.params.speed * 0.5;
        }
      }
    }
  }

  // =========================================================================
  // 4. SIMULATION FORCES & FEEDBACK ENGINE
  // =========================================================================
  function calculateForces() {
    const { params, sitePolygon, attractors, repulsors, agents } = state;
    const center = Vec.centroid(sitePolygon);

    // Spatial hash for efficient neighbor lookups
    const cellSize = params.influenceRadius;
    const grid = new Map();

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const gx = Math.floor(a.x / cellSize);
      const gy = Math.floor(a.y / cellSize);
      const key = `${gx},${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];

      // --- 1. ATTRACTOR FORCE ---
      if (params.attractionEnabled && attractors.length > 0) {
        for (const attr of attractors) {
          const dx = attr.x - a.x;
          const dy = attr.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 5 && d < attr.radius) {
            const force = (1 - d / attr.radius) * attr.strength * params.attractionStrength * 0.04;
            a.applyForce((dx / d) * force, (dy / d) * force);
          }
        }
      }

      // --- 2. REPULSOR FORCE ---
      if (params.repulsionEnabled && repulsors.length > 0) {
        for (const rep of repulsors) {
          const dx = a.x - rep.x;
          const dy = a.y - rep.y;
          const d = Math.hypot(dx, dy);
          if (d > 1 && d < rep.radius) {
            const force = ((rep.radius - d) / rep.radius) * rep.strength * params.repulsionStrength * 0.08;
            a.applyForce((dx / d) * force, (dy / d) * force);
          }
        }
      }

      // --- 3. SEPARATION & ALIGNMENT (Local Neighbors) ---
      const gx = Math.floor(a.x / cellSize);
      const gy = Math.floor(a.y / cellSize);
      let sepX = 0, sepY = 0, sepCount = 0;
      let alignX = 0, alignY = 0, alignCount = 0;

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(`${gx + ox},${gy + oy}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (i === j) continue;
            const other = agents[j];
            const dx = a.x - other.x;
            const dy = a.y - other.y;
            const d = Math.hypot(dx, dy);

            // Separation (closer range)
            const sepDist = params.influenceRadius * 0.55;
            if (params.separationEnabled && d > 0 && d < sepDist) {
              const str = (1 - d / sepDist) / Math.max(d, 1);
              sepX += dx * str;
              sepY += dy * str;
              sepCount++;
            }

            // Alignment (full influence radius)
            if (params.alignmentEnabled && d > 0 && d < params.influenceRadius) {
              alignX += other.vx;
              alignY += other.vy;
              alignCount++;
            }
          }
        }
      }

      if (sepCount > 0) {
        const f = params.separationStrength * 0.35;
        a.applyForce(sepX * f, sepY * f);
      }

      if (alignCount > 0) {
        const avgVx = alignX / alignCount;
        const avgVy = alignY / alignCount;
        const steerX = (avgVx - a.vx) * params.alignmentStrength * 0.06;
        const steerY = (avgVy - a.vy) * params.alignmentStrength * 0.06;
        a.applyForce(steerX, steerY);
      }

      // --- 4. BOUNDARY AVOIDANCE FORCE ---
      if (params.boundaryEnabled) {
        const buffer = 45;
        for (let k = 0; k < sitePolygon.length; k++) {
          const p1 = sitePolygon[k];
          const p2 = sitePolygon[(k + 1) % sitePolygon.length];
          const { dist, closest } = Vec.distToSegment(a, p1, p2);
          if (dist < buffer) {
            const pushDir = Vec.normalize({ x: a.x - closest.x, y: a.y - closest.y });
            const pushMag = ((buffer - dist) / buffer) ** 1.5 * params.boundaryStrength * 0.25;
            a.applyForce(pushDir.x * pushMag, pushDir.y * pushMag);
          }
        }
      }

      // --- 5. CONTROLLED WANDER / RANDOMNESS ---
      if (params.randomness > 0.01) {
        a.wanderAngle += (Math.random() - 0.5) * 0.8 * params.randomness;
        const wx = Math.cos(a.wanderAngle) * params.randomness * 0.25;
        const wy = Math.sin(a.wanderAngle) * params.randomness * 0.25;
        a.applyForce(wx, wy);
      }

      // --- 6. ARCHITECTURAL FEEDBACK LOOP ---
      // Architecture guides movement:
      // Agents gravitate toward expansive public cells & along active circulation axes,
      // while feeling repulsive resistance from compact, enclosed service/cellular walls.
      if (params.feedbackEnabled && a.assignedCell) {
        const cell = a.assignedCell;
        const fbStr = params.feedbackStrength * 0.08;

        if (cell.type === 'public') {
          // Public plaza: gentle expansive drift toward cell interior
          const toCentroid = Vec.normalize({ x: cell.centroid.x - a.x, y: cell.centroid.y - a.y });
          a.applyForce(toCentroid.x * fbStr * 0.5, toCentroid.y * fbStr * 0.5);
        } else if (cell.type === 'service') {
          // Service/dense: push out toward shared openings / adjacent cells
          const outward = Vec.normalize({ x: a.x - cell.centroid.x, y: a.y - cell.centroid.y });
          a.applyForce(outward.x * fbStr * 0.8, outward.y * fbStr * 0.8);
        }

        // Align with detected circulation direction if nearby
        if (cell.circulationVector) {
          a.applyForce(cell.circulationVector.x * fbStr * 0.6, cell.circulationVector.y * fbStr * 0.6);
        }
      }
    }
  }

  // =========================================================================
  // 5. VORONOI TESSELLATION & ARCHITECTURAL TRANSLATION
  // =========================================================================
  function computeVoronoiAndArchitecture() {
    const { agents, sitePolygon, params } = state;
    if (agents.length < 3 || sitePolygon.length < 3) return;

    // Site bounding box for initial Voronoi clipping bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of sitePolygon) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = 80;
    const bounds = [minX - pad, minY - pad, maxX + pad, maxY + pad];

    // Compute Voronoi with d3-delaunay
    const points = agents.map(a => [a.x, a.y]);
    let delaunay, voronoi;
    try {
      delaunay = d3.Delaunay.from(points);
      voronoi = delaunay.voronoi(bounds);
    } catch (e) {
      console.warn("Voronoi error:", e);
      return;
    }

    const computedCells = [];
    let totalArea = 0;

    // First pass: extract clipped polygon for each agent
    for (let i = 0; i < agents.length; i++) {
      const rawPoly = voronoi.cellPolygon(i);
      let polygon = [];
      if (rawPoly && rawPoly.length >= 3) {
        const polyPts = rawPoly.map(pt => ({ x: pt[0], y: pt[1] }));
        polygon = clipPolygon(polyPts, sitePolygon);
      }

      const area = Vec.polygonArea(polygon);
      totalArea += area;
      const centroid = Vec.centroid(polygon);

      computedCells.push({
        agentIndex: i,
        agent: agents[i],
        polygon,
        area,
        centroid,
        perimeter: calculatePerimeter(polygon),
        neighbors: Array.from(delaunay.neighbors(i)),
        walls: [],
        openings: [],
        type: 'studio', // default
        typeName: 'ACTIVE STUDIO',
      });
    }

    const meanArea = totalArea / Math.max(1, computedCells.length);
    state.stats.avgArea = Math.round(meanArea);

    // Compute area variance (density indicator)
    let varianceSum = 0;
    for (const c of computedCells) {
      varianceSum += (c.area - meanArea) ** 2;
    }
    state.stats.densityVariance = Number((Math.sqrt(varianceSum / computedCells.length) / Math.max(1, meanArea)).toFixed(2));

    // Second pass: Architectural Classification & Wall Geometry
    let countPublic = 0, countStudio = 0, countPrivate = 0, countService = 0;

    for (let i = 0; i < computedCells.length; i++) {
      const cell = computedCells[i];
      const areaRatio = cell.area / Math.max(1, meanArea);
      const traffic = cell.agent.trafficScore;

      // Program classification rules
      if (areaRatio > 1.35 * (1.5 - params.publicThreshold)) {
        cell.type = 'public';
        cell.typeName = 'CIVIC / PLAZA';
        countPublic++;
      } else if (traffic > 0.65 || areaRatio > 0.95) {
        cell.type = 'studio';
        cell.typeName = 'ACTIVE STUDIO';
        countStudio++;
      } else if (areaRatio < 0.60 * (params.publicThreshold + 0.5)) {
        cell.type = 'service';
        cell.typeName = 'SERVICE CORE';
        countService++;
      } else {
        cell.type = 'private';
        cell.typeName = 'CELLULAR SUITE';
        countPrivate++;
      }

      // Associate back to agent for feedback loop
      cell.agent.assignedCell = cell;

      // Extract architectural wall segments & doors/portals
      const poly = cell.polygon;
      cell.walls = [];
      cell.openings = [];

      for (let j = 0; j < poly.length; j++) {
        const p1 = poly[j];
        const p2 = poly[(j + 1) % poly.length];
        const edgeLen = Vec.dist(p1, p2);
        if (edgeLen < 4) continue;

        // Check if edge is along the site boundary
        const isSiteBorder = isEdgeOnSiteBoundary(p1, p2, sitePolygon);

        if (isSiteBorder) {
          // Exterior envelope wall: solid thick boundary
          cell.walls.push({ p1, p2, isExterior: true, thickness: params.wallThickness * 1.5 });
        } else {
          // Interior shared wall: determine opening permeability
          const openness = (params.openingThreshold * 0.7) + (traffic * 0.3);
          const shouldHaveOpening = openness > 0.38 && edgeLen > 24 && cell.type !== 'service';

          if (shouldHaveOpening) {
            // Cut a doorway / portal opening in the center of the wall segment
            const openingRatio = Vec.clamp(openness * 0.5, 0.25, 0.55);
            const mid = { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
            const dir = Vec.normalize({ x: p2.x - p1.x, y: p2.y - p1.y });
            const halfOpening = (edgeLen * openingRatio) * 0.5;

            const op1 = { x: mid.x - dir.x * halfOpening, y: mid.y - dir.y * halfOpening };
            const op2 = { x: mid.x + dir.x * halfOpening, y: mid.y + dir.y * halfOpening };

            // Two solid wall segments flanking the doorway
            cell.walls.push({ p1, p2: op1, isExterior: false, thickness: params.wallThickness });
            cell.walls.push({ p1: op2, p2, isExterior: false, thickness: params.wallThickness });

            // Architectural opening portal
            cell.openings.push({ p1: op1, p2: op2, width: halfOpening * 2 });
          } else {
            // Solid partition wall
            cell.walls.push({ p1, p2, isExterior: false, thickness: params.wallThickness });
          }
        }
      }

      // Determine local circulation alignment vector from agent movement
      cell.circulationVector = Vec.normalize({ x: cell.agent.vx, y: cell.agent.vy });
    }

    state.cells = computedCells;

    // Update program telemetry
    const totalCells = computedCells.length || 1;
    state.stats.progDist = {
      public: Math.round((countPublic / totalCells) * 100),
      studio: Math.round((countStudio / totalCells) * 100),
      private: Math.round((countPrivate / totalCells) * 100),
      service: Math.round((countService / totalCells) * 100),
    };

    // Calculate circulation spines through high-traffic adjacent cells
    extractCirculationSpines(computedCells);
  }

  function calculatePerimeter(pts) {
    let perim = 0;
    for (let i = 0; i < pts.length; i++) {
      perim += Vec.dist(pts[i], pts[(i + 1) % pts.length]);
    }
    return perim;
  }

  function isEdgeOnSiteBoundary(p1, p2, sitePoly) {
    const mid = { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
    for (let i = 0; i < sitePoly.length; i++) {
      const sp1 = sitePoly[i];
      const sp2 = sitePoly[(i + 1) % sitePoly.length];
      const { dist } = Vec.distToSegment(mid, sp1, sp2);
      if (dist < 3) return true;
    }
    return false;
  }

  function extractCirculationSpines(cells) {
    const spines = [];
    const highTraffic = cells.filter(c => c.agent.trafficScore > 0.55);

    for (let i = 0; i < highTraffic.length; i++) {
      const c1 = highTraffic[i];
      for (const nIndex of c1.neighbors) {
        if (nIndex > c1.agentIndex && nIndex < cells.length) {
          const c2 = cells[nIndex];
          if (c2.agent.trafficScore > 0.50) {
            spines.push({
              p1: c1.centroid,
              p2: c2.centroid,
              weight: (c1.agent.trafficScore + c2.agent.trafficScore) * 0.5,
            });
          }
        }
      }
    }
    state.circulationSpines = spines;
    state.stats.flux = Math.min(100, Math.round((spines.length / Math.max(1, cells.length)) * 100));
  }

  // =========================================================================
  // 6. RENDERER (Clean Architectural / Diagrammatic Style)
  // =========================================================================
  function render(targetCtx = ctx, isExport = false) {
    const { width, height } = targetCtx.canvas;
    const { view, layers, viewMode, params, sitePolygon, agents, attractors, repulsors, cells, circulationSpines } = state;

    targetCtx.save();
    targetCtx.clearRect(0, 0, width, height);

    // Architectural background
    targetCtx.fillStyle = '#faf9f5';
    targetCtx.fillRect(0, 0, width, height);

    // Apply pan & zoom
    if (!isExport) {
      targetCtx.translate(view.offsetX, view.offsetY);
      targetCtx.scale(view.scale, view.scale);
    }

    // Draw architectural scale grid
    drawArchitecturalGrid(targetCtx, sitePolygon);

    // --- LAYER 1: PROGRAM FILLS ---
    if (layers.programs && (viewMode === 'spatial' || viewMode === 'architecture' || viewMode === 'all')) {
      for (const cell of cells) {
        if (cell.polygon.length < 3) continue;

        targetCtx.beginPath();
        targetCtx.moveTo(cell.polygon[0].x, cell.polygon[0].y);
        for (let i = 1; i < cell.polygon.length; i++) {
          targetCtx.lineTo(cell.polygon[i].x, cell.polygon[i].y);
        }
        targetCtx.closePath();

        if (cell.type === 'public') {
          targetCtx.fillStyle = 'rgba(230, 223, 209, 0.45)';
          targetCtx.fill();
        } else if (cell.type === 'studio') {
          targetCtx.fillStyle = 'rgba(220, 211, 192, 0.30)';
          targetCtx.fill();
        } else if (cell.type === 'private') {
          targetCtx.fillStyle = 'rgba(201, 199, 191, 0.22)';
          targetCtx.fill();
        } else if (cell.type === 'service') {
          // Service core: cross hatch or subtle darker tone
          targetCtx.fillStyle = 'rgba(168, 166, 157, 0.35)';
          targetCtx.fill();
        }
      }
    }

    // --- LAYER 2: VORONOI CELL LINES ---
    if (layers.voronoi && (viewMode === 'voronoi' || viewMode === 'spatial' || viewMode === 'all')) {
      targetCtx.strokeStyle = 'rgba(110, 110, 105, 0.45)';
      targetCtx.lineWidth = 0.8;
      targetCtx.setLineDash([4, 3]);

      for (const cell of cells) {
        if (cell.polygon.length < 3) continue;
        targetCtx.beginPath();
        targetCtx.moveTo(cell.polygon[0].x, cell.polygon[0].y);
        for (let i = 1; i < cell.polygon.length; i++) {
          targetCtx.lineTo(cell.polygon[i].x, cell.polygon[i].y);
        }
        targetCtx.closePath();
        targetCtx.stroke();
      }
      targetCtx.setLineDash([]);
    }

    // --- LAYER 3: AGENT TRAILS & HEATMAP CIRCULATION ---
    if (layers.trails && (viewMode === 'agents' || viewMode === 'behavior' || viewMode === 'all')) {
      targetCtx.lineWidth = 1.0;
      for (const a of agents) {
        if (a.trail.length < 2) continue;
        targetCtx.beginPath();
        targetCtx.moveTo(a.trail[0].x, a.trail[0].y);
        for (let i = 1; i < a.trail.length; i++) {
          targetCtx.lineTo(a.trail[i].x, a.trail[i].y);
        }
        targetCtx.strokeStyle = 'rgba(20, 20, 20, 0.08)';
        targetCtx.stroke();
      }
    }

    // --- LAYER 4: CIRCULATION SPINES ---
    if (layers.circulation && (viewMode === 'architecture' || viewMode === 'spatial' || viewMode === 'all')) {
      for (const spine of circulationSpines) {
        targetCtx.beginPath();
        targetCtx.moveTo(spine.p1.x, spine.p1.y);
        targetCtx.lineTo(spine.p2.x, spine.p2.y);
        targetCtx.strokeStyle = '#181818';
        targetCtx.lineWidth = 1.6;
        targetCtx.setLineDash([5, 4]);
        targetCtx.stroke();
        targetCtx.setLineDash([]);

        // Small directional tick at spine midpoint
        const mx = (spine.p1.x + spine.p2.x) * 0.5;
        const my = (spine.p1.y + spine.p2.y) * 0.5;
        targetCtx.fillStyle = '#181818';
        targetCtx.beginPath();
        targetCtx.arc(mx, my, 1.8, 0, Math.PI * 2);
        targetCtx.fill();
      }
    }

    // --- LAYER 5: ARCHITECTURAL WALLS & OPENINGS ---
    if (layers.walls && (viewMode === 'architecture' || viewMode === 'all')) {
      for (const cell of cells) {
        for (const wall of cell.walls) {
          targetCtx.beginPath();
          targetCtx.moveTo(wall.p1.x, wall.p1.y);
          targetCtx.lineTo(wall.p2.x, wall.p2.y);
          targetCtx.strokeStyle = wall.isExterior ? '#101010' : '#222222';
          targetCtx.lineWidth = wall.thickness;
          targetCtx.lineCap = 'square';
          targetCtx.stroke();
        }

        // Openings: delicate architectural doorway threshold line
        for (const op of cell.openings) {
          targetCtx.beginPath();
          targetCtx.moveTo(op.p1.x, op.p1.y);
          targetCtx.lineTo(op.p2.x, op.p2.y);
          targetCtx.strokeStyle = 'rgba(30, 30, 30, 0.25)';
          targetCtx.lineWidth = 0.75;
          targetCtx.stroke();
        }
      }
    }

    // --- LAYER 6: AGENTS & BEHAVIOR VECTORS ---
    if (layers.agents && (viewMode === 'agents' || viewMode === 'behavior' || viewMode === 'all')) {
      for (const a of agents) {
        // Agent dot
        targetCtx.fillStyle = '#181818';
        targetCtx.beginPath();
        targetCtx.arc(a.x, a.y, 2.5, 0, Math.PI * 2);
        targetCtx.fill();

        // Velocity vector in behavior mode
        if (viewMode === 'behavior' || viewMode === 'all') {
          const vScale = 6;
          targetCtx.beginPath();
          targetCtx.moveTo(a.x, a.y);
          targetCtx.lineTo(a.x + a.vx * vScale, a.y + a.vy * vScale);
          targetCtx.strokeStyle = 'rgba(20, 20, 20, 0.7)';
          targetCtx.lineWidth = 1;
          targetCtx.stroke();
        }
      }
    }

    // --- LAYER 7: ATTRACTORS & REPULSORS ---
    if (layers.forces) {
      drawForces(targetCtx, attractors, repulsors);
    }

    // --- LAYER 8: SITE BOUNDARY & EDIT HANDLES ---
    if (layers.site) {
      drawSiteBoundary(targetCtx, sitePolygon);
    }

    // --- LAYER 9: SPATIAL LABELS & ANNOTATIONS ---
    if (layers.labels && (viewMode === 'spatial' || viewMode === 'architecture' || viewMode === 'all')) {
      drawSpatialLabels(targetCtx, cells);
    }

    targetCtx.restore();
  }

  function drawArchitecturalGrid(tCtx, poly) {
    if (!poly || poly.length < 3) return;
    const center = Vec.centroid(poly);
    tCtx.strokeStyle = 'rgba(20, 20, 20, 0.04)';
    tCtx.lineWidth = 0.5;

    // 50px architectural grid lines
    const gridStep = 50;
    const minX = center.x - 600, maxX = center.x + 600;
    const minY = center.y - 450, maxY = center.y + 450;

    tCtx.beginPath();
    for (let x = minX; x <= maxX; x += gridStep) {
      tCtx.moveTo(x, minY);
      tCtx.lineTo(x, maxY);
    }
    for (let y = minY; y <= maxY; y += gridStep) {
      tCtx.moveTo(minX, y);
      tCtx.lineTo(maxX, y);
    }
    tCtx.stroke();
  }

  function drawForces(tCtx, attractors, repulsors) {
    // Attractors (Architectural vermilion)
    for (let i = 0; i < attractors.length; i++) {
      const attr = attractors[i];

      // Radius ring
      tCtx.beginPath();
      tCtx.arc(attr.x, attr.y, attr.radius, 0, Math.PI * 2);
      tCtx.strokeStyle = 'rgba(204, 59, 30, 0.25)';
      tCtx.lineWidth = 1;
      tCtx.setLineDash([4, 4]);
      tCtx.stroke();
      tCtx.setLineDash([]);

      // Center crosshair
      const ch = 10;
      tCtx.strokeStyle = '#cc3b1e';
      tCtx.lineWidth = 1.5;
      tCtx.beginPath();
      tCtx.moveTo(attr.x - ch, attr.y);
      tCtx.lineTo(attr.x + ch, attr.y);
      tCtx.moveTo(attr.x, attr.y - ch);
      tCtx.lineTo(attr.x, attr.y + ch);
      tCtx.stroke();

      // Center point
      tCtx.fillStyle = '#cc3b1e';
      tCtx.beginPath();
      tCtx.arc(attr.x, attr.y, 4, 0, Math.PI * 2);
      tCtx.fill();

      // Label
      tCtx.font = "700 8px 'Space Mono', monospace";
      tCtx.fillStyle = '#cc3b1e';
      tCtx.fillText(`ATTRACTOR [A${i + 1}]`, attr.x + 12, attr.y - 6);
    }

    // Repulsors (Architectural cyan / slate)
    for (let i = 0; i < repulsors.length; i++) {
      const rep = repulsors[i];

      // Radius ring
      tCtx.beginPath();
      tCtx.arc(rep.x, rep.y, rep.radius, 0, Math.PI * 2);
      tCtx.strokeStyle = 'rgba(27, 101, 148, 0.25)';
      tCtx.lineWidth = 1;
      tCtx.setLineDash([3, 4]);
      tCtx.stroke();
      tCtx.setLineDash([]);

      // Diamond barrier icon
      const sz = 8;
      tCtx.strokeStyle = '#1b6594';
      tCtx.lineWidth = 1.5;
      tCtx.strokeRect(rep.x - sz * 0.5, rep.y - sz * 0.5, sz, sz);

      tCtx.beginPath();
      tCtx.moveTo(rep.x - sz, rep.y);
      tCtx.lineTo(rep.x + sz, rep.y);
      tCtx.stroke();

      // Label
      tCtx.font = "700 8px 'Space Mono', monospace";
      tCtx.fillStyle = '#1b6594';
      tCtx.fillText(`REPULSOR [R${i + 1}]`, rep.x + 12, rep.y - 6);
    }
  }

  function drawSiteBoundary(tCtx, poly) {
    if (poly.length < 3) return;

    // Perimeter line
    tCtx.beginPath();
    tCtx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) {
      tCtx.lineTo(poly[i].x, poly[i].y);
    }
    tCtx.closePath();
    tCtx.strokeStyle = '#141414';
    tCtx.lineWidth = 2.0;
    tCtx.stroke();

    // Corner vertex handles & dimension callouts
    for (let i = 0; i < poly.length; i++) {
      const pt = poly[i];
      const next = poly[(i + 1) % poly.length];

      // Handle square
      tCtx.fillStyle = '#ffffff';
      tCtx.strokeStyle = '#141414';
      tCtx.lineWidth = 1.5;
      tCtx.fillRect(pt.x - 4, pt.y - 4, 8, 8);
      tCtx.strokeRect(pt.x - 4, pt.y - 4, 8, 8);

      // Edge dimension
      const lenMeters = (Vec.dist(pt, next) / 10).toFixed(1);
      const mx = (pt.x + next.x) * 0.5;
      const my = (pt.y + next.y) * 0.5;

      tCtx.font = "600 7.5px 'Space Mono', monospace";
      tCtx.fillStyle = '#7a7870';
      tCtx.fillText(`${lenMeters}m`, mx + 4, my - 4);
    }
  }

  function drawSpatialLabels(tCtx, cells) {
    tCtx.font = "700 7px 'Space Mono', monospace";
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle';

    for (const cell of cells) {
      if (cell.area > 2200) {
        tCtx.fillStyle = '#3a3a36';
        tCtx.fillText(cell.typeName, cell.centroid.x, cell.centroid.y);

        tCtx.font = "400 6.5px 'Space Mono', monospace";
        tCtx.fillStyle = '#8c8b84';
        tCtx.fillText(`${Math.round(cell.area * 0.1)}m²`, cell.centroid.x, cell.centroid.y + 9);
        tCtx.font = "700 7px 'Space Mono', monospace";
      }
    }
    tCtx.textAlign = 'start';
    tCtx.textBaseline = 'alphabetic';
  }

  // =========================================================================
  // 7. INTERACTION & TOOL HANDLING
  // =========================================================================
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    return {
      screenX: rawX,
      screenY: rawY,
      worldX: (rawX - state.view.offsetX) / state.view.scale,
      worldY: (rawY - state.view.offsetY) / state.view.scale,
    };
  }

  function setupCanvasInteractions() {
    canvas.addEventListener('mousedown', (e) => {
      const coords = getCanvasCoords(e);

      // Middle click or Space+Click or right drag -> Pan
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        state.view.isPanning = true;
        state.view.panStartX = coords.screenX - state.view.offsetX;
        state.view.panStartY = coords.screenY - state.view.offsetY;
        return;
      }

      if (e.button === 2) {
        // Right click: delete attractor or repulsor
        e.preventDefault();
        deleteEntityAt(coords.worldX, coords.worldY);
        return;
      }

      // Left click handling based on active tool
      if (e.button === 0) {
        if (state.activeTool === 'add-attractor') {
          state.attractors.push({
            x: coords.worldX,
            y: coords.worldY,
            radius: 160,
            strength: 1.5,
            type: 'attractor',
          });
          updateTelemetryUI();
          return;
        }

        if (state.activeTool === 'add-repulsor') {
          state.repulsors.push({
            x: coords.worldX,
            y: coords.worldY,
            radius: 140,
            strength: 1.8,
            type: 'repulsor',
          });
          updateTelemetryUI();
          return;
        }

        if (state.activeTool === 'edit-site') {
          // Check vertex hit
          for (let i = 0; i < state.sitePolygon.length; i++) {
            const v = state.sitePolygon[i];
            if (Math.hypot(coords.worldX - v.x, coords.worldY - v.y) < 14 / state.view.scale) {
              state.draggedEntity = { type: 'site-vertex', index: i };
              return;
            }
          }
          // Check edge to add new vertex
          for (let i = 0; i < state.sitePolygon.length; i++) {
            const v1 = state.sitePolygon[i];
            const v2 = state.sitePolygon[(i + 1) % state.sitePolygon.length];
            const { dist, closest } = Vec.distToSegment({ x: coords.worldX, y: coords.worldY }, v1, v2);
            if (dist < 10 / state.view.scale) {
              state.sitePolygon.splice(i + 1, 0, { x: closest.x, y: closest.y });
              state.draggedEntity = { type: 'site-vertex', index: i + 1 };
              return;
            }
          }
        }

        // 'select' mode: hit-test attractors, repulsors, and site vertices
        const hit = hitTestEntities(coords.worldX, coords.worldY);
        if (hit) {
          state.draggedEntity = hit;
        } else {
          // If clicked empty space, start panning
          state.view.isPanning = true;
          state.view.panStartX = coords.screenX - state.view.offsetX;
          state.view.panStartY = coords.screenY - state.view.offsetY;
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      const coords = getCanvasCoords(e);

      if (state.view.isPanning) {
        state.view.offsetX = coords.screenX - state.view.panStartX;
        state.view.offsetY = coords.screenY - state.view.panStartY;
        return;
      }

      if (state.draggedEntity) {
        const ent = state.draggedEntity;
        if (ent.type === 'attractor' || ent.type === 'repulsor') {
          ent.item.x = coords.worldX;
          ent.item.y = coords.worldY;
        } else if (ent.type === 'site-vertex') {
          state.sitePolygon[ent.index].x = coords.worldX;
          state.sitePolygon[ent.index].y = coords.worldY;
        }
      }
    });

    window.addEventListener('mouseup', () => {
      state.view.isPanning = false;
      state.draggedEntity = null;
    });

    // Zoom on mouse wheel
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const newScale = Vec.clamp(state.view.scale * zoomFactor, 0.35, 3.5);

      state.view.offsetX = mouseX - (mouseX - state.view.offsetX) * (newScale / state.view.scale);
      state.view.offsetY = mouseY - (mouseY - state.view.offsetY) * (newScale / state.view.scale);
      state.view.scale = newScale;
    }, { passive: false });

    // Context menu disable on canvas for right-click interaction
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function hitTestEntities(wx, wy) {
    // Check attractors
    for (const attr of state.attractors) {
      if (Math.hypot(wx - attr.x, wy - attr.y) < 18 / state.view.scale) {
        return { type: 'attractor', item: attr };
      }
    }
    // Check repulsors
    for (const rep of state.repulsors) {
      if (Math.hypot(wx - rep.x, wy - rep.y) < 18 / state.view.scale) {
        return { type: 'repulsor', item: rep };
      }
    }
    // Check site handles
    for (let i = 0; i < state.sitePolygon.length; i++) {
      const v = state.sitePolygon[i];
      if (Math.hypot(wx - v.x, wy - v.y) < 12 / state.view.scale) {
        return { type: 'site-vertex', index: i };
      }
    }
    return null;
  }

  function deleteEntityAt(wx, wy) {
    const attrIdx = state.attractors.findIndex(a => Math.hypot(wx - a.x, wy - a.y) < 20 / state.view.scale);
    if (attrIdx !== -1) {
      state.attractors.splice(attrIdx, 1);
      updateTelemetryUI();
      return;
    }
    const repIdx = state.repulsors.findIndex(r => Math.hypot(wx - r.x, wy - r.y) < 20 / state.view.scale);
    if (repIdx !== -1) {
      state.repulsors.splice(repIdx, 1);
      updateTelemetryUI();
      return;
    }
  }

  // =========================================================================
  // 8. PRESET CONFIGURATIONS
  // =========================================================================
  function loadPreset(name) {
    const center = Vec.centroid(state.sitePolygon);

    switch (name) {
      case 'uniform':
        state.params.agentCount = 120;
        state.params.speed = 1.0;
        state.params.randomness = 0.15;
        state.params.attractionEnabled = false;
        state.params.repulsionEnabled = false;
        state.params.separationEnabled = true;
        state.params.separationStrength = 1.8;
        state.params.alignmentEnabled = false;
        state.params.feedbackEnabled = false;
        state.attractors = [];
        state.repulsors = [];
        initAgents();
        break;

      case 'central':
        state.params.agentCount = 140;
        state.params.speed = 1.8;
        state.params.randomness = 0.2;
        state.params.attractionEnabled = true;
        state.params.attractionStrength = 1.6;
        state.params.repulsionEnabled = true;
        state.params.separationEnabled = true;
        state.params.separationStrength = 1.2;
        state.params.feedbackEnabled = false;
        state.attractors = [
          { x: center.x, y: center.y, radius: 260, strength: 1.8, type: 'attractor' }
        ];
        state.repulsors = [];
        initAgents();
        break;

      case 'multi':
        state.params.agentCount = 160;
        state.params.speed = 1.8;
        state.params.randomness = 0.25;
        state.params.attractionEnabled = true;
        state.params.attractionStrength = 1.5;
        state.params.repulsionEnabled = true;
        state.params.repulsionStrength = 1.8;
        state.params.separationEnabled = true;
        state.params.feedbackEnabled = false;
        state.attractors = [
          { x: center.x - 180, y: center.y - 50, radius: 200, strength: 1.6, type: 'attractor' },
          { x: center.x + 180, y: center.y + 60, radius: 200, strength: 1.6, type: 'attractor' },
        ];
        state.repulsors = [
          { x: center.x, y: center.y, radius: 120, strength: 2.0, type: 'repulsor' }
        ];
        initAgents();
        break;

      case 'flow':
        state.params.agentCount = 140;
        state.params.speed = 2.4;
        state.params.randomness = 0.1;
        state.params.attractionEnabled = true;
        state.params.alignmentEnabled = true;
        state.params.alignmentStrength = 1.4;
        state.params.separationStrength = 0.8;
        state.params.feedbackEnabled = false;
        state.attractors = [
          { x: center.x + 320, y: center.y, radius: 450, strength: 1.5, type: 'attractor' }
        ];
        state.repulsors = [
          { x: center.x - 300, y: center.y, radius: 220, strength: 2.0, type: 'repulsor' }
        ];
        initAgents();
        for (const a of state.agents) {
          a.vx = Math.abs(a.vx) + 1.2;
        }
        break;

      case 'collision':
        state.params.agentCount = 180;
        state.params.speed = 1.6;
        state.params.randomness = 0.3;
        state.params.attractionEnabled = false;
        state.params.separationEnabled = true;
        state.params.separationStrength = 2.4;
        state.params.alignmentEnabled = false;
        state.params.feedbackEnabled = false;
        state.attractors = [];
        state.repulsors = [];
        initAgents();
        break;

      case 'organic':
        state.params.agentCount = 150;
        state.params.speed = 1.9;
        state.params.randomness = 0.45;
        state.params.attractionEnabled = true;
        state.params.attractionStrength = 1.2;
        state.params.separationEnabled = true;
        state.params.separationStrength = 1.5;
        state.params.alignmentEnabled = true;
        state.params.alignmentStrength = 0.7;
        state.params.feedbackEnabled = false;
        state.attractors = [
          { x: center.x - 120, y: center.y - 100, radius: 220, strength: 1.2, type: 'attractor' },
          { x: center.x + 120, y: center.y + 110, radius: 220, strength: 1.2, type: 'attractor' },
        ];
        state.repulsors = [
          { x: center.x + 80, y: center.y - 80, radius: 130, strength: 1.6, type: 'repulsor' },
        ];
        initAgents();
        break;

      case 'feedback':
        state.params.agentCount = 150;
        state.params.speed = 2.0;
        state.params.randomness = 0.25;
        state.params.attractionEnabled = true;
        state.params.attractionStrength = 1.3;
        state.params.separationEnabled = true;
        state.params.separationStrength = 1.4;
        state.params.feedbackEnabled = true;
        state.params.feedbackStrength = 1.2;
        state.attractors = [
          { x: center.x - 150, y: center.y, radius: 220, strength: 1.4, type: 'attractor' },
          { x: center.x + 160, y: center.y, radius: 220, strength: 1.4, type: 'attractor' },
        ];
        state.repulsors = [
          { x: center.x, y: center.y - 120, radius: 140, strength: 1.8, type: 'repulsor' },
          { x: center.x, y: center.y + 120, radius: 140, strength: 1.8, type: 'repulsor' },
        ];
        initAgents();
        break;
    }

    syncUIValues();
    updateTelemetryUI();
  }

  // =========================================================================
  // 9. EXPORT SYSTEM (SVG & HIGH-RES PNG)
  // =========================================================================
  function exportHighResPNG() {
    const exportCanvas = document.createElement('canvas');
    const scaleFactor = 2; // crisp 2x retina
    exportCanvas.width = canvas.width * scaleFactor;
    exportCanvas.height = canvas.height * scaleFactor;
    const expCtx = exportCanvas.getContext('2d');

    expCtx.scale(scaleFactor, scaleFactor);
    // Draw current world view
    expCtx.translate(state.view.offsetX, state.view.offsetY);
    expCtx.scale(state.view.scale, state.view.scale);

    render(expCtx, true);

    const link = document.createElement('a');
    link.download = `Design-7-Exploration_iter-${String(state.iteration).padStart(4, '0')}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  }

  function exportVectorSVG() {
    const { sitePolygon, cells, circulationSpines, attractors, repulsors, agents, layers, viewMode } = state;

    // Determine bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of sitePolygon) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = 60;
    const vbX = Math.round(minX - pad);
    const vbY = Math.round(minY - pad);
    const vbW = Math.round(maxX - minX + pad * 2);
    const vbH = Math.round(maxY - minY + pad * 2);

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}">\n`;
    svg += `<style>
      .site-border { fill: none; stroke: #141414; stroke-width: 2.0; }
      .wall-ext { stroke: #101010; stroke-width: 3.5; stroke-linecap: square; }
      .wall-int { stroke: #222222; stroke-width: 2.2; stroke-linecap: square; }
      .opening { stroke: rgba(30,30,30,0.3); stroke-width: 0.8; fill: none; }
      .spine { stroke: #181818; stroke-width: 1.5; stroke-dasharray: 4,3; fill: none; }
      .voronoi { fill: none; stroke: #888884; stroke-width: 0.75; stroke-dasharray: 4,3; }
      .agent { fill: #181818; }
      .public-fill { fill: #e6dfd1; fill-opacity: 0.45; }
      .studio-fill { fill: #dcd3c0; fill-opacity: 0.35; }
      .private-fill { fill: #c9c7bf; fill-opacity: 0.25; }
      .service-fill { fill: #a8a69d; fill-opacity: 0.40; }
      .label { font-family: monospace; font-size: 7px; fill: #333333; text-anchor: middle; font-weight: bold; }
    </style>\n`;

    // Background
    svg += `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#faf9f5"/>\n`;

    // Program Fills
    if (layers.programs) {
      svg += `<g id="program-fills">\n`;
      for (const cell of cells) {
        if (cell.polygon.length < 3) continue;
        const pts = cell.polygon.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        svg += `  <polygon points="${pts}" class="${cell.type}-fill"/>\n`;
      }
      svg += `</g>\n`;
    }

    // Voronoi
    if (layers.voronoi) {
      svg += `<g id="voronoi-mesh">\n`;
      for (const cell of cells) {
        if (cell.polygon.length < 3) continue;
        const pts = cell.polygon.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        svg += `  <polygon points="${pts}" class="voronoi"/>\n`;
      }
      svg += `</g>\n`;
    }

    // Circulation Spines
    if (layers.circulation) {
      svg += `<g id="circulation-spines">\n`;
      for (const spine of circulationSpines) {
        svg += `  <line x1="${spine.p1.x.toFixed(1)}" y1="${spine.p1.y.toFixed(1)}" x2="${spine.p2.x.toFixed(1)}" y2="${spine.p2.y.toFixed(1)}" class="spine"/>\n`;
      }
      svg += `</g>\n`;
    }

    // Walls & Openings
    if (layers.walls) {
      svg += `<g id="architectural-walls">\n`;
      for (const cell of cells) {
        for (const wall of cell.walls) {
          const cls = wall.isExterior ? 'wall-ext' : 'wall-int';
          svg += `  <line x1="${wall.p1.x.toFixed(1)}" y1="${wall.p1.y.toFixed(1)}" x2="${wall.p2.x.toFixed(1)}" y2="${wall.p2.y.toFixed(1)}" class="${cls}"/>\n`;
        }
        for (const op of cell.openings) {
          svg += `  <line x1="${op.p1.x.toFixed(1)}" y1="${op.p1.y.toFixed(1)}" x2="${op.p2.x.toFixed(1)}" y2="${op.p2.y.toFixed(1)}" class="opening"/>\n`;
        }
      }
      svg += `</g>\n`;
    }

    // Site boundary
    if (layers.site) {
      const sitePts = sitePolygon.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      svg += `<polygon points="${sitePts}" class="site-border"/>\n`;
    }

    // Agents
    if (layers.agents) {
      svg += `<g id="agents">\n`;
      for (const a of agents) {
        svg += `  <circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="2.2" class="agent"/>\n`;
      }
      svg += `</g>\n`;
    }

    // Labels
    if (layers.labels) {
      svg += `<g id="spatial-labels">\n`;
      for (const cell of cells) {
        if (cell.area > 2400) {
          svg += `  <text x="${cell.centroid.x.toFixed(1)}" y="${cell.centroid.y.toFixed(1)}" class="label">${cell.typeName}</text>\n`;
        }
      }
      svg += `</g>\n`;
    }

    svg += `</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.download = `Design-7-Exploration_iter-${String(state.iteration).padStart(4, '0')}.svg`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // =========================================================================
  // 10. STUDIO 5-STAGE SEQUENCE ANALYSIS MODAL
  // =========================================================================
  let seqCanvas, seqCtx;
  let activeSeqStep = '0';

  const sequenceInfo = [
    {
      title: '01 — AGENTS (Point Distribution)',
      desc: 'Autonomous spatial agents initialized across the architectural boundary. Each agent represents an occupant or activity locus whose position determines subsequent spatial subdivision.',
    },
    {
      title: '02 — BEHAVIOR (Movement Vectors & Forces)',
      desc: 'Local forces (attraction, repulsion, separation, and alignment) generate dynamic trajectories. Vector arrows depict steering forces and velocity fields.',
    },
    {
      title: '03 — VORONOI (Geometric Partition)',
      desc: 'Continuous Voronoi tessellation where cell boundaries represent perpendicular bisectors between neighboring agents. Density fluctuations manifest as scale variation.',
    },
    {
      title: '04 — SPATIAL ORGANIZATION (Program Classification)',
      desc: 'Tessellated cells mapped to programmatic zones: Civic plazas in large expanses, active forums in high flux, and private/service suites in compact clusters.',
    },
    {
      title: '05 — ARCHITECTURAL TRANSLATION (Walls, Portals, Circulation)',
      desc: 'Shared edges materialize into thick partition walls with doorway thresholds. High-traffic corridors crystallize into primary circulation spines.',
    },
  ];

  function openSequenceModal() {
    const modal = document.getElementById('sequence-modal');
    modal.classList.remove('hidden');

    if (!seqCanvas) {
      seqCanvas = document.getElementById('sequence-canvas');
      seqCtx = seqCanvas.getContext('2d');
    }

    // Resize sequence canvas to match its client box
    const rect = seqCanvas.getBoundingClientRect();
    seqCanvas.width = rect.width;
    seqCanvas.height = rect.height;

    renderSequenceStep(activeSeqStep);
  }

  function closeSequenceModal() {
    document.getElementById('sequence-modal').classList.add('hidden');
  }

  function renderSequenceStep(step) {
    if (!seqCtx) return;
    const w = seqCanvas.width;
    const h = seqCanvas.height;

    seqCtx.clearRect(0, 0, w, h);
    seqCtx.fillStyle = '#faf9f5';
    seqCtx.fillRect(0, 0, w, h);

    const center = Vec.centroid(state.sitePolygon);
    const scale = Math.min(w / 900, h / 650);

    if (step === 'all') {
      // 5-stage matrix grid
      document.getElementById('seq-title').textContent = 'MORPHOGENETIC 5-STAGE PIPELINE';
      document.getElementById('seq-desc').textContent = 'Synoptic overview showing the direct causal emergence from autonomous agents to fully resolved architectural organization.';

      const cols = 5;
      const stepW = w / cols;
      for (let i = 0; i < cols; i++) {
        seqCtx.save();
        seqCtx.beginPath();
        seqCtx.rect(i * stepW, 0, stepW, h);
        seqCtx.clip();

        seqCtx.translate(i * stepW + stepW * 0.5, h * 0.5);
        seqCtx.scale(scale * 0.45, scale * 0.45);
        seqCtx.translate(-center.x, -center.y);

        renderStepLayers(seqCtx, i);
        seqCtx.restore();

        // Column divider line
        if (i > 0) {
          seqCtx.strokeStyle = '#dcd9cd';
          seqCtx.lineWidth = 1;
          seqCtx.beginPath();
          seqCtx.moveTo(i * stepW, 0);
          seqCtx.lineTo(i * stepW, h);
          seqCtx.stroke();
        }

        // Column Header
        seqCtx.font = "700 9px 'Space Mono', monospace";
        seqCtx.fillStyle = '#141414';
        seqCtx.fillText(`0${i + 1} — ${sequenceInfo[i].title.split(' ')[2]}`, i * stepW + 8, 18);
      }
    } else {
      const stepIdx = parseInt(step, 10);
      document.getElementById('seq-title').textContent = sequenceInfo[stepIdx].title;
      document.getElementById('seq-desc').textContent = sequenceInfo[stepIdx].desc;

      seqCtx.save();
      seqCtx.translate(w * 0.5, h * 0.5);
      seqCtx.scale(scale * 0.85, scale * 0.85);
      seqCtx.translate(-center.x, -center.y);

      renderStepLayers(seqCtx, stepIdx);
      seqCtx.restore();
    }
  }

  function renderStepLayers(targetCtx, stepIdx) {
    const { sitePolygon, agents, cells, circulationSpines, attractors, repulsors } = state;

    // Site boundary (always shown)
    targetCtx.beginPath();
    targetCtx.moveTo(sitePolygon[0].x, sitePolygon[0].y);
    for (let i = 1; i < sitePolygon.length; i++) targetCtx.lineTo(sitePolygon[i].x, sitePolygon[i].y);
    targetCtx.closePath();
    targetCtx.strokeStyle = '#141414';
    targetCtx.lineWidth = 2.0;
    targetCtx.stroke();

    if (stepIdx === 0) {
      // 01 AGENTS ONLY
      for (const a of agents) {
        targetCtx.fillStyle = '#141414';
        targetCtx.beginPath();
        targetCtx.arc(a.x, a.y, 3.2, 0, Math.PI * 2);
        targetCtx.fill();
      }
    } else if (stepIdx === 1) {
      // 02 BEHAVIOR & VECTORS
      drawForces(targetCtx, attractors, repulsors);
      for (const a of agents) {
        targetCtx.fillStyle = '#141414';
        targetCtx.beginPath();
        targetCtx.arc(a.x, a.y, 2.5, 0, Math.PI * 2);
        targetCtx.fill();

        targetCtx.strokeStyle = '#141414';
        targetCtx.lineWidth = 1.2;
        targetCtx.beginPath();
        targetCtx.moveTo(a.x, a.y);
        targetCtx.lineTo(a.x + a.vx * 8, a.y + a.vy * 8);
        targetCtx.stroke();
      }
    } else if (stepIdx === 2) {
      // 03 VORONOI
      targetCtx.strokeStyle = '#60605c';
      targetCtx.lineWidth = 1.2;
      for (const c of cells) {
        if (c.polygon.length < 3) continue;
        targetCtx.beginPath();
        targetCtx.moveTo(c.polygon[0].x, c.polygon[0].y);
        for (let i = 1; i < c.polygon.length; i++) targetCtx.lineTo(c.polygon[i].x, c.polygon[i].y);
        targetCtx.closePath();
        targetCtx.stroke();
      }
      for (const a of agents) {
        targetCtx.fillStyle = '#999990';
        targetCtx.beginPath();
        targetCtx.arc(a.x, a.y, 1.8, 0, Math.PI * 2);
        targetCtx.fill();
      }
    } else if (stepIdx === 3) {
      // 04 SPATIAL ORGANIZATION
      for (const cell of cells) {
        if (cell.polygon.length < 3) continue;
        targetCtx.beginPath();
        targetCtx.moveTo(cell.polygon[0].x, cell.polygon[0].y);
        for (let i = 1; i < cell.polygon.length; i++) targetCtx.lineTo(cell.polygon[i].x, cell.polygon[i].y);
        targetCtx.closePath();
        if (cell.type === 'public') targetCtx.fillStyle = 'rgba(230, 223, 209, 0.6)';
        else if (cell.type === 'studio') targetCtx.fillStyle = 'rgba(220, 211, 192, 0.45)';
        else if (cell.type === 'private') targetCtx.fillStyle = 'rgba(201, 199, 191, 0.35)';
        else targetCtx.fillStyle = 'rgba(168, 166, 157, 0.55)';
        targetCtx.fill();
        targetCtx.strokeStyle = '#888880';
        targetCtx.lineWidth = 0.8;
        targetCtx.stroke();
      }
      drawSpatialLabels(targetCtx, cells);
    } else if (stepIdx === 4) {
      // 05 ARCHITECTURAL TRANSLATION
      for (const cell of cells) {
        if (cell.polygon.length < 3) continue;
        targetCtx.beginPath();
        targetCtx.moveTo(cell.polygon[0].x, cell.polygon[0].y);
        for (let i = 1; i < cell.polygon.length; i++) targetCtx.lineTo(cell.polygon[i].x, cell.polygon[i].y);
        targetCtx.closePath();
        if (cell.type === 'public') targetCtx.fillStyle = 'rgba(230, 223, 209, 0.4)';
        else if (cell.type === 'service') targetCtx.fillStyle = 'rgba(168, 166, 157, 0.3)';
        targetCtx.fill();

        for (const wall of cell.walls) {
          targetCtx.beginPath();
          targetCtx.moveTo(wall.p1.x, wall.p1.y);
          targetCtx.lineTo(wall.p2.x, wall.p2.y);
          targetCtx.strokeStyle = '#101010';
          targetCtx.lineWidth = wall.thickness;
          targetCtx.stroke();
        }
        for (const op of cell.openings) {
          targetCtx.beginPath();
          targetCtx.moveTo(op.p1.x, op.p1.y);
          targetCtx.lineTo(op.p2.x, op.p2.y);
          targetCtx.strokeStyle = 'rgba(30,30,30,0.3)';
          targetCtx.lineWidth = 0.8;
          targetCtx.stroke();
        }
      }
      // Spines
      for (const sp of circulationSpines) {
        targetCtx.beginPath();
        targetCtx.moveTo(sp.p1.x, sp.p1.y);
        targetCtx.lineTo(sp.p2.x, sp.p2.y);
        targetCtx.strokeStyle = '#141414';
        targetCtx.lineWidth = 1.5;
        targetCtx.setLineDash([4, 3]);
        targetCtx.stroke();
        targetCtx.setLineDash([]);
      }
      drawSpatialLabels(targetCtx, cells);
    }
  }

  // =========================================================================
  // 11. SNAPSHOT & HISTORY MANAGER
  // =========================================================================
  function saveSnapshot() {
    const snap = {
      id: Date.now(),
      iteration: state.iteration,
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      agents: state.agents.map(a => ({ x: a.x, y: a.y, vx: a.vx, vy: a.vy })),
      attractors: JSON.parse(JSON.stringify(state.attractors)),
      repulsors: JSON.parse(JSON.stringify(state.repulsors)),
      sitePolygon: JSON.parse(JSON.stringify(state.sitePolygon)),
    };
    state.snapshots.push(snap);
    renderSnapshotsList();
  }

  function restoreSnapshot(id) {
    const snap = state.snapshots.find(s => s.id === id);
    if (!snap) return;

    state.iteration = snap.iteration;
    state.sitePolygon = JSON.parse(JSON.stringify(snap.sitePolygon));
    state.attractors = JSON.parse(JSON.stringify(snap.attractors));
    state.repulsors = JSON.parse(JSON.stringify(snap.repulsors));

    state.agents = snap.agents.map(p => {
      const a = new Agent(p.x, p.y);
      a.vx = p.vx;
      a.vy = p.vy;
      return a;
    });

    computeVoronoiAndArchitecture();
    updateTelemetryUI();
  }

  function renderSnapshotsList() {
    const container = document.getElementById('snapshot-list');
    document.getElementById('snapshot-count').textContent = state.snapshots.length;

    if (state.snapshots.length === 0) {
      container.innerHTML = '<div class="empty-snapshots">No saved states yet. Click [SNAPSHOT] to capture interesting configurations.</div>';
      return;
    }

    container.innerHTML = '';
    state.snapshots.forEach((snap, idx) => {
      const div = document.createElement('div');
      div.className = 'snapshot-item';
      div.innerHTML = `
        <span class="snapshot-title" data-id="${snap.id}">SNAP #${idx + 1} (Iter ${snap.iteration})</span>
        <button class="snapshot-del-btn" data-del-id="${snap.id}">&times;</button>
      `;
      div.querySelector('.snapshot-title').addEventListener('click', () => restoreSnapshot(snap.id));
      div.querySelector('.snapshot-del-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        state.snapshots = state.snapshots.filter(s => s.id !== snap.id);
        renderSnapshotsList();
      });
      container.appendChild(div);
    });
  }

  // =========================================================================
  // 12. INITIALIZATION & RESIZE
  // =========================================================================
  function initSitePolygon() {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const halfW = 380;
    const halfH = 260;

    // Centered rectangular site with crisp proportions
    state.sitePolygon = [
      { x: cx - halfW, y: cy - halfH },
      { x: cx + halfW, y: cy - halfH },
      { x: cx + halfW, y: cy + halfH },
      { x: cx - halfW, y: cy + halfH },
    ];
  }

  function initAgents() {
    state.agents = [];
    const count = state.params.agentCount;

    // Find bounding box of site
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of state.sitePolygon) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    let attempts = 0;
    while (state.agents.length < count && attempts < count * 20) {
      attempts++;
      const x = minX + 20 + Math.random() * (maxX - minX - 40);
      const y = minY + 20 + Math.random() * (maxY - minY - 40);
      if (Vec.pointInPolygon({ x, y }, state.sitePolygon)) {
        state.agents.push(new Agent(x, y));
      }
    }
  }

  function fitViewToScreen() {
    state.view.scale = 1;
    state.view.offsetX = 0;
    state.view.offsetY = 0;
  }

  function handleResize() {
    const container = document.getElementById('canvas-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    if (state.sitePolygon.length === 0) {
      initSitePolygon();
      initAgents();
      // Default initial forces: 1 attractor and 1 repulsor
      const center = Vec.centroid(state.sitePolygon);
      state.attractors = [
        { x: center.x - 120, y: center.y, radius: 240, strength: 1.5, type: 'attractor' }
      ];
      state.repulsors = [
        { x: center.x + 140, y: center.y, radius: 140, strength: 1.8, type: 'repulsor' }
      ];
    }
  }

  // =========================================================================
  // 13. MAIN ANIMATION & SIMULATION LOOP
  // =========================================================================
  function stepSimulation() {
    state.iteration++;
    calculateForces();

    for (const a of state.agents) {
      a.update(state.sitePolygon);
    }

    computeVoronoiAndArchitecture();
    updateTelemetryUI();
  }

  function loop() {
    if (state.running) {
      stepSimulation();
    }
    render();
    animFrameId = requestAnimationFrame(loop);
  }

  // =========================================================================
  // 14. UI BINDINGS & SYNCHRONIZATION
  // =========================================================================
  function bindUI() {
    // Play / Pause / Reset / Step
    const btnPlay = document.getElementById('btn-play');
    btnPlay.addEventListener('click', () => {
      state.running = !state.running;
      btnPlay.textContent = state.running ? 'PAUSE' : 'PLAY';
      btnPlay.classList.toggle('primary', state.running);
    });

    document.getElementById('btn-step').addEventListener('click', () => {
      if (state.running) {
        state.running = false;
        btnPlay.textContent = 'PLAY';
        btnPlay.classList.remove('primary');
      }
      stepSimulation();
      render();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      state.iteration = 0;
      initAgents();
      computeVoronoiAndArchitecture();
      updateTelemetryUI();
      render();
    });

    // Snapshots & Exports
    document.getElementById('btn-snapshot').addEventListener('click', saveSnapshot);
    document.getElementById('btn-export-png').addEventListener('click', exportHighResPNG);
    document.getElementById('btn-export-svg').addEventListener('click', exportVectorSVG);

    // Sequence Modal
    document.getElementById('btn-sequence-mode').addEventListener('click', openSequenceModal);
    document.getElementById('modal-close').addEventListener('click', closeSequenceModal);
    document.getElementById('modal-done-btn').addEventListener('click', closeSequenceModal);
    document.getElementById('btn-export-sequence-png').addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = `Design-7-Exploration_Sequence_${activeSeqStep}.png`;
      link.href = seqCanvas.toDataURL('image/png');
      link.click();
    });

    document.querySelectorAll('.seq-step-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.seq-step-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeSeqStep = e.target.dataset.seqStep;
        renderSequenceStep(activeSeqStep);
      });
    });

    // Presets buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => loadPreset(btn.dataset.preset));
    });

    // Tool Selector buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeTool = btn.dataset.tool;

        const hint = document.getElementById('tool-hint');
        if (state.activeTool === 'select') hint.textContent = 'Click & drag attractors/repulsors. Right click to delete.';
        else if (state.activeTool === 'add-attractor') hint.textContent = 'Click canvas to place Attractor. Right click to delete.';
        else if (state.activeTool === 'add-repulsor') hint.textContent = 'Click canvas to place Repulsor. Right click to delete.';
        else if (state.activeTool === 'edit-site') hint.textContent = 'Drag boundary vertices; click an edge to insert vertex.';
      });
    });

    // View Mode Tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.viewMode = tab.dataset.mode;
        document.getElementById('hud-mode').textContent = state.viewMode.toUpperCase();
        render();
      });
    });

    // HUD buttons
    document.getElementById('btn-fit-screen').addEventListener('click', () => {
      fitViewToScreen();
      render();
    });

    document.getElementById('btn-clear-forces').addEventListener('click', () => {
      state.attractors = [];
      state.repulsors = [];
      updateTelemetryUI();
      render();
    });

    // Sliders & Toggles binding helper
    bindRange('param-agent-count', 'val-agent-count', (v) => {
      state.params.agentCount = parseInt(v, 10);
      adjustAgentCount();
    });
    bindRange('param-speed', 'val-speed', (v) => { state.params.speed = parseFloat(v); });
    bindRange('param-randomness', 'val-randomness', (v) => { state.params.randomness = parseFloat(v); });
    bindRange('param-influence-radius', 'val-influence-radius', (v) => { state.params.influenceRadius = parseFloat(v); }, 'px');

    bindToggle('toggle-attraction', (v) => { state.params.attractionEnabled = v; });
    bindRange('param-attraction', 'val-attraction', (v) => { state.params.attractionStrength = parseFloat(v); });

    bindToggle('toggle-repulsion', (v) => { state.params.repulsionEnabled = v; });
    bindRange('param-repulsion', 'val-repulsion', (v) => { state.params.repulsionStrength = parseFloat(v); });

    bindToggle('toggle-separation', (v) => { state.params.separationEnabled = v; });
    bindRange('param-separation', 'val-separation', (v) => { state.params.separationStrength = parseFloat(v); });

    bindToggle('toggle-alignment', (v) => { state.params.alignmentEnabled = v; });
    bindRange('param-alignment', 'val-alignment', (v) => { state.params.alignmentStrength = parseFloat(v); });

    bindToggle('toggle-boundary', (v) => { state.params.boundaryEnabled = v; });
    bindRange('param-boundary', 'val-boundary', (v) => { state.params.boundaryStrength = parseFloat(v); });

    bindRange('param-wall-thickness', 'val-wall-thickness', (v) => { state.params.wallThickness = parseFloat(v); }, 'px');
    bindRange('param-opening-threshold', 'val-opening-threshold', (v) => { state.params.openingThreshold = parseFloat(v); });
    bindRange('param-public-threshold', 'val-public-threshold', (v) => { state.params.publicThreshold = parseFloat(v); });
    bindRange('param-circulation-influence', 'val-circulation-influence', (v) => { state.params.circulationInfluence = parseFloat(v); });

    bindToggle('toggle-feedback', (v) => {
      state.params.feedbackEnabled = v;
      document.getElementById('hud-feedback-status').textContent = v ? 'ACTIVE' : 'OFF';
    });
    bindRange('param-feedback', 'val-feedback', (v) => { state.params.feedbackStrength = parseFloat(v); });

    // Layer checkboxes
    const layerKeys = ['site', 'agents', 'trails', 'voronoi', 'forces', 'programs', 'walls', 'circulation', 'labels'];
    layerKeys.forEach(k => {
      const el = document.getElementById(`layer-${k}`);
      if (el) {
        el.addEventListener('change', () => {
          state.layers[k] = el.checked;
          render();
        });
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        document.getElementById('btn-play').click();
      } else if (e.key === 'r' || e.key === 'R') {
        document.getElementById('btn-reset').click();
      } else if (e.key === 's' || e.key === 'S') {
        document.getElementById('btn-step').click();
      }
    });
  }

  function bindRange(id, valId, callback, unit = '') {
    const input = document.getElementById(id);
    const label = document.getElementById(valId);
    if (!input || !label) return;
    input.addEventListener('input', () => {
      label.textContent = `${input.value}${unit}`;
      callback(input.value);
    });
  }

  function bindToggle(id, callback) {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('change', () => callback(input.checked));
  }

  function adjustAgentCount() {
    const target = state.params.agentCount;
    while (state.agents.length > target) {
      state.agents.pop();
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of state.sitePolygon) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    while (state.agents.length < target) {
      const x = minX + 20 + Math.random() * (maxX - minX - 40);
      const y = minY + 20 + Math.random() * (maxY - minY - 40);
      if (Vec.pointInPolygon({ x, y }, state.sitePolygon)) {
        state.agents.push(new Agent(x, y));
      }
    }
  }

  function syncUIValues() {
    const setVal = (id, val, valId, unit = '') => {
      const el = document.getElementById(id);
      const lbl = document.getElementById(valId);
      if (el) el.value = val;
      if (lbl) lbl.textContent = `${val}${unit}`;
    };
    const setChk = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = val;
    };

    setVal('param-agent-count', state.params.agentCount, 'val-agent-count');
    setVal('param-speed', state.params.speed, 'val-speed');
    setVal('param-randomness', state.params.randomness, 'val-randomness');
    setVal('param-influence-radius', state.params.influenceRadius, 'val-influence-radius', 'px');

    setChk('toggle-attraction', state.params.attractionEnabled);
    setVal('param-attraction', state.params.attractionStrength, 'val-attraction');
    setChk('toggle-repulsion', state.params.repulsionEnabled);
    setVal('param-repulsion', state.params.repulsionStrength, 'val-repulsion');
    setChk('toggle-separation', state.params.separationEnabled);
    setVal('param-separation', state.params.separationStrength, 'val-separation');
    setChk('toggle-alignment', state.params.alignmentEnabled);
    setVal('param-alignment', state.params.alignmentStrength, 'val-alignment');
    setChk('toggle-boundary', state.params.boundaryEnabled);
    setVal('param-boundary', state.params.boundaryStrength, 'val-boundary');

    setChk('toggle-feedback', state.params.feedbackEnabled);
    setVal('param-feedback', state.params.feedbackStrength, 'val-feedback');
    document.getElementById('hud-feedback-status').textContent = state.params.feedbackEnabled ? 'ACTIVE' : 'OFF';
  }

  function updateTelemetryUI() {
    document.getElementById('hud-iteration').textContent = String(state.iteration).padStart(5, '0');
    document.getElementById('metric-agents').textContent = state.agents.length;
    document.getElementById('metric-cells').textContent = state.cells.length;
    document.getElementById('metric-avg-area').textContent = `${(state.stats.avgArea * 0.1).toFixed(0)} m²`;
    document.getElementById('metric-density').textContent = state.stats.densityVariance;
    document.getElementById('metric-forces').textContent = `${state.attractors.length} / ${state.repulsors.length}`;
    document.getElementById('metric-flux').textContent = `${state.stats.flux}%`;

    // Program bars
    const dist = state.stats.progDist;
    document.getElementById('bar-public').style.width = `${dist.public}%`;
    document.getElementById('pct-public').textContent = `${dist.public}%`;

    document.getElementById('bar-studio').style.width = `${dist.studio}%`;
    document.getElementById('pct-studio').textContent = `${dist.studio}%`;

    document.getElementById('bar-private').style.width = `${dist.private}%`;
    document.getElementById('pct-private').textContent = `${dist.private}%`;

    document.getElementById('bar-service').style.width = `${dist.service}%`;
    document.getElementById('pct-service').textContent = `${dist.service}%`;
  }

  // =========================================================================
  // 15. STARTUP
  // =========================================================================
  window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('main-canvas');
    ctx = canvas.getContext('2d');

    handleResize();
    window.addEventListener('resize', handleResize);

    setupCanvasInteractions();
    bindUI();
    computeVoronoiAndArchitecture();
    updateTelemetryUI();

    // Start 60fps simulation loop
    loop();
  });

})();
