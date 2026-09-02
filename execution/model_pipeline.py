"""
Spec-to-3D Generator — Model Generation Pipeline (Part 2)
Coordinates parametric CAD construction, holographic config bundling,
and persistent geometry storage in the DB.
"""

import os
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from backend.models import Part, SpecField, PartGeometry
from execution.parametric_geometry import ParametricGeometryEngine
from execution.holographic_config import generate_holographic_config

load_dotenv()
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")


def generate_part_model(
    part_id: str,
    db: Session,
    force_rebuild: bool = False
) -> Dict[str, Any]:
    """
    Generate or retrieve deterministic 3D geometry for a part based on extracted specs.
    """
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise ValueError(f"Part with id '{part_id}' not found")

    # Check for existing geometry if not forced rebuild
    existing_geom = (
        db.query(PartGeometry)
        .filter(PartGeometry.part_id == part_id)
        .order_by(PartGeometry.version.desc())
        .first()
    )

    if existing_geom and not force_rebuild and existing_geom.mesh_file_path and os.path.exists(existing_geom.mesh_file_path):
        # Attach dynamic holographic config
        holo_config = generate_holographic_config(
            template_used=existing_geom.template_used or "unknown",
            parameters=existing_geom.parameters or {},
            hud_anchors=existing_geom.parameters.get("hud_anchors", []),
            is_placeholder=bool(existing_geom.is_placeholder)
        )
        return {
            "part_id": part.id,
            "part_name": part.name,
            "geometry_id": existing_geom.id,
            "template_used": existing_geom.template_used,
            "parameters": existing_geom.parameters,
            "mesh_file_path": existing_geom.mesh_file_path,
            "is_placeholder": bool(existing_geom.is_placeholder),
            "missing_fields": existing_geom.missing_fields,
            "version": existing_geom.version,
            "generated_at": existing_geom.generated_at,
            "holographic_config": holo_config,
            "cached": True
        }

    # Fetch all spec fields for this part
    db_fields = db.query(SpecField).filter(SpecField.part_id == part_id).all()
    fields_list = [
        {
            "id": f.id,
            "field_name": f.field_name,
            "raw_value": f.raw_value,
            "normalized_value": f.normalized_value,
            "unit": f.unit,
            "original_unit": f.original_unit,
            "source_location": f.source_location,
            "source_snippet": f.source_snippet,
            "confidence": f.confidence,
            "is_available": f.is_available,
            "not_available_reason": f.not_available_reason,
            "user_correction": f.user_correction,
        }
        for f in db_fields
    ]

    # Destination mesh file path
    version = (existing_geom.version + 1) if existing_geom else 1
    output_dir = Path(UPLOAD_DIR) / "models" / part_id
    output_dir.mkdir(parents=True, exist_ok=True)
    stl_filename = f"{part.name.replace(' ', '_').lower()}_v{version}.stl"
    stl_path = str(output_dir / stl_filename)

    # Parametric Generation
    build_result = ParametricGeometryEngine.generate(
        part_name=part.name,
        part_type=part.part_type,
        spec_fields=fields_list,
        output_stl_path=stl_path
    )

    template_used = build_result.get("template_used", "placeholder")
    is_placeholder = build_result.get("is_placeholder", False)
    missing_fields = build_result.get("missing_fields", [])
    hud_anchors = build_result.get("hud_anchors", [])

    parameters_payload = build_result.get("parameters", {})
    parameters_payload["hud_anchors"] = hud_anchors

    # Update part type if resolved and not previously set
    if not part.part_type and template_used != "placeholder":
        part.part_type = template_used

    # Persist PartGeometry record
    geom_record = PartGeometry(
        part_id=part.id,
        template_used=template_used,
        parameters=parameters_payload,
        mesh_file_path=stl_path,
        is_placeholder=1 if is_placeholder else 0,
        missing_fields=missing_fields,
        version=version,
        generated_at=datetime.now(timezone.utc)
    )
    db.add(geom_record)
    db.commit()
    db.refresh(geom_record)

    # Build Holographic Config
    holo_config = generate_holographic_config(
        template_used=template_used,
        parameters=parameters_payload,
        hud_anchors=hud_anchors,
        is_placeholder=is_placeholder
    )

    return {
        "part_id": part.id,
        "part_name": part.name,
        "geometry_id": geom_record.id,
        "template_used": geom_record.template_used,
        "parameters": geom_record.parameters,
        "mesh_file_path": geom_record.mesh_file_path,
        "is_placeholder": bool(geom_record.is_placeholder),
        "missing_fields": geom_record.missing_fields,
        "version": geom_record.version,
        "generated_at": geom_record.generated_at,
        "holographic_config": holo_config,
        "cached": False
    }
