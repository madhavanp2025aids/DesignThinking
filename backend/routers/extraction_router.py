"""
HYDAC Spec-to-3D Generator — Extraction Router
POST /extract (trigger parsing pipeline), GET /parameters, PUT /parameters/{component_id}
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from typing import List
import copy

from backend.database import get_db
from backend.models import User, UploadedFile, ExtractedComponent
from backend.schemas import ComponentResponse, ParameterUpdate, PipelineStatus
from backend.auth import get_current_user

router = APIRouter(prefix="/api/extraction", tags=["Extraction"])


@router.post("/extract", response_model=PipelineStatus)
async def trigger_extraction(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger the parsing + extraction pipeline for all pending files."""
    from backend.pipeline import run_extraction_pipeline

    pending_files = (
        db.query(UploadedFile)
        .filter(
            UploadedFile.user_id == current_user.id,
            UploadedFile.parse_status == "pending",
        )
        .all()
    )

    if not pending_files:
        # Check if there are already-parsed files
        all_files = (
            db.query(UploadedFile)
            .filter(UploadedFile.user_id == current_user.id)
            .all()
        )
        if not all_files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No files uploaded. Upload spec documents first.",
            )

    # Run extraction synchronously for now (could be background task for large batches)
    result = run_extraction_pipeline(current_user.id, db)
    return result


@router.get("/parameters", response_model=List[ComponentResponse])
def get_parameters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all extracted components/parameters for the current user."""
    components = (
        db.query(ExtractedComponent)
        .join(UploadedFile)
        .filter(UploadedFile.user_id == current_user.id)
        .all()
    )

    result = []
    for comp in components:
        result.append(ComponentResponse(
            id=comp.id,
            component_type=comp.component_type,
            parameters=comp.parameters,
            missing_required_fields=comp.missing_required_fields,
            status=comp.status,
            user_confirmed=bool(comp.user_confirmed),
            file_id=comp.file_id,
        ))
    return result


@router.put("/parameters/{component_id}", response_model=ComponentResponse)
def update_parameter(
    component_id: str,
    update: ParameterUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """User edits a parameter value during confirmation."""
    component = (
        db.query(ExtractedComponent)
        .join(UploadedFile)
        .filter(
            ExtractedComponent.id == component_id,
            UploadedFile.user_id == current_user.id,
        )
        .first()
    )
    if not component:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")

    # Update the parameter
    params = copy.deepcopy(component.parameters)
    if update.field_name in params:
        params[update.field_name]["value"] = update.value
        if update.unit:
            params[update.field_name]["unit"] = update.unit
        params[update.field_name]["confidence"] = "high"  # User-confirmed
        params[update.field_name]["source_location"] = params[update.field_name].get("source_location", "") + " [user-edited]"
    else:
        # Adding a new parameter (user fills in a missing field)
        file = db.query(UploadedFile).filter(UploadedFile.id == component.file_id).first()
        params[update.field_name] = {
            "value": update.value,
            "unit": update.unit,
            "source_file": file.filename if file else "manual",
            "source_location": "user-provided",
            "confidence": "high",
        }

    component.parameters = params

    # Re-validate completeness
    from backend.pipeline import validate_component_completeness
    component = validate_component_completeness(component)

    flag_modified(component, "parameters")
    db.commit()
    db.refresh(component)

    return ComponentResponse(
        id=component.id,
        component_type=component.component_type,
        parameters=component.parameters,
        missing_required_fields=component.missing_required_fields,
        status=component.status,
        user_confirmed=bool(component.user_confirmed),
        file_id=component.file_id,
    )


@router.post("/confirm/{component_id}", response_model=ComponentResponse)
def confirm_component(
    component_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a component's parameters as user-confirmed."""
    component = (
        db.query(ExtractedComponent)
        .join(UploadedFile)
        .filter(
            ExtractedComponent.id == component_id,
            UploadedFile.user_id == current_user.id,
        )
        .first()
    )
    if not component:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")

    if component.status != "ready_for_generation":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm component with status '{component.status}'. Missing fields: {component.missing_required_fields}",
        )

    component.user_confirmed = 1
    db.commit()
    db.refresh(component)

    return ComponentResponse(
        id=component.id,
        component_type=component.component_type,
        parameters=component.parameters,
        missing_required_fields=component.missing_required_fields,
        status=component.status,
        user_confirmed=bool(component.user_confirmed),
        file_id=component.file_id,
    )
