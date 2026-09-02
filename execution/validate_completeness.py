"""
HYDAC Spec-to-3D Generator — Completeness Validator
Checks extracted parameters against required fields per component_type.
Sets status: ready_for_generation | incomplete | no_specs_found.
"""


def validate_completeness(component: dict, schemas: dict) -> dict:
    """
    Validate that a component has all required fields.
    
    Args:
        component: extracted component dict with parameters
        schemas: loaded component_schemas.json
        
    Returns:
        Updated component dict with missing_required_fields and status set.
    """
    comp_type = component.get("component_type", "")
    parameters = component.get("parameters", {})
    
    type_schema = schemas.get("component_types", {}).get(comp_type, {})
    required_fields = type_schema.get("required_fields", [])
    
    # Check each required field
    missing = []
    for field in required_fields:
        if field not in parameters:
            missing.append(field)
        elif parameters[field].get("value") is None:
            missing.append(field)
        elif parameters[field].get("value") == "":
            missing.append(field)
    
    component["missing_required_fields"] = missing
    
    # Determine status
    if not parameters:
        component["status"] = "no_specs_found"
    elif missing:
        component["status"] = "incomplete"
    else:
        component["status"] = "ready_for_generation"
    
    return component
