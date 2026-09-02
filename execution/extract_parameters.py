"""
HYDAC Spec-to-3D Generator — Parameter Extractor
Regex + alias table matching for deterministic parameter extraction.
Every extracted value carries a traceability tag.
"""

import re
import json
import os
import uuid
from typing import Optional


def extract_parameters(normalized: dict, filename: str, schemas: dict) -> list:
    """
    Extract hydraulic component parameters from normalized text/table data.
    Uses alias matching from component_schemas.json for deterministic extraction.

    Returns: list of component dicts (may be empty if no specs found)
    """
    component_types = schemas.get("component_types", {})

    # Collect all potential parameter matches across all component types
    all_matches = {}  # {component_type: {field_name: [match_dicts]}}

    for comp_type, comp_schema in component_types.items():
        field_defs = comp_schema.get("field_definitions", {})
        matches = {}

        for field_name, field_def in field_defs.items():
            aliases = field_def.get("aliases", [])
            unit_variants = field_def.get("unit_variants", {})
            data_type = field_def.get("data_type", "string")

            # Search in table rows
            for table_row in normalized.get("table_rows", []):
                match = _match_in_table_row(
                    table_row, aliases, unit_variants, data_type,
                    field_name, field_def, filename
                )
                if match:
                    if field_name not in matches:
                        matches[field_name] = []
                    matches[field_name].append(match)

            # Search in text blocks
            for text_block in normalized.get("text_blocks", []):
                match = _match_in_text(
                    text_block, aliases, unit_variants, data_type,
                    field_name, field_def, filename
                )
                if match:
                    if field_name not in matches:
                        matches[field_name] = []
                    matches[field_name].append(match)

        if matches:
            all_matches[comp_type] = matches

    # Determine which component type has the best match
    components = _resolve_components(all_matches, component_types)

    return components


def _match_in_table_row(
    table_row: dict, aliases: list, unit_variants: dict,
    data_type: str, field_name: str, field_def: dict, filename: str
) -> Optional[dict]:
    """
    Try to match a field alias in table headers or key-value row data.
    """
    row_data = table_row.get("row_data", {})
    source_location = table_row.get("source_location", "Unknown")

    for header, value in row_data.items():
        header_lower = header.lower().strip()
        
        # Skip empty headers which would match everything via `in` operator
        if not header_lower:
            continue

        for alias in aliases:
            alias_lower = alias.lower().strip()
            if not alias_lower:
                continue

            # Check if alias is in header, or if a sufficiently long header is in the alias
            if alias_lower in header_lower or (len(header_lower) > 4 and header_lower in alias_lower):
                # Found a matching header — extract value
                extracted = _extract_value(value, unit_variants, data_type, field_def)
                if extracted:
                    return {
                        "value": extracted["value"],
                        "unit": extracted.get("unit", field_def.get("canonical_unit")),
                        "source_file": filename,
                        "source_location": source_location,
                        "confidence": _compute_confidence(alias_lower, header_lower, extracted),
                        "raw_value": value,
                    }

    return None


def _match_in_text(
    text_block: dict, aliases: list, unit_variants: dict,
    data_type: str, field_name: str, field_def: dict, filename: str
) -> Optional[dict]:
    """
    Try to match a field alias in a text block using regex.
    """
    text = text_block.get("text", "")
    source_location = text_block.get("source_location", "Unknown")

    text_lower = text.lower()

    for alias in aliases:
        alias_lower = alias.lower().strip()

        if alias_lower not in text_lower:
            continue

        # Found alias in text — try to extract the associated value
        # Pattern: alias followed by separator and a number+unit
        escaped_alias = re.escape(alias_lower)
        pattern = rf'{escaped_alias}\s*[:=\-]?\s*([0-9.,]+)\s*([A-Za-z/²³°"]*)'

        match = re.search(pattern, text_lower)
        if match:
            raw_value = match.group(1)
            raw_unit = match.group(2).strip()
            full_value = f"{raw_value} {raw_unit}".strip()

            extracted = _extract_value(full_value, unit_variants, data_type, field_def)
            if extracted:
                return {
                    "value": extracted["value"],
                    "unit": extracted.get("unit", field_def.get("canonical_unit")),
                    "source_file": filename,
                    "source_location": source_location,
                    "confidence": _compute_confidence(alias_lower, alias_lower, extracted),
                    "raw_value": full_value,
                }

    return None


def _extract_value(raw_value: str, unit_variants: dict, data_type: str, field_def: dict) -> Optional[dict]:
    """
    Parse a raw value string into a typed value with unit normalization.
    NEVER guesses — returns None if parsing fails.
    """
    if not raw_value or not raw_value.strip():
        return None

    raw_value = raw_value.strip()

    if data_type == "number":
        # Extract number and optional unit
        num_match = re.match(r'([0-9]+[.,]?[0-9]*)\s*([A-Za-z/²³°"]*)', raw_value)
        if not num_match:
            return None

        num_str = num_match.group(1).replace(",", ".")
        try:
            value = float(num_str)
        except ValueError:
            return None

        raw_unit = num_match.group(2).strip()
        canonical_unit = field_def.get("canonical_unit")

        # Unit normalization — convert to canonical unit
        if raw_unit and unit_variants:
            conversion_factor = None
            for unit_name, factor in unit_variants.items():
                if raw_unit.lower() == unit_name.lower():
                    conversion_factor = factor
                    break

            if conversion_factor is not None and conversion_factor != 1.0:
                value = round(value * conversion_factor, 4)
                return {"value": value, "unit": canonical_unit, "converted_from": raw_unit}

        return {"value": value, "unit": canonical_unit or raw_unit}

    elif data_type == "string":
        return {"value": raw_value}

    return None


def _compute_confidence(alias: str, header: str, extracted: dict) -> str:
    """Determine extraction confidence level."""
    # Exact match = high
    if alias == header:
        return "high"
    # Close match (alias contained in header or vice versa) = medium
    if len(alias) > 3 and len(header) > 3:
        return "medium"
    # Loose match = low
    return "low"


def _resolve_components(all_matches: dict, component_types: dict) -> list:
    """
    Resolve extracted matches into component instances.
    Select the component type with the most matching required fields.
    """
    components = []

    # Score each component type by how many required fields were matched
    scored_types = []
    for comp_type, matches in all_matches.items():
        required = component_types[comp_type].get("required_fields", [])
        matched_required = sum(1 for f in required if f in matches)
        total_matched = len(matches)
        scored_types.append((comp_type, matched_required, total_matched, matches))

    # Sort by required matches (desc), then total matches (desc)
    scored_types.sort(key=lambda x: (x[1], x[2]), reverse=True)

    if not scored_types:
        return []

    # Take the best match (or multiple if clearly different component types)
    # For v1: extract the single best-matching component type
    best_type, best_required, best_total, best_matches = scored_types[0]

    if best_required == 0 and best_total < 2:
        # Not enough matches to confidently identify a component
        return []

    # Build the component parameter dict
    parameters = {}
    for field_name, match_list in best_matches.items():
        # Take the highest-confidence match
        best_match = sorted(match_list, key=lambda m: {"high": 3, "medium": 2, "low": 1}.get(m["confidence"], 0), reverse=True)[0]
        parameters[field_name] = {
            "value": best_match["value"],
            "unit": best_match.get("unit"),
            "source_file": best_match["source_file"],
            "source_location": best_match["source_location"],
            "confidence": best_match["confidence"],
        }

    component = {
        "component_id": str(uuid.uuid4()),
        "component_type": best_type,
        "parameters": parameters,
        "missing_required_fields": [],
        "status": "incomplete",
    }

    components.append(component)
    return components
