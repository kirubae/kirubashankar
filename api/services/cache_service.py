"""
Cache Service - Local + GCS caching for API results
"""

import json
import hashlib
import logging
import aiofiles
from pathlib import Path
from datetime import datetime, timedelta
from typing import Any, Optional
from cachetools import TTLCache

logger = logging.getLogger(__name__)

# Try to import GCS
try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False
    logger.warning("google-cloud-storage not installed, using local cache only")


class CacheService:
    """Two-tier cache: in-memory + local files + optional GCS"""

    def __init__(
        self,
        cache_dir: Path,
        gcs_bucket_name: str,
        cache_expiry_days: int = 30
    ):
        self.cache_dir = cache_dir
        self.cache_expiry_days = cache_expiry_days

        # In-memory cache (1000 items, 5 min TTL)
        self._memory_cache: TTLCache = TTLCache(maxsize=1000, ttl=300)

        # GCS setup
        self._gcs_available = False
        self._gcs_bucket = None
        self._gcs_bucket_name = gcs_bucket_name

        if GCS_AVAILABLE:
            try:
                client = storage.Client()
                self._gcs_bucket = client.bucket(gcs_bucket_name)
                self._gcs_available = True
                logger.info(f"GCS cache initialized with bucket: {gcs_bucket_name}")
            except Exception as e:
                logger.warning(f"Failed to initialize GCS client: {e}")

    def _cache_key(self, identifier: str) -> str:
        """Generate cache key from identifier"""
        return hashlib.md5(identifier.lower().strip().encode()).hexdigest()

    def _is_expired(self, timestamp: Optional[str]) -> bool:
        """Check if cached entry is expired"""
        if not timestamp:
            return True
        try:
            cached_time = datetime.fromisoformat(timestamp)
            expiry_time = datetime.now() - timedelta(days=self.cache_expiry_days)
            return cached_time < expiry_time
        except Exception:
            return True

    async def get(self, cache_name: str, identifier: str) -> Optional[Any]:
        """Get data from cache"""
        key = self._cache_key(identifier)
        memory_key = f"{cache_name}:{key}"

        # Check memory cache
        if memory_key in self._memory_cache:
            return self._memory_cache[memory_key]

        # Check local file
        local_path = self.cache_dir / f"{cache_name}.json"
        if local_path.exists():
            try:
                async with aiofiles.open(local_path, "r", encoding="utf-8") as f:
                    content = await f.read()
                    cache_data = json.loads(content)
                    if key in cache_data:
                        entry = cache_data[key]
                        if not self._is_expired(entry.get("timestamp")):
                            self._memory_cache[memory_key] = entry["data"]
                            logger.info(f"Cache hit for {identifier}")
                            return entry["data"]
            except Exception as e:
                logger.warning(f"Failed to read local cache: {e}")

        # Check GCS
        if self._gcs_available and self._gcs_bucket:
            try:
                blob = self._gcs_bucket.blob(cache_name + ".json")
                if blob.exists():
                    content = blob.download_as_string()
                    cache_data = json.loads(content)
                    if key in cache_data:
                        entry = cache_data[key]
                        if not self._is_expired(entry.get("timestamp")):
                            self._memory_cache[memory_key] = entry["data"]
                            logger.info(f"GCS cache hit for {identifier}")
                            return entry["data"]
            except Exception as e:
                logger.warning(f"Failed to read GCS cache: {e}")

        return None

    async def set(self, cache_name: str, identifier: str, data: Any) -> None:
        """Save data to cache"""
        key = self._cache_key(identifier)
        memory_key = f"{cache_name}:{key}"

        entry = {
            "identifier": identifier,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }

        # Update memory cache
        self._memory_cache[memory_key] = data

        # Update local file
        local_path = self.cache_dir / f"{cache_name}.json"
        cache_data = {}

        if local_path.exists():
            try:
                async with aiofiles.open(local_path, "r", encoding="utf-8") as f:
                    content = await f.read()
                    cache_data = json.loads(content)
            except Exception:
                pass

        cache_data[key] = entry

        try:
            async with aiofiles.open(local_path, "w", encoding="utf-8") as f:
                await f.write(json.dumps(cache_data, ensure_ascii=False, indent=2))
        except Exception as e:
            logger.error(f"Failed to write local cache: {e}")

        # Update GCS (fire-and-forget)
        if self._gcs_available and self._gcs_bucket:
            try:
                blob = self._gcs_bucket.blob(cache_name + ".json")
                blob.upload_from_string(
                    json.dumps(cache_data, ensure_ascii=False, indent=2),
                    content_type="application/json"
                )
            except Exception as e:
                logger.error(f"Failed to write GCS cache: {e}")

        logger.info(f"Cached data for {identifier}")

    async def load_full_cache(self, cache_name: str) -> dict:
        """Load entire cache file"""
        # Try GCS first
        if self._gcs_available and self._gcs_bucket:
            try:
                blob = self._gcs_bucket.blob(cache_name + ".json")
                if blob.exists():
                    content = blob.download_as_string()
                    return json.loads(content)
            except Exception:
                pass

        # Fallback to local
        local_path = self.cache_dir / f"{cache_name}.json"
        if local_path.exists():
            try:
                async with aiofiles.open(local_path, "r", encoding="utf-8") as f:
                    content = await f.read()
                    return json.loads(content)
            except Exception:
                pass

        return {}

    async def save_full_cache(self, cache_name: str, data: dict) -> None:
        """Save entire cache file"""
        local_path = self.cache_dir / f"{cache_name}.json"

        try:
            async with aiofiles.open(local_path, "w", encoding="utf-8") as f:
                await f.write(json.dumps(data, ensure_ascii=False, indent=2))
        except Exception as e:
            logger.error(f"Failed to write local cache: {e}")

        if self._gcs_available and self._gcs_bucket:
            try:
                blob = self._gcs_bucket.blob(cache_name + ".json")
                blob.upload_from_string(
                    json.dumps(data, ensure_ascii=False, indent=2),
                    content_type="application/json"
                )
            except Exception as e:
                logger.error(f"Failed to write GCS cache: {e}")

    @property
    def gcs_enabled(self) -> bool:
        """Check if GCS is available"""
        return self._gcs_available

    @property
    def bucket_name(self) -> Optional[str]:
        """Get GCS bucket name if available"""
        return self._gcs_bucket_name if self._gcs_available else None


# Will be initialized in main.py
cache_service: Optional[CacheService] = None


def get_cache_service() -> CacheService:
    """Get the cache service instance"""
    global cache_service
    if cache_service is None:
        from config import settings
        cache_service = CacheService(
            cache_dir=settings.cache_dir,
            gcs_bucket_name=settings.gcs_cache_bucket,
            cache_expiry_days=settings.cache_expiry_days
        )
    return cache_service
