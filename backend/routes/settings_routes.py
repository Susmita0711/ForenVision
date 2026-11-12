"""
Application Settings & Security Configuration API Routes for ForenVision AI.
Provides endpoints for retrieving and mutating forensic application settings.
Enforces settings.manage permission on updates (Administrator only).
"""

from __future__ import annotations

from typing import Any, Dict
from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import jwt_required, permission_required
from services.permission_service import PERM_SETTINGS_MANAGE
from services.audit_service import audit_service, ACTION_SETTINGS_UPDATED
from services.db import db_service

settings_bp = Blueprint("settings_routes", __name__)

# Default application settings
DEFAULT_SETTINGS: Dict[str, Any] = {
    "autoVerifyHashes": True,
    "highContrastOverlay": False,
    "maxUploadSizeMb": 25,
    "retentionPolicyDays": 365,
    "strictCustodyChain": True,
    "requireTwoExaminerSignoff": False,
    "auditTrailRetentionDays": 730,
    "sessionTimeoutMinutes": 30,
    "enforceStrictMfa": False,
}

_memory_settings: Dict[str, Any] = dict(DEFAULT_SETTINGS)


def get_current_settings() -> Dict[str, Any]:
    db = db_service.get_db()
    if db is not None:
        try:
            doc = db["app_settings"].find_one({"_id": "global_config"})
            if doc:
                res = dict(doc)
                res.pop("_id", None)
                return res
        except Exception:
            pass
    return dict(_memory_settings)


@settings_bp.route("", methods=["GET"])
@permission_required(PERM_SETTINGS_MANAGE)
def get_settings():
    """Retrieve current forensic application settings."""
    settings = get_current_settings()
    return jsonify({
        "success": True,
        "settings": settings,
    }), 200


@settings_bp.route("", methods=["PATCH", "PUT"])
@permission_required(PERM_SETTINGS_MANAGE)
def update_settings():
    """
    Update forensic application settings.
    Restricted to Administrator clearance (settings.manage).
    Records structured audit log.
    """
    current_user = getattr(g, "current_user", {})
    payload = request.get_json(silent=True) or {}

    allowed_keys = {
        "autoVerifyHashes",
        "highContrastOverlay",
        "maxUploadSizeMb",
        "retentionPolicyDays",
        "strictCustodyChain",
        "requireTwoExaminerSignoff",
        "auditTrailRetentionDays",
        "sessionTimeoutMinutes",
        "enforceStrictMfa",
    }

    clean_updates: Dict[str, Any] = {}
    for k, v in payload.items():
        if k in allowed_keys:
            clean_updates[k] = v

    if not clean_updates:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "No valid configurable setting keys provided in payload.",
        }), 400

    db = db_service.get_db()
    if db is not None:
        try:
            db["app_settings"].update_one(
                {"_id": "global_config"},
                {"$set": clean_updates},
                upsert=True,
            )
        except Exception:
            pass

    _memory_settings.update(clean_updates)

    audit_service.log_event(
        action=ACTION_SETTINGS_UPDATED,
        actor=current_user,
        target="global_config",
        target_type="settings",
        details=clean_updates,
        ip_address=request.remote_addr or "127.0.0.1",
    )

    return jsonify({
        "success": True,
        "message": "Application configuration settings updated successfully.",
        "settings": get_current_settings(),
    }), 200
