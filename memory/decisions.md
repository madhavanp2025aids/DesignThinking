# Decisions Log

> Architectural choices and the reasoning behind each.

---

## DEC-001: PDF Parser — pdfplumber (primary)

**Decision:** Use pdfplumber as the primary PDF parser, with PyMuPDF for initial text extraction speed.

**Rationale:** HYDAC hydraulics specs likely contain inconsistent table layouts, borderless tables, and mixed text/table content. pdfplumber provides character-level bounding box access and visual debugging — critical for tuning extraction on messy documents. PyMuPDF is 10–50× faster but less precise for complex tables.

**Trade-off:** Slower processing per page vs. higher extraction accuracy. Acceptable since spec documents are typically < 50 pages.

---

## DEC-002: CAD Engine — FreeCAD Part Workbench (headless)

**Decision:** Use FreeCAD's `Part` workbench via `freecadcmd` for headless parametric CAD generation.

**Rationale:** `Part` workbench is stable in headless mode (unlike `PartDesign` which depends on GUI). Provides parametric primitives (`Part::Cylinder`, etc.), boolean operations (`Part.Cut`, `Part.Fuse`), and direct STEP/STL export. FreeCAD is open-source with no licensing cost.

**Alternative considered:** `build123d` — more Pythonic API but smaller ecosystem. CadQuery — powerful but overkill for our component-based generation.

**Trade-off:** FreeCAD requires system installation (not pip-installable), complicating deployment. Mitigated by Docker containerization.

---

## DEC-003: 3D Format — STL for viewer, STEP for download

**Decision:** Generate both STEP and STL from FreeCAD. Serve STL to Three.js viewer, offer STEP for download.

**Rationale:** STL is natively supported by Three.js STLLoader with no conversion step. STEP preserves parametric/B-Rep data for engineering use. Avoids STEP→glTF conversion complexity (requires OpenCASCADE tessellation server-side).

**Future:** If STL file sizes become problematic, add glTF conversion via `cascadio` as an optimization.

---

## DEC-004: Frontend — React + Vite + React Three Fiber

**Decision:** React SPA built with Vite, using @react-three/fiber and @react-three/drei for 3D rendering.

**Rationale:** Vite provides fast dev builds. React Three Fiber offers declarative Three.js with React paradigm. Drei provides ready-made OrbitControls, Center, and other utilities. Separating frontend from FastAPI backend allows independent deployment.

---

## DEC-005: Auth — JWT (session-based)

**Decision:** JWT tokens with httpOnly cookies for session persistence.

**Rationale:** Stateless auth suitable for single-server deployment. No session store needed. FastAPI has well-documented JWT patterns via python-jose.

---

## DEC-006: Database — PostgreSQL

**Decision:** PostgreSQL for persistent storage of users, uploaded files metadata, extracted parameters, and generation jobs.

**Rationale:** Relational model fits our entity relationships (User → Files → Parameters → Jobs). JSONB columns can store flexible parameter data. Production-grade, well-supported.

---

## DEC-007: No LLM in v1 Extraction

**Decision:** Use regex + alias/synonym table for parameter extraction in v1. Defer LLM-assisted fuzzy mapping to v2.

**Rationale:** Deterministic extraction is auditable and reproducible. LLM adds non-determinism, latency, and cost. The alias table approach (mapping common spec label variations to canonical field names) handles most cases. LLM is reserved for truly ambiguous/messy labels in a future iteration.

---

## DEC-008: OCR Fallback for Scanned PDFs

**Decision:** Detect scanned pages via text-length heuristic. If a page has visual content but minimal extracted text (< 50 chars), run Tesseract OCR.

**Rationale:** HYDAC specs may include scanned datasheets. Silent failure on scanned pages would violate the "never guess" rule — we'd miss parameters. OCR fallback ensures coverage.

**Trade-off:** Tesseract adds processing time and requires system installation. Acceptable for correctness.

---

## DEC-009: Storage Abstraction

**Decision:** Implement a `StorageBackend` interface with a `LocalStorage` implementation. All file operations go through the interface.

**Rationale:** Enables future swap to S3/GCS without touching business logic. Local storage is sufficient for development and single-server deployment.

---

## DEC-010: Config-Driven Component Schemas

**Decision:** Component field definitions (required fields, aliases, units) loaded from `component_schemas.json`, not hardcoded in extraction code.

**Rationale:** New component types or fields can be added by editing config, not code. Reduces regression risk. Aligns with "SOPs before code" invariant.
