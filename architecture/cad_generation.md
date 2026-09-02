# SOP: CAD Generation (`generate_cad.py`)

## Purpose
Generate dimensionally exact parametric 3D models from confirmed parameters, producing STEP + STL files.

## Behavioral Rules
1. **NEVER guess a dimension.** If a required parameter is missing, halt and report which field.
2. **NEVER produce a placeholder shape.** All geometry is a function of confirmed parameters only.
3. All generation steps are logged in `generation_log`.

## Primary Path: FreeCAD Headless

### Invocation
```bash
freecadcmd /tmp/freecad_gen_<uuid>.py
```

### Per-Component Templates
Location: `/execution/cad_templates/<component_type>.py`

Each template exports a `generate(params, step_path, stl_path)` function.

### Cylinder Template (`cylinder.py`)
1. Create outer cylinder: `Part::Cylinder` with `Radius = bore_r + wall`, `Height = stroke`
2. Create bore: `Part::Cylinder` with `Radius = bore_r`, `Height = stroke`
3. Boolean cut: `Part::Cut` (outer - bore = hollow body)
4. Create rod: `Part::Cylinder` extending from top
5. Create end caps: `Part::Cylinder` with rod hole cut in top cap
6. Fuse all: `Part::MultiFuse`
7. Recompute: `doc.recompute()`
8. Export STEP: `Import.export([assembly], step_path)`
9. Export STL: `assembly.Shape.tessellate(0.1)` → `Mesh.write(stl_path)`

### Wall Thickness
- Calculated as: `max(bore_radius * 0.15, 5.0)` mm
- This is a proportional engineering standard, not a guess — it's a function of bore diameter

## Fallback Path: Pure-Python STL Generator

If FreeCAD is not installed, a pure-Python parametric STL generator creates binary STL files.

### Supported Primitives
- **Cylinder**: 48-segment tessellation, outer surface + inner bore surface + end caps
- **Tube**: Outer cylinder + inner bore (for hoses)
- **Box**: 12-triangle rectangular prism (for simplified valve/pump bodies)

### Binary STL Format
```
Header: 80 bytes
Triangle count: 4 bytes (uint32 LE)
Per triangle: normal (3×float32) + 3 vertices (9×float32) + attribute (uint16) = 50 bytes
```

### Dimensional Fidelity
- Cylinder radius and height are set EXACTLY to the parameter values
- 48 segments gives < 0.1% deviation from a true circle at typical bore sizes
- No rounding or approximation of input dimensions

## FreeCAD API Reference (Part Workbench)

| Operation | API Call |
|-----------|---------|
| New document | `FreeCAD.newDocument("name")` |
| Add cylinder | `doc.addObject("Part::Cylinder", "name")` |
| Set dimension | `obj.Radius = value`, `obj.Height = value` |
| Boolean cut | `doc.addObject("Part::Cut", "name")` |
| Boolean fuse | `doc.addObject("Part::MultiFuse", "name")` |
| Position | `obj.Placement = FreeCAD.Placement(Vector, Rotation)` |
| Recompute | `doc.recompute()` |
| Export STEP | `Import.export([obj], "path.step")` |
| Export STL | `Shape.tessellate(deviation)` + `Mesh.write("path.stl")` |

## Golden Rule
If generation logic changes, update this SOP BEFORE modifying the code.
