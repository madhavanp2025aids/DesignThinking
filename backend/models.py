"""
HYDAC Spec-to-3D Generator — Database Models
SQLAlchemy ORM models: User, UploadedFile, ExtractedComponent, GenerationJob.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Float, Text, DateTime, ForeignKey, JSON, Enum
)
from sqlalchemy.orm import relationship
from backend.database import Base


def generate_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    uploaded_files = relationship("UploadedFile", back_populates="user", cascade="all, delete-orphan")
    generation_jobs = relationship("GenerationJob", back_populates="user", cascade="all, delete-orphan")


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # pdf, docx, xlsx
    storage_path = Column(String, nullable=False)
    upload_timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    parse_status = Column(String, default="pending")  # pending, parsing, parsed, no_specs_found, error
    raw_extracted_text = Column(Text, nullable=True)
    raw_extracted_tables = Column(JSON, nullable=True)
    parse_error = Column(Text, nullable=True)

    # Relationships
    user = relationship("User", back_populates="uploaded_files")
    components = relationship("ExtractedComponent", back_populates="uploaded_file", cascade="all, delete-orphan")


class ExtractedComponent(Base):
    __tablename__ = "extracted_components"

    id = Column(String, primary_key=True, default=generate_uuid)
    file_id = Column(String, ForeignKey("uploaded_files.id"), nullable=False)
    component_type = Column(String, nullable=False)  # cylinder, valve, pump, hose, fitting
    parameters = Column(JSON, nullable=False, default=dict)
    missing_required_fields = Column(JSON, nullable=False, default=list)
    status = Column(String, default="incomplete")  # ready_for_generation, incomplete, no_specs_found
    user_confirmed = Column(Integer, default=0)  # 0=not confirmed, 1=confirmed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    uploaded_file = relationship("UploadedFile", back_populates="components")
    generation_jobs = relationship("GenerationJob", back_populates="component", cascade="all, delete-orphan")


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    component_id = Column(String, ForeignKey("extracted_components.id"), nullable=False)
    status = Column(String, default="pending")  # pending, generating, success, failed_missing_params, failed_generation_error
    cad_file_path = Column(String, nullable=True)
    mesh_file_path = Column(String, nullable=True)
    generation_log = Column(JSON, nullable=True, default=list)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="generation_jobs")
    component = relationship("ExtractedComponent", back_populates="generation_jobs")


# ── NEW v2 Models (Spec-to-3D Enhanced) ──────────────────────


class Part(Base):
    """A machine part identified from uploaded spec documents."""
    __tablename__ = "parts"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    part_type = Column(String, nullable=True)  # shaft, flange, bearing, gear, plate, bracket, etc. — nullable if undetermined
    status = Column(String, default="processing")  # processing, complete, incomplete, error
    revision_history = Column(JSON, nullable=True)  # List of revision diffs
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", backref="parts")
    spec_documents = relationship("SpecDocument", back_populates="part", cascade="all, delete-orphan")
    spec_fields = relationship("SpecField", back_populates="part", cascade="all, delete-orphan")
    geometries = relationship("PartGeometry", back_populates="part", cascade="all, delete-orphan")


class SpecDocument(Base):
    """An uploaded spec document associated with a part."""
    __tablename__ = "spec_documents"

    id = Column(String, primary_key=True, default=generate_uuid)
    part_id = Column(String, ForeignKey("parts.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    format = Column(String, nullable=False)  # pdf, docx, xlsx, pptx, csv
    storage_path = Column(String, nullable=False)
    upload_timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    ocr_flag = Column(Integer, default=0)  # 0=no OCR, 1=OCR-derived
    parse_status = Column(String, default="pending")  # pending, parsing, parsed, no_specs_found, error
    raw_text = Column(Text, nullable=True)
    raw_tables = Column(JSON, nullable=True)
    parse_error = Column(Text, nullable=True)

    # Relationships
    part = relationship("Part", back_populates="spec_documents")
    user = relationship("User", backref="spec_documents")
    spec_fields = relationship("SpecField", back_populates="document", cascade="all, delete-orphan")


class SpecField(Base):
    """A single extracted spec field with full traceability."""
    __tablename__ = "spec_fields"

    id = Column(String, primary_key=True, default=generate_uuid)
    part_id = Column(String, ForeignKey("parts.id"), nullable=False)
    document_id = Column(String, ForeignKey("spec_documents.id"), nullable=False)
    field_name = Column(String, nullable=False)
    raw_value = Column(String, nullable=True)  # Exact value as it appeared in the document
    normalized_value = Column(String, nullable=True)  # Cleaned/converted value
    unit = Column(String, nullable=True)  # Canonical unit after conversion
    original_unit = Column(String, nullable=True)  # Unit exactly as written in document
    source_location = Column(String, nullable=True)  # Page N / Sheet X, Cell Y / Slide Z
    source_snippet = Column(Text, nullable=True)  # Raw text snippet the value was extracted from
    confidence = Column(String, default="medium")  # high, medium, conflicting, low
    is_available = Column(Integer, default=1)  # 1=extracted, 0=not found in document
    not_available_reason = Column(String, nullable=True)  # Why field is unavailable
    user_correction = Column(String, nullable=True)  # User-provided override (raw extraction preserved)
    correction_timestamp = Column(DateTime, nullable=True)
    extraction_method = Column(String, default="regex")  # regex, table, consensus
    conflict = Column(Integer, default=0)  # 1 if cross-method or cross-document conflict
    candidate_values = Column(JSON, nullable=True)  # Alternative candidate extractions
    tolerance_data = Column(JSON, nullable=True)  # {nominal, plus, minus, unit, gdt_fit}
    bbox = Column(JSON, nullable=True)  # [x0, top, x1, bottom, page_number]

    # Relationships
    part = relationship("Part", back_populates="spec_fields")
    document = relationship("SpecDocument", back_populates="spec_fields")


class PartGeometry(Base):
    """Stored geometry definition for deterministic re-rendering."""
    __tablename__ = "part_geometries"

    id = Column(String, primary_key=True, default=generate_uuid)
    part_id = Column(String, ForeignKey("parts.id"), nullable=False)
    template_used = Column(String, nullable=True)  # cylinder, shaft, flange, plate, etc.
    parameters = Column(JSON, nullable=False, default=dict)  # The exact params used for generation
    mesh_file_path = Column(String, nullable=True)
    is_placeholder = Column(Integer, default=0)  # 1 if geometry is incomplete/wireframe
    missing_fields = Column(JSON, nullable=True)  # Fields that were missing for complete geometry
    generated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=1)

    # Relationships
    part = relationship("Part", back_populates="geometries")
