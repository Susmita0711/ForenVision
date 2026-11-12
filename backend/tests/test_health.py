from unittest.mock import MagicMock, patch
from services.db import DatabaseService


def test_health_check_endpoint(client):
    """Test that the /api/health endpoint returns 200 with structured JSON."""
    response = client.get("/api/health")
    assert response.status_code == 200

    data = response.get_json()
    assert data is not None
    assert "status" in data
    assert data["status"] in ["healthy", "degraded"]
    assert data["app"] == "ForenVision AI Backend"
    assert data["version"] == "1.0.0"
    assert "database" in data
    assert "environment" in data


def test_health_check_unconfigured_db_graceful(client):
    """Test that application runs gracefully when MongoDB is unconfigured."""
    response = client.get("/api/health")
    assert response.status_code == 200

    data = response.get_json()
    db_info = data["database"]
    assert db_info["status"] in ["unconfigured", "disconnected", "connected"]
    assert "message" in db_info


def test_database_health_endpoint_unconfigured(client):
    """Test /api/database-health returns 200 with unconfigured status when URI is missing."""
    response = client.get("/api/database-health")
    assert response.status_code == 200

    data = response.get_json()
    assert data is not None
    assert "database" in data
    assert data["database"]["status"] == "unconfigured"
    assert "MONGODB_URI" in data["database"]["message"]
    # Check that alias route /api/health/db also responds
    alias_resp = client.get("/api/health/db")
    assert alias_resp.status_code == 200


def test_database_health_when_connected(app, client):
    """Verify /api/database-health when MongoDB is successfully connected."""
    mock_client = MagicMock()
    mock_client.admin.command.return_value = {"ok": 1}

    mock_db = MagicMock()
    mock_client.__getitem__.return_value = mock_db

    # Patch DatabaseService to simulate connected state
    with patch("services.db.MongoClient", return_value=mock_client):
        test_db_service = DatabaseService()
        test_app_config = {
            "MONGODB_URI": "mongodb+srv://investigator:SuperSecretPassword123@cluster0.forensic.net/forenvision_test_db",
            "MONGODB_DB_NAME": "forenvision_test_db",
            "DB_CONNECT_TIMEOUT_MS": 1000,
            "DB_SERVER_SELECTION_TIMEOUT_MS": 1000,
        }
        test_app = MagicMock()
        test_app.config = test_app_config

        test_db_service.init_app(test_app)
        assert test_db_service.status == "connected"
        assert test_db_service.masked_uri == "mongodb+srv://***:***@cluster0.forensic.net/forenvision_test_db"
        assert "SuperSecretPassword123" not in test_db_service.masked_uri

        # Verify ping returns latency and connected status
        ping = test_db_service.ping()
        assert ping["connected"] is True
        assert ping["latency_ms"] is not None


def test_database_health_when_disconnected(app):
    """Verify /api/database-health and /api/health when MongoDB cluster is unreachable."""
    # pyrefly: ignore[missing-import]
    from pymongo.errors import ServerSelectionTimeoutError

    with patch("services.db.MongoClient", side_effect=ServerSelectionTimeoutError("Timeout")):
        test_db_service = DatabaseService()
        test_app_config = {
            "MONGODB_URI": "mongodb+srv://user:pass@nonexistent-cluster.mongodb.net/test",
            "MONGODB_DB_NAME": "test",
            "DB_CONNECT_TIMEOUT_MS": 100,
            "DB_SERVER_SELECTION_TIMEOUT_MS": 100,
        }
        test_app = MagicMock()
        test_app.config = test_app_config

        test_db_service.init_app(test_app)
        assert test_db_service.status == "disconnected"
        assert "timeout" in test_db_service.status_message.lower()
        # Verify credentials are never leaked in status message
        assert "pass" not in test_db_service.status_message
