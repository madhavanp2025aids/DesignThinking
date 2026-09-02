"""
HYDAC Spec-to-3D Generator — FastAPI Main Application
Entry point: CORS, router mounting, startup diagnostics, health check, global error handling.
"""

import os
import shutil
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from dotenv import load_dotenv

from backend.database import init_db, SessionLocal
from backend.routers import (
    auth_router,
    upload_router,
    extraction_router,
    generation_router,
    spec_router,
    model_router,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("hydac_app")


def _test_directory_writable(dir_path: str) -> bool:
    """Verify that a directory exists and is writable."""
    try:
        os.makedirs(dir_path, exist_ok=True)
        test_file = os.path.join(dir_path, ".write_test")
        with open(test_file, "w") as f:
            f.write("ok")
        if os.path.exists(test_file):
            os.remove(test_file)
        return True
    except Exception as e:
        logger.error(f"Directory {dir_path} is not writable: {e}")
        return False


def _detect_freecad() -> bool:
    """Detect if FreeCAD binary is available on the host system."""
    cmd = os.getenv("FREECAD_CMD", "freecadcmd")
    found = shutil.which(cmd) is not None
    if found:
        logger.info(f"FreeCAD detected at '{cmd}' — STEP & FreeCAD STL generation active.")
    else:
        logger.info(f"FreeCAD ('{cmd}') not detected — Pure-Python parametric STL CAD generator active as default.")
    return found


def _detect_ocr() -> bool:
    """Detect if OCR engines (easyocr or pytesseract) are available."""
    has_easyocr = False
    has_pytesseract = False
    try:
        import easyocr
        has_easyocr = True
    except ImportError:
        pass

    try:
        import pytesseract
        if shutil.which("tesseract"):
            has_pytesseract = True
    except ImportError:
        pass

    ocr_available = has_easyocr or has_pytesseract
    if ocr_available:
        engine = "easyocr" if has_easyocr else "pytesseract"
        logger.info(f"OCR Engine detected ({engine}) — Scanned document OCR extraction active.")
    else:
        logger.info("OCR Engine not detected — Digital text-layer parsing active (Scanned images will flag fallback tag).")
    return ocr_available


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: verify DB, storage directories, and toolchain diagnostics."""
    logger.info("Initializing HYDAC Spec-to-3D Generator backend...")
    init_db()

    upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
    temp_dir = os.getenv("TEMP_DIR", "./tmp")

    upload_ok = _test_directory_writable(upload_dir)
    temp_ok = _test_directory_writable(temp_dir)

    freecad_ok = _detect_freecad()
    ocr_ok = _detect_ocr()
    cad_kernel_ok = True  # Pure-Python CAD kernel is universally available

    # Record capabilities on app state
    app.state.capabilities = {
        "upload_dir_writable": upload_ok,
        "temp_dir_writable": temp_ok,
        "cad_kernel_available": cad_kernel_ok,
        "freecad_available": freecad_ok,
        "ocr_available": ocr_ok,
    }

    logger.info("Startup diagnostics complete. System ready.")
    yield


app = FastAPI(
    title="HYDAC Spec-to-3D Generator",
    description="Parse hydraulics spec documents and generate dimensionally exact parametric 3D models.",
    version="2.0.0",
    lifespan=lifespan,
)

# ── Global Exception Handlers ─────────────────────────────────

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Clean JSON shape for all HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail if isinstance(exc.detail, str) else "HTTP Exception",
            "detail": exc.detail,
            "status_code": exc.status_code,
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Clean JSON shape for Pydantic validation errors."""
    errors = exc.errors()
    message = "; ".join([f"{'.'.join(str(l) for l in err['loc'])}: {err['msg']}" for err in errors])
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "Validation Error",
            "detail": message,
            "status_code": status.HTTP_422_UNPROCESSABLE_ENTITY,
            "errors": errors,
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Global catch-all for unhandled 500 errors."""
    logger.error(f"Unhandled Exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "detail": str(exc),
            "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
        },
    )


# ── CORS Middleware ───────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount Routers ─────────────────────────────────────────────

app.include_router(auth_router.router)
app.include_router(upload_router.router)
app.include_router(extraction_router.router)
app.include_router(generation_router.router)
app.include_router(spec_router.router)
app.include_router(model_router.router)


# ── Health & Diagnostics Endpoint ─────────────────────────────

@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    """
    Health & System Diagnostics Endpoint.
    Checks DB connectivity, storage writability, CAD kernel availability, and OCR availability.
    """
    db_ok = False
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_ok = True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")

    caps = getattr(app.state, "capabilities", {
        "upload_dir_writable": True,
        "temp_dir_writable": True,
        "cad_kernel_available": True,
        "freecad_available": False,
        "ocr_available": False,
    })

    is_degraded = not caps.get("cad_kernel_available")

    return {
        "status": "ok" if db_ok else "error",
        "service": "HYDAC Spec-to-3D Generator",
        "database_reachable": db_ok,
        "cad_kernel_available": caps.get("cad_kernel_available", True),
        "freecad_available": caps.get("freecad_available", False),
        "ocr_available": caps.get("ocr_available", False),
        "upload_dir_writable": caps.get("upload_dir_writable", False),
        "temp_dir_writable": caps.get("temp_dir_writable", False),
        "degraded": is_degraded,
    }
