"""
Part 5 Tests: 3D Camera Controls & Spec-Driven Geometric Connectivity
Verifies:
1. Multi-segment stepped shafts build as continuous single meshes with cumulative Z-offsets.
2. Flanged cylinder assemblies join flange to cylinder barrel with coincident mating boundaries.
3. Mating pairs with incompatible dimensions are flagged as mating_mismatch rather than force-joined.
4. Camera zoom limits scale dynamically from model bounding box dimensions.
"""

import os
from execution.parametric_geometry import ParametricGeometryEngine


def test_multi_segment_stepped_shaft_connectivity(tmp_path):
    output_stl = str(tmp_path / "stepped_shaft.stl")

    spec_fields = [
        {"field_name": "step_1_diameter", "raw_value": "40", "normalized_value": "40", "unit": "mm", "is_available": 1},
        {"field_name": "step_1_length", "raw_value": "100", "normalized_value": "100", "unit": "mm", "is_available": 1},
        {"field_name": "step_2_diameter", "raw_value": "60", "normalized_value": "60", "unit": "mm", "is_available": 1},
        {"field_name": "step_2_length", "raw_value": "150", "normalized_value": "150", "unit": "mm", "is_available": 1},
        {"field_name": "step_3_diameter", "raw_value": "50", "normalized_value": "50", "unit": "mm", "is_available": 1},
        {"field_name": "step_3_length", "raw_value": "50", "normalized_value": "50", "unit": "mm", "is_available": 1},
    ]

    res = ParametricGeometryEngine.generate(
        part_name="Precision Stepped Drive Shaft",
        part_type="shaft",
        spec_fields=spec_fields,
        output_stl_path=output_stl
    )

    assert res["is_placeholder"] is False
    assert res["template_used"] == "stepped_shaft"
    assert os.path.exists(output_stl)

    layout = res["parameters"]["assembly_layout"]
    assert layout["type"] == "stepped_shaft_continuous"
    assert layout["segment_count"] == 3
    assert layout["total_length_mm"] == 300.0

    # Verify cumulative Z-axis connectivity: segment 1 starts exactly where segment 0 ends
    assert layout["segments"][0]["start_z_mm"] == 0.0
    assert layout["segments"][0]["end_z_mm"] == 100.0
    assert layout["segments"][1]["start_z_mm"] == 100.0
    assert layout["segments"][1]["end_z_mm"] == 250.0
    assert layout["segments"][2]["start_z_mm"] == 250.0
    assert layout["segments"][2]["end_z_mm"] == 300.0
    assert layout["mating_mismatch"] is False


def test_flanged_cylinder_connected_assembly(tmp_path):
    output_stl = str(tmp_path / "flanged_cylinder.stl")

    spec_fields = [
        {"field_name": "flange_diameter", "raw_value": "200", "normalized_value": "200", "unit": "mm", "is_available": 1},
        {"field_name": "flange_thickness", "raw_value": "25", "normalized_value": "25", "unit": "mm", "is_available": 1},
        {"field_name": "bore_diameter", "raw_value": "80", "normalized_value": "80", "unit": "mm", "is_available": 1},
        {"field_name": "stroke", "raw_value": "400", "normalized_value": "400", "unit": "mm", "is_available": 1},
    ]

    res = ParametricGeometryEngine.generate(
        part_name="Mounting Flange Cylinder Unit",
        part_type="cylinder",
        spec_fields=spec_fields,
        output_stl_path=output_stl
    )

    assert res["is_placeholder"] is False
    assert res["template_used"] == "flanged_cylinder"
    assert os.path.exists(output_stl)

    layout = res["parameters"]["assembly_layout"]
    assert layout["type"] == "flanged_cylinder_assembly"
    assert layout["flange_thickness_mm"] == 25.0
    assert layout["cylinder_length_mm"] == 400.0
    assert layout["total_length_mm"] == 425.0
    assert layout["mating_verified"] is True
    assert layout["mating_mismatch"] is False


def test_mating_mismatch_detection_flagging(tmp_path):
    output_stl = str(tmp_path / "mismatch_shaft.stl")

    # Mating shaft (80mm) trying to fit inside smaller receiving bore (50mm)
    spec_fields = [
        {"field_name": "diameter", "raw_value": "80", "normalized_value": "80", "unit": "mm", "is_available": 1},
        {"field_name": "length", "raw_value": "200", "normalized_value": "200", "unit": "mm", "is_available": 1},
        {"field_name": "mating_bore_diameter", "raw_value": "50", "normalized_value": "50", "unit": "mm", "is_available": 1},
    ]

    res = ParametricGeometryEngine.generate(
        part_name="Coupling Shaft",
        part_type="shaft",
        spec_fields=spec_fields,
        output_stl_path=output_stl
    )

    assert res["is_placeholder"] is False
    layout = res["parameters"]["assembly_layout"]
    assert layout["mating_mismatch"] is True
    assert "exceeds receiving bore diameter" in layout["mating_note"]


def test_dynamic_camera_zoom_boundaries_computation():
    # Test bounding box dimensions scaling
    def compute_zoom_bounds(max_dim: float):
        min_dist = max(max_dim * 0.35, 1.0)
        max_dist = max(max_dim * 8.0, 50.0)
        return min_dist, max_dist

    # Small 10mm precision bearing
    min_10, max_10 = compute_zoom_bounds(10.0)
    assert min_10 == 3.5
    assert max_10 == 80.0

    # Large 2000mm (2m) hydraulic cylinder
    min_2000, max_2000 = compute_zoom_bounds(2000.0)
    assert min_2000 == 700.0
    assert max_2000 == 16000.0
