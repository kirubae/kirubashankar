"""
Job Manager - File-based job tracking for multi-worker support
Stores job state in /tmp so all workers can access it
"""

import json
import logging
import os
import asyncio
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Directory for job state files
JOBS_DIR = Path("/tmp/jobs")


class JobManager:
    """File-based job tracking that works across multiple workers"""

    def __init__(self):
        self._tasks: dict[str, asyncio.Task] = {}  # For async research tasks
        self._lock = Lock()
        # Ensure jobs directory exists
        JOBS_DIR.mkdir(parents=True, exist_ok=True)

    def _job_file(self, job_id: str) -> Path:
        """Get path to job file"""
        return JOBS_DIR / f"{job_id}.json"

    def create_job(self, job_id: str, job_type: str = "merge") -> None:
        """Create a new job with initial status"""
        job_data = {
            "status": "processing",
            "progress": 0,
            "message": "Starting...",
            "created": datetime.now().isoformat(),
            "type": job_type
        }
        self._write_job(job_id, job_data)
        logger.info(f"Created job: {job_id} ({job_type})")

    def update_job(self, job_id: str, **kwargs) -> None:
        """Update job status"""
        job = self._read_job(job_id)
        if job:
            job.update(kwargs)
            self._write_job(job_id, job)

    def get_job(self, job_id: str) -> Optional[dict[str, Any]]:
        """Get job status"""
        return self._read_job(job_id)

    def job_exists(self, job_id: str) -> bool:
        """Check if job exists"""
        return self._job_file(job_id).exists()

    def delete_job(self, job_id: str) -> None:
        """Delete a job from tracking"""
        try:
            self._job_file(job_id).unlink(missing_ok=True)
        except Exception as e:
            logger.error(f"Failed to delete job {job_id}: {e}")
        # Also cancel task if exists
        self.cancel_task(job_id)

    def _read_job(self, job_id: str) -> Optional[dict[str, Any]]:
        """Read job data from file"""
        job_file = self._job_file(job_id)
        try:
            if job_file.exists():
                with open(job_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Failed to read job {job_id}: {e}")
        return None

    def _write_job(self, job_id: str, data: dict) -> None:
        """Write job data to file"""
        job_file = self._job_file(job_id)
        try:
            with open(job_file, 'w') as f:
                json.dump(data, f)
        except Exception as e:
            logger.error(f"Failed to write job {job_id}: {e}")

    def register_task(self, job_id: str, task: asyncio.Task) -> None:
        """Register an async task for a job (for cancellation support)"""
        self._tasks[job_id] = task

    def cancel_task(self, job_id: str) -> bool:
        """Cancel an async task if running"""
        task = self._tasks.get(job_id)
        if task and not task.done():
            task.cancel()
            logger.info(f"Cancelled task for job: {job_id}")
            return True
        return False

    def get_all_jobs(self) -> dict[str, dict[str, Any]]:
        """Get all jobs (for debugging)"""
        jobs = {}
        try:
            for f in JOBS_DIR.glob("*.json"):
                job_id = f.stem
                job = self._read_job(job_id)
                if job:
                    jobs[job_id] = job
        except Exception as e:
            logger.error(f"Failed to list jobs: {e}")
        return jobs


# Singleton instance
job_manager = JobManager()
