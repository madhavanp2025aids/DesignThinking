"""
HYDAC Spec-to-3D Generator — FastAPI Main Application
Entry point: CORS, router mounting, startup/shutdown.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from backend.database import init_db
from backend.routers import auth_router, upload_router, extraction_router, generation_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create DB tables and required directories."""
    init_db()
    os.makedirs(os.getenv("UPLOAD_DIR", "./uploads"), exist_ok=True)
    os.makedirs(os.getenv("TEMP_DIR", "./tmp"), exist_ok=True)
    yield


app = FastAPI(
    title="HYDAC Spec-to-3D Generator",
    description="Parse hydraulics spec documents and generate dimensionally exact parametric 3D models.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server
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

# Mount routers
app.include_router(auth_router.router)
app.include_router(upload_router.router)
app.include_router(extraction_router.router)
app.include_router(generation_router.router)


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "HYDAC Spec-to-3D Generator"}
