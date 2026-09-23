# Design-7-Exploration

**Architectural Design Reasoning & Form-Finding System** is a browser-based computational design platform developed for architecture students to explore spatial typology seeds, descriptor design intentions, design reasoning strategies, base spatial topologies, and Art Nouveau-inspired section form-finding.

Rather than generating arbitrary mathematical curves or random decorative ornament, the system enforces a rigorous 9-stage architectural design reasoning pipeline:

```
TYPOLOGY 
  → DESIGN INTENT 
  → ARCHITECTURAL REASONING 
  → SPATIAL RULES 
  → BASE SPATIAL TOPOLOGY 
  → ART NOUVEAU FORM-FINDING 
  → GEOMETRY 
  → QUANTITATIVE EVALUATION 
  → COMPARE AGAINST INTENT (TARGET vs RESULT) 
  → REASON + REFINE
```

---

## Workflow Stages

### 01 SELECT TYPOLOGY
Choose from 16 distinct architectural spatial seed typologies across 3 categories:
- **LOBBY**: `Vertical Void`, `Compressed Sequential`, `Continuous Hall`, `Topographic / Ground-Field`, `Linear Gallery`.
- **WORKSPACE**: `Open Hall`, `Cascaded / Terraced`, `Flat Deep-Plan Plate`, `Void-Edge`, `Folded / Undulated Surface`.
- **GATHERING**: `Stepped Amphitheater`, `Void Gathering`, `Inserted Horizontal Plate`, `Room Within a Volume`, `Linear Edge Gallery`.

### 02 SET DESIGN INTENT
Set targets (`LOW`, `MEDIUM`, `HIGH`, `PRIMARY PRIORITY`) for the 12 descriptors across Formal/Geometric, Organizational/Spatial, and Experiential/Atmospheric categories.

### 03 ARCHITECTURAL REASONING
The engine executes `reasonAboutDesign(typology, descriptorTargets)` to synthesize a multi-step **DESIGN STRATEGY** and resolve spatial conflicts (e.g. `HIGH INTIMACY + HIGH POROSITY`, `HIGH DYNAMIC + HIGH CLARITY`, `HIGH COMMUNAL + HIGH INTIMACY`).

### 04 GENERATION
- **Base Spatial Topology**: Synthesizes an internal 2D spatial graph (plates, occupied zones, voids, circulation routes, decision nodes, focal points).
- **Art Nouveau Form-Finding**: Applies structural whiplash S-curves and continuous floor-wall-ceiling transitions directly onto the topology.
- **Viewer Toggles**: `FINAL GEOMETRY`, `SPATIAL LOGIC` (topology diagram), `ANALYSIS` (1.8m human reference figure, nodes, portals), `CONTROL GEOMETRY`.

### 05 EVALUATION & REFINE
- Measures quantitative metrics directly from SVG geometry.
- Compares results against design intent targets (`PASS` / `NEEDS REVISION`) with diagnostic explanations.
- **REASON + REFINE**: Intelligently inspects failing targets, applies topological fixes, and creates `VERSION 02`, `VERSION 03` with a complete Version History.
- **GENERATE VARIATIONS**: Produces 6 family-related alternative designs inheriting typology and intent.

---

## Getting Started

1. Open `index.html` directly in any web browser, or serve locally using PowerShell:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\server.ps1
   ```
2. Open `http://127.0.0.1:8080/` in your browser.
