# SOP: DOCX Parser (`parse_docx.py`)

## Purpose
Extract text and tables from DOCX spec documents using python-docx, preserving document order.

## Inputs
- `file_path`: Absolute path to the DOCX file
- `filename`: Original filename (for traceability)

## Outputs
```json
{
  "raw_text": "concatenated paragraph text",
  "tables": [{ "table_index", "source_location", "headers", "rows" }],
  "paragraphs": [{ "index", "text", "source_location" }]
}
```

## Strategy
1. Open document with `Document(file_path)`
2. Iterate `doc.element.body` children to preserve document order (tables and paragraphs interleaved)
3. Match XML elements to python-docx Table and Paragraph objects
4. Extract table data with merged cell deduplication
5. Extract paragraph text for inline parameter detection

## Edge Cases

### Merged Cells
- python-docx repeats cell references for merged cells
- **Handling**: Track `id(cell._element)` per row; skip duplicates
- First occurrence keeps the text; subsequent occurrences get empty string

### Tables Inside Paragraphs
- Rare but possible: nested tables or tables within text frames
- **Handling**: `doc.tables` may not capture these. Current approach iterates body-level elements only.
- Nested tables are a known limitation.

### Empty Tables
- Tables with < 2 rows (header only) are skipped
- Tables with all empty cells are skipped

### .doc Format (Legacy Word)
- python-docx does NOT support .doc files
- .doc format is deferred to v2 (requires LibreOffice headless conversion)
- Upload endpoint rejects .doc files

## Dependencies
- `python-docx >= 1.1.0`

## Golden Rule
If extraction logic in this parser changes, update this SOP BEFORE modifying the code.
