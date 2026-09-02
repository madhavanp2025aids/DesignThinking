"""
Spec-to-3D Generator — 3D Model Generation Router (Part 2)
POST /api/models/generate/{partId} — parametric 3D model construction
GET /api/models/{partId} — stored geometry definition & holographic hooks
GET /api/models/{partId}/mesh — raw STL binary mesh download / stream
"""

import os
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Dict, Any

from backend.database import get_db
from backend.models import User, Part, PartGeometry
from backend.auth import get_current_user
from execution.model_pipeline import generate_part_model

router = APIRouter(prefix="/api/models", tags=["3D Model Generation"])


@router.post("/generate/{part_id}", status_code=status.HTTP_200_OK)
def trigger_model_generation(
    part_id: str,
    force_rebuild: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate parametric 3D geometry from verified technical specifications.
    Deterministic, reproducible, and includes JARVIS holographic visualization hooks.
    """
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    try:
        result = generate_part_model(part_id=part.id, db=db, force_rebuild=force_rebuild)
        return result
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Geometry generation failed: {str(e)}")


@router.get("/{part_id}", status_code=status.HTTP_200_OK)
def get_part_geometry(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve stored geometry definition and holographic configuration for a part.
    Re-renders identically every time (deterministic).
    """
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    result = generate_part_model(part_id=part.id, db=db, force_rebuild=False)
    return result


@router.get("/{part_id}/mesh")
def download_mesh(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Download the binary STL mesh file for in-browser Three.js STLLoader.
    """
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    geom = (
        db.query(PartGeometry)
        .filter(PartGeometry.part_id == part_id)
        .order_by(PartGeometry.version.desc())
        .first()
    )

    if not geom or not geom.mesh_file_path or not os.path.exists(geom.mesh_file_path):
        # Auto-generate if missing
        res = generate_part_model(part_id=part.id, db=db, force_rebuild=False)
        mesh_path = res.get("mesh_file_path")
        if not mesh_path or not os.path.exists(mesh_path):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"3D STL Mesh file for part '{part_id}' not found.")
        return FileResponse(
            mesh_path,
            media_type="model/stl",
            filename=os.path.basename(mesh_path)
        )

    return FileResponse(
        geom.mesh_file_path,
        media_type="model/stl",
        filename=os.path.basename(geom.mesh_file_path)
    )


@router.get("/{part_id}/step")
def download_step(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Download pure-Python generated ISO 10303-21 STEP CAD model for the part.
    """
    from execution.cad_kernel import export_step_model
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    res = generate_part_model(part_id=part.id, db=db, force_rebuild=False)
    template = res.get("template_used", "cylinder")
    params = res.get("parameters", {})

    step_dir = os.path.join(os.getcwd(), "uploads", "models", "step")
    os.makedirs(step_dir, exist_ok=True)
    step_path = os.path.join(step_dir, f"{part.id}_{template}.stp")

    export_step_model(template, params, step_path)

    return FileResponse(
        step_path,
        media_type="application/step",
        filename=f"{part.name.replace(' ', '_')}.stp"
    )


@router.get("/{part_id}/iges")
def download_iges(
    part_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Download pure-Python generated IGES 5.3 CAD model for the part.
    """
    from execution.cad_kernel import export_iges_model
    part = db.query(Part).filter(Part.id == part_id, Part.user_id == current_user.id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part with ID '{part_id}' not found.")

    res = generate_part_model(part_id=part.id, db=db, force_rebuild=False)
    template = res.get("template_used", "cylinder")
    params = res.get("parameters", {})

    iges_dir = os.path.join(os.getcwd(), "uploads", "models", "iges")
    os.makedirs(iges_dir, exist_ok=True)
    iges_path = os.path.join(iges_dir, f"{part.id}_{template}.igs")

    export_iges_model(template, params, iges_path)

    return FileResponse(
        iges_path,
        media_type="application/iges",
        filename=f"{part.name.replace(' ', '_')}.igs"
    )
