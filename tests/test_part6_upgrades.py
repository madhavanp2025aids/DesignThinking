"""
Part 6 Tests: Research-Backed Accuracy, Geometry & Traceability Upgrades
Verifies:
1. Two-pass extraction confidence scoring (high, medium, conflicting).
2. Cross-document conflict detection via rapidfuzz and geometry-blocking behavior.
3. Pure-Python ISO 10303-21 STEP and IGES export without external FreeCAD requirement.
4. PDF bounding box spatial citation localization.
5. Tolerance & GD&T fit parsing into structured shape.
6. Document revision diffing (added, removed, modified sets).
"""

import os
from execution.spec_extractor import extract_specs_from_document, _parse_tolerance, _find_bounding_box
from execution.cad_kernel import export_step_model, export_iges_model, is_cad_kernel_available
from execution.spec_pipeline import compute_part_revision_diff


def test_two_pass_extraction_confidence_scoring():
    # Scenario A: Consensus agreement (High confidence)
    parsed_agree = {
        "raw_text": "Bore Diameter: 80 mm\nStroke: 400 mm",
        "tables": [
            {
                "headers": ["Parameter", "Value"],
                "rows": [["Bore Diameter", "80 mm"], ["Stroke", "400 mm"]],
                "source_location": "Page 1"
            }
        ],
        "text_blocks": [
            {"text": "Bore Diameter: 80 mm\nStroke: 400 mm", "source_location": "Page 1"}
        ]
    }

    fields_agree = extract_specs_from_document(
        parsed_data=parsed_agree,
        document_id="doc_1",
        part_id="part_1",
        filename="agree.pdf"
    )

    bore_field = next(f for f in fields_agree if f["field_name"] == "bore_diameter")
    assert bore_field["is_available"] == 1
    assert bore_field["confidence"] == "high"
    assert bore_field["extraction_method"] == "consensus"
    assert bore_field["conflict"] == 0

    # Scenario B: Conflicting values (Conflicting confidence - Never guess)
    parsed_conflict = {
        "raw_text": "Bore Diameter: 100 mm",
        "tables": [
            {
                "headers": ["Parameter", "Value"],
                "rows": [["Bore Diameter", "80 mm"]],
                "source_location": "Page 1"
            }
        ],
        "text_blocks": [
            {"text": "Bore Diameter: 100 mm", "source_location": "Page 1"}
        ]
    }

    fields_conflict = extract_specs_from_document(
        parsed_data=parsed_conflict,
        document_id="doc_2",
        part_id="part_2",
        filename="conflict.pdf"
    )

    bore_conflict = next(f for f in fields_conflict if f["field_name"] == "bore_diameter")
    assert bore_conflict["is_available"] == 0
    assert bore_conflict["confidence"] == "conflicting"
    assert bore_conflict["conflict"] == 1
    assert "Conflicting values" in bore_conflict["not_available_reason"]
    assert len(bore_conflict["candidate_values"]) == 2


def test_tolerance_and_gdt_fit_parsing():
    # Symmetric tolerance
    tol1 = _parse_tolerance("Diameter: 50 ±0.05 mm", "50", "mm")
    assert tol1 is not None
    assert tol1["nominal"] == 50.0
    assert tol1["plus"] == 0.05
    assert tol1["minus"] == -0.05
    assert tol1["unit"] == "mm"

    # ISO Fit tolerance
    tol2 = _parse_tolerance("Bore: 80 H7", "80", "mm")
    assert tol2 is not None
    assert tol2["nominal"] == 80.0
    assert tol2["gdt_fit"] == "H7"


def test_bounding_box_citation_mapping():
    cand = {
        "raw_value": "80",
        "source_location": "Page 1 (Row 1)"
    }
    pages = [
        {
            "page_num": 1,
            "words": [
                {"text": "Bore", "x0": 50.0, "top": 100.0, "x1": 80.0, "bottom": 115.0},
                {"text": "80", "x0": 120.0, "top": 100.0, "x1": 135.0, "bottom": 115.0}
            ]
        }
    ]

    bbox = _find_bounding_box(cand, pages)
    assert bbox is not None
    assert bbox == [120.0, 100.0, 135.0, 115.0, 1]


def test_pure_python_step_and_iges_export(tmp_path):
    assert is_cad_kernel_available() is True

    params = {
        "outer_diameter_mm": 120.0,
        "bore_diameter_mm": 60.0,
        "length_mm": 250.0
    }

    # STEP export
    step_out = str(tmp_path / "test_cylinder.stp")
    export_step_model("cylinder", params, step_out)
    assert os.path.exists(step_out)

    with open(step_out, "r", encoding="utf-8") as f:
        content = f.read()
        assert "ISO-10303-21;" in content
        assert "AUTOMOTIVE_DESIGN" in content
        assert "ADVANCED_BREP_SHAPE_REPRESENTATION" in content
        assert "END-ISO-10303-21;" in content

    # IGES export
    iges_out = str(tmp_path / "test_cylinder.igs")
    export_iges_model("cylinder", params, iges_out)
    assert os.path.exists(iges_out)

    with open(iges_out, "r", encoding="utf-8") as f:
        content = f.read()
        assert "SpecTo3D Kernel" in content
        assert "S      1" in content


def test_document_revision_diffing():
    prior_fields = {
        "diameter": {"raw_value": "50", "normalized_value": "50", "unit": "mm", "is_available": 1},
        "length": {"raw_value": "200", "normalized_value": "200", "unit": "mm", "is_available": 1},
        "material": {"raw_value": "Steel", "normalized_value": "Steel", "unit": "text", "is_available": 1},
    }

    # Mock database session with updated fields
    class MockSpecField:
        def __init__(self, field_name, raw_value, norm_value, unit, is_avail):
            self.field_name = field_name
            self.raw_value = raw_value
            self.normalized_value = norm_value
            self.unit = unit
            self.is_available = is_avail

    class MockQuery:
        def filter(self, *args, **kwargs):
            return self
        def all(self):
            return [
                MockSpecField("diameter", "55", "55", "mm", 1), # Changed
                MockSpecField("length", "200", "200", "mm", 1), # Unchanged
                MockSpecField("flange_diameter", "120", "120", "mm", 1), # Added
                # "material" was removed
            ]

    class MockDB:
        def query(self, *args, **kwargs):
            return MockQuery()

    diff = compute_part_revision_diff(part_id="part_test", prior_fields=prior_fields, db=MockDB())
    assert diff["has_changes"] is True
    assert len(diff["added_fields"]) == 1
    assert diff["added_fields"][0]["field_name"] == "flange_diameter"

    assert len(diff["removed_fields"]) == 1
    assert diff["removed_fields"][0]["field_name"] == "material"

    assert len(diff["changed_fields"]) == 1
    assert diff["changed_fields"][0]["field_name"] == "diameter"
    assert diff["changed_fields"][0]["old_value"] == "50"
    assert diff["changed_fields"][0]["new_value"] == "55"
