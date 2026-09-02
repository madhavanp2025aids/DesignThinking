"""
Part 2 Tests: Parametric 3D Geometry Generation & Holographic Presentation Layer
Tests parametric CAD mesh building, unit conversion, deterministic reproduction,
placeholder handling for missing specs, JARVIS holographic config hooks, and API endpoints.
"""

import os
from fastapi.testclient import TestClient
from backend.main import app
from execution.parametric_geometry import ParametricGeometryEngine, normalize_to_mm
from execution.holographic_config import generate_holographic_config


def test_unit_normalization():
    assert normalize_to_mm(10, "mm") == 10.0
    assert normalize_to_mm(2.5, "cm") == 25.0
    assert normalize_to_mm(2, "in") == 50.8
    assert normalize_to_mm(2, "inch") == 50.8
    assert normalize_to_mm(1, "m") == 1000.0


def test_parametric_cylinder_generation(tmp_path):
    stl_file = tmp_path / "cylinder.stl"
    specs = [
        {"id": "f1", "field_name": "bore_diameter", "raw_value": "80 mm", "normalized_value": "80", "unit": "mm", "is_available": 1, "source_snippet": "Bore: 80 mm"},
        {"id": "f2", "field_name": "stroke", "raw_value": "400 mm", "normalized_value": "400", "unit": "mm", "is_available": 1, "source_snippet": "Stroke = 400 mm"},
        {"id": "f3", "field_name": "rod_diameter", "raw_value": "45 mm", "normalized_value": "45", "unit": "mm", "is_available": 1, "source_snippet": "Rod: 45 mm"},
    ]

    res = ParametricGeometryEngine.generate("Hydraulic Actuator", "cylinder", specs, str(stl_file))
    assert res["is_placeholder"] is False
    assert res["template_used"] == "cylinder"
    assert res["parameters"]["bore_diameter_mm"] == 80.0
    assert res["parameters"]["stroke_mm"] == 400.0
    assert res["parameters"]["rod_diameter_mm"] == 45.0
    assert os.path.exists(str(stl_file))
    assert os.path.getsize(str(stl_file)) > 1000


def test_parametric_shaft_generation(tmp_path):
    stl_file = tmp_path / "shaft.stl"
    specs = [
        {"id": "f1", "field_name": "diameter", "raw_value": "2 in", "normalized_value": "2", "unit": "in", "is_available": 1, "source_snippet": "Shaft Dia: 2 in"},
        {"id": "f2", "field_name": "length", "raw_value": "300 mm", "normalized_value": "300", "unit": "mm", "is_available": 1, "source_snippet": "Length: 300 mm"},
    ]

    res = ParametricGeometryEngine.generate("Drive Shaft", "shaft", specs, str(stl_file))
    assert res["is_placeholder"] is False
    assert res["template_used"] == "shaft"
    assert res["parameters"]["diameter_mm"] == 50.8  # 2 inches converted to 50.8 mm
    assert res["parameters"]["length_mm"] == 300.0
    assert os.path.exists(str(stl_file))


def test_missing_dimensions_triggers_placeholder(tmp_path):
    stl_file = tmp_path / "flange_incomplete.stl"
    # Only outer diameter present; inner diameter & thickness are missing
    specs = [
        {"id": "f1", "field_name": "outer_diameter", "raw_value": "200 mm", "normalized_value": "200", "unit": "mm", "is_available": 1},
        {"id": "f2", "field_name": "inner_diameter", "raw_value": None, "normalized_value": None, "is_available": 0, "not_available_reason": "Not available in uploaded document"},
    ]

    res = ParametricGeometryEngine.generate("Mounting Flange", "flange", specs, str(stl_file))
    assert res["is_placeholder"] is True
    assert "inner_diameter" in res["missing_fields"]
    assert "thickness" in res["missing_fields"]


def test_holographic_config_generation():
    params = {"bore_diameter_mm": 100, "stroke_mm": 500}
    anchors = [{"name": "Bore Diameter", "pos": [50, 0, 0], "field": {"raw_value": "100 mm", "unit": "mm", "source_location": "Page 1"}}]

    holo = generate_holographic_config("cylinder", params, anchors, is_placeholder=False)
    assert holo["theme"] == "JARVIS_HOLOGRAPHIC"
    assert holo["material"]["color"] == "#00f0ff"
    assert holo["material"]["fresnel_glow"]["enabled"] is True
    assert holo["reveal_animation"]["type"] == "wireframe_scan"
    assert len(holo["interaction"]["hud_nodes"]) == 1


def test_api_models_and_specs_endpoints(auth_headers):
    client = TestClient(app)
    headers = {"Authorization": auth_headers["Authorization"]}

    # 1. POST /api/specs/upload with a CSV file
    csv_bytes = b"Parameter,Value,Unit\nBore Diameter,90,mm\nStroke Length,550,mm\nRod Diameter,50,mm\nMaterial,Steel 4140,\n"
    res_upload = client.post(
        "/api/specs/upload",
        files=[("files", ("hydac_cylinder.csv", csv_bytes, "text/csv"))],
        data={"part_name": "HYDAC Master Ram", "auto_extract": "true"},
        headers=headers
    )
    assert res_upload.status_code == 201
    part_id = res_upload.json()["part"]["id"]

    # 2. GET /api/specs/{part_id}
    res_spec = client.get(f"/api/specs/{part_id}", headers=headers)
    assert res_spec.status_code == 200
    spec_data = res_spec.json()
    assert spec_data["part"]["id"] == part_id
    assert len(spec_data["fields"]) > 0

    # 3. POST /api/models/generate/{part_id}
    res_gen = client.post(f"/api/models/generate/{part_id}", headers=headers)
    assert res_gen.status_code == 200
    model_data = res_gen.json()
    assert model_data["template_used"] == "cylinder"
    assert model_data["is_placeholder"] is False
    assert model_data["parameters"]["bore_diameter_mm"] == 90.0
    assert model_data["holographic_config"]["theme"] == "JARVIS_HOLOGRAPHIC"

    # 4. GET /api/models/{part_id} (Deterministic re-render cache check)
    res_get_model = client.get(f"/api/models/{part_id}", headers=headers)
    assert res_get_model.status_code == 200
    assert res_get_model.json()["geometry_id"] == model_data["geometry_id"]

    # 5. GET /api/models/{part_id}/mesh (STL stream check)
    res_mesh = client.get(f"/api/models/{part_id}/mesh", headers=headers)
    assert res_mesh.status_code == 200
    assert len(res_mesh.content) > 500
    assert res_mesh.headers["content-type"] in ("model/stl", "application/octet-stream")
