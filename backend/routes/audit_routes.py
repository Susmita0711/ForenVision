"""
Security Audit Trail API Routes for ForenVision AI.
Provides endpoints for authorized administrators to inspect immutable security,
access control, authentication, and forensic chain audit records.
Protected by audit.read permission.
"""

from __future__ import annotations

from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import permission_required
from services.audit_service import audit_service
from services.permission_service import permission_service, PERM_AUDIT_READ

audit_bp = Blueprint("audit_routes", __name__)


@audit_bp.route("/logs", methods=["GET"])
@permission_required(PERM_AUDIT_READ)
def get_audit_logs():
    """
    Retrieve paginated immutable security audit records.
    Restricted to Administrator clearance (audit.read).
    Supports filtering by targetType, action, actor query, and pagination.
    """
    target_type = request.args.get("targetType")
    action = request.args.get("action")
    actor_query = request.args.get("q") or request.args.get("actor")

    try:
        page = int(request.args.get("page", 1))
    except ValueError:
        page = 1

    try:
        limit = int(request.args.get("limit", 50))
    except ValueError:
        limit = 50

    result = audit_service.list_audit_logs(
        target_type=target_type,
        action=action,
        actor_query=actor_query,
        limit=limit,
        page=page,
    )

    return jsonify({
        "success": True,
        "total": result["total"],
        "page": result["page"],
        "limit": result["limit"],
        "logs": result["logs"],
    }), 200


@audit_bp.route("/matrix", methods=["GET"])
@permission_required(PERM_AUDIT_READ)
def get_permission_matrix():
    """
    Retrieve formal role-to-permission mapping matrix for security compliance audit.
    """
    matrix = permission_service.get_permission_matrix()
    return jsonify({
        "success": True,
        "matrix": matrix,
    }), 200
