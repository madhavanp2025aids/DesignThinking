# SOP: PDF Parser (`parse_pdf.py`)

## Purpose
Extract text and tables from PDF spec documents using pdfplumber.

## Inputs
- `file_path`: Absolute path to the PDF file
- `filename`: Original filename (for traceability)

## Outputs
```json
{
  "raw_text": "concatenated text from all pages",
  "tables": [{ "table_index", "source_location", "headers", "rows" }],
  "pages": [{ "page_num", "text", "tables" }]
}
```

## Strategy
1. Open PDF with `pdfplumber.open()`
2. Iterate all pages
3. Per page: extract text via `page.extract_text()`, extract tables via `page.extract_tables()`
4. First row of each table treated as headers
5. Source location tagged as `"Page N"`

## Edge Cases

### Scanned PDFs
- **Detection**: If `extract_text()` returns < 50 non-whitespace characters on a page with non-zero dimensions, flag as `[SCANNED PAGE - OCR REQUIRED]`
- **Current behavior**: Marks page text with warning prefix. OCR fallback deferred to v2 (Tesseract integration).
- **Rationale**: Better to explicitly flag a scanned page than silently skip parameters on it.

### Multi-column layouts
- pdfplumber extracts text in reading order. Multi-column PDFs may interleave columns.
- **Mitigation**: Table extraction is layout-independent (uses cell coordinates). Inline text extraction may need manual review via confirmation page.

### No tables detected
- Some PDFs have parameters in flowing text, not tables.
- The normalizer extracts key-value pairs from text blocks as a fallback.

### Empty/corrupted pages
- `page.extract_text()` returns `None` → converted to empty string.
- `page.extract_tables()` returns `None` → converted to empty list.
- No exception thrown; page is skipped.

## Dependencies
- `pdfplumber >= 0.11.0`

## Golden Rule
If extraction logic in this parser changes, update this SOP BEFORE modifying the code.
