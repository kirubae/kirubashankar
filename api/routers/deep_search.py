"""
Deep Search Router - FastAPI endpoints for research operations
Replaces the Flask deep-search backend
"""

import csv
import io
import uuid
import hashlib
import logging
import asyncio
import aiofiles
from datetime import datetime
from pathlib import Path
from typing import Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

from config import settings
from models.deep_search import (
    FIELD_TYPES,
    ResearchType,
    CSVUploadResponse,
    SetResearchTypeRequest,
    SetResearchTypeResponse,
    RunResearchRequest,
    ResearchProgress,
    ResultsStreamResponse,
    ResearchResult,
    HistoryResponse,
    CacheStats,
    RunHistoryEntry,
    DeleteRunsRequest,
    DeleteRunsResponse,
    StopResearchResponse
)
from services.cache_service import get_cache_service
from services.perplexity_service import process_entity_perplexity

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory storage for session data
csv_storage: dict[str, list[list[str]]] = {}
research_type_storage: dict[str, str] = {}
progress_tracker: dict[str, dict[str, int]] = {}
results_storage: dict[str, list[dict[str, Any]]] = {}
stop_flags: dict[str, bool] = {}

# Results directory
RESULTS_DIR = Path("storage/results")


@router.get("/field-types")
async def get_field_types():
    """Get available field types for Perplexity research"""
    return FIELD_TYPES


@router.post("/upload", response_model=CSVUploadResponse)
async def upload_csv(
    csv_file: UploadFile = File(...),
    has_header: str = Form("no"),
    research_type: str = Form("perplexity")
):
    """Upload and parse CSV file for research"""
    if not csv_file.filename or not csv_file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    try:
        content = await csv_file.read()
        decoded = content.decode("utf-8-sig")
        csv_reader = csv.reader(io.StringIO(decoded), delimiter=",", quotechar='"')
        rows = list(csv_reader)

        if not rows:
            raise HTTPException(status_code=400, detail="CSV file is empty")

        # Generate session ID
        session_id = str(uuid.uuid4())

        # Store CSV data
        if has_header == "yes":
            csv_storage[session_id] = rows[1:]
            total_rows = len(rows) - 1
        else:
            csv_storage[session_id] = rows
            total_rows = len(rows)

        sample_data = csv_storage[session_id][:5]
        research_type_storage[session_id] = research_type

        logger.info(f"Uploaded CSV with {total_rows} rows for session {session_id}")

        return CSVUploadResponse(
            total_rows=total_rows,
            sample_data=sample_data,
            has_header=has_header == "yes"
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing CSV: {str(e)}")


@router.post("/type", response_model=SetResearchTypeResponse)
async def set_research_type(request: SetResearchTypeRequest):
    """Set research type for session"""
    session_id = str(uuid.uuid4())
    research_type_storage[session_id] = request.research_type.value

    return SetResearchTypeResponse(
        success=True,
        research_type=request.research_type.value
    )


@router.post("/run", response_model=ResearchResult)
async def run_research(request: RunResearchRequest, background_tasks: BackgroundTasks):
    """Run research for all rows in CSV"""
    logger.info("=" * 80)
    logger.info("Starting research run")

    research_type = request.research_type.value

    # Validate request
    if research_type == "perplexity" and not request.fields:
        raise HTTPException(status_code=400, detail="At least one output field is required")

    if not request.csv_data:
        raise HTTPException(status_code=400, detail="No CSV data provided")

    # Generate session ID
    session_id = str(uuid.uuid4())

    # Initialize progress tracking
    total_items = len(request.csv_data)
    progress_tracker[session_id] = {
        "total": total_items,
        "completed": 0,
        "batches_total": 0,
        "batches_completed": 0
    }
    results_storage[session_id] = []
    stop_flags[session_id] = False

    # Process based on research type
    cache_service = get_cache_service()

    try:
        all_results = []

        if research_type == "perplexity":
            # Process with Perplexity (parallel within batches)
            fields_config = [f.model_dump() for f in (request.fields or [])]
            entity_names = [row[0] if row else "" for row in request.csv_data]
            entity_names = [n for n in entity_names if n]

            # Process in batches of 10 with 3 concurrent batches
            batch_size = 10
            batches = [entity_names[i:i+batch_size] for i in range(0, len(entity_names), batch_size)]
            progress_tracker[session_id]["batches_total"] = len(batches)

            for batch_num, batch in enumerate(batches, 1):
                if stop_flags.get(session_id):
                    break

                # Process batch items concurrently
                tasks = [
                    process_entity_perplexity(
                        settings.perplexity_api_key,
                        entity,
                        fields_config
                    )
                    for entity in batch
                ]
                batch_results = await asyncio.gather(*tasks)

                for result in batch_results:
                    if result:
                        all_results.append(result)
                        results_storage[session_id].append(result)
                        progress_tracker[session_id]["completed"] += 1

                progress_tracker[session_id]["batches_completed"] = batch_num

        # Save results to CSV
        if all_results:
            RESULTS_DIR.mkdir(parents=True, exist_ok=True)
            filename = f"research_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            file_path = RESULTS_DIR / filename

            async with aiofiles.open(file_path, "w", newline="", encoding="utf-8") as f:
                if all_results:
                    fieldnames = list(all_results[0].keys())
                    output = io.StringIO()
                    writer = csv.DictWriter(output, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(all_results)
                    await f.write(output.getvalue())

            # Log run to history
            await log_run(
                research_type=research_type,
                total_records=total_items,
                results_count=len(all_results),
                status="completed" if not stop_flags.get(session_id) else "partial",
                filename=filename
            )

            return ResearchResult(
                success=True,
                total_processed=len(all_results),
                file_path=str(file_path),
                results=all_results
            )

        return ResearchResult(
            success=True,
            total_processed=0,
            file_path="",
            results=[]
        )

    except Exception as e:
        logger.error(f"Research error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Cleanup
        if session_id in progress_tracker:
            del progress_tracker[session_id]
        if session_id in stop_flags:
            del stop_flags[session_id]


@router.get("/progress", response_model=ResearchProgress)
async def get_progress(session_id: str = ""):
    """Get current research progress"""
    # Find any active session
    for sid, progress in progress_tracker.items():
        return ResearchProgress(**progress)

    return ResearchProgress(total=0, completed=0, batches_total=0, batches_completed=0)


@router.get("/results", response_model=ResultsStreamResponse)
async def get_results(session_id: str = "", offset: int = 0):
    """Get results stream"""
    for sid, results in results_storage.items():
        return ResultsStreamResponse(
            results=results[offset:],
            total=len(results)
        )

    return ResultsStreamResponse(results=[], total=0)


@router.post("/stop", response_model=StopResearchResponse)
async def stop_research():
    """Stop ongoing research"""
    for session_id in stop_flags:
        stop_flags[session_id] = True
        logger.info(f"Stop requested for session {session_id}")
        return StopResearchResponse(success=True, message="Stop requested")

    return StopResearchResponse(success=False, message="No active research session")


@router.get("/download/{filename}")
async def download_results(filename: str):
    """Download research results file"""
    file_path = RESULTS_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        media_type="text/csv",
        filename=filename
    )


@router.get("/history", response_model=HistoryResponse)
async def get_history():
    """Get run history and cache statistics"""
    cache_service = get_cache_service()

    # Load runs history
    runs = await load_runs_history()

    return HistoryResponse(
        runs=[RunHistoryEntry(**run) for run in runs],
        cache_stats=CacheStats(
            gcs_enabled=cache_service.gcs_enabled,
            bucket=cache_service.bucket_name
        )
    )


@router.delete("/runs", response_model=DeleteRunsResponse)
async def delete_runs(request: DeleteRunsRequest):
    """Delete selected runs from history"""
    if not request.ids:
        raise HTTPException(status_code=400, detail="No IDs provided")

    runs = await load_runs_history()
    original_count = len(runs)

    ids_to_delete = set(request.ids)
    runs = [run for run in runs if run.get("id") not in ids_to_delete]

    deleted_count = original_count - len(runs)
    await save_runs_history(runs)

    logger.info(f"Deleted {deleted_count} runs from history")

    return DeleteRunsResponse(success=True, deleted_count=deleted_count)


# Helper functions for runs history

async def load_runs_history() -> list[dict]:
    """Load runs history from cache"""
    cache_service = get_cache_service()
    history = await cache_service.load_full_cache("runs_history")
    return history.get("runs", [])


async def save_runs_history(runs: list[dict]) -> None:
    """Save runs history to cache"""
    cache_service = get_cache_service()
    await cache_service.save_full_cache("runs_history", {"runs": runs})


async def log_run(
    research_type: str,
    total_records: int,
    results_count: int,
    status: str,
    filename: str = None
) -> None:
    """Log a research run to history"""
    runs = await load_runs_history()

    run_entry = {
        "id": hashlib.md5(f"{datetime.now().isoformat()}{research_type}".encode()).hexdigest()[:8],
        "timestamp": datetime.now().isoformat(),
        "research_type": research_type,
        "total_records": total_records,
        "results_count": results_count,
        "status": status,
        "filename": filename
    }

    runs.insert(0, run_entry)
    runs = runs[:100]  # Keep only last 100 runs

    await save_runs_history(runs)
    logger.info(f"Logged run: {research_type} - {results_count}/{total_records} records")
