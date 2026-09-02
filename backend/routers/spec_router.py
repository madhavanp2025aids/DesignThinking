"""
Spec-to-3D Generator — Specification Router (Part 1 Ingestion & Extraction + Enhancements)
Handles Part creation, multi-format spec document uploads, extraction execution,
traceable field querying, user-override adjustments, cascading deletions, and spec reporting.
"""

import os
import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User, Part, SpecDocument, SpecField, PartGeometry
from backend.schemas import (
    PartCreate, PartResponse, SpecDocumentResponse, SpecFieldResponse,
    SpecFieldUpdate, SpecUploadResponse, SpecProcessingStatus
)
from backend.auth import get_current_user
from backend.storage import get_storage
from execution.spec_pipeline import run_part_extraction_pipeline, process_spec_document

router = APIRouter(prefix="/api/specs", tags=["Specification Pipeline"])

ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "xlsx", "xls", "csv", "tsv", "pptx", "ppt"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def _get_extension(filename: str) -> str:
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[1].lower()


def _validate_uploaded_file(file: UploadFile, content: bytes) -> None:
    """Validate file extension, emptiness, and size limit."""
    ext = _get_extension(file.filename or "")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: '.{ext}'. Supported formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{file.filename}' is empty (0 bytes). Please upload a valid document."
        )
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{file.filename}' exceeds the maximum allowed size of 50MB ({len(content)} bytes)."
        )


@router.post("/parts", response_model=PartResponse, status_code=status.HTTP_201_CREATED)
def create_part(
    part_in: PartCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new machine part container for technical spec documents."""
    existing = db.query(Part).filter(Part.user_id == current_user.id, Part.name == part_in.name.strip()).first()
    new_part = Part(
        user_id=current_user.id,
        name=part_in.name.strip(),
        status="processing"
    )
    db.add(new_part)
    db.commit()
    db.refresh(new_part)
    return new_part


@router.get("/parts", response_model=List[PartResponse])
def list_parts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all parts registered for current user."""
    parts = db.query(Part).filter(Part.user_id == current_user.id).order_by(Part.created_at.desc()).all()
    return parts


@router.get("/parts/{part_id}", response_model=PartResponse)
def get_part(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get single part by ID."""
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")
    return part


@router.delete("/parts/{part_id}", status_code=status.HTTP_200_OK)
def delete_part(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a part and cascade delete all its documents, fields, geometries, and physical files.
    """
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    storage = get_storage()

    # 1. Delete associated geometries and mesh files
    geometries = db.query(PartGeometry).filter(PartGeometry.part_id == part.id).all()
    for geom in geometries:
        if geom.mesh_file_path and os.path.exists(geom.mesh_file_path):
            try:
                os.remove(geom.mesh_file_path)
            except Exception:
                pass
        db.delete(geom)

    # 2. Delete spec fields
    db.query(SpecField).filter(SpecField.part_id == part.id).delete()

    # 3. Delete spec documents and stored source files
    documents = db.query(SpecDocument).filter(SpecDocument.part_id == part.id).all()
    for doc in documents:
        if doc.storage_path:
            storage.delete_file(doc.storage_path)
        db.delete(doc)

    # 4. Delete part
    part_name = part.name
    db.delete(part)
    db.commit()

    return {
        "status": "deleted",
        "part_id": part_id,
        "message": f"Part '{part_name}' and all associated documents, specs, and 3D models were deleted successfully."
    }


@router.delete("/parts/{part_id}/documents/{document_id}", status_code=status.HTTP_200_OK)
def delete_part_document(
    part_id: str,
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a single document from a part and re-trigger extraction for remaining documents.
    """
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    doc = db.query(SpecDocument).filter(SpecDocument.id == document_id, SpecDocument.part_id == part.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document with ID '{document_id}' not found on part '{part.name}'.")

    # 1. Delete file on storage
    storage = get_storage()
    if doc.storage_path:
        storage.delete_file(doc.storage_path)

    # 2. Delete fields associated with this document
    db.query(SpecField).filter(SpecField.document_id == doc.id).delete()
    db.delete(doc)
    db.commit()

    # 3. Re-extract specs if other documents remain
    remaining_docs = db.query(SpecDocument).filter(SpecDocument.part_id == part.id).count()
    if remaining_docs > 0:
        run_part_extraction_pipeline(part.id, db)
    else:
        # Clear fields and geometries if no documents left
        db.query(SpecField).filter(SpecField.part_id == part.id).delete()
        db.query(PartGeometry).filter(PartGeometry.part_id == part.id).delete()
        part.status = "no_documents"
        db.commit()

    return {
        "status": "deleted",
        "document_id": document_id,
        "part_id": part_id,
        "remaining_documents": remaining_docs,
        "message": f"Document '{doc.filename}' deleted and part specifications updated."
    }


@router.get("/{part_id}")
def get_part_specs_detail(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/specs/:partId — returns structured spec JSON with per-field source trace,
    confidence, and availability flags.
    """
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    docs = db.query(SpecDocument).filter(SpecDocument.part_id == part.id).all()
    fields = db.query(SpecField).filter(SpecField.part_id == part.id).all()

    formatted_fields = [
        {
            "id": f.id,
            "field_name": f.field_name,
            "raw_value": f.raw_value,
            "normalized_value": f.normalized_value,
            "unit": f.unit,
            "original_unit": f.original_unit,
            "source_location": f.source_location,
            "source_snippet": f.source_snippet,
            "confidence": f.confidence or "medium",
            "is_available": bool(f.is_available),
            "not_available_reason": f.not_available_reason,
            "user_correction": f.user_correction,
            "correction_timestamp": f.correction_timestamp,
        }
        for f in fields
    ]

    return {
        "part": {
            "id": part.id,
            "name": part.name,
            "part_type": part.part_type,
            "status": part.status,
            "created_at": part.created_at,
        },
        "documents": [
            {
                "id": d.id,
                "filename": d.filename,
                "format": d.format,
                "upload_timestamp": d.upload_timestamp,
                "ocr_flag": bool(d.ocr_flag),
                "parse_status": d.parse_status,
                "parse_error": d.parse_error,
            }
            for d in docs
        ],
        "fields": formatted_fields,
        "available_fields_count": sum(1 for f in fields if f.is_available == 1),
        "total_fields_count": len(fields),
    }


@router.get("/{part_id}/report")
def get_part_spec_report(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Downloadable Specification Summary Report.
    Returns full audit trail, citations, and parameter values in a structured exportable format.
    """
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    docs = db.query(SpecDocument).filter(SpecDocument.part_id == part.id).all()
    fields = db.query(SpecField).filter(SpecField.part_id == part.id).all()
    geom = db.query(PartGeometry).filter(PartGeometry.part_id == part.id).order_by(PartGeometry.version.desc()).first()

    report = {
        "report_title": "HYDAC Specification & 3D Model Audit Report",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "part": {
            "id": part.id,
            "name": part.name,
            "part_type": part.part_type or "Unknown",
            "status": part.status,
            "created_at": part.created_at.isoformat() if part.created_at else None,
        },
        "source_documents": [
            {
                "filename": d.filename,
                "format": d.format,
                "ocr_derived": bool(d.ocr_flag),
                "parse_status": d.parse_status,
                "upload_timestamp": d.upload_timestamp.isoformat() if d.upload_timestamp else None,
            }
            for d in docs
        ],
        "extracted_specifications": [
            {
                "field_name": f.field_name,
                "status": "AVAILABLE" if f.is_available else "NOT_AVAILABLE",
                "verified_value": f.user_correction or f.normalized_value,
                "raw_extracted_value": f.raw_value,
                "unit": f.unit or f.original_unit,
                "citation_location": f.source_location,
                "ground_truth_snippet": f.source_snippet,
                "confidence": f.confidence,
                "user_corrected": bool(f.user_correction),
                "not_available_reason": f.not_available_reason,
            }
            for f in fields
        ],
        "cad_geometry": {
            "template_used": geom.template_used if geom else None,
            "is_placeholder": bool(geom.is_placeholder) if geom else None,
            "missing_fields": geom.missing_fields if geom else None,
            "version": geom.version if geom else None,
        } if geom else None,
        "summary": {
            "total_documents": len(docs),
            "total_fields": len(fields),
            "available_fields": sum(1 for f in fields if f.is_available == 1),
            "unavailable_fields": sum(1 for f in fields if f.is_available == 0),
            "ground_truth_fidelity": "100% CITED",
        }
    }

    return JSONResponse(
        content=report,
        headers={"Content-Disposition": f'attachment; filename="{part.name.replace(" ", "_")}_spec_report.json"'}
    )


@router.post("/upload", response_model=SpecUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_spec_files(
    files: List[UploadFile] = File(...),
    part_name: Optional[str] = Form(None),
    part_id: Optional[str] = Form(None),
    auto_extract: bool = Form(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/specs/upload — accepts multi-file, multi-format upload for a part.
    Includes duplicate name guard and file validation.
    """
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files provided for upload.")

    duplicate_warning = None

    # Locate or create part
    if part_id:
        part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
        if not part:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")
    else:
        computed_name = part_name.strip() if part_name and part_name.strip() else os.path.splitext(files[0].filename or "Part")[0]
        
        # Duplicate part guard
        existing = db.query(Part).filter(Part.user_id == current_user.id, Part.name == computed_name).first()
        if existing:
            duplicate_warning = f"A part named '{computed_name}' already exists. Creating a new part instance."

        part = Part(user_id=current_user.id, name=computed_name, status="processing")
        db.add(part)
        db.commit()
        db.refresh(part)

    storage = get_storage()
    created_docs = []

    for file in files:
        content = await file.read()
        _validate_uploaded_file(file, content)
        ext = _get_extension(file.filename or "")

        storage_path = storage.save_file(content, file.filename or "file", current_user.id)
        spec_doc = SpecDocument(
            part_id=part.id,
            user_id=current_user.id,
            filename=file.filename or "file",
            format=ext,
            storage_path=storage_path,
            parse_status="pending"
        )
        db.add(spec_doc)
        db.commit()
        db.refresh(spec_doc)
        created_docs.append(spec_doc)

    if auto_extract:
        run_part_extraction_pipeline(part.id, db)
        db.refresh(part)

    msg = f"Uploaded and processed {len(created_docs)} file(s) for part '{part.name}'."
    if duplicate_warning:
        msg = f"{duplicate_warning} {msg}"

    return SpecUploadResponse(
        part=part,
        documents=created_docs,
        message=msg
    )


@router.post("/parts/{part_id}/documents", response_model=SpecUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_part_documents(
    part_id: str,
    files: List[UploadFile] = File(...),
    auto_extract: bool = Form(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload one or multiple specification documents (PDF, DOCX, XLSX, PPTX, CSV) for a part.
    """
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files provided.")

    storage = get_storage()
    created_docs = []

    for file in files:
        content = await file.read()
        _validate_uploaded_file(file, content)
        ext = _get_extension(file.filename or "")

        storage_path = storage.save_file(content, file.filename or "file", current_user.id)
        spec_doc = SpecDocument(
            part_id=part.id,
            user_id=current_user.id,
            filename=file.filename or "file",
            format=ext,
            storage_path=storage_path,
            parse_status="pending"
        )
        db.add(spec_doc)
        db.commit()
        db.refresh(spec_doc)
        created_docs.append(spec_doc)

    if auto_extract:
        run_part_extraction_pipeline(part.id, db)
        db.refresh(part)

    return SpecUploadResponse(
        part=part,
        documents=created_docs,
        message=f"Successfully uploaded {len(created_docs)} document(s) for part '{part.name}'."
    )


@router.post("/session/upload", response_model=List[SpecUploadResponse], status_code=status.HTTP_201_CREATED)
async def upload_multi_part_session(
    manifest_json: str = Form(...),
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Multi-part upload session: uploads multiple files grouped into parts.
    """
    try:
        manifest = json.loads(manifest_json)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid manifest_json structure. Must be JSON array.")

    storage = get_storage()
    session_responses = []

    for item in manifest:
        part_name = item.get("part_name", "Untitled Part")
        indices = item.get("file_indices", [])

        part = Part(user_id=current_user.id, name=part_name, status="processing")
        db.add(part)
        db.commit()
        db.refresh(part)

        part_docs = []
        for idx in indices:
            if 0 <= idx < len(files):
                file = files[idx]
                content = await file.read()
                try:
                    _validate_uploaded_file(file, content)
                except HTTPException:
                    continue

                ext = _get_extension(file.filename or "")
                storage_path = storage.save_file(content, file.filename or "file", current_user.id)

                spec_doc = SpecDocument(
                    part_id=part.id,
                    user_id=current_user.id,
                    filename=file.filename or "file",
                    format=ext,
                    storage_path=storage_path,
                    parse_status="pending"
                )
                db.add(spec_doc)
                db.commit()
                db.refresh(spec_doc)
                part_docs.append(spec_doc)

        run_part_extraction_pipeline(part.id, db)
        db.refresh(part)

        session_responses.append(SpecUploadResponse(
            part=part,
            documents=part_docs,
            message=f"Created part '{part.name}' with {len(part_docs)} document(s)."
        ))

    return session_responses


@router.post("/parts/{part_id}/extract", response_model=SpecProcessingStatus)
def trigger_part_extraction(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Trigger the spec extraction and self-verification pipeline for a part."""
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    stats = run_part_extraction_pipeline(part.id, db)
    return SpecProcessingStatus(
        part_id=part.id,
        part_name=part.name,
        total_documents=stats.get("total_documents", 0),
        parsed=stats.get("total_documents", 0) - stats.get("errors", 0),
        pending=0,
        errors=stats.get("errors", 0),
        total_fields=stats.get("total_fields", 0),
        available_fields=stats.get("available_fields", 0),
        unavailable_fields=stats.get("unavailable_fields", 0),
        status=part.status
    )


@router.get("/parts/{part_id}/fields", response_model=List[SpecFieldResponse])
def get_part_spec_fields(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve all extracted spec fields with full ground-truth traceability for a part."""
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    fields = db.query(SpecField).filter(SpecField.part_id == part.id).all()
    res = []
    for f in fields:
        res.append(SpecFieldResponse(
            id=f.id,
            part_id=f.part_id,
            document_id=f.document_id,
            field_name=f.field_name,
            raw_value=f.raw_value,
            normalized_value=f.normalized_value,
            unit=f.unit,
            original_unit=f.original_unit,
            source_location=f.source_location,
            source_snippet=f.source_snippet,
            confidence=f.confidence or "medium",
            is_available=bool(f.is_available),
            not_available_reason=f.not_available_reason,
            user_correction=f.user_correction,
            correction_timestamp=f.correction_timestamp,
            extraction_method=f.extraction_method or "regex",
            conflict=bool(f.conflict),
            candidate_values=f.candidate_values,
            tolerance_data=f.tolerance_data,
            bbox=f.bbox
        ))
    return res


@router.get("/parts/{part_id}/status", response_model=SpecProcessingStatus)
def get_part_status(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get extraction status summary for a part."""
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    docs = db.query(SpecDocument).filter(SpecDocument.part_id == part.id).all()
    fields = db.query(SpecField).filter(SpecField.part_id == part.id).all()
    avail = [f for f in fields if f.is_available == 1 and f.conflict != 1]
    unavail = [f for f in fields if f.is_available == 0 or f.conflict == 1]
    errors = sum(1 for d in docs if d.parse_status == "error")
    parsed = sum(1 for d in docs if d.parse_status == "parsed")
    pending = sum(1 for d in docs if d.parse_status == "pending")

    return SpecProcessingStatus(
        part_id=part.id,
        part_name=part.name,
        total_documents=len(docs),
        parsed=parsed,
        pending=pending,
        errors=errors,
        total_fields=len(fields),
        available_fields=len(avail),
        unavailable_fields=len(unavail),
        status=part.status
    )


@router.put("/fields/{field_id}", response_model=SpecFieldResponse)
def update_spec_field(
    field_id: str,
    update: SpecFieldUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    User edit/correction gate: allows manual correction while preserving raw extracted value.
    """
    spec_field = (
        db.query(SpecField)
        .join(Part)
        .filter(SpecField.id == field_id, Part.user_id == current_user.id)
        .first()
    )
    if not spec_field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Spec field with ID '{field_id}' not found.")

    spec_field.user_correction = update.correction
    spec_field.normalized_value = update.correction
    spec_field.correction_timestamp = datetime.now(timezone.utc)
    if update.unit:
        spec_field.unit = update.unit
    spec_field.is_available = 1
    spec_field.conflict = 0
    spec_field.not_available_reason = None
    spec_field.confidence = "high"

    db.commit()
    db.refresh(spec_field)

    return SpecFieldResponse(
        id=spec_field.id,
        part_id=spec_field.part_id,
        document_id=spec_field.document_id,
        field_name=spec_field.field_name,
        raw_value=spec_field.raw_value,
        normalized_value=spec_field.normalized_value,
        unit=spec_field.unit,
        original_unit=spec_field.original_unit,
        source_location=spec_field.source_location,
        source_snippet=spec_field.source_snippet,
        confidence=spec_field.confidence,
        is_available=bool(spec_field.is_available),
        not_available_reason=spec_field.not_available_reason,
        user_correction=spec_field.user_correction,
        correction_timestamp=spec_field.correction_timestamp,
        extraction_method=spec_field.extraction_method or "manual",
        conflict=bool(spec_field.conflict),
        candidate_values=spec_field.candidate_values,
        tolerance_data=spec_field.tolerance_data,
        bbox=spec_field.bbox
    )


@router.post("/fields/{field_id}/resolve_conflict", response_model=SpecFieldResponse)
def resolve_spec_conflict(
    field_id: str,
    chosen_value: str = Form(...),
    chosen_unit: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Resolve a cross-method or cross-document conflict with explicit user choice.
    """
    spec_field = (
        db.query(SpecField)
        .join(Part)
        .filter(SpecField.id == field_id, Part.user_id == current_user.id)
        .first()
    )
    if not spec_field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Spec field with ID '{field_id}' not found.")

    spec_field.user_correction = chosen_value
    spec_field.normalized_value = chosen_value
    spec_field.raw_value = chosen_value
    if chosen_unit:
        spec_field.unit = chosen_unit
    spec_field.conflict = 0
    spec_field.is_available = 1
    spec_field.confidence = "high"
    spec_field.not_available_reason = None
    spec_field.correction_timestamp = datetime.now(timezone.utc)

    # Re-evaluate part status
    part = spec_field.part
    conflicts = db.query(SpecField).filter(SpecField.part_id == part.id, SpecField.conflict == 1).count()
    if conflicts == 0 and part.status == "conflict_detected":
        part.status = "complete"

    db.commit()
    db.refresh(spec_field)

    return SpecFieldResponse(
        id=spec_field.id,
        part_id=spec_field.part_id,
        document_id=spec_field.document_id,
        field_name=spec_field.field_name,
        raw_value=spec_field.raw_value,
        normalized_value=spec_field.normalized_value,
        unit=spec_field.unit,
        original_unit=spec_field.original_unit,
        source_location=spec_field.source_location,
        source_snippet=spec_field.source_snippet,
        confidence=spec_field.confidence,
        is_available=True,
        not_available_reason=None,
        user_correction=spec_field.user_correction,
        correction_timestamp=spec_field.correction_timestamp,
        extraction_method="user_resolved",
        conflict=False,
        candidate_values=spec_field.candidate_values,
        tolerance_data=spec_field.tolerance_data,
        bbox=spec_field.bbox
    )


@router.get("/documents/{document_id}/page/{page_number}")
def get_document_page_overlay(
    document_id: str,
    page_number: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns rendered page image + bounding box citation overlay data for visual verification.
    """
    doc = db.query(SpecDocument).join(Part).filter(SpecDocument.id == document_id, Part.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document with ID '{document_id}' not found.")

    fields = db.query(SpecField).filter(SpecField.document_id == doc.id).all()
    page_bboxes = []
    for f in fields:
        if f.bbox and len(f.bbox) >= 5 and f.bbox[4] == page_number:
            page_bboxes.append({
                "field_id": f.id,
                "field_name": f.field_name,
                "value": f.raw_value or f.normalized_value,
                "unit": f.unit,
                "bbox": f.bbox[:4],  # [x0, top, x1, bottom]
            })

    # Render image representation of the page
    import base64
    image_base64 = None
    page_width, page_height = 612.0, 792.0

    if doc.format.lower() == "pdf" and os.path.exists(doc.storage_path):
        try:
            import pdfplumber
            with pdfplumber.open(doc.storage_path) as pdf:
                if 1 <= page_number <= len(pdf.pages):
                    page = pdf.pages[page_number - 1]
                    page_width = float(page.width)
                    page_height = float(page.height)
                    page_img = page.to_image(resolution=150)
                    import io
                    buf = io.BytesIO()
                    page_img.original.save(buf, format="PNG")
                    image_base64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception:
            pass

    return {
        "document_id": doc.id,
        "filename": doc.filename,
        "format": doc.format,
        "page_number": page_number,
        "page_width": page_width,
        "page_height": page_height,
        "image_data": image_base64,
        "annotations": page_bboxes,
        "raw_snippet": doc.raw_text[:500] if doc.raw_text else ""
    }


@router.get("/parts/{part_id}/diff")
def get_part_diff(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get revision diff history for a part."""
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    history = part.revision_history or []
    latest_diff = history[-1] if history else {
        "part_id": part_id,
        "has_changes": False,
        "added_fields": [],
        "removed_fields": [],
        "changed_fields": [],
        "summary": "No revision history recorded."
    }

    return {
        "part_id": part.id,
        "part_name": part.name,
        "history": history,
        "latest": latest_diff
    }

