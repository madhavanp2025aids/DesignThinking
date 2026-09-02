"""
HYDAC Spec-to-3D Generator — Pydantic Schemas
Request/response models matching the data schemas defined in CLAUDE.md.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ── Auth Schemas ──────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── File Upload Schemas ───────────────────────────────────────

class UploadedFileResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    upload_timestamp: datetime
    parse_status: str
    parse_error: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Parameter / Traceability Schemas ──────────────────────────

class ParameterValue(BaseModel):
    """Single parameter with full traceability."""
    value: float | int | str
    unit: Optional[str] = None
    source_file: str
    source_location: str  # page N / sheet X, cell Y / paragraph Z
    confidence: str = "high"  # high | medium | low


class ComponentResponse(BaseModel):
    id: str
    component_type: str
    parameters: dict[str, dict]  # field_name -> ParameterValue-like dict
    missing_required_fields: list[str]
    status: str
    user_confirmed: bool = False
    file_id: str

    model_config = ConfigDict(from_attributes=True)


class ParameterUpdate(BaseModel):
    """User edits a parameter value during confirmation."""
    field_name: str
    value: float | int | str
    unit: Optional[str] = None


# ── Generation Schemas ────────────────────────────────────────

class GenerationLogEntry(BaseModel):
    step: str
    status: str  # ok | warning | error
    detail: str


class GenerationJobResponse(BaseModel):
    id: str
    component_id: str
    status: str
    cad_file_path: Optional[str] = None
    mesh_file_path: Optional[str] = None
    generation_log: Optional[list[dict]] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── Pipeline Status ───────────────────────────────────────────

class PipelineStatus(BaseModel):
    """Overall status of the extraction pipeline for a batch of files."""
    total_files: int
    parsed: int
    no_specs_found: int
    errors: int
    pending: int
    components_found: int
    ready_for_generation: int
    incomplete: int


# ── NEW v2 Schemas (Spec-to-3D Enhanced) ──────────────────────


class PartCreate(BaseModel):
    """Create a new part for spec extraction."""
    name: str = Field(min_length=1, max_length=200)


class PartResponse(BaseModel):
    id: str
    name: str
    part_type: Optional[str] = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SpecDocumentResponse(BaseModel):
    id: str
    part_id: str
    filename: str
    format: str
    upload_timestamp: datetime
    ocr_flag: bool = False
    parse_status: str
    parse_error: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SpecFieldResponse(BaseModel):
    id: str
    part_id: str
    document_id: str
    field_name: str
    raw_value: Optional[str] = None
    normalized_value: Optional[str] = None
    unit: Optional[str] = None
    original_unit: Optional[str] = None
    source_location: Optional[str] = None
    source_snippet: Optional[str] = None
    confidence: str = "medium"
    is_available: bool = True
    not_available_reason: Optional[str] = None
    user_correction: Optional[str] = None
    correction_timestamp: Optional[datetime] = None
    extraction_method: Optional[str] = "regex"
    conflict: bool = False
    candidate_values: Optional[list] = None
    tolerance_data: Optional[dict] = None
    bbox: Optional[list] = None

    model_config = ConfigDict(from_attributes=True)


class SpecFieldUpdate(BaseModel):
    """User correction for a spec field."""
    correction: str
    unit: Optional[str] = None


class ConflictResolution(BaseModel):
    """User resolution of a conflicting spec value."""
    chosen_value: str
    chosen_unit: Optional[str] = None


class RevisionDiffResponse(BaseModel):
    """Summary of changes between document revisions for a part."""
    part_id: str
    has_changes: bool
    added_fields: list[dict]
    removed_fields: list[dict]
    changed_fields: list[dict]
    summary: str


class PartGeometryResponse(BaseModel):
    id: str
    part_id: str
    template_used: Optional[str] = None
    parameters: dict
    mesh_file_path: Optional[str] = None
    is_placeholder: bool = False
    missing_fields: Optional[list] = None
    generated_at: datetime
    version: int

    model_config = ConfigDict(from_attributes=True)


class SpecUploadResponse(BaseModel):
    """Response after uploading spec documents for a part."""
    part: PartResponse
    documents: list[SpecDocumentResponse]
    message: str


class SpecProcessingStatus(BaseModel):
    """Status of the spec extraction pipeline for a part."""
    part_id: str
    part_name: str
    total_documents: int
    parsed: int
    pending: int
    errors: int
    total_fields: int
    available_fields: int
    unavailable_fields: int
    status: str  # processing, complete, incomplete, error

