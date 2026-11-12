"""
Chain of Custody Routes Blueprint for ForenVision AI.
Provides authenticated REST endpoints for:
- Logging tamper-evident custody events (transfers, checkouts, returns, corrections)
- Querying chronological custody records with case clearance filtering
- Retrieving single custody event metadata
- Cryptographic hash-chain integrity verification
- Exporting custody history as court-ready CSV or JSON reports
- Strict prohibition of updating or deleting historic custody records
"""

from __future__ import annotations

import io
from flask import Blueprint, request, jsonify, g, send_file
from middleware.auth_middleware import jwt_required, permission_required
from services.custody_service import custody_service
from services.permission_service import (
    PERM_CUSTODY_CREATE,
    PERM_CUSTODY_READ,
)

custody_bp = Blueprint("custody", __name__)


@custody_bp.route("", methods=["POST"])
@permission_required(PERM_CUSTODY_CREATE)
def create_custody_event():
    """
    Record a new tamper-evident chain of custody event.
    Restricted to custody.create permission (Admin, Investigator).
    Expects JSON body:
    - evidenceId or evidenceNumber: Identifier of the target evidence artifact
    - eventType or action: 'transferred', 'checked_out', 'returned', 'sealed', 'correction', etc.
    - reason: Operational justification
    - location: Lab facility or vault location
    - recipient or newCustodian: Custodian receiving the artifact
    - previousCustodian: Custodian relinquishing the artifact
    - notes: Additional descriptive notes
    - isCorrection / correctedEventId / correctionReason: When logging a correction
    """
    current_user = getattr(g, "current_user", {})
    payload = request.get_json(silent=True) or {}

    evidence_ref = payload.get("evidenceId") or payload.get("evidenceNumber")
    if not evidence_ref:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Missing required field: 'evidenceId' or 'evidenceNumber' is required.",
        }), 400

    if not payload.get("reason") and not payload.get("notes"):
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Operational reason or justification is required for chain of custody logging.",
        }), 400

    try:
        event = custody_service.record_custody_event(evidence_ref, payload, current_user)
        return jsonify({
            "success": True,
            "message": f"Custody event {event['action']} logged for {event['evidenceNumber']}.",
            "event": event,
        }), 201
    except KeyError as key_err:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": str(key_err),
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403
    except ValueError as val_err:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": str(val_err),
        }), 400
    except Exception as exc:  # pylint: disable=broad-exception-caught
        return jsonify({
            "success": False,
            "error": "Server Error",
            "message": f"Failed to record custody event: {exc.__class__.__name__}",
        }), 500


@custody_bp.route("", methods=["GET"])
@permission_required(PERM_CUSTODY_READ)
def list_custody_events():
    """List accessible custody events with filtering and search."""
    current_user = getattr(g, "current_user", {})

    case_id = request.args.get("caseId")
    case_number = request.args.get("caseNumber")
    evidence_id = request.args.get("evidenceId")
    event_type = request.args.get("type") or request.args.get("eventType")
    search_query = request.args.get("q")

    try:
        page = int(request.args.get("page", 1))
    except ValueError:
        page = 1

    try:
        limit = int(request.args.get("limit", 20))
    except ValueError:
        limit = 20

    sort_order = request.args.get("sort_order", "desc")

    result = custody_service.list_all_accessible_custody(
        user=current_user,
        case_id=case_id,
        case_number=case_number,
        evidence_id=evidence_id,
        event_type=event_type,
        search_query=search_query,
        page=page,
        limit=limit,
    )

    return jsonify({
        "success": True,
        "count": result["count"],
        "events": result["events"],
        "pagination": result["pagination"],
    }), 200


@custody_bp.route("/<event_id>", methods=["GET"])
@permission_required(PERM_CUSTODY_READ)
def get_custody_event(event_id: str):
    """Retrieve details for a single custody block."""
    current_user = getattr(g, "current_user", {})
    try:
        event = custody_service.get_custody_event_by_id(event_id, current_user)
        return jsonify({
            "success": True,
            "event": event,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Custody event '{event_id}' does not exist.",
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403


@custody_bp.route("/<event_id>", methods=["PUT", "PATCH", "DELETE"])
@jwt_required
def modify_custody_event(event_id: str):
    """
    Enforce strict immutability: historic custody records cannot be modified or deleted.
    Returns 405 Method Not Allowed.
    """
    if request.method == "DELETE":
        msg = f"Custody event '{event_id}' is immutable under forensic standards and cannot be deleted."
    else:
        msg = f"Custody event '{event_id}' is immutable under forensic standards and cannot be modified."
    return jsonify({
        "success": False,
        "error": "Method Not Allowed",
        "message": msg,
    }), 405


@custody_bp.route("/verify/<evidence_id>", methods=["GET"])
@custody_bp.route("/verify-chain", methods=["GET"])
@permission_required(PERM_CUSTODY_READ)
def verify_chain(evidence_id: str = None):
    """
    Execute cryptographic hash-chain verification across all or evidence-specific events.
    Verifies SHA-256 block hash continuity and detects tampering.
    """
    current_user = getattr(g, "current_user", {})
    evidence_ref = evidence_id or request.args.get("evidenceId") or request.args.get("evidenceNumber")
    if not evidence_ref:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Missing required parameter: 'evidenceId' or 'evidenceNumber'.",
        }), 400

    try:
        report = custody_service.verify_custody_chain(evidence_ref, current_user)
        return jsonify({
            "success": True,
            "verification": report,
        }), 200
    except KeyError as key_err:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": str(key_err),
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403


@custody_bp.route("/export/<evidence_id>", methods=["GET"])
@custody_bp.route("/export", methods=["GET"])
@permission_required(PERM_CUSTODY_READ)
def export_custody(evidence_id: str = None):
    """
    Export chronological custody event history for court presentation.
    Supports ?format=csv or ?format=json.
    """
    current_user = getattr(g, "current_user", {})
    export_format = request.args.get("format", "csv").lower()
    evidence_ref = evidence_id or request.args.get("evidenceId") or request.args.get("evidenceNumber")

    if not evidence_ref:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Evidence reference is required for export.",
        }), 400

    try:
        content, media_type, filename = custody_service.export_custody_history(
            evidence_id_or_number=evidence_ref,
            user=current_user,
            format_type=export_format,
        )

        file_bytes = content.encode("utf-8") if isinstance(content, str) else content

        return send_file(
            io.BytesIO(file_bytes),
            mimetype=media_type,
            as_attachment=True,
            download_name=filename,
        )
    except KeyError as key_err:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": str(key_err),
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403
    except ValueError as val_err:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": str(val_err),
        }), 400
