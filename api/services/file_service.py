"""File upload, download, and cleanup service"""

import uuid
import logging
import aiofiles
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta
from fastapi import UploadFile, HTTPException
from io import BytesIO
import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# Thread pool for CPU-bound pandas operations
_executor = ThreadPoolExecutor(max_workers=4)


async def save_upload(file: UploadFile, upload_dir: Path) -> tuple[str, Path, str]:
    """
    Save uploaded file and return (file_id, path, file_type)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    # Get file extension
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ["csv", "xlsx", "xls"]:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use CSV or Excel."
        )

    # Generate unique filename
    file_id = str(uuid.uuid4())
    filename = f"{file_id}.{ext}"
    file_path = upload_dir / filename

    # Save file
    content = await file.read()
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    logger.info(f"Saved file: {file_path} ({file.filename})")
    return file_id, file_path, ext


async def cleanup_old_files(directory: Path, hours: int = 1) -> None:
    """Remove files older than specified hours"""
    if not directory.exists():
        return

    cutoff = datetime.now() - timedelta(hours=hours)
    deleted_count = 0

    for file_path in directory.iterdir():
        if file_path.is_file() and file_path.name != ".gitkeep":
            try:
                mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                if mtime < cutoff:
                    file_path.unlink()
                    deleted_count += 1
                    logger.info(f"Cleaned up old file: {file_path}")
            except Exception as e:
                logger.error(f"Failed to clean up {file_path}: {e}")

    if deleted_count > 0:
        logger.info(f"Cleaned up {deleted_count} old files from {directory}")


def _read_file_to_df_sync(file_path: Path, file_type: str) -> pd.DataFrame:
    """Read CSV or Excel file into DataFrame (sync version)"""
    if file_type in ["xlsx", "xls"]:
        return pd.read_excel(file_path)
    else:
        # Try different encodings for CSV
        encodings = ["utf-8", "latin-1", "cp1252"]
        for encoding in encodings:
            try:
                return pd.read_csv(file_path, encoding=encoding)
            except UnicodeDecodeError:
                continue
        raise ValueError("Could not read CSV file with any common encoding")


async def read_file_to_df(file_path: Path, file_type: str) -> pd.DataFrame:
    """Read CSV or Excel file into DataFrame (async wrapper)"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _executor,
        _read_file_to_df_sync,
        file_path,
        file_type
    )


def get_file_preview(df: pd.DataFrame, num_rows: int = 5) -> dict:
    """Get preview of DataFrame"""
    preview_df = df.head(num_rows).fillna("")
    return {
        "columns": list(df.columns),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        "rowCount": len(df),
        "preview": preview_df.astype(str).to_dict("records")
    }


def find_file_path(file_id: str, upload_dir: Path) -> Path | None:
    """Find file path by ID (checking all supported extensions)"""
    for ext in ["csv", "xlsx", "xls"]:
        path = upload_dir / f"{file_id}.{ext}"
        if path.exists():
            return path
    return None


async def df_to_excel_bytes(df: pd.DataFrame) -> bytes:
    """Convert DataFrame to Excel bytes (async)"""
    def _convert():
        output = BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name="Merged Data", index=False)
        output.seek(0)
        return output.getvalue()

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _convert)
