"""
Pytest configuration and shared fixtures
"""
import pytest
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set test environment variables
os.environ.setdefault("CORS_ORIGINS", "http://localhost:4321")
os.environ.setdefault("PORT", "8080")
os.environ.setdefault("DEBUG", "false")


@pytest.fixture
def sample_csv_content():
    """Sample CSV content for testing"""
    return b"id,name,email\n1,John,john@example.com\n2,Jane,jane@example.com"


@pytest.fixture
def sample_job_data():
    """Sample job data for testing"""
    return {
        "status": "pending",
        "result_id": None,
        "error": None,
        "row_count": 0
    }
