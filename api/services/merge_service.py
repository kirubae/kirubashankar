"""
Merge Service - Pandas merge operations for data merge tool
"""

import logging
import pandas as pd
import asyncio
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from jobs.job_manager import job_manager
from services.file_service import read_file_to_df, find_file_path

logger = logging.getLogger(__name__)

# Thread pool for CPU-bound pandas operations
_executor = ThreadPoolExecutor(max_workers=2)


def get_unique_values(df: pd.DataFrame, column: str, limit: int = 50000) -> set:
    """Get unique values for a column (for match preview)"""
    values = df[column].dropna().astype(str).str.strip().str.lower().unique()
    return set(values[:limit])


async def preview_match(
    df_a: pd.DataFrame,
    df_b: pd.DataFrame,
    key_a: str,
    key_b: str
) -> dict:
    """Preview match count between two columns"""
    def _calculate():
        values_a = get_unique_values(df_a, key_a)
        values_b = get_unique_values(df_b, key_b)
        matches = values_a.intersection(values_b)

        return {
            "success": True,
            "uniqueA": len(values_a),
            "uniqueB": len(values_b),
            "matchCount": len(matches),
            "matchPercent": round(len(matches) / len(values_a) * 100, 1) if values_a else 0
        }

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _calculate)


def _run_merge_sync(
    job_id: str,
    file_a_path: Path,
    file_b_path: Path,
    join_type: str,
    left_key: str,
    right_key: str,
    selected_columns: Optional[list[str]],
    results_dir: Path
) -> None:
    """Run merge operation synchronously (for background thread)"""
    try:
        job_manager.update_job(job_id, progress=10, message="Loading files...")

        # Read files
        job_manager.update_job(job_id, progress=20, message="Reading File A...")
        df_a = pd.read_csv(file_a_path) if file_a_path.suffix == ".csv" else pd.read_excel(file_a_path)

        job_manager.update_job(job_id, progress=35, message="Reading File B...")
        df_b = pd.read_csv(file_b_path) if file_b_path.suffix == ".csv" else pd.read_excel(file_b_path)

        job_manager.update_job(job_id, progress=50, message="Merging datasets...")

        # Map join type
        how_map = {
            "left": "left",
            "right": "right",
            "inner": "inner",
            "outer": "outer"
        }
        how = how_map.get(join_type, "left")

        # Perform merge
        merged_df = pd.merge(
            df_a,
            df_b,
            how=how,
            left_on=left_key,
            right_on=right_key,
            suffixes=("", "_right"),
            indicator="_merge_status"
        )

        job_manager.update_job(job_id, progress=70, message="Calculating statistics...")

        # Calculate stats
        stats = {
            "leftRows": len(df_a),
            "rightRows": len(df_b),
            "outputRows": len(merged_df),
            "matched": len(merged_df[merged_df["_merge_status"] == "both"]),
            "leftOnly": len(merged_df[merged_df["_merge_status"] == "left_only"]),
            "rightOnly": len(merged_df[merged_df["_merge_status"] == "right_only"]),
            "joinType": join_type
        }

        job_manager.update_job(job_id, progress=80, message="Preparing output...")

        # Remove merge indicator
        output_df = merged_df.drop("_merge_status", axis=1)

        # Apply column selection
        if selected_columns:
            available = [c for c in selected_columns if c in output_df.columns]
            if available:
                output_df = output_df[available]

        # Save result
        import uuid
        result_id = str(uuid.uuid4())
        result_path = results_dir / f"{result_id}.csv"
        output_df.to_csv(result_path, index=False)

        job_manager.update_job(job_id, progress=90, message="Generating preview...")

        # Get preview
        preview = output_df.head(100).fillna("").astype(str).to_dict("records")

        job_manager.update_job(
            job_id,
            status="complete",
            progress=100,
            message="Merge complete",
            resultId=result_id,
            stats=stats,
            columns=list(output_df.columns),
            preview=preview
        )

        logger.info(f"Merge complete: {job_id}, {stats['outputRows']} rows")

    except Exception as e:
        logger.error(f"Merge error: {e}")
        job_manager.update_job(job_id, status="error", message=str(e))


async def run_merge_async(
    job_id: str,
    file_a_path: Path,
    file_b_path: Path,
    join_type: str,
    left_key: str,
    right_key: str,
    selected_columns: Optional[list[str]],
    results_dir: Path
) -> None:
    """Run merge operation in background"""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        _executor,
        _run_merge_sync,
        job_id,
        file_a_path,
        file_b_path,
        join_type,
        left_key,
        right_key,
        selected_columns,
        results_dir
    )


def _read_file_from_r2(r2_service, key: str) -> pd.DataFrame:
    """Download and read a file from R2"""
    from io import BytesIO

    data = r2_service.download_file(key)
    if not data:
        raise ValueError(f"File not found in R2: {key}")

    if key.endswith('.xlsx') or key.endswith('.xls'):
        return pd.read_excel(data)
    else:
        return pd.read_csv(data)


def _run_merge_r2_sync(
    job_id: str,
    primary_keys: list[str],
    secondary_keys: list[str],
    join_type: str,
    left_key: str,
    right_key: str,
    selected_columns: Optional[list[str]]
) -> None:
    """Run merge operation with files from R2"""
    from services.r2_service import get_r2_service
    from io import BytesIO
    import uuid

    try:
        r2 = get_r2_service()

        if not r2.is_available:
            job_manager.update_job(job_id, status="error", message="R2 storage not available")
            return

        job_manager.update_job(job_id, progress=10, message="Downloading primary files from cloud...")

        # Download and concatenate primary files
        primary_dfs = []
        for i, key in enumerate(primary_keys):
            job_manager.update_job(
                job_id,
                progress=10 + (i * 15 // len(primary_keys)),
                message=f"Reading primary file {i+1}/{len(primary_keys)}..."
            )
            df = _read_file_from_r2(r2, key)
            primary_dfs.append(df)
            logger.info(f"Loaded primary file: {key} ({len(df)} rows)")

        df_a = pd.concat(primary_dfs, ignore_index=True) if len(primary_dfs) > 1 else primary_dfs[0]
        logger.info(f"Combined primary files: {len(df_a)} total rows")

        job_manager.update_job(job_id, progress=30, message="Downloading secondary files from cloud...")

        # Download and concatenate secondary files
        secondary_dfs = []
        for i, key in enumerate(secondary_keys):
            job_manager.update_job(
                job_id,
                progress=30 + (i * 15 // len(secondary_keys)),
                message=f"Reading secondary file {i+1}/{len(secondary_keys)}..."
            )
            df = _read_file_from_r2(r2, key)
            secondary_dfs.append(df)
            logger.info(f"Loaded secondary file: {key} ({len(df)} rows)")

        df_b = pd.concat(secondary_dfs, ignore_index=True) if len(secondary_dfs) > 1 else secondary_dfs[0]
        logger.info(f"Combined secondary files: {len(df_b)} total rows")

        job_manager.update_job(job_id, progress=50, message="Merging datasets...")

        # Map join type
        how_map = {"left": "left", "right": "right", "inner": "inner", "outer": "outer"}
        how = how_map.get(join_type, "left")

        # Perform merge
        merged_df = pd.merge(
            df_a,
            df_b,
            how=how,
            left_on=left_key,
            right_on=right_key,
            suffixes=("", "_right"),
            indicator="_merge_status"
        )

        job_manager.update_job(job_id, progress=70, message="Calculating statistics...")

        # Calculate stats
        stats = {
            "leftRows": len(df_a),
            "rightRows": len(df_b),
            "outputRows": len(merged_df),
            "matched": len(merged_df[merged_df["_merge_status"] == "both"]),
            "leftOnly": len(merged_df[merged_df["_merge_status"] == "left_only"]),
            "rightOnly": len(merged_df[merged_df["_merge_status"] == "right_only"]),
            "joinType": join_type
        }

        job_manager.update_job(job_id, progress=80, message="Preparing output...")

        # Remove merge indicator
        output_df = merged_df.drop("_merge_status", axis=1)

        # Apply column selection
        if selected_columns:
            available = [c for c in selected_columns if c in output_df.columns]
            if available:
                output_df = output_df[available]

        # Save result to R2
        result_id = str(uuid.uuid4())
        result_key = f"results/{result_id}.csv"

        job_manager.update_job(job_id, progress=85, message="Uploading result to cloud...")

        csv_buffer = BytesIO()
        output_df.to_csv(csv_buffer, index=False)
        csv_buffer.seek(0)

        if not r2.upload_file(result_key, csv_buffer, content_type="text/csv"):
            raise ValueError("Failed to upload result to R2")

        job_manager.update_job(job_id, progress=90, message="Generating preview...")

        # Get preview
        preview = output_df.head(100).fillna("").astype(str).to_dict("records")

        job_manager.update_job(
            job_id,
            status="complete",
            progress=100,
            message="Merge complete",
            resultId=result_key,  # R2 key instead of local file ID
            stats=stats,
            columns=list(output_df.columns),
            preview=preview
        )

        logger.info(f"R2 Merge complete: {job_id}, {stats['outputRows']} rows -> {result_key}")

    except Exception as e:
        logger.error(f"R2 Merge error: {e}", exc_info=True)
        job_manager.update_job(job_id, status="error", message=str(e))


async def run_merge_r2_async(
    job_id: str,
    primary_keys: list[str],
    secondary_keys: list[str],
    join_type: str,
    left_key: str,
    right_key: str,
    selected_columns: Optional[list[str]]
) -> None:
    """Run R2-based merge operation in background"""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        _executor,
        _run_merge_r2_sync,
        job_id,
        primary_keys,
        secondary_keys,
        join_type,
        left_key,
        right_key,
        selected_columns
    )
