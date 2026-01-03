"""
Data Merge Router - FastAPI endpoints for merge operations
Supports both local file uploads and R2 cloud storage
"""

import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from io import BytesIO
from typing import Optional
import pandas as pd

from config import settings
from models.data_merge import (
    FileUploadResponse,
    PreviewMatchRequest,
    PreviewMatchResponse,
    MergeRequest,
    MergeJobResponse,
    JobStatusResponse,
    ErrorResponse,
    R2MergeRequest,
    R2PreviewRequest
)
from services.file_service import (
    save_upload,
    read_file_to_df,
    get_file_preview,
    find_file_path,
    df_to_excel_bytes
)
from services.merge_service import preview_match, run_merge_async, run_merge_r2_async
from services.r2_service import get_r2_service
from jobs.job_manager import job_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """Upload and parse a file, return preview"""
    try:
        # Save file
        file_id, file_path, file_type = await save_upload(file, settings.upload_dir)

        # Read and preview
        df = await read_file_to_df(file_path, file_type)
        preview_data = get_file_preview(df)

        # Get unique counts for each column
        unique_counts = {}
        for col in df.columns:
            unique_counts[col] = int(df[col].nunique())

        return FileUploadResponse(
            success=True,
            fileId=file_id,
            fileName=file.filename or "unknown",
            fileType=file_type,
            columns=preview_data["columns"],
            dtypes=preview_data["dtypes"],
            rowCount=preview_data["rowCount"],
            preview=preview_data["preview"],
            uniqueCounts=unique_counts
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preview-match", response_model=PreviewMatchResponse)
async def preview_match_endpoint(request: PreviewMatchRequest):
    """Preview match count between two columns"""
    try:
        # Find files
        file_a_path = find_file_path(request.file_a_id, settings.upload_dir)
        file_b_path = find_file_path(request.file_b_id, settings.upload_dir)

        if not file_a_path or not file_b_path:
            raise HTTPException(
                status_code=404,
                detail="Files not found. Please re-upload."
            )

        # Read files
        df_a = await read_file_to_df(file_a_path, file_a_path.suffix[1:])
        df_b = await read_file_to_df(file_b_path, file_b_path.suffix[1:])

        # Calculate match preview
        result = await preview_match(df_a, df_b, request.key_a, request.key_b)

        return PreviewMatchResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in preview match: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs", response_model=MergeJobResponse)
async def create_merge_job(
    request: MergeRequest,
    background_tasks: BackgroundTasks
):
    """Start an async merge job"""
    # Find files
    file_a_path = find_file_path(request.file_a_id, settings.upload_dir)
    file_b_path = find_file_path(request.file_b_id, settings.upload_dir)

    if not file_a_path or not file_b_path:
        raise HTTPException(
            status_code=404,
            detail="Files not found. Please re-upload."
        )

    # Create job
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id, job_type="merge")

    # Run merge in background
    background_tasks.add_task(
        run_merge_async,
        job_id,
        file_a_path,
        file_b_path,
        request.join_type.value,
        request.left_key,
        request.right_key,
        request.selected_columns,
        settings.results_dir
    )

    return MergeJobResponse(jobId=job_id)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get job status"""
    job = job_manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobStatusResponse(**job)


@router.get("/results/{result_id}")
async def download_result_csv(result_id: str):
    """Download merge result as CSV"""
    result_path = settings.results_dir / f"{result_id}.csv"

    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Result not found")

    return FileResponse(
        path=result_path,
        media_type="text/csv",
        filename="merged_data.csv"
    )


@router.get("/results/{result_id}/excel")
async def download_result_excel(result_id: str):
    """Download merge result as Excel"""
    result_path = settings.results_dir / f"{result_id}.csv"

    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Result not found")

    try:
        import pandas as pd
        df = pd.read_csv(result_path)
        excel_bytes = await df_to_excel_bytes(df)

        return StreamingResponse(
            BytesIO(excel_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=merged_data.xlsx"
            }
        )

    except Exception as e:
        logger.error(f"Excel export error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# R2 Cloud Storage Endpoints (for large files)
# ============================================

@router.post("/r2/preview")
async def preview_r2_files(request: R2PreviewRequest):
    """Preview files from R2 storage (concatenates multiple files)"""
    r2 = get_r2_service()

    if not r2.is_available:
        raise HTTPException(status_code=503, detail="R2 storage not available")

    try:
        # Download and concatenate all files
        dfs = []
        for key in request.keys:
            data = r2.download_file(key)
            if not data:
                raise HTTPException(status_code=404, detail=f"File not found: {key}")

            if key.endswith('.xlsx') or key.endswith('.xls'):
                df = pd.read_excel(data)
            else:
                df = pd.read_csv(data)
            dfs.append(df)

        # Concatenate if multiple files
        combined_df = pd.concat(dfs, ignore_index=True) if len(dfs) > 1 else dfs[0]

        # Get preview
        preview = get_file_preview(combined_df)
        unique_counts = {col: int(combined_df[col].nunique()) for col in combined_df.columns}

        return {
            "success": True,
            "columns": preview["columns"],
            "dtypes": preview["dtypes"],
            "rowCount": preview["rowCount"],
            "preview": preview["preview"],
            "uniqueCounts": unique_counts,
            "fileCount": len(request.keys)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"R2 preview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/r2/jobs", response_model=MergeJobResponse)
async def create_r2_merge_job(
    request: R2MergeRequest,
    background_tasks: BackgroundTasks
):
    """Start a merge job using files from R2 (supports multiple files per side)"""
    r2 = get_r2_service()

    if not r2.is_available:
        raise HTTPException(status_code=503, detail="R2 storage not available")

    # Verify at least one file on each side
    if not request.primary_keys or not request.secondary_keys:
        raise HTTPException(status_code=400, detail="Need at least one file on each side")

    # Verify first file of each side exists (quick check)
    if not r2.download_file(request.primary_keys[0]):
        raise HTTPException(status_code=404, detail="Primary file not found in R2")
    if not r2.download_file(request.secondary_keys[0]):
        raise HTTPException(status_code=404, detail="Secondary file not found in R2")

    # Create job
    job_id = str(uuid.uuid4())
    job_manager.create_job(job_id, job_type="merge")

    # Run merge in background
    background_tasks.add_task(
        run_merge_r2_async,
        job_id,
        request.primary_keys,
        request.secondary_keys,
        request.join_type,
        request.left_key,
        request.right_key,
        request.selected_columns
    )

    return MergeJobResponse(jobId=job_id)


@router.get("/r2/results/{result_key:path}")
async def download_r2_result(result_key: str):
    """Get presigned URL for downloading result from R2"""
    r2 = get_r2_service()

    if not r2.is_available:
        raise HTTPException(status_code=503, detail="R2 storage not available")

    url = r2.generate_presigned_url(result_key, expires_in=3600)

    if not url:
        raise HTTPException(status_code=404, detail="Result not found")

    return {"downloadUrl": url}
