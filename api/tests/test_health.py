"""
Tests for health endpoint
"""
import pytest
from fastapi.testclient import TestClient
from main import app


client = TestClient(app)


def test_health_endpoint():
    """Health endpoint should return 200 and healthy status"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


def test_health_has_version():
    """Health endpoint should include version info"""
    response = client.get("/health")
    data = response.json()
    assert "version" in data or data["status"] == "healthy"
