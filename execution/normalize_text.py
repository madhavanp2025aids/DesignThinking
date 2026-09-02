"""
HYDAC Spec-to-3D Generator — Text/Table Normalizer
Unifies parser outputs (PDF/DOCX/XLSX) into one intermediate JSON format.
"""


def normalize_parsed_output(parse_result: dict, filename: str) -> dict:
    """
    Normalize the output from any parser into a unified intermediate format.
    
    Input: raw parser output (varies by format)
    Output: unified JSON with text_blocks and table_rows, all tagged with source location.
    
    Returns:
        {
            "filename": str,
            "text_blocks": [
                {"text": str, "source_location": str}
            ],
            "table_rows": [
                {
                    "headers": [str],
                    "row_data": {header: value},
                    "source_location": str
                }
            ]
        }
    """
    normalized = {
        "filename": filename,
        "text_blocks": [],
        "table_rows": [],
    }

    # Extract text blocks
    _extract_text_blocks(parse_result, filename, normalized)

    # Extract and flatten table rows
    _extract_table_rows(parse_result, filename, normalized)

    return normalized


def _extract_text_blocks(parse_result: dict, filename: str, normalized: dict):
    """Extract text blocks from parser output."""
    # From PDF pages
    pages = parse_result.get("pages", [])
    for page in pages:
        text = page.get("text", "").strip()
        if text:
            normalized["text_blocks"].append({
                "text": text,
                "source_location": f"Page {page.get('page_num', '?')}",
            })

    # From DOCX paragraphs
    paragraphs = parse_result.get("paragraphs", [])
    for para in paragraphs:
        text = para.get("text", "").strip()
        if text:
            normalized["text_blocks"].append({
                "text": text,
                "source_location": para.get("source_location", "Unknown"),
            })

    # If we have raw_text but no structured blocks (fallback)
    if not normalized["text_blocks"]:
        raw_text = parse_result.get("raw_text", "")
        if raw_text.strip():
            # Split by page markers or newlines
            blocks = raw_text.split("\n--- Page ")
            for i, block in enumerate(blocks):
                block = block.strip()
                if block:
                    normalized["text_blocks"].append({
                        "text": block,
                        "source_location": f"Section {i + 1}",
                    })


def _extract_table_rows(parse_result: dict, filename: str, normalized: dict):
    """
    Flatten tables into individual rows, each tagged with headers and source.
    This makes parameter extraction row-by-row instead of table-by-table.
    """
    tables = parse_result.get("tables", [])

    for table in tables:
        headers = table.get("headers", [])
        rows = table.get("rows", [])
        source = table.get("source_location", "Unknown")

        if not headers or not rows:
            continue

        # Normalize headers: lowercase, strip whitespace
        clean_headers = [str(h).strip() for h in headers]

        # Check if table appears to be a vertical key-value table (2 columns)
        is_kv_table = len(clean_headers) == 2 or (len(rows) > 0 and len(rows[0]) == 2)
        
        if is_kv_table:
            # For 2-column tables, treat every row (including the first row which was parsed as headers) as a key-value pair
            all_rows = [headers] + rows
            for row_idx, row in enumerate(all_rows):
                if len(row) >= 2:
                    k = str(row[0]).strip() if row[0] else ""
                    v = str(row[1]).strip() if row[1] else ""
                    if k and v:
                        normalized["table_rows"].append({
                            "headers": [k],
                            "row_data": {k: v},
                            "source_location": f"{source}, Row {row_idx + 1}",
                        })
        else:
            # Horizontal table (headers in first row, data in subsequent rows)
            for row_idx, row in enumerate(rows):
                # Build header->value mapping
                row_data = {}
                for col_idx, header in enumerate(clean_headers):
                    if col_idx < len(row):
                        value = str(row[col_idx]).strip() if row[col_idx] else ""
                        if header and value:
                            row_data[header] = value

                if row_data:
                    normalized["table_rows"].append({
                        "headers": clean_headers,
                        "row_data": row_data,
                        "source_location": f"{source}, Row {row_idx + 1}",
                    })

    # Also handle key-value pairs in text blocks
    # Many spec sheets use "Label: Value" or "Label = Value" format in paragraphs
    for block in normalized["text_blocks"]:
        kv_pairs = _extract_key_value_pairs(block["text"])
        for key, value in kv_pairs:
            normalized["table_rows"].append({
                "headers": [key],
                "row_data": {key: value},
                "source_location": block["source_location"],
            })


def _extract_key_value_pairs(text: str) -> list:
    """
    Extract key-value pairs from text blocks.
    Handles formats like:
    - "Bore Diameter: 100 mm"
    - "Stroke = 500 mm"
    - "Working Pressure  250 bar"
    """
    import re
    pairs = []

    # Pattern: "Label: Value" or "Label = Value"
    kv_pattern = re.compile(
        r'([A-Za-zÄÖÜäöüß\s/\-\.]+?)\s*[:=]\s*([0-9.,]+\s*[A-Za-z/²³°"]*)',
        re.IGNORECASE
    )

    for match in kv_pattern.finditer(text):
        key = match.group(1).strip()
        value = match.group(2).strip()
        if len(key) >= 2 and value:
            pairs.append((key, value))

    return pairs
