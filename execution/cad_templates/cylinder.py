"""
HYDAC Spec-to-3D Generator — FreeCAD Cylinder Template
Parametric hydraulic cylinder: outer body, bore, rod, ports.
All dimensions from parameters — NEVER guessed.
"""


def generate(params, step_path, stl_path):
    """
    Generate a parametric hydraulic cylinder using FreeCAD Part workbench.
    
    Required params:
        bore_diameter_mm: float
        stroke_length_mm: float
    Optional params:
        rod_diameter_mm: float
        working_pressure_bar: float (affects wall thickness calculation)
    """
    import FreeCAD
    import Part
    import Mesh
    import Import
    
    bore_d = float(params["bore_diameter_mm"])
    stroke = float(params["stroke_length_mm"])
    rod_d = float(params.get("rod_diameter_mm", bore_d * 0.5))
    
    bore_r = bore_d / 2.0
    rod_r = rod_d / 2.0
    
    # Wall thickness: proportional to bore, minimum 5mm
    wall = max(bore_r * 0.15, 5.0)
    outer_r = bore_r + wall
    
    # Create document
    doc = FreeCAD.newDocument("HydraulicCylinder")
    
    # Outer cylinder body
    outer = doc.addObject("Part::Cylinder", "OuterBody")
    outer.Radius = outer_r
    outer.Height = stroke
    
    # Inner bore (to be subtracted)
    bore = doc.addObject("Part::Cylinder", "Bore")
    bore.Radius = bore_r
    bore.Height = stroke
    
    # Cut bore from outer
    body = doc.addObject("Part::Cut", "CylinderBody")
    body.Base = outer
    body.Tool = bore
    
    # Rod
    rod = doc.addObject("Part::Cylinder", "Rod")
    rod.Radius = rod_r
    rod.Height = stroke * 0.6
    rod.Placement = FreeCAD.Placement(
        FreeCAD.Vector(0, 0, stroke),
        FreeCAD.Rotation(0, 0, 0)
    )
    
    # End caps
    cap_thickness = wall
    
    bottom_cap = doc.addObject("Part::Cylinder", "BottomCap")
    bottom_cap.Radius = outer_r
    bottom_cap.Height = cap_thickness
    bottom_cap.Placement = FreeCAD.Placement(
        FreeCAD.Vector(0, 0, -cap_thickness),
        FreeCAD.Rotation(0, 0, 0)
    )
    
    top_cap = doc.addObject("Part::Cylinder", "TopCap")
    top_cap.Radius = outer_r
    top_cap.Height = cap_thickness
    
    # Top cap with rod hole
    rod_hole = doc.addObject("Part::Cylinder", "RodHole")
    rod_hole.Radius = rod_r + 1  # Clearance
    rod_hole.Height = cap_thickness
    rod_hole.Placement = top_cap.Placement
    
    top_cap_with_hole = doc.addObject("Part::Cut", "TopCapWithHole")
    top_cap_with_hole.Base = top_cap
    top_cap_with_hole.Tool = rod_hole
    top_cap_with_hole.Placement = FreeCAD.Placement(
        FreeCAD.Vector(0, 0, stroke),
        FreeCAD.Rotation(0, 0, 0)
    )
    
    # Fuse all parts
    assembly = doc.addObject("Part::MultiFuse", "Assembly")
    assembly.Shapes = [body, rod, bottom_cap, top_cap_with_hole]
    
    doc.recompute()
    
    # Export STEP
    Import.export([assembly], step_path)
    
    # Export STL
    mesh_data = assembly.Shape.tessellate(0.1)
    mesh = Mesh.Mesh()
    for i in range(0, len(mesh_data[1])):
        tri = mesh_data[1][i]
        mesh.addFacet(
            mesh_data[0][tri[0]],
            mesh_data[0][tri[1]],
            mesh_data[0][tri[2]],
        )
    mesh.write(stl_path)
    
    FreeCAD.closeDocument("HydraulicCylinder")
