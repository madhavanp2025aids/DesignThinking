"""
HYDAC Spec-to-3D Generator — Storage Abstraction
Interface + LocalStorage implementation. Abstractable to S3/cloud later.
"""

import os
import shutil
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
TEMP_DIR = os.getenv("TEMP_DIR", "./tmp")


class StorageBackend(ABC):
    """Abstract storage interface — swap implementations without touching business logic."""

    @abstractmethod
    def save_file(self, file_content: bytes, filename: str, user_id: str) -> str:
        """Save uploaded file. Returns the storage path."""
        pass

    @abstractmethod
    def get_file_path(self, storage_path: str) -> str:
        """Get the absolute filesystem path for a stored file."""
        pass

    @abstractmethod
    def delete_file(self, storage_path: str) -> bool:
        """Delete a stored file. Returns True if successful."""
        pass

    @abstractmethod
    def save_generated_file(self, file_content: bytes, filename: str, job_id: str) -> str:
        """Save a generated CAD/mesh file. Returns the storage path."""
        pass


class LocalStorage(StorageBackend):
    """Local filesystem storage implementation."""

    def __init__(self):
        self.upload_dir = Path(UPLOAD_DIR)
        self.temp_dir = Path(TEMP_DIR)
        self.generated_dir = self.upload_dir / "generated"
        # Ensure directories exist
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.generated_dir.mkdir(parents=True, exist_ok=True)

    def save_file(self, file_content: bytes, filename: str, user_id: str) -> str:
        """Save uploaded file to /uploads/{user_id}/{uuid}_{filename}."""
        user_dir = self.upload_dir / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        safe_filename = f"{uuid.uuid4().hex[:8]}_{filename}"
        file_path = user_dir / safe_filename
        file_path.write_bytes(file_content)
        return str(file_path)

    def get_file_path(self, storage_path: str) -> str:
        """Return absolute path."""
        return str(Path(storage_path).resolve())

    def delete_file(self, storage_path: str) -> bool:
        """Delete file from local filesystem."""
        try:
            Path(storage_path).unlink(missing_ok=True)
            return True
        except Exception:
            return False

    def save_generated_file(self, file_content: bytes, filename: str, job_id: str) -> str:
        """Save generated file to /uploads/generated/{job_id}/{filename}."""
        job_dir = self.generated_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        file_path = job_dir / filename
        file_path.write_bytes(file_content)
        return str(file_path)


def get_storage() -> StorageBackend:
    """Factory: returns the configured storage backend."""
    return LocalStorage()
