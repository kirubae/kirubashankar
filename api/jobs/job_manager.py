"""
Job Manager - Thread-safe in-memory job tracking
Handles background jobs for merge operations and research tasks
"""

import asyncio
import logging
from datetime import datetime
from threading import Lock
from typing import Any, Optional

logger = logging.getLogger(__name__)


class JobManager:
    """Thread-safe job tracking for background operations"""

    def __init__(self):
        self._jobs: dict[str, dict[str, Any]] = {}
        self._tasks: dict[str, asyncio.Task] = {}  # For async research tasks
        self._lock = Lock()

    def create_job(self, job_id: str, job_type: str = "merge") -> None:
        """Create a new job with initial status"""
        with self._lock:
            self._jobs[job_id] = {
                "status": "processing",
                "progress": 0,
                "message": "Starting...",
                "created": datetime.now().isoformat(),
                "type": job_type
            }
        logger.info(f"Created job: {job_id} ({job_type})")

    def update_job(self, job_id: str, **kwargs) -> None:
        """Update job status (thread-safe)"""
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].update(kwargs)

    def get_job(self, job_id: str) -> Optional[dict[str, Any]]:
        """Get job status"""
        with self._lock:
            return self._jobs.get(job_id)

    def job_exists(self, job_id: str) -> bool:
        """Check if job exists"""
        with self._lock:
            return job_id in self._jobs

    def delete_job(self, job_id: str) -> None:
        """Delete a job from tracking"""
        with self._lock:
            if job_id in self._jobs:
                del self._jobs[job_id]
        # Also cancel task if exists
        self.cancel_task(job_id)

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
        with self._lock:
            return dict(self._jobs)


# Singleton instance
job_manager = JobManager()
