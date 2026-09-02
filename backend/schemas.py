"""
HYDAC Spec-to-3D Generator — Pydantic Schemas
Request/response models matching the data schemas defined in CLAUDE.md.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


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

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


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
