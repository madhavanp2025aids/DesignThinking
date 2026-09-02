"""
HYDAC Spec-to-3D Generator — Upload Router
POST /upload (multi-file), GET /files (list with status)
"""

import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List

from backend.database import get_db
from backend.models import User, UploadedFile
from backend.schemas import UploadedFileResponse
from backend.auth import get_current_user
from backend.storage import get_storage

router = APIRouter(prefix="/api/files", tags=["File Upload"])

ALLOWED_EXTENSIONS = {"pdf", "docx", "xlsx"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def get_file_extension(filename: str) -> str:
    """Extract and validate file extension."""
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[1].lower()


@router.post("/upload", response_model=List[UploadedFileResponse], status_code=status.HTTP_201_CREATED)
async def upload_files(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload one or more spec documents (PDF, DOCX, XLSX)."""
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided",
        )

    storage = get_storage()
    uploaded = []

    for file in files:
        # Validate extension
        ext = get_file_extension(file.filename)
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type: .{ext}. Accepted: {', '.join(ALLOWED_EXTENSIONS)}",
            )

        # Read and validate size
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File '{file.filename}' exceeds {MAX_FILE_SIZE // (1024*1024)}MB limit",
            )

        # Store file
        storage_path = storage.save_file(content, file.filename, current_user.id)

        # Create DB record
        db_file = UploadedFile(
            user_id=current_user.id,
            filename=file.filename,
            file_type=ext,
            storage_path=storage_path,
            parse_status="pending",
        )
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
        uploaded.append(db_file)

    return uploaded


@router.get("/", response_model=List[UploadedFileResponse])
def list_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all uploaded files for the current user."""
    files = (
        db.query(UploadedFile)
        .filter(UploadedFile.user_id == current_user.id)
        .order_by(UploadedFile.upload_timestamp.desc())
        .all()
    )
    return files


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an uploaded file."""
    db_file = (
        db.query(UploadedFile)
        .filter(UploadedFile.id == file_id, UploadedFile.user_id == current_user.id)
        .first()
    )
    if not db_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    storage = get_storage()
    storage.delete_file(db_file.storage_path)
    db.delete(db_file)
    db.commit()
