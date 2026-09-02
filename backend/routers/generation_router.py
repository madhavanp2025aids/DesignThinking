"""
HYDAC Spec-to-3D Generator — Generation Router
POST /generate, GET /status, GET /download
"""

import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List

from backend.database import get_db
from backend.models import User, ExtractedComponent, GenerationJob, UploadedFile
from backend.schemas import GenerationJobResponse
from backend.auth import get_current_user

router = APIRouter(prefix="/api/generation", tags=["Generation"])


@router.post("/generate", response_model=List[GenerationJobResponse])
def generate_models(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate 3D models for all confirmed components."""
    from backend.pipeline import run_generation_pipeline

    # Find confirmed components ready for generation
    confirmed = (
        db.query(ExtractedComponent)
        .join(UploadedFile)
        .filter(
            UploadedFile.user_id == current_user.id,
            ExtractedComponent.user_confirmed == 1,
            ExtractedComponent.status == "ready_for_generation",
        )
        .all()
    )

    if not confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No confirmed components ready for generation. Confirm parameters first.",
        )

    # Check for existing pending/running jobs
    existing_jobs = (
        db.query(GenerationJob)
        .filter(
            GenerationJob.user_id == current_user.id,
            GenerationJob.status.in_(["pending", "generating"]),
        )
        .all()
    )

    # Create generation jobs for components without active jobs
    existing_component_ids = {j.component_id for j in existing_jobs}
    new_jobs = []

    for component in confirmed:
        if component.id in existing_component_ids:
            continue

        job = GenerationJob(
            user_id=current_user.id,
            component_id=component.id,
            status="pending",
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        new_jobs.append(job)

    # Run generation synchronously
    results = run_generation_pipeline(current_user.id, db)

    # Fetch all jobs for this user
    all_jobs = (
        db.query(GenerationJob)
        .filter(GenerationJob.user_id == current_user.id)
        .order_by(GenerationJob.created_at.desc())
        .all()
    )

    return all_jobs


@router.get("/jobs", response_model=List[GenerationJobResponse])
def list_jobs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all generation jobs for the current user."""
    jobs = (
        db.query(GenerationJob)
        .filter(GenerationJob.user_id == current_user.id)
        .order_by(GenerationJob.created_at.desc())
        .all()
    )
    return jobs


@router.get("/jobs/{job_id}", response_model=GenerationJobResponse)
def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific generation job status."""
    job = (
        db.query(GenerationJob)
        .filter(GenerationJob.id == job_id, GenerationJob.user_id == current_user.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.get("/download/{job_id}/{format}")
def download_file(
    job_id: str,
    format: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download generated CAD file (STEP or STL)."""
    if format not in ("step", "stl"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format must be 'step' or 'stl'",
        )

    job = (
        db.query(GenerationJob)
        .filter(GenerationJob.id == job_id, GenerationJob.user_id == current_user.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if job.status != "success":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Generation not complete. Status: {job.status}",
        )

    file_path = job.cad_file_path if format == "step" else job.mesh_file_path
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Generated {format.upper()} file not found",
        )

    media_type = "application/step" if format == "step" else "application/sla"
    filename = os.path.basename(file_path)
    return FileResponse(file_path, media_type=media_type, filename=filename)


@router.get("/mesh/{job_id}")
def get_mesh_for_viewer(
    job_id: str,
    token: str = None,
    db: Session = Depends(get_db),
):
    """Serve STL mesh file for the Three.js viewer."""
    from backend.auth import decode_access_token
    
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token in query parameter")
        
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    job = (
        db.query(GenerationJob)
        .filter(GenerationJob.id == job_id, GenerationJob.user_id == user_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if job.status != "success" or not job.mesh_file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mesh file not available",
        )

    if not os.path.exists(job.mesh_file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mesh file not found on disk",
        )

    return FileResponse(
        job.mesh_file_path,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"inline; filename={os.path.basename(job.mesh_file_path)}"},
    )
