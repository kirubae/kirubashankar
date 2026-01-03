"""
Data Merge Router - FastAPI endpoints for merge operations
Replaces the Flask data-merge backend
"""

import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from io import BytesIO

from config import settings
from models.data_merge import (
    FileUploadResponse,
    PreviewMatchRequest,
    PreviewMatchResponse,
    MergeRequest,
    MergeJobResponse,
    JobStatusResponse,
    ErrorResponse
)
from services.file_service import (
    save_upload,
    read_file_to_df,
    get_file_preview,
    find_file_path,
    df_to_excel_bytes
)
from services.merge_service import preview_match, run_merge_async
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
