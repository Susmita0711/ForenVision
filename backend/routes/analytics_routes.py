"""
Analytics & Operational Intelligence API Routes for ForenVision AI.
Provides database-backed aggregation endpoints for:
- Cases by status & cases created over time
- Evidence by media type & ingestion trajectory
- Analysis jobs by status & recorded compute processing times
- Official report generation activity
- Investigator caseload distribution (enforcing RBAC)
"""

from __future__ import annotations

import logging
from flask import Blueprint, jsonify, request, g

from middleware.auth_middleware import jwt_required
from services.analytics_service import analytics_service, METRIC_DEFINITIONS

analytics_bp = Blueprint("analytics_routes", __name__)
logger = logging.getLogger("forenvision.analytics")


@analytics_bp.route("", methods=["GET"])
@analytics_bp.route("/overview", methods=["GET"])
@jwt_required
def get_analytics_overview():
    """
    Retrieve comprehensive forensic analytics and operational metrics.
    Supports preset ranges ('7d', '30d', '90d', '1y', 'all') or custom ISO 'startDate' and 'endDate'.
    Enforces case-level clearance and investigator workload visibility boundaries.
    """
    current_user = getattr(g, "current_user", {})
    start_date = request.args.get("startDate")
    end_date = request.args.get("endDate")
    preset = request.args.get("range", "30d")

    try:
        data = analytics_service.get_overview_analytics(
            user=current_user,
            start_date=start_date,
            end_date=end_date,
            preset=preset,
        )
        return jsonify({
            "status": "success",
            "data": data,
        }), 200
    except ValueError as e:
        return jsonify({"status": "error", "message": f"Invalid date parameter: {str(e)}"}), 400
    except Exception as e:
        logger.error("Failed to compute analytics: %s", str(e), exc_info=True)
        return jsonify({"status": "error", "message": "Failed to aggregate forensic metrics."}), 500


@analytics_bp.route("/workload", methods=["GET"])
@jwt_required
def get_investigator_workload():
    """
    Retrieve caseload metrics per examiner.
    Admins / Supervisors receive agency-wide distribution; standard investigators
    receive their individual workload metrics without exposing peer caseloads.
    """
    current_user = getattr(g, "current_user", {})
    start_date = request.args.get("startDate")
    end_date = request.args.get("endDate")
    preset = request.args.get("range", "30d")

    try:
        start_dt, end_dt, _ = analytics_service.parse_date_range(start_date, end_date, preset)
        workload_data = analytics_service._aggregate_investigator_workload(current_user, start_dt, end_dt)
        return jsonify({
            "status": "success",
            "data": workload_data,
        }), 200
    except Exception as e:
        logger.error("Failed to aggregate investigator workload: %s", str(e), exc_info=True)
        return jsonify({"status": "error", "message": "Failed to aggregate workload."}), 500


@analytics_bp.route("/definitions", methods=["GET"])
@jwt_required
def get_metric_definitions():
    """
    Retrieve formal definitions for every metric and statutory legal disclaimers.
    """
    return jsonify({
        "status": "success",
        "data": {
            "definitions": METRIC_DEFINITIONS,
            "forensicAccuracyNotice": METRIC_DEFINITIONS["forensicAccuracyNotice"],
        },
    }), 200
