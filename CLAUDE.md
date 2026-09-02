# HYDAC Spec-to-3D Generator — Project Constitution

> **North Star:** A user logs in, uploads hydraulics spec documents (PDF/DOCX/XLSX),
> clicks "Generate," and the system parses every document, extracts hydraulic component
> parameters, maps them to a normalized schema, and generates a dimensionally exact
> parametric 3D model viewable in-browser with 360° rotation and zoom.

---

## 1. Data Schemas

### 1.1 Input Schema (per uploaded file)

```json
{
  "file_id": "string (UUID v4)",
  "filename": "string",
  "file_type": "pdf | docx | xlsx",
  "upload_timestamp": "ISO8601",
  "raw_extracted_text": "string | null",
  "raw_extracted_tables": [
    {
      "table_index": "number",
      "source_location": "string (page/sheet/paragraph)",
      "headers": ["string"],
      "rows": [["string"]]
    }
  ]
}
```

### 1.2 Normalized Parameter Schema (per hydraulic component)

```json
{
  "component_id": "string (UUID v4)",
  "component_type": "cylinder | valve | pump | hose | fitting",
  "parameters": {
    "<field_name>": {
      "value": "number | string",
      "unit": "string",
      "source_file": "string (filename)",
      "source_location": "string (page N / sheet X, cell Y / paragraph Z)",
      "confidence": "high | medium | low"
    }
  },
  "missing_required_fields": ["array of field names not found"],
  "status": "ready_for_generation | incomplete | no_specs_found"
}
```

**Required fields per component_type** are loaded from `/execution/config/component_schemas.json` — never hardcoded.

### 1.3 Output Schema (generation result)

```json
{
  "component_id": "string",
  "cad_file_path": "string (.step)",
  "mesh_file_path": "string (.stl)",
  "generation_log": [
    { "step": "string", "status": "ok | warning | error", "detail": "string" }
  ],
  "generation_status": "success | failed_missing_params | failed_generation_error"
}
```

---

## 2. Behavioral Rules

1. **NEVER guess a missing dimension.** If a required parameter is not found in any uploaded document, halt generation for that component and report exactly which field is missing.
2. **NEVER produce a "rough" or placeholder 3D shape.** Geometry must be driven only by explicitly extracted parameters mapped to the schema.
3. **No-specs handling:** If a document (or page) contains no matching hydraulics parameters → output: `"No specs found in [filename]"`. Do not fail the entire batch; continue processing other documents.
4. **Traceability:** Every extracted value must carry: `{value, unit, source_file, source_location, confidence}`.
5. **100% dimensional fidelity:** The generated model's dimensions must exactly match extracted/normalized parameter values — zero silent unit-conversion errors, zero assumed defaults.
6. **Human confirmation gate:** Extracted parameters MUST be shown to the user for review/edit before CAD generation. This step is mandatory, not skippable.
7. **Tone:** Professional, engineering-tool tone. No filler UI copy.
8. **Error specificity:** Error states must name the specific missing field or failing document — never a generic "something went wrong."

---

## 3. Architectural Invariants

1. **One parser per format:** `parse_pdf.py`, `parse_docx.py`, `parse_xlsx.py` — atomic, testable, no cross-format logic.
2. **Navigation layer orchestrates only:** The routing/decision layer routes files to parsers and manages pipeline flow — it does NOT perform parsing or CAD math.
3. **Config-driven field schemas:** Component field definitions (required fields, aliases, unit conversion rules) loaded from config files, not hardcoded.
4. **SOPs before code:** If extraction logic changes, update the relevant `/architecture/*.md` SOP before modifying code.
5. **Intermediate JSON:** All formats normalize to a single intermediate JSON structure before parameter extraction.
6. **Storage abstraction:** File storage is behind an interface — local `/uploads` now, abstractable to S3/cloud later.
7. **All temp files route through `/tmp/`.**
8. **FreeCAD headless only:** Use `Part` workbench (stable headless), avoid `PartDesign`/GUI modules.

---

## 4. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| API | FastAPI (Python) | FreeCAD + parsing libs are Python-native |
| Auth | JWT (session-based) | Simple, stateless auth |
| Database | PostgreSQL | Relational: users, files, parameters, jobs |
| PDF parsing | pdfplumber (primary), PyMuPDF (fallback/speed) | pdfplumber: precision for messy tables; PyMuPDF: speed |
| DOCX parsing | python-docx | Standard, well-maintained |
| XLSX parsing | openpyxl + pandas | Merged cell handling, table extraction |
| CAD engine | FreeCAD headless (freecadcmd) | Part workbench, STEP+STL export |
| 3D viewer | React + Three.js (@react-three/fiber + drei) | STLLoader, OrbitControls |
| Frontend | React (Vite) | Fast dev, modern tooling |

---

## 5. B.L.A.S.T. Phase Outputs

### Phase B — Blueprint
- [x] North Star confirmed
- [x] Integrations defined (Auth/JWT, local storage, FreeCAD headless, no SaaS)
- [x] Source of truth defined (spec docs → normalized JSON)
- [x] Delivery payload defined (interactive 3D + downloadable STL/STEP + parameter table)
- [x] Behavioral rules codified (6 rules above)
- [x] Data schemas defined (Input, Parameter, Output)

### Phase L — Link
- [ ] Auth flow verified end-to-end
- [ ] File upload endpoint verified
- [ ] FreeCAD headless smoke test passed
- [ ] Three.js STL rendering verified

### Phase A — Architect
- [ ] Architecture SOPs written
- [ ] Navigation layer implemented
- [ ] Tool modules implemented and tested

### Phase S — Stylize
- [ ] UI polished (industrial/engineering aesthetic)
- [ ] Pipeline end-to-end test passed
- [ ] Error states verified

### Phase T — Trigger
- [ ] Deployment ready
- [ ] Maintenance log finalized
- [ ] Self-healing repair loop documented

---

## 6. Pipeline Flow

```
Upload (multi-format) → Parse (per format) → Normalize (unified JSON) → Extract + Map
→ Validate (no_specs_found / incomplete / ready) → Human Confirmation → CAD Generate
→ 3D Viewer (rotate/zoom/download)
```

---

## 7. Unit Conversion Rules

| From | To | Factor |
|------|----|--------|
| inch → mm | × 25.4 |
| mm → inch | ÷ 25.4 |
| psi → bar | × 0.0689476 |
| bar → psi | × 14.5038 |
| MPa → bar | × 10 |
| bar → MPa | ÷ 10 |

All conversions logged with source and target units in traceability tags.
