"""
Tests for data merge API endpoints
"""
import pytest
from fastapi.testclient import TestClient
from main import app
from unittest.mock import patch, MagicMock


client = TestClient(app)


class TestUploadUrl:
    """Tests for /api/merge/r2/upload-url endpoint"""

    @patch('routers.data_merge.get_r2_service')
    def test_get_upload_url_success(self, mock_r2):
        """Should return presigned URL when R2 is available"""
        mock_service = MagicMock()
        mock_service.is_available = True
        mock_service.generate_presigned_upload_url.return_value = "https://r2.example.com/upload"
        mock_r2.return_value = mock_service

        response = client.post("/api/merge/r2/upload-url?filename=test.csv")

        assert response.status_code == 200
        data = response.json()
        assert "uploadUrl" in data
        assert "key" in data
        assert "expiresIn" in data

    @patch('routers.data_merge.get_r2_service')
    def test_get_upload_url_r2_unavailable(self, mock_r2):
        """Should return 503 when R2 is not available"""
        mock_service = MagicMock()
        mock_service.is_available = False
        mock_r2.return_value = mock_service

        response = client.post("/api/merge/r2/upload-url?filename=test.csv")

        assert response.status_code == 503


class TestJobStatus:
    """Tests for /api/merge/jobs/{job_id} endpoint"""

    @patch('routers.data_merge.job_manager')
    def test_get_job_status_not_found(self, mock_manager):
        """Should return 404 for non-existent job"""
        mock_manager.get_job.return_value = None

        response = client.get("/api/merge/jobs/nonexistent-id")

        assert response.status_code == 404

    @patch('routers.data_merge.job_manager')
    def test_get_job_status_success(self, mock_manager):
        """Should return job status when job exists"""
        mock_manager.get_job.return_value = {
            "status": "completed",
            "result_id": "result-123",
            "row_count": 100
        }

        response = client.get("/api/merge/jobs/existing-id")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"


class TestPreviewEndpoint:
    """Tests for preview functionality"""

    def test_preview_requires_keys(self):
        """Preview endpoint should require file keys"""
        response = client.post(
            "/api/merge/r2/preview",
            json={"keys": []}
        )
        # Empty keys should fail validation or return error
        assert response.status_code in [400, 422, 503]
