"""
FastAPI Application - Centralized API for kirubashankar.com tools
Combines data-merge and deep-search backends into a single service
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import health, data_merge, deep_search
from services.file_service import cleanup_old_files

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("Starting API server...")

    # Ensure storage directories exist
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.results_dir.mkdir(parents=True, exist_ok=True)
    settings.cache_dir.mkdir(parents=True, exist_ok=True)

    # Run cleanup on startup
    await cleanup_old_files(settings.upload_dir, settings.file_cleanup_hours)
    await cleanup_old_files(settings.results_dir, settings.file_cleanup_hours)

    logger.info(f"Storage directories initialized")
    logger.info(f"CORS origins: {settings.cors_origins_list}")
    logger.info(f"Perplexity API Key: {'Set' if settings.perplexity_api_key else 'MISSING'}")
    logger.info(f"Apollo API Key: {'Set' if settings.apollo_api_key else 'MISSING'}")
    logger.info(f"SalesQL API Key: {'Set' if settings.salesql_api_key else 'MISSING'}")

    yield

    # Shutdown
    logger.info("Shutting down API server...")


# Create FastAPI app
app = FastAPI(
    title="Kirubashankar API",
    description="Centralized API for data-merge and deep-search tools",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(data_merge.router, prefix="/api/merge", tags=["Data Merge"])
app.include_router(deep_search.router, prefix="/api/research", tags=["Deep Search"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.debug
    )
