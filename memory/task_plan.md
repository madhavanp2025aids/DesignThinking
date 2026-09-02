# Task Plan — HYDAC Spec-to-3D Generator

> Master checklist organized by B.L.A.S.T. phases.

---

## Protocol 0 — Initialization ✅

- [x] Create `/memory/task_plan.md`
- [x] Create `/memory/findings.md`
- [x] Create `/memory/progress.md`
- [x] Create `/memory/decisions.md`
- [x] Create `CLAUDE.md` (Project Constitution)
- [x] Research all technology stack components
- [x] Define data schemas (Input, Parameter, Output)
- [ ] **GATE: User approves Blueprint before any execution code**

---

## Phase B — Blueprint

- [x] North Star confirmed
- [x] Integrations defined
- [x] Source of truth defined
- [x] Delivery payload defined
- [x] Behavioral rules codified
- [x] Data schemas defined in CLAUDE.md
- [ ] User approval received

---

## Phase L — Link (Verification Probes)

- [ ] L1: Auth flow — signup/login/session works end-to-end
  - [ ] Create FastAPI project skeleton with JWT auth
  - [ ] Test: signup → login → authenticated endpoint
- [ ] L2: File upload — endpoint accepts pdf/docx/xlsx, stores them
  - [ ] Create upload endpoint with file type validation
  - [ ] Test: upload each format, verify storage
- [ ] L3: FreeCAD headless — smoke test
  - [ ] Create test script: generate one hardcoded cylinder → STEP + STL
  - [ ] Run via `freecadcmd`, verify output files
- [ ] L4: Three.js STL rendering — smoke test
  - [ ] Create minimal React page with STLLoader + OrbitControls
  - [ ] Load test cylinder STL, verify rotate + zoom
- [ ] Document each result in `/memory/progress.md`

---

## Phase A — Architect

### Architecture SOPs
- [ ] A1: Write `/architecture/parser_pdf.md`
- [ ] A2: Write `/architecture/parser_docx.md`
- [ ] A3: Write `/architecture/parser_xlsx.md`
- [ ] A4: Write `/architecture/extraction_schema_mapping.md`
- [ ] A5: Write `/architecture/cad_generation.md`

### Backend — Tool Modules
- [ ] A6: `execution/parse_pdf.py`
- [ ] A7: `execution/parse_docx.py`
- [ ] A8: `execution/parse_xlsx.py`
- [ ] A9: `execution/normalize_text.py`
- [ ] A10: `execution/extract_parameters.py`
- [ ] A11: `execution/validate_completeness.py`
- [ ] A12: `execution/generate_cad.py`
- [ ] A13: `execution/config/component_schemas.json`
- [ ] A14: `execution/cad_templates/` — per component_type

### Backend — API Layer
- [ ] A15: FastAPI app structure (main.py, routers, models, db)
- [ ] A16: Auth endpoints (signup, login, logout, me)
- [ ] A17: Upload endpoints (upload, list, status)
- [ ] A18: Extraction endpoints (extract, get parameters)
- [ ] A19: Generation endpoints (generate, status, download)
- [ ] A20: Database models (SQLAlchemy)
- [ ] A21: Storage interface + LocalStorage implementation

### Backend — Navigation Layer
- [ ] A22: Pipeline orchestrator (routes files → parsers → extraction → validation → generation)
- [ ] A23: Status tracking per file and per component

### Frontend
- [ ] A24: Vite + React project setup
- [ ] A25: Page 1 — Login/Signup
- [ ] A26: Page 2 — Document Upload (drag-drop, multi-file, status per file)
- [ ] A27: Page 3 — Parameter Confirmation (editable table, missing fields flagged)
- [ ] A28: Page 4 — Generate + 3D Viewer (Three.js, OrbitControls, download)
- [ ] A29: API client / fetch layer
- [ ] A30: Routing (React Router)

---

## Phase S — Stylize

- [ ] S1: UI polish — industrial/engineering aesthetic, dark neutral palette
- [ ] S2: Error states — specific messages per failure mode
- [ ] S3: Loading states — pipeline stage indicators
- [ ] S4: End-to-end test with sample spec files
  - [ ] Clean PDF
  - [ ] Messy/scanned PDF (OCR fallback)
  - [ ] XLSX with merged cells
  - [ ] DOCX with tables + inline text
- [ ] S5: Present working pipeline for user sign-off

---

## Phase T — Trigger

- [ ] T1: Deployment preparation (Docker, env config)
- [ ] T2: Maintenance log in CLAUDE.md (parser limitations, supported formats, FreeCAD version)
- [ ] T3: Self-healing repair loop documented
