"""
Part 4 Hardening & New Features Tests:
- Extended /api/health diagnostics
- Part & document deletion endpoints
- Spec summary report export
- Duplicate-part guard
- File validation (unsupported formats, empty files)
- 404 error handling for non-existent entities
"""

from fastapi.testclient import TestClient
from backend.main import app


def test_health_diagnostics_endpoint():
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ["ok", "error"]
    assert "database_reachable" in data
    assert "freecad_available" in data
    assert "ocr_available" in data
    assert "upload_dir_writable" in data
    assert "temp_dir_writable" in data


def test_part_and_document_deletion_flow(auth_headers):
    client = TestClient(app)
    headers = {"Authorization": auth_headers["Authorization"]}

    # Create part with 2 documents
    doc1 = "Parameter,Value,Unit\nDiameter,100,mm\n".encode("utf-8")
    doc2 = "Parameter,Value,Unit\nLength,250,mm\n".encode("utf-8")

    res_upload = client.post(
        "/api/specs/upload",
        files=[
            ("files", ("part_spec1.csv", doc1, "text/csv")),
            ("files", ("part_spec2.csv", doc2, "text/csv")),
        ],
        data={"part_name": "Delete Test Flange", "auto_extract": "true"},
        headers=headers
    )
    assert res_upload.status_code == 201
    part_id = res_upload.json()["part"]["id"]
    doc_ids = [d["id"] for d in res_upload.json()["documents"]]
    assert len(doc_ids) == 2

    # Delete first document
    res_del_doc = client.delete(f"/api/specs/parts/{part_id}/documents/{doc_ids[0]}", headers=headers)
    assert res_del_doc.status_code == 200
    assert res_del_doc.json()["status"] == "deleted"

    # Verify part specs now only have 1 document
    res_specs = client.get(f"/api/specs/{part_id}", headers=headers)
    assert res_specs.status_code == 200
    assert len(res_specs.json()["documents"]) == 1

    # Delete entire part
    res_del_part = client.delete(f"/api/specs/parts/{part_id}", headers=headers)
    assert res_del_part.status_code == 200
    assert res_del_part.json()["status"] == "deleted"

    # Verify part is now 404
    res_404 = client.get(f"/api/specs/{part_id}", headers=headers)
    assert res_404.status_code == 404
    assert "not found" in res_404.json()["detail"].lower()


def test_spec_report_export(auth_headers):
    client = TestClient(app)
    headers = {"Authorization": auth_headers["Authorization"]}

    csv_data = "Parameter,Value,Unit\nOuter Diameter,120,mm\nLength,300,mm\n".encode("utf-8")
    res_upload = client.post(
        "/api/specs/upload",
        files=[("files", ("shaft_report.csv", csv_data, "text/csv"))],
        data={"part_name": "Shaft For Report", "auto_extract": "true"},
        headers=headers
    )
    part_id = res_upload.json()["part"]["id"]

    # Generate 3D model
    client.post(f"/api/models/generate/{part_id}", headers=headers)

    # Download spec report
    res_report = client.get(f"/api/specs/{part_id}/report", headers=headers)
    assert res_report.status_code == 200
    report_data = res_report.json()
    assert report_data["report_title"] == "HYDAC Specification & 3D Model Audit Report"
    assert report_data["part"]["id"] == part_id
    assert len(report_data["extracted_specifications"]) > 0
    assert report_data["summary"]["ground_truth_fidelity"] == "100% CITED"


def test_file_validation_unsupported_and_empty(auth_headers):
    client = TestClient(app)
    headers = {"Authorization": auth_headers["Authorization"]}

    # 1. Unsupported extension (.exe)
    res_bad_ext = client.post(
        "/api/specs/upload",
        files=[("files", ("malicious.exe", b"binarycontent", "application/octet-stream"))],
        data={"part_name": "Bad Ext Part"},
        headers=headers
    )
    assert res_bad_ext.status_code == 400
    assert "unsupported file type" in res_bad_ext.json()["detail"].lower()

    # 2. Empty file (0 bytes)
    res_empty = client.post(
        "/api/specs/upload",
        files=[("files", ("empty.csv", b"", "text/csv"))],
        data={"part_name": "Empty File Part"},
        headers=headers
    )
    assert res_empty.status_code == 400
    assert "empty" in res_empty.json()["detail"].lower()


def test_404_handling_clean_json(auth_headers):
    client = TestClient(app)
    headers = {"Authorization": auth_headers["Authorization"]}

    fake_id = "non-existent-uuid-9999"

    # Part not found
    res1 = client.get(f"/api/specs/{fake_id}", headers=headers)
    assert res1.status_code == 404
    assert res1.json()["status_code"] == 404
    assert "not found" in res1.json()["detail"].lower()

    # Model not found
    res2 = client.get(f"/api/models/{fake_id}", headers=headers)
    assert res2.status_code == 404
    assert res2.json()["status_code"] == 404
