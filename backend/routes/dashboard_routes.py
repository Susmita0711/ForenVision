"""
Dashboard Routes Blueprint for ForenVision AI.
Exposes database-backed telemetry, recent cases, and real activity feeds.
Never returns fabricated statistics.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, g
from middleware.auth_middleware import jwt_required
from services.case_service import case_service

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/summary", methods=["GET"])
@dashboard_bp.route("/stats", methods=["GET"])
@jwt_required
def get_dashboard_summary():
    """
    Retrieve real-time telemetry calculated from authentic database records:
    - Case totals (total, active, closed, under review)
    - Case status breakdown
    - Recent authorized cases
    - Real activity logs (if source exists)
    - Real evidence statistics (if evidence exists)
    - Real pending analysis queue count (if analysis system exists)
    """
    current_user = getattr(g, "current_user", {})
    summary = case_service.get_dashboard_summary(current_user)

    return jsonify({
        "success": True,
        "data": summary,
    }), 200
