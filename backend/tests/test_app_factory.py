import pytest
from app import create_app


def test_app_factory_development():
    """Verify application factory creates Flask app in development mode."""
    app = create_app("development")
    assert app.config["DEBUG"] is True
    assert app.config["TESTING"] is False
    assert "health" in app.blueprints


def test_app_factory_testing():
    """Verify application factory creates Flask app in testing mode."""
    app = create_app("testing")
    assert app.config["TESTING"] is True
    assert app.config["MONGODB_URI"] == ""


def test_app_factory_production():
    """Verify application factory creates Flask app in production mode."""
    app = create_app("production")
    assert app.config["DEBUG"] is False
    assert app.config["TESTING"] is False
