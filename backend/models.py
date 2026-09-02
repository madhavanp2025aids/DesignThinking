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
