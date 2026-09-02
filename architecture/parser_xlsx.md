# SOP: XLSX Parser (`parse_xlsx.py`)

## Purpose
Extract data from XLSX spreadsheets using openpyxl, handling merged cells and multi-sheet documents.

## Inputs
- `file_path`: Absolute path to the XLSX file
- `filename`: Original filename (for traceability)

## Outputs
```json
{
  "raw_text": "all non-empty cell values concatenated",
  "tables": [{ "table_index", "source_location", "headers", "rows" }],
  "sheets": [{ "name", "tables" }]
}
```

## Strategy
1. Open workbook with `load_workbook(file_path, data_only=True)` — `data_only=True` reads calculated values, not formulas
2. For each sheet:
   a. Collect all merged cell ranges via `ws.merged_cells.ranges`
   b. Unmerge cells and fill all cells in range with top-left value
   c. Read all rows, skip completely empty rows
   d. Detect table boundaries (heuristic: first non-empty row = headers, consecutive rows = data, empty row = boundary)
3. Tag source location as `"Sheet 'SheetName'"`

## Edge Cases

### Merged Cells
- `range_boundaries()` gives (min_col, min_row, max_col, max_row)
- Unmerge, then fill all cells with top-left value
- Must unmerge before reading to avoid NaN/None in cell values

### Multiple Tables Per Sheet
- Heuristic detection: non-empty row after an empty row starts a new table
- If no empty rows found, entire sheet treated as one table
- First row of each detected table is the header

### Named Ranges / Excel Tables
- Current version does not parse Excel named ranges or ListObjects
- All data is read via cell iteration
- Future: add `ws.tables` support for structured Excel tables

### Formula Cells
- `data_only=True` reads cached computed values
- If the file was never opened in Excel (no cached values), formulas return None
- **Mitigation**: Flag these as potential extraction gaps in the normalizer

### Multi-Sheet Processing
- ALL sheets are processed, not just the first one
- Each sheet produces separate table entries

## Dependencies
- `openpyxl >= 3.1.0`

## Golden Rule
If extraction logic in this parser changes, update this SOP BEFORE modifying the code.
