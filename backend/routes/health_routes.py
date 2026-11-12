from datetime import datetime, timezone
from flask import Blueprint, jsonify, current_app
from services.db import db_service

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health_check():
    """
    General system health check endpoint.
    Reports operational status of the Flask backend and summary of database status.
    """
    db_status = db_service.get_status()

    # If DB is connected -> healthy; if unconfigured -> healthy (bootstrap ready); if disconnected -> degraded
    overall_status = "healthy"
    if db_status["status"] == "disconnected":
        overall_status = "degraded"

    return jsonify({
        "status": overall_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "app": "ForenVision AI Backend",
        "version": "1.0.0",
        "database": db_status,
        "environment": current_app.config.get("ENV_NAME", "development"),
    }), 200


@health_bp.route("/database-health", methods=["GET"])
@health_bp.route("/health/db", methods=["GET"])
def database_health_check():
    """
    Detailed database health and connectivity inspection endpoint.
    Verifies PyMongo client status, latency, and index registration without exposing credentials.
    """
    ping_result = db_service.ping()
    db_status = db_service.get_status()

    status_code = 200
    if db_status["status"] == "disconnected":
        status_code = 503

    return jsonify({
        "success": db_status["status"] != "disconnected",
        "status": db_status["status"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": db_status,
        "ping": ping_result,
        "environment": current_app.config.get("ENV_NAME", "development"),
    }), status_code
