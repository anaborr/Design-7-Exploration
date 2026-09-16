# Design-7-Exploration

Design-7-Exploration is an interactive generative morphogenesis laboratory exploring agent-based Voronoi systems as a generative method for architecture. Rather than generating rigid floor plans, the system visualizes the direct emergence pipeline: Agents → Movement → Point Distribution → Voronoi Cells → Spatial Organization → Architectural Form, featuring an active reciprocal feedback loop where emerging spaces steer agent behavior.

## Features
- **Emergent Morphogenetic Pipeline**: Real-time simulation demonstrating how simple local rules create complex global architectural organization.
- **3D Geometry Extraction**:
  - **3D OBJ Export (`.obj`)**: Generates 3D Wavefront OBJ geometry with separate named groups (`Site_Pedestal_Slab`, `Architectural_Program_Volumes`, `Architectural_Wall_Partitions`) compatible with Rhino, Blender, SketchUp, Revit, and AutoCAD.
  - **3D STL Export (`.stl`)**: Generates triangulated 3D solids for direct digital fabrication and 3D printing.
  - **3D Axonometric View Mode (`3D Axono`)**: Live 3D isometric massing visualization mode with adjustable wall heights and shading.
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
- **Publication & Studio Diagram Export**: Clean 2D vector SVG export with semantic layer groups, high-resolution 2x 2D PNG export, and 3D OBJ/STL export.

## Getting Started
1. Access the live web application on GitHub Pages:
   [https://anaborr.github.io/Design-7-Exploration/](https://anaborr.github.io/Design-7-Exploration/)
2. Or run locally:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\server.ps1
   ```
   Navigate to `http://127.0.0.1:8080/` in your browser.

## Controls
- **Top Bar Controls**:
  - `3D OBJ`: Export 3D Wavefront OBJ geometry (`.obj`)
  - `3D STL`: Export 3D Printable STL mesh (`.stl`)
  - `PNG` / `SVG`: Export 2D publication-ready diagrams
  - `DIAGRAM SEQUENCE`: Open 5-stage studio sequence modal
  - `RESET` / `PAUSE` / `STEP`: Simulation clock controls
  - `SNAPSHOT`: Save current spatial configuration
- **Visualization Modes**: `Agents` | `Vectors` | `Voronoi` | `Spatial` | `Architecture` | `3D Axono`
- **Canvas Interaction**:
  - `Left Click + Drag`: Move attractors, repulsors, or site boundary vertices (or pan canvas).
  - `Mouse Wheel`: Zoom in/out centered at cursor.
  - `Shift + Drag` or `Middle Click`: Pan canvas view.
  - `Right Click`: Delete attractor or repulsor under cursor.
- **Keyboard Shortcuts**:
  - `Space`: Play / Pause simulation
  - `S`: Step simulation by 1 iteration
  - `R`: Reset agent swarm
