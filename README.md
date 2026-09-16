# Design-7-Exploration

Design-7-Exploration is an interactive generative morphogenesis laboratory exploring agent-based Voronoi systems as a generative method for architecture. Rather than generating rigid floor plans, the system visualizes the direct emergence pipeline: Agents → Movement → Point Distribution → Voronoi Cells → Spatial Organization → Architectural Form, featuring an active reciprocal feedback loop where emerging spaces steer agent behavior.

## Features
- **Emergent Morphogenetic Pipeline**: Real-time simulation demonstrating how simple local rules create complex global architectural organization.
- **Dynamic Agent Swarm**: 50–400 autonomous agents with tunable attraction, repulsion, separation, velocity alignment, boundary steering, and wander noise.
- **Architectural Translation Mode**: Translates Voronoi geometry into architectural spaces—programmatic classifications (Civic Plazas, Active Forums, Cellular Suites, Service Cores), thick exterior/interior partition walls, doorway portals, and circulation spines.
- **Reciprocal Feedback Loop**: Emerging spatial conditions dynamically guide agent flow (agents channel into expansive plazas and circulation axes, avoiding enclosed cores).
- **Interactive Attractors & Repulsors**: Click and drag attractors and repulsors directly on canvas to restructure the spatial field in real time.
- **Editable Architectural Site Boundary**: Interactive polygonal site boundary with vertex dragging and edge division.
- **7 Experimental Presets**:
  - `01 Uniform`: Calm, homogeneous cellular field
  - `02 Central Attractor`: Dense core surrounded by peripheral expanses
  - `03 Multi Attractors`: Twin civic loci with intermediate threshold
  - `04 Flow Promenade`: Directional promenade with elongated circulation galleries
  - `05 Collision Mosaic`: Territorial cellular mosaic with high separation
  - `06 Organic Growth`: Amoebic, biomimetic field
  - `07 Arch Feedback`: Full reciprocal morphogenesis loop
- **Studio 5-Step Sequence Analysis**: Deconstructs emergence into 5 presentation stages (Agents → Behavior → Voronoi → Spatial → Architectural) and 5-stage matrix.
- **Publication & Studio Diagram Export**: Clean vector SVG export with semantic layer groups and high-resolution 2x PNG export.

## Getting Started
1. Clone the repository:
   ```bash
   git clone https://github.com/anaborr/Design-7-Exploration.git
   ```
2. Open `index.html` directly in any modern web browser or serve locally:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\server.ps1
   ```
3. Navigate to `http://127.0.0.1:8080/` in your browser.

## Controls
- **Canvas Interaction**:
  - `Left Click + Drag`: Move attractors, repulsors, or site boundary vertices (or pan canvas).
  - `Mouse Wheel`: Zoom in/out centered at cursor.
  - `Shift + Drag` or `Middle Click`: Pan canvas view.
  - `Right Click`: Delete attractor or repulsor under cursor.
- **Keyboard Shortcuts**:
  - `Space`: Play / Pause simulation
  - `S`: Step simulation by 1 iteration
  - `R`: Reset agent swarm
- **Top Bar Controls**:
  - `RESET` / `PAUSE` / `STEP`: Simulation clock controls
  - `SNAPSHOT`: Save current spatial configuration to the history gallery
  - `PNG` / `SVG`: Export publication-ready diagrams
  - `DIAGRAM SEQUENCE`: Open 5-stage studio sequence modal
