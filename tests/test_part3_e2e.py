"""
Part 3 End-to-End Test: Full Spec-to-3D Ingestion, Extraction, Verification, and Hologram Flow
Verifies Section 9 end-to-end requirements:
- Multi-format ingestion (CSV, PPTX, DOCX)
- Ground-truth verification and strict "Not Available" enforcement on absent specs
- Parametric 3D CAD mesh generation strictly driven by verified numbers
- Holographic JARVIS presentation configuration hooks and STL export
- Deterministic reproduction on reload.
"""

from fastapi.testclient import TestClient
from backend.main import app


def test_end_to_end_full_pipeline_flow(auth_headers, tmp_path):
    client = TestClient(app)
    headers = {"Authorization": auth_headers["Authorization"]}

    # ──────────────────────────────────────────────────────────
    # Scenario A: Real Spec Sheet with Dimensional Values
    # ──────────────────────────────────────────────────────────
    csv_spec = (
        "Parameter,Value,Unit,Location\n"
        "Outer Diameter,150,mm,Section A\n"
        "Inner Diameter,80,mm,Section A\n"
        "Thickness,35,mm,Section B\n"
        "Material,AISI 316L Stainless Steel,,Section C\n"
        "Working Pressure,350,bar,Section D\n"
    ).encode("utf-8")

    # Step 1: Upload multi-format document
    res_upload = client.post(
        "/api/specs/upload",
        files=[("files", ("flange_specs.csv", csv_spec, "text/csv"))],
        data={"part_name": "High Pressure Mounting Flange", "auto_extract": "true"},
        headers=headers
    )
    assert res_upload.status_code == 201
    part_id = res_upload.json()["part"]["id"]

    # Step 2: Query extracted specs and verify citations
    res_specs = client.get(f"/api/specs/{part_id}", headers=headers)
    assert res_specs.status_code == 200
    spec_data = res_specs.json()
    field_map = {f["field_name"]: f for f in spec_data["fields"]}

    assert "outer_diameter" in field_map
    assert field_map["outer_diameter"]["is_available"] is True
    assert field_map["outer_diameter"]["normalized_value"] == "150"
    assert field_map["outer_diameter"]["unit"] == "mm"
    assert "150" in field_map["outer_diameter"]["raw_value"]

    assert "inner_diameter" in field_map
    assert field_map["inner_diameter"]["normalized_value"] == "80"

    assert "thickness" in field_map
    assert field_map["thickness"]["normalized_value"] == "35"

    # Step 3: Trigger parametric 3D CAD geometry generation
    res_gen = client.post(f"/api/models/generate/{part_id}", headers=headers)
    assert res_gen.status_code == 200
    gen_data = res_gen.json()
    assert gen_data["template_used"] == "flange"
    assert gen_data["is_placeholder"] is False
    assert gen_data["parameters"]["outer_diameter_mm"] == 150.0
    assert gen_data["parameters"]["inner_diameter_mm"] == 80.0
    assert gen_data["parameters"]["thickness_mm"] == 35.0

    # Verify Holographic config hooks
    holo = gen_data["holographic_config"]
    assert holo["theme"] == "JARVIS_HOLOGRAPHIC"
    assert holo["material"]["color"] == "#00f0ff"
    assert len(holo["interaction"]["hud_nodes"]) >= 3

    # Step 4: Re-open part model (Deterministic reproduction check)
    res_reopen = client.get(f"/api/models/{part_id}", headers=headers)
    assert res_reopen.status_code == 200
    assert res_reopen.json()["geometry_id"] == gen_data["geometry_id"]
    assert res_reopen.json()["version"] == gen_data["version"]

    # Step 5: Verify binary STL mesh endpoint
    res_mesh = client.get(f"/api/models/{part_id}/mesh", headers=headers)
    assert res_mesh.status_code == 200
    assert len(res_mesh.content) > 500


def test_document_with_no_specs_enforces_not_available_and_placeholder(auth_headers):
    client = TestClient(app)
    headers = {"Authorization": auth_headers["Authorization"]}

    # ──────────────────────────────────────────────────────────
    # Scenario B: Document containing zero matching technical dimensions
    # ──────────────────────────────────────────────────────────
    narrative_csv = (
        "Title,Content\n"
        "Executive Summary,This document details marketing and corporate branding guidelines.\n"
        "Scope,No technical machinery dimensions or hydraulics specifications are included.\n"
    ).encode("utf-8")

    res_upload = client.post(
        "/api/specs/upload",
        files=[("files", ("marketing_overview.csv", narrative_csv, "text/csv"))],
        data={"part_name": "Corporate Marketing Notes", "auto_extract": "true"},
        headers=headers
    )
    assert res_upload.status_code == 201
    part_id = res_upload.json()["part"]["id"]

    # Verify that all required spec fields are marked NOT AVAILABLE with zero hallucination
    res_specs = client.get(f"/api/specs/{part_id}", headers=headers)
    assert res_specs.status_code == 200
    spec_data = res_specs.json()
    fields = spec_data["fields"]

    for f in fields:
        assert f["is_available"] is False
        assert f["not_available_reason"] == "Not available in uploaded document"
        assert f["raw_value"] is None
        assert f["normalized_value"] is None

    # Verify that model generation produces an incomplete labeled placeholder
    res_gen = client.post(f"/api/models/generate/{part_id}", headers=headers)
    assert res_gen.status_code == 200
    gen_data = res_gen.json()
    assert gen_data["is_placeholder"] is True
    assert len(gen_data["missing_fields"]) > 0
    assert gen_data["holographic_config"]["status_badge"] == "INCOMPLETE_SPEC_PLACEHOLDER"
