import pytest
import sys
from pathlib import Path

# Add backend directory to sys.path so tests can import modules
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app
from services.db import db_service


@pytest.fixture
def app():
    """Create and configure application for testing."""
    application = create_app("testing")
    yield application
    # Teardown
    db_service.close()


@pytest.fixture
def client(app):
    """Test client for HTTP requests."""
    return app.test_client()
