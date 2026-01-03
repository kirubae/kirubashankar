"""
Configuration settings for the FastAPI application
Uses Pydantic Settings for environment variable management
"""

from pydantic_settings import BaseSettings
from pathlib import Path
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Server
    port: int = 8080
    debug: bool = False

    # CORS
    cors_origins: str = "http://localhost:4321,https://kirubashankar.com"

    # File handling
    upload_dir: Path = Path("storage/uploads")
    results_dir: Path = Path("storage/results")
    cache_dir: Path = Path("storage/cache")
    max_upload_size_mb: int = 500
    file_cleanup_hours: int = 1

    # API Keys
    perplexity_api_key: str = ""
    apollo_api_key: str = ""
    salesql_api_key: str = ""

    # GCS Cache (optional)
    gcs_cache_bucket: str = "deep-search-cache-20251229"
    google_application_credentials: Optional[str] = None

    # Cache settings
    cache_expiry_days: int = 30

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string"""
        return [origin.strip() for origin in self.cors_origins.split(",")]


# Singleton instance
settings = Settings()
