"""
Spec-to-3D Generator — CSV / TSV Parser
Extracts structured rows, headers, and key-value pairs from delimited files.
Preserves header-to-column mappings and cell-level location tags.
"""

import csv
from typing import Optional


def parse_csv(file_path: str, filename: str) -> dict:
    """
    Parse a CSV/TSV file, extracting tables and key-value relationships.

    Returns:
        {
            "raw_text": str,
            "tables": [
                {
                    "table_index": int,
                    "source_location": str,
                    "headers": [str],
                    "rows": [[str]]
                }
            ],
            "sheets": [
                {
                    "name": str,
                    "tables": [...]
                }
            ]
        }
    """
    result = {
        "raw_text": "",
        "tables": [],
        "sheets": [],
    }

    # Detect delimiter (comma vs tab vs semicolon)
    sample = ""
    try:
        with open(file_path, "r", encoding="utf-8-sig", errors="replace") as f:
            sample = f.read(2048)
            f.seek(0)
            sniffer = csv.Sniffer()
            try:
                dialect = sniffer.sniff(sample, delimiters=",;\t|")
                delimiter = dialect.delimiter
            except Exception:
                delimiter = "\t" if file_path.lower().endswith(".tsv") else ","

            reader = csv.reader(f, delimiter=delimiter)
            all_rows = []
            for row in reader:
                cleaned_row = [cell.strip() for cell in row]
                if any(c != "" for c in cleaned_row):
                    all_rows.append(cleaned_row)

    except Exception as e:
        raise RuntimeError(f"Failed to read CSV/TSV file {filename}: {str(e)}")

    if not all_rows:
        return result

    headers = all_rows[0]
    data_rows = all_rows[1:] if len(all_rows) > 1 else [all_rows[0]]

    table_entry = {
        "table_index": 0,
        "source_location": f"{filename} (CSV)",
        "headers": headers,
        "rows": data_rows,
    }

    result["tables"].append(table_entry)
    result["sheets"].append({
        "name": filename,
        "tables": [table_entry],
    })

    # Build raw_text
    for row in all_rows:
        result["raw_text"] += " | ".join(cell for cell in row if cell) + "\n"

    return result
