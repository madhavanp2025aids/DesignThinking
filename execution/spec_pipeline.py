"""
Spec-to-3D Generator — Specification Pipeline Orchestrator (Part 1 + Part 6)
Handles multi-format parsing, multi-part & multi-file ingestion,
two-pass spec extraction, cross-document conflict detection via rapidfuzz,
and document revision diffing.
"""

import os
import traceback
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from rapidfuzz import fuzz

from backend.models import Part, SpecDocument, SpecField
from execution.parse_pdf import parse_pdf
from execution.parse_docx import parse_docx
from execution.parse_xlsx import parse_xlsx
from execution.parse_pptx import parse_pptx
from execution.parse_csv import parse_csv
from execution.normalize_text import normalize_parsed_output
from execution.spec_extractor import extract_specs_from_document

PARSER_REGISTRY = {
    "pdf": parse_pdf,
    "docx": parse_docx,
    "doc": parse_docx,
    "xlsx": parse_xlsx,
    "xls": parse_xlsx,
    "csv": parse_csv,
    "tsv": parse_csv,
    "pptx": parse_pptx,
    "ppt": parse_pptx,
}


def process_spec_document(
    doc: SpecDocument,
    db: Session,
    required_fields: Optional[List[str]] = None
) -> List[SpecField]:
    """
    Execute parsing and two-pass specification extraction on a single SpecDocument.
    """
    format_key = doc.format.lower()
    parser_func = PARSER_REGISTRY.get(format_key)

    if not parser_func:
        doc.parse_status = "error"
        doc.parse_error = f"Unsupported document format: {doc.format}"
        db.commit()
        return []

    try:
        doc.parse_status = "parsing"
        db.commit()

        # Step 1: Programmatic Parser Execution
        parse_result = parser_func(doc.storage_path, doc.filename)

        # Store raw text / tables
        doc.raw_text = parse_result.get("raw_text", "")
        doc.raw_tables = parse_result.get("tables", [])
        
        # Check OCR flag
        if parse_result.get("ocr_flag"):
            doc.ocr_flag = 1

        # Step 2: Normalize
        normalized = normalize_parsed_output(parse_result, doc.filename)

        # Step 3: Two-Pass Extract & Ground Specs
        extracted_fields_data = extract_specs_from_document(
            parsed_data={
                "raw_text": doc.raw_text,
                "tables": doc.raw_tables,
                "pages": parse_result.get("pages", []),
                "text_blocks": normalized.get("text_blocks", []),
            },
            document_id=doc.id,
            part_id=doc.part_id,
            filename=doc.filename,
            required_field_names=required_fields
        )

        # Step 4: Clear existing extracted fields for this document to avoid duplicates
        db.query(SpecField).filter(SpecField.document_id == doc.id).delete()

        # Step 5: Persist SpecFields
        created_fields = []
        for field_dict in extracted_fields_data:
            spec_field = SpecField(**field_dict)
            db.add(spec_field)
            created_fields.append(spec_field)

        doc.parse_status = "parsed"
        doc.parse_error = None
        db.commit()

        return created_fields

    except Exception as e:
        doc.parse_status = "error"
        doc.parse_error = f"Extraction failed: {str(e)}\n{traceback.format_exc()}"
        db.commit()
        return []


def run_part_extraction_pipeline(part_id: str, db: Session) -> Dict[str, Any]:
    """
    Run ingestion, extraction, cross-document conflict detection, and revision diffing.
    """
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise ValueError(f"Part with id {part_id} not found")

    # Snapshot previous fields before re-extraction for revision diffing
    prior_fields_snapshot = {
        f.field_name: {
            "raw_value": f.raw_value,
            "normalized_value": f.normalized_value,
            "unit": f.unit,
            "is_available": f.is_available
        }
        for f in db.query(SpecField).filter(SpecField.part_id == part_id).all()
        if f.is_available == 1
    }

    docs = db.query(SpecDocument).filter(SpecDocument.part_id == part_id).all()
    if not docs:
        part.status = "no_specs_found"
        db.commit()
        return {
            "part_id": part.id,
            "status": "no_specs_found",
            "message": "No documents uploaded for this part."
        }

    all_extracted_fields: List[SpecField] = []
    error_count = 0

    for doc in docs:
        fields = process_spec_document(doc, db)
        if doc.parse_status == "error":
            error_count += 1
        all_extracted_fields.extend(fields)

    # ── Cross-Document Conflict Detection via rapidfuzz ────────
    detect_and_flag_cross_document_conflicts(part_id, db)

    # ── Document Revision Diff Computation ─────────────────────
    diff_result = compute_part_revision_diff(part_id, prior_fields_snapshot, db)
    if diff_result.get("has_changes"):
        rev_history = part.revision_history or []
        rev_history.append(diff_result)
        part.revision_history = rev_history

    # Re-evaluate part completeness status
    total_fields = db.query(SpecField).filter(SpecField.part_id == part_id).all()
    available_fields = [f for f in total_fields if f.is_available == 1 and f.conflict != 1]
    unavailable_fields = [f for f in total_fields if f.is_available == 0 or f.conflict == 1]
    conflicts = [f for f in total_fields if f.conflict == 1]

    if not total_fields or len(available_fields) == 0:
        part.status = "no_specs_found"
    elif len(conflicts) > 0:
        part.status = "conflict_detected"
    elif len(unavailable_fields) > 0 and len(available_fields) < 3:
        part.status = "incomplete"
    else:
        part.status = "complete"

    db.commit()

    return {
        "part_id": part.id,
        "part_name": part.name,
        "total_documents": len(docs),
        "total_fields": len(total_fields),
        "available_fields": len(available_fields),
        "unavailable_fields": len(unavailable_fields),
        "conflicts": len(conflicts),
        "revision_diff": diff_result,
        "errors": error_count,
        "status": part.status,
    }


def detect_and_flag_cross_document_conflicts(part_id: str, db: Session) -> int:
    """
    Compare extracted fields across documents for the same part using rapidfuzz.
    Flags unresolved conflicts as conflict: 1, is_available: 0 until resolved.
    """
    fields = db.query(SpecField).filter(SpecField.part_id == part_id).all()
    available_fields = [f for f in fields if f.raw_value and f.is_available in (1, True)]

    conflict_count = 0
    docs_map = {d.id: d.filename for d in db.query(SpecDocument).filter(SpecDocument.part_id == part_id).all()}

    # Group fields with exact or fuzzy matching names
    for i, f1 in enumerate(available_fields):
        for j in range(i + 1, len(available_fields)):
            f2 = available_fields[j]
            if f1.document_id == f2.document_id:
                continue

            # Compare field names (exact or fuzzy >= 88%)
            name_sim = fuzz.ratio(f1.field_name.lower().replace("_", " "), f2.field_name.lower().replace("_", " "))
            if name_sim >= 88 or f1.field_name == f2.field_name:
                # Compare extracted values
                val1 = str(f1.normalized_value or f1.raw_value).strip().lower()
                val2 = str(f2.normalized_value or f2.raw_value).strip().lower()

                is_mismatch = False
                try:
                    fval1 = float(val1)
                    fval2 = float(val2)
                    is_mismatch = abs(fval1 - fval2) > 1e-3
                except (ValueError, TypeError):
                    is_mismatch = (val1 != val2)

                if is_mismatch:
                    doc1_name = docs_map.get(f1.document_id, "Document 1")
                    doc2_name = docs_map.get(f2.document_id, "Document 2")

                    f1.conflict = 1
                    f1.confidence = "conflicting"
                    f1.is_available = 0
                    f1.not_available_reason = f"Cross-document conflict with '{doc2_name}' ({f2.raw_value} {f2.unit or ''}). Human resolution required."
                    f1.candidate_values = [
                        {"document": doc1_name, "value": f1.raw_value, "unit": f1.unit, "location": f1.source_location},
                        {"document": doc2_name, "value": f2.raw_value, "unit": f2.unit, "location": f2.source_location}
                    ]

                    f2.conflict = 1
                    f2.confidence = "conflicting"
                    f2.is_available = 0
                    f2.not_available_reason = f"Cross-document conflict with '{doc1_name}' ({f1.raw_value} {f1.unit or ''}). Human resolution required."
                    f2.candidate_values = f1.candidate_values

                    conflict_count += 1

    if conflict_count > 0:
        db.commit()

    return conflict_count


def compute_part_revision_diff(
    part_id: str,
    prior_fields: Dict[str, Dict[str, Any]],
    db: Session
) -> Dict[str, Any]:
    """
    Compute added, removed, and modified specification fields between document revisions.
    """
    current_fields = {
        f.field_name: {
            "raw_value": f.raw_value,
            "normalized_value": f.normalized_value,
            "unit": f.unit,
            "is_available": f.is_available
        }
        for f in db.query(SpecField).filter(SpecField.part_id == part_id).all()
        if f.is_available == 1
    }

    if not prior_fields:
        return {
            "part_id": part_id,
            "has_changes": False,
            "added_fields": [],
            "removed_fields": [],
            "changed_fields": [],
            "summary": "Initial specification baseline established."
        }

    added = []
    removed = []
    changed = []

    for name, curr in current_fields.items():
        if name not in prior_fields:
            added.append({"field_name": name, "new_value": curr["raw_value"], "unit": curr["unit"]})
        else:
            old = prior_fields[name]
            if str(curr["normalized_value"]) != str(old["normalized_value"]):
                changed.append({
                    "field_name": name,
                    "old_value": old["raw_value"],
                    "new_value": curr["raw_value"],
                    "old_unit": old["unit"],
                    "new_unit": curr["unit"]
                })

    for name, old in prior_fields.items():
        if name not in current_fields:
            removed.append({"field_name": name, "old_value": old["raw_value"], "unit": old["unit"]})

    has_changes = bool(added or removed or changed)
    summary = f"Revision Diff: {len(added)} added, {len(removed)} removed, {len(changed)} changed parameters." if has_changes else "No parameter changes detected."

    return {
        "part_id": part_id,
        "has_changes": has_changes,
        "added_fields": added,
        "removed_fields": removed,
        "changed_fields": changed,
        "summary": summary
    }
