"""
HYDAC Spec-to-3D Generator — Pipeline Orchestrator (A.N.T. Navigation Layer)
Routes files to correct parsers, manages extraction/validation/generation flow.
Does NOT perform parsing or CAD math — only orchestrates calls to Tools.
"""

import json
import os
import traceback
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from backend.models import UploadedFile, ExtractedComponent, GenerationJob
from backend.schemas import PipelineStatus


def load_component_schemas():
    """Load component field definitions from config."""
    schema_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "execution", "config", "component_schemas.json"
    )
    with open(schema_path, "r") as f:
        return json.load(f)


def run_extraction_pipeline(user_id: str, db: Session) -> PipelineStatus:
    """
    Full extraction pipeline: parse → normalize → extract → validate.
    Routes each file to the correct parser by file_type.
    """
    from execution.parse_pdf import parse_pdf
    from execution.parse_docx import parse_docx
    from execution.parse_xlsx import parse_xlsx
    from execution.normalize_text import normalize_parsed_output
    from execution.extract_parameters import extract_parameters
    from execution.validate_completeness import validate_completeness

    files = (
        db.query(UploadedFile)
        .filter(UploadedFile.user_id == user_id)
        .all()
    )

    stats = {
        "total_files": len(files),
        "parsed": 0,
        "no_specs_found": 0,
        "errors": 0,
        "pending": 0,
        "components_found": 0,
        "ready_for_generation": 0,
        "incomplete": 0,
    }

    # Parser routing table — one parser per format
    parser_map = {
        "pdf": parse_pdf,
        "docx": parse_docx,
        "xlsx": parse_xlsx,
    }

    for file in files:
        if file.parse_status not in ("pending",):
            # Already processed — just count
            if file.parse_status == "parsed":
                stats["parsed"] += 1
            elif file.parse_status == "no_specs_found":
                stats["no_specs_found"] += 1
            elif file.parse_status == "error":
                stats["errors"] += 1
            continue

        # Route to correct parser
        parser = parser_map.get(file.file_type)
        if not parser:
            file.parse_status = "error"
            file.parse_error = f"No parser available for file type: {file.file_type}"
            db.commit()
            stats["errors"] += 1
            continue

        try:
            # STEP 1: Parse
            file.parse_status = "parsing"
            db.commit()

            parse_result = parser(file.storage_path, file.filename)

            file.raw_extracted_text = parse_result.get("raw_text", "")
            file.raw_extracted_tables = parse_result.get("tables", [])

            # STEP 2: Normalize
            normalized = normalize_parsed_output(parse_result, file.filename)

            # STEP 3: Extract parameters
            schemas = load_component_schemas()
            components = extract_parameters(normalized, file.filename, schemas)

            if not components:
                # No specs found in this file
                file.parse_status = "no_specs_found"
                file.parse_error = f"No specs found in {file.filename}"
                db.commit()
                stats["no_specs_found"] += 1
                continue

            # STEP 4: Validate and save each component
            for comp_data in components:
                validated = validate_completeness(comp_data, schemas)

                component = ExtractedComponent(
                    file_id=file.id,
                    component_type=validated["component_type"],
                    parameters=validated["parameters"],
                    missing_required_fields=validated["missing_required_fields"],
                    status=validated["status"],
                )
                db.add(component)
                stats["components_found"] += 1

                if validated["status"] == "ready_for_generation":
                    stats["ready_for_generation"] += 1
                elif validated["status"] == "incomplete":
                    stats["incomplete"] += 1

            file.parse_status = "parsed"
            db.commit()
            stats["parsed"] += 1

        except Exception as e:
            file.parse_status = "error"
            file.parse_error = f"Parse error: {str(e)}\n{traceback.format_exc()}"
            db.commit()
            stats["errors"] += 1
            # Continue processing other files — never fail the whole batch
            continue

    return PipelineStatus(**stats)


def validate_component_completeness(component: ExtractedComponent) -> ExtractedComponent:
    """Re-validate a component's completeness after user edits."""
    schemas = load_component_schemas()
    comp_type = component.component_type
    type_schema = schemas.get("component_types", {}).get(comp_type, {})
    required = type_schema.get("required_fields", [])

    missing = []
    for field in required:
        if field not in component.parameters:
            missing.append(field)
        elif component.parameters[field].get("value") is None:
            missing.append(field)

    component.missing_required_fields = missing
    component.status = "ready_for_generation" if not missing else "incomplete"
    return component


def run_generation_pipeline(user_id: str, db: Session) -> list:
    """
    Generation pipeline: for each pending job, invoke CAD generation.
    """
    from execution.generate_cad import generate_cad_model

    jobs = (
        db.query(GenerationJob)
        .filter(
            GenerationJob.user_id == user_id,
            GenerationJob.status == "pending",
        )
        .all()
    )

    results = []

    for job in jobs:
        component = db.query(ExtractedComponent).filter(
            ExtractedComponent.id == job.component_id
        ).first()

        if not component:
            job.status = "failed_generation_error"
            job.error_message = "Component not found"
            job.generation_log = [{"step": "lookup", "status": "error", "detail": "Component not found"}]
            db.commit()
            results.append(job)
            continue

        # Enforce: must be confirmed and have no missing fields
        if not component.user_confirmed:
            job.status = "failed_missing_params"
            job.error_message = "Parameters not confirmed by user"
            job.generation_log = [{"step": "validation", "status": "error", "detail": "User confirmation required"}]
            db.commit()
            results.append(job)
            continue

        if component.missing_required_fields:
            job.status = "failed_missing_params"
            job.error_message = f"Missing required fields: {', '.join(component.missing_required_fields)}"
            job.generation_log = [{"step": "validation", "status": "error", "detail": job.error_message}]
            db.commit()
            results.append(job)
            continue

        try:
            job.status = "generating"
            db.commit()

            result = generate_cad_model(
                component_id=component.id,
                component_type=component.component_type,
                parameters=component.parameters,
                job_id=job.id,
            )

            job.cad_file_path = result.get("cad_file_path")
            job.mesh_file_path = result.get("mesh_file_path")
            job.generation_log = result.get("generation_log", [])
            job.status = result.get("status", "failed_generation_error")
            job.error_message = result.get("error_message")
            job.completed_at = datetime.now(timezone.utc)
            db.commit()

        except Exception as e:
            job.status = "failed_generation_error"
            job.error_message = f"Generation error: {str(e)}"
            job.generation_log = [{"step": "generation", "status": "error", "detail": str(e)}]
            job.completed_at = datetime.now(timezone.utc)
            db.commit()

        results.append(job)

    return results
