# Findings — Research Log

> Last updated: 2026-08-30

---

## 1. FreeCAD Headless / Python Scripting

### Key Findings
- **Headless invocation:** `freecadcmd script.py` or `freecad --console script.py`
- **Use `Part` workbench** for headless stability. `PartDesign` is tightly coupled to GUI — causes crashes in headless mode.
- **Parametric primitives:** `doc.addObject("Part::Cylinder", "name")` → set `.Radius`, `.Height` → `doc.recompute()`
- **Boolean operations:** `Part.Cut`, `Part.Fuse`, `Part.Common` for compound shapes (e.g., hollow cylinders = outer cylinder cut by inner bore cylinder)
- **STEP export:** `Import.export([obj], "output.step")`
- **STL export:** Tessellate first → `Mesh.createMesh(shape.tessellate(deviation))` → `mesh.write("output.stl")`
  - Deviation value (e.g., 0.1) controls mesh resolution. Smaller = smoother = larger file.
- **Alternative considered:** `build123d` — code-first OpenCASCADE wrapper. Simpler API but less mature ecosystem. **Decision: stick with FreeCAD** for broader CAD format support and proven headless pipeline.

### Risks
- FreeCAD Python path must be on `sys.path` or use `freecadcmd` — deployment needs FreeCAD installed.
- Complex assemblies (multiple components in one document) may need careful object management.

---

## 2. PDF Parsing (pdfplumber / PyMuPDF)

### Key Findings
- **pdfplumber:** Best for complex/messy tables. Character-level bounding box access, visual debugging. Slower (10–50× vs PyMuPDF).
- **PyMuPDF (fitz):** Best for speed. C-bindings, `page.find_tables()` for structured tables. AGPL license — requires caution for commercial use.
- **Hybrid approach (production standard):**
  1. Initial pass: PyMuPDF for bulk text + simple tables
  2. Fallback: pdfplumber for pages where PyMuPDF fails to detect tables
- **Scanned PDFs:** Neither handles OCR natively. Need OCR fallback (Tesseract via `pytesseract` or `easyocr`).
- **Camelot:** Good for ruled-grid tables but requires Java dependency (Tabula wrapper). Skip for now.

### Decision
- Primary: **pdfplumber** for precision (HYDAC specs likely have messy/inconsistent table layouts)
- Speed fallback: PyMuPDF for initial text extraction
- OCR: Tesseract via `pytesseract` for scanned pages (detect via text-length heuristic — if extracted text is very short for a page with content, trigger OCR)

---

## 3. DOCX Parsing (python-docx)

### Key Findings
- `document.tables` returns all tables; iterate `table.rows` → `row.cells` → `cell.text`
- **Merged cells:** python-docx repeats the value or returns empty strings — need dedup logic
- **Element ordering:** `document.tables` gives tables only, not in document order. Use `iter_block_items()` for sequential traversal (tables + paragraphs interleaved)
- **Inline specs:** Parameters may appear in paragraph text, not just tables. Need regex extraction from paragraph text as well.

### Decision
- Extract both tables AND paragraph text
- Use `iter_block_items()` for correct ordering
- Apply same regex-based parameter extraction to paragraph text

---

## 4. XLSX Parsing (openpyxl / pandas)

### Key Findings
- **Merged cells:** Only top-left cell retains value; others become NaN. Fix: `openpyxl` `sheet.merged_cells.ranges` → fill all cells in range with top-left value.
- **Multiple tables per sheet:** Use `openpyxl` direct cell access to extract specific regions
- **Forward fill:** `df.ffill()` handles simple categorization-style merged cells
- **Multi-sheet:** Must iterate all sheets — specs may span multiple worksheets

### Decision
- Use `openpyxl` for merged cell pre-processing
- Convert to pandas DataFrame per sheet after unmerging
- Extract all sheets, tag each with sheet name as source_location

---

## 5. Three.js / React Three Fiber

### Key Findings
- **STLLoader:** `useLoader(STLLoader, url)` returns `BufferGeometry` → pass to `<mesh>`
- **OrbitControls:** `@react-three/drei` provides declarative `<OrbitControls />` — handles rotate (all axes), zoom (scroll/pinch)
- **Suspense required:** `useLoader` is async → wrap in `<Suspense>`
- **Camera setup:** Default camera may not frame model correctly — need auto-fit based on bounding box
- **File serving:** STL files served from backend `/api/files/` endpoint or `public/` folder

### Decision
- Use `@react-three/fiber` + `@react-three/drei` (OrbitControls, Center)
- STL loaded from API endpoint (generated files are per-session, not static)
- Add auto-camera positioning based on model bounding box
- Metallic/engineering material look (not plastic orange)

---

## 6. STEP → STL Conversion

### Key Findings
- FreeCAD can export both STEP and STL directly — no separate conversion tool needed
- For glTF (lighter web loading): `cascadio` (pip-installable OpenCASCADE wrapper) or CadQuery
- **Decision: export STL directly from FreeCAD** — simpler pipeline, STLLoader well-supported in Three.js
- If performance becomes an issue, add glTF conversion as optimization later

---

## 7. FastAPI Backend

### Stack
- FastAPI for REST API
- SQLAlchemy + asyncpg for PostgreSQL
- Pydantic for request/response validation (matches our JSON schemas)
- python-jose for JWT
- python-multipart for file upload handling
- uvicorn as ASGI server

---

## 8. Open Questions (Resolved)

| Question | Resolution |
|----------|-----------|
| STEP vs STL for browser? | STL for viewer, STEP for download (engineering-grade) |
| LLM for fuzzy mapping? | Deferred — regex + alias table first pass. LLM second pass for messy labels is Phase 2 |
| OCR for scanned PDFs? | Yes, Tesseract fallback when text extraction yields < threshold |
