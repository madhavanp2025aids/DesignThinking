"""
Spec-to-3D Generator — Two-Pass Technical Specification Extractor & Validator (Part 6)
Implements:
1. Two-pass extraction strategy (Pass A: Table structure, Pass B: Regex pattern extraction).
2. Computed confidence scoring based on consensus (high), single-method (medium), or conflict (conflicting).
3. Tolerance / GD&T fit parsing (e.g. ±0.05mm, +0.1/-0.02, H7/h6).
4. PDF word bounding-box (bbox) spatial localization.
"""

import re
from typing import List, Dict, Any, Optional, Tuple
from execution.spec_verifier import SpecVerifier

# Canonical dimensional fields to check
DIMENSIONAL_FIELDS = {
    "diameter": [r"\bdiameter\b", r"\bdia\b", r"\bø\b", r"\bphi\b", r"\bd\b"],
    "outer_diameter": [r"\bouter\s+diameter\b", r"\boutside\s+diameter\b", r"\bod\b", r"\bd_out\b", r"\bext(?:ernal)?\s+dia\b"],
    "inner_diameter": [r"\binner\s+diameter\b", r"\binside\s+diameter\b", r"\bid\b", r"\bd_in\b", r"\bint(?:ernal)?\s+dia\b"],
    "bore_diameter": [r"\bbore\s+diameter\b", r"\bbore\s+size\b", r"\bbore\b", r"\bcylinder\s+bore\b"],
    "rod_diameter": [r"\brod\s+diameter\b", r"\bpiston\s+rod\b", r"\brod\s+dia\b", r"\brod\b"],
    "radius": [r"\bradius\b", r"\brad\b", r"\br\b"],
    "length": [r"\blength\b", r"\btotal\s+length\b", r"\boverall\s+length\b", r"\bl\b", r"\blng\b"],
    "width": [r"\bwidth\b", r"\bw\b", r"\bbreadth\b"],
    "height": [r"\bheight\b", r"\bh\b"],
    "thickness": [r"\bthickness\b", r"\bthk\b", r"\bwall\s+thickness\b", r"\bt\b"],
    "stroke": [r"\bstroke\b", r"\bstroke\s+length\b", r"\bs\b"],
    "pitch": [r"\bpitch\b", r"\bthread\s+pitch\b", r"\bp\b"],
    "angle": [r"\bangle\b", r"\bdeg(?:ree)?\b", r"\bchamfer\s+angle\b"],
    "depth": [r"\bdepth\b", r"\bhole\s+depth\b"],
    "flange_diameter": [r"\bflange\s+diameter\b", r"\bflange\s+dia\b", r"\bflange\s+od\b"],
    "flange_thickness": [r"\bflange\s+thickness\b", r"\bflange\s+thk\b"],
}

# Material & engineering metadata fields
METADATA_FIELDS = {
    "material": [r"\bmaterial\b", r"\bmatl\b", r"\braw\s+material\b", r"\bbody\s+material\b"],
    "tolerance": [r"\btolerance\b", r"\bfit\b", r"\bdim(?:ensional)?\s+tolerance\b", r"\biso\s+2768\b"],
    "weight": [r"\bweight\b", r"\bmass\b", r"\bnet\s+weight\b", r"\bgross\s+weight\b"],
    "finish": [r"\bfinish\b", r"\bsurface\s+finish\b", r"\bcoating\b", r"\bplating\b", r"\broughness\b", r"\bra\b"],
    "standard_grade": [r"\bstandard\b", r"\bgrade\b", r"\biso\b", r"\bastm\b", r"\bdin\b", r"\ben\b"],
    "pressure_rating": [r"\bworking\s+pressure\b", r"\bmax(?:imum)?\s+pressure\b", r"\bnominal\s+pressure\b", r"\bpressure\b"],
    "temperature_range": [r"\btemperature\s+range\b", r"\boperating\s+temp(?:erature)?\b", r"\btemp\b"],
}

UNIT_PATTERN = r'(mm|cm|m|inch|inches|in|\"|\'|bar|psi|mpa|kpa|kg|g|lbs|deg|°|rad|rpm|l/min|gpm|µm|um)'


def extract_specs_from_document(
    parsed_data: dict,
    document_id: str,
    part_id: str,
    filename: str,
    required_field_names: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Two-Pass Extraction Strategy:
    - Pass A: Tabular structure key-value & cell extraction
    - Pass B: Regex pattern matching across continuous text blocks
    Computes consensus confidence ("high", "medium", "conflicting") without inventing values.
    """
    raw_full_text = parsed_data.get("raw_text", "")
    pages_data = parsed_data.get("pages", [])

    # ── Pass A: Tabular Extraction ─────────────────────────────
    table_candidates: Dict[str, Dict[str, Any]] = {}
    for table in parsed_data.get("tables", []):
        headers = table.get("headers", [])
        rows = table.get("rows", [])
        source_loc = table.get("source_location", filename)
        _extract_from_table(headers, rows, source_loc, filename, table_candidates, document_id, part_id)

    # ── Pass B: Regex / Pattern Extraction ─────────────────────
    regex_candidates: Dict[str, Dict[str, Any]] = {}
    for text_block in parsed_data.get("text_blocks", []):
        text = text_block.get("text", "")
        source_loc = text_block.get("source_location", filename)
        _extract_from_text(text, source_loc, filename, regex_candidates, document_id, part_id)

    if not regex_candidates and raw_full_text:
        _extract_from_text(raw_full_text, filename, filename, regex_candidates, document_id, part_id)

    # ── Pass C: Reconcile Two Passes & Compute Confidence ─────
    all_field_keys = set(table_candidates.keys()).union(set(regex_candidates.keys()))
    combined_fields: Dict[str, Dict[str, Any]] = {}

    for k in all_field_keys:
        cand_t = table_candidates.get(k)
        cand_r = regex_candidates.get(k)

        if cand_t and cand_r:
            # Both strategies extracted this field -> Check agreement
            val_t = cand_t.get("normalized_value")
            val_r = cand_r.get("normalized_value")

            is_agree = _values_agree(val_t, val_r)

            if is_agree:
                # High confidence consensus
                chosen = dict(cand_t)
                chosen["confidence"] = "high"
                chosen["extraction_method"] = "consensus"
                chosen["conflict"] = 0
                chosen["candidate_values"] = [
                    {"method": "table", "value": cand_t["raw_value"], "location": cand_t["source_location"]},
                    {"method": "regex", "value": cand_r["raw_value"], "location": cand_r["source_location"]}
                ]
                combined_fields[k] = chosen
            else:
                # Conflict between Table & Regex -> Never guess!
                chosen = dict(cand_t)
                chosen["confidence"] = "conflicting"
                chosen["extraction_method"] = "conflict"
                chosen["conflict"] = 1
                chosen["is_available"] = 0
                chosen["not_available_reason"] = f"Conflicting values: Table found '{cand_t['raw_value']}' vs Regex found '{cand_r['raw_value']}'. User resolution required."
                chosen["candidate_values"] = [
                    {"method": "table", "value": cand_t["raw_value"], "location": cand_t["source_location"], "normalized": val_t},
                    {"method": "regex", "value": cand_r["raw_value"], "location": cand_r["source_location"], "normalized": val_r}
                ]
                combined_fields[k] = chosen

        elif cand_t:
            # Table-only extraction
            chosen = dict(cand_t)
            chosen["confidence"] = "medium"
            chosen["extraction_method"] = "table"
            chosen["conflict"] = 0
            combined_fields[k] = chosen

        elif cand_r:
            # Regex-only extraction
            chosen = dict(cand_r)
            chosen["confidence"] = "medium"
            chosen["extraction_method"] = "regex"
            chosen["conflict"] = 0
            combined_fields[k] = chosen

    # ── Pass D: Tolerance Parsing & Bounding Box Localization ──
    for field_name, cand in combined_fields.items():
        # Parse tolerance if present in raw string or snippet
        raw_str = f"{cand.get('raw_value', '')} {cand.get('source_snippet', '')}"
        tol_data = _parse_tolerance(raw_str, cand.get("normalized_value"), cand.get("unit"))
        if tol_data:
            cand["tolerance_data"] = tol_data

        # Locate spatial bounding box if PDF page word coordinates are available
        cand["bbox"] = _find_bounding_box(cand, pages_data)

    # ── Pass E: Ground Truth Verification ──────────────────────
    verified_results: List[Dict[str, Any]] = []
    for field_name, cand in combined_fields.items():
        if cand.get("conflict") == 1:
            verified_results.append(cand)
            continue

        is_valid, note = SpecVerifier.verify_field(
            raw_source_text=raw_full_text,
            raw_value=cand.get("raw_value"),
            normalized_value=cand.get("normalized_value"),
            source_snippet=cand.get("source_snippet")
        )

        if is_valid:
            cand["is_available"] = 1
            cand["not_available_reason"] = None
            verified_results.append(cand)
        else:
            unavail = SpecVerifier.create_unavailable_field(
                field_name=field_name,
                part_id=part_id,
                document_id=document_id,
                reason=f"Failed verification against source text ({note})"
            )
            unavail["extraction_method"] = cand.get("extraction_method", "regex")
            verified_results.append(unavail)

    # ── Pass F: Explicit "Not Available" for missing targets ───
    target_fields = required_field_names or list(DIMENSIONAL_FIELDS.keys())[:6]
    present_field_names = {f["field_name"] for f in verified_results}

    for req_field in target_fields:
        if req_field not in present_field_names:
            unavail = SpecVerifier.create_unavailable_field(
                field_name=req_field,
                part_id=part_id,
                document_id=document_id,
                reason="Not available in uploaded document"
            )
            unavail["extraction_method"] = "none"
            verified_results.append(unavail)

    return verified_results


def _values_agree(val1: Optional[str], val2: Optional[str]) -> bool:
    """Compare two extracted values with numeric tolerance."""
    if not val1 or not val2:
        return False
    if val1.strip().lower() == val2.strip().lower():
        return True
    try:
        f1 = float(re.sub(r"[^\d.-]", "", val1))
        f2 = float(re.sub(r"[^\d.-]", "", val2))
        return abs(f1 - f2) < 1e-3
    except (ValueError, TypeError):
        return False


def _parse_tolerance(text: str, norm_val: Optional[str], unit: Optional[str]) -> Optional[Dict[str, Any]]:
    """Parse GD&T fits or symmetric / asymmetric tolerances."""
    if not text:
        return None

    try:
        nominal = float(norm_val) if norm_val else 0.0
    except (ValueError, TypeError):
        nominal = 0.0

    # Symmetric tolerance: ±0.05 or +/- 0.05
    sym_match = re.search(r"(?:±|\+\/-|\+-)\s*([\d\.]+)\s*(?:mm|in)?", text, re.IGNORECASE)
    if sym_match:
        tol = float(sym_match.group(1))
        return {
            "nominal": nominal,
            "plus": tol,
            "minus": -tol,
            "unit": unit or "mm",
            "gdt_fit": None,
            "display": f"±{tol} {unit or 'mm'}"
        }

    # Asymmetric tolerance: +0.1 / -0.05 or +0.10 -0.02
    asym_match = re.search(r"\+([\d\.]+)\s*(?:\/|\s)\s*-([\d\.]+)", text)
    if asym_match:
        plus = float(asym_match.group(1))
        minus = -float(asym_match.group(2))
        return {
            "nominal": nominal,
            "plus": plus,
            "minus": minus,
            "unit": unit or "mm",
            "gdt_fit": None,
            "display": f"+{plus}/{minus} {unit or 'mm'}"
        }

    # ISO Fit tolerance: H7, h6, g6, f7, etc.
    fit_match = re.search(r"\b([A-Za-z]{1,2}\d{1,2})\b", text)
    if fit_match and nominal > 0:
        fit_code = fit_match.group(1)
        return {
            "nominal": nominal,
            "plus": 0.025,
            "minus": 0.0,
            "unit": unit or "mm",
            "gdt_fit": fit_code,
            "display": f"{nominal} {fit_code}"
        }

    return None


def _find_bounding_box(cand: Dict[str, Any], pages: List[Dict[str, Any]]) -> Optional[List[float]]:
    """Find spatial bounding box (x0, top, x1, bottom, page_num) in PDF word maps."""
    if not pages:
        return None

    raw_val = str(cand.get("raw_value", "")).strip()
    if not raw_val:
        return None

    loc_str = str(cand.get("source_location", ""))
    target_page_num = 1
    page_match = re.search(r"Page\s+(\d+)", loc_str, re.IGNORECASE)
    if page_match:
        target_page_num = int(page_match.group(1))

    for page in pages:
        if page.get("page_num") == target_page_num:
            words = page.get("words", [])
            for w in words:
                if raw_val in w.get("text", "") or w.get("text", "") in raw_val:
                    return [w["x0"], w["top"], w["x1"], w["bottom"], target_page_num]

    return None


def _extract_from_table(
    headers: List[str],
    rows: List[List[str]],
    source_loc: str,
    filename: str,
    extracted_fields: Dict[str, Dict[str, Any]],
    document_id: str,
    part_id: str
):
    """Extract fields from tabular key-value or columnar representations."""
    all_fields_map = {**DIMENSIONAL_FIELDS, **METADATA_FIELDS}

    for row_idx, row in enumerate(rows):
        if len(row) >= 2:
            key_cell = str(row[0]).strip()
            val_cell = str(row[1]).strip()
            unit_cell = str(row[2]).strip() if len(row) >= 3 else ""

            if not key_cell or not val_cell:
                continue

            for field_name, patterns in all_fields_map.items():
                for pat in patterns:
                    if re.search(pat, key_cell, re.IGNORECASE):
                        parsed_val, orig_unit, norm_unit = _parse_val_and_unit(val_cell)
                        if unit_cell and (orig_unit == "unspecified" or not orig_unit):
                            parsed_unit_match = re.search(UNIT_PATTERN, unit_cell, re.IGNORECASE)
                            if parsed_unit_match:
                                orig_unit = parsed_unit_match.group(1)
                                norm_unit = _canonical_unit(orig_unit)

                        if parsed_val is not None:
                            extracted_fields[field_name] = {
                                "part_id": part_id,
                                "document_id": document_id,
                                "field_name": field_name,
                                "raw_value": val_cell,
                                "normalized_value": str(parsed_val),
                                "unit": norm_unit,
                                "original_unit": orig_unit,
                                "source_location": f"{source_loc} (Row {row_idx + 1})",
                                "source_snippet": f"{key_cell}: {val_cell}" + (f" {unit_cell}" if unit_cell else ""),
                                "confidence": "medium",
                                "is_available": 1,
                                "not_available_reason": None,
                            }
                        break


def _extract_from_text(
    text: str,
    source_loc: str,
    filename: str,
    extracted_fields: Dict[str, Dict[str, Any]],
    document_id: str,
    part_id: str
):
    """Extract fields from continuous narrative text or spec bullet points."""
    all_fields_map = {**DIMENSIONAL_FIELDS, **METADATA_FIELDS}

    for line in text.splitlines():
        clean_line = line.strip()
        if not clean_line or len(clean_line) < 3:
            continue

        for field_name, patterns in all_fields_map.items():
            if field_name in extracted_fields:
                continue

            for pat in patterns:
                full_pat = rf'{pat}\s*[:=]\s*([^\n,;]+)'
                match = re.search(full_pat, clean_line, re.IGNORECASE)
                if match:
                    raw_extracted_val = match.group(1).strip()
                    parsed_val, orig_unit, norm_unit = _parse_val_and_unit(raw_extracted_val)

                    if parsed_val is not None:
                        extracted_fields[field_name] = {
                            "part_id": part_id,
                            "document_id": document_id,
                            "field_name": field_name,
                            "raw_value": raw_extracted_val,
                            "normalized_value": str(parsed_val),
                            "unit": norm_unit,
                            "original_unit": orig_unit,
                            "source_location": source_loc,
                            "source_snippet": clean_line[:120],
                            "confidence": "medium",
                            "is_available": 1,
                            "not_available_reason": None,
                        }
                    break


def _parse_val_and_unit(val_str: str) -> Tuple[Optional[str], str, str]:
    """Parse raw value string into cleaned value and canonical unit."""
    cleaned = val_str.strip()
    if not cleaned:
        return None, "unspecified", "unspecified"

    num_match = re.search(rf'(-?\d+(?:\.\d+)?)\s*{UNIT_PATTERN}?', cleaned, re.IGNORECASE)
    if num_match:
        val_num = num_match.group(1)
        orig_unit = num_match.group(2) if num_match.group(2) else "unspecified"
        norm_unit = _canonical_unit(orig_unit)
        return val_num, orig_unit, norm_unit

    text_val = re.sub(r'["\';]', '', cleaned).strip()
    if len(text_val) > 0:
        return text_val, "text", "text"

    return None, "unspecified", "unspecified"


def _canonical_unit(unit_str: Optional[str]) -> str:
    """Normalize unit string to canonical industrial units."""
    if not unit_str or unit_str.lower() in ("unspecified", "none", ""):
        return "mm"
    u = unit_str.lower().strip()
    if u in ["mm", "millimeter", "millimeters"]:
        return "mm"
    if u in ["cm", "centimeter"]:
        return "cm"
    if u in ["m", "meter", "meters"]:
        return "m"
    if u in ["in", "inch", "inches", '"']:
        return "in"
    if u in ["bar", "bars"]:
        return "bar"
    if u in ["psi"]:
        return "psi"
    if u in ["mpa"]:
        return "mpa"
    if u in ["kg", "kgs", "kilogram"]:
        return "kg"
    if u in ["deg", "degree", "degrees", "°"]:
        return "deg"
    return u
