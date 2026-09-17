# Design-7-Exploration

**EMERGENT / VORONOI SYSTEM** is an interactive computational design laboratory for exploring agent-based Voronoi emergence as a generative method for architecture.

The core pipeline demonstrates:
**AGENTS → MOVEMENT → POINT DISTRIBUTION → VORONOI CELLS → SPATIAL ORGANIZATION → ARCHITECTURAL FORM**

Designed in the graphic tradition of architecture-school generative systems, Grasshopper computational experiments, and analytical diagrams, the tool uses a restrained off-white background, crisp dark linework, subtle tonal fills, and precise telemetry to reveal how simple local agent rules synthesize complex global spatial structures.

---

## Key Features

- **Generative Morphogenesis Engine**: Real-time agent physics engine with attraction, repulsion, agent separation, alignment, site boundary avoidance, and controlled wander noise.
- **Continuous Voronoi Geometry**: Real-time Voronoi tessellation clipped to rectangular or irregular polygonal site boundaries via Sutherland-Hodgman polygon clipping.
- **Architectural Translation System**:
  - **Cell Area → Program Scale**: Categorizes cells into Primary, Secondary, Tertiary, Public, and Private territories.
  - **Movement → Circulation Spines**: Accumulates agent trails into continuous circulation axes and active movement fields.
  - **Shared Edges → Walls & Openings**: Dynamically calculates edge traffic to determine wall thickness, portal openings, and spatial thresholds.
- **Reciprocal Architectural Feedback Loop**: A master feedback toggle (`ARCHITECTURAL FEEDBACK: ON / OFF`) where generated spatial conditions (open plazas, circulation paths, enclosed density) directly direct agent movement, producing continuous emergent self-organization.
- **Display Modes**:
  - `AGENTS`: Minimal site & agent positions
  - `BEHAVIOR`: Agents, velocity vectors, trails, attractors, repulsors
  - `VORONOI`: Site, agents, clean Voronoi cells
  - `SPATIAL`: Density fills, cell area metrics, circulation axes
  - `ARCHITECTURAL`: Wall boundaries, portal openings, programmatic hierarchy
  - `FULL SYSTEM`: Complete overlay of all system layers
- **Analysis Presentation Mode**: Interactive 5-stage architectural sequence modal (`01 AGENTS` → `02 BEHAVIOR` → `03 VORONOI` → `04 SPATIAL` → `05 ARCHITECTURE`) with `← PREVIOUS` / `NEXT →` step navigation for studio presentations.
- **3D Geometry Extraction**:
  - **3D Wavefront OBJ (`.obj`)**: Exports extruded 3D solid geometry with separate semantic groups (`Site_Pedestal`, `Programmatic_Volumes`, `Architectural_Walls`) for Rhino, Blender, SketchUp, and CAD software.
  - **3D Printable STL (`.stl`)**: Exports triangulated 3D mesh ready for digital fabrication and 3D printing.
- **Interactive Spatial Tools**: Place and drag Attractors (`○`) and Repulsors (`×`), drag site boundary vertices, zoom/pan canvas, capture state snapshots, and scrub iteration timeline.
- **12 Layer Toggles & Analytical Telemetry**: Toggle site, agents, trails, vectors, Voronoi, attractors, repulsors, circulation, architectural cells, walls, openings, and labels with live calculation of average cell area, density, circulation percentage, and open edge counts.

---

## 7 Generative Presets

1. **UNIFORM**: Homogeneous cellular layout with balanced separation.
2. **CENTRAL ATTRACTOR**: Single central force drawing agents into a dense core with surrounding expanses.
3. **MULTIPLE ATTRACTORS**: Multi-nodal spatial organization forming distinct territorial zones.
4. **FLOW**: Directional velocity alignment creating elongated Voronoi cells and linear circulation promenades.
5. **COLLISION**: High separation and repulsion producing a dispersed cellular mosaic.
6. **ORGANIC GROWTH**: Evolving field combining attraction, separation, and controlled noise.
7. **ARCHITECTURAL FEEDBACK**: Complete reciprocal loop where spatial boundaries actively steer agent trajectories.

---

## Getting Started

1. **Live Application**:
   [https://anaborr.github.io/Design-7-Exploration/](https://anaborr.github.io/Design-7-Exploration/)

2. **Local Run**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\server.ps1
   ```
   Open `http://127.0.0.1:8080/` in your browser.

---

## User Controls

- **Simulation Controls**: `PLAY / PAUSE` (Space), `STEP` (S), `RESET` (R), Iteration Scrubbing.
- **Export Options**: `EXPORT PNG` (2D image), `EXPORT SVG` (2D vector diagram), `EXPORT OBJ` (3D geometry), `EXPORT STL` (3D print mesh).
- **Canvas Gestures**:
  - `Left Click + Drag`: Position Attractors, Repulsors, or Site Vertices.
  - `Mouse Wheel`: Zoom canvas.
  - `Shift + Drag` or `Middle Click`: Pan view.
  - `Right Click`: Remove selected object.

