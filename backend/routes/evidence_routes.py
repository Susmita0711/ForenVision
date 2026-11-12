"""
Evidence Routes Blueprint for ForenVision AI.
Provides secure authenticated REST endpoints for:
- Uploading evidence linked to authorized cases
- Listing accessible evidence with search & filters
- Retrieving sanitized evidence metadata
- Secure authorized downloading and inline preview
- On-demand cryptographic SHA-256 verification
- Associating and retrieving AI analysis results
- Retrieving verified chain of custody records
Enforces granular permissions, case-level clearance, and audit logging.
"""

from __future__ import annotations

import io
import math
from flask import Blueprint, request, jsonify, g, send_file, current_app
from middleware.auth_middleware import jwt_required, permission_required
from services.evidence_service import evidence_service
from services.permission_service import (
    PERM_EVIDENCE_UPLOAD,
    PERM_EVIDENCE_READ,
    PERM_EVIDENCE_DOWNLOAD,
    PERM_ANALYSIS_READ,
    PERM_ANALYSIS_RUN,
    PERM_CUSTODY_READ,
    PERM_CUSTODY_CREATE,
)
from services.audit_service import audit_service, ACTION_EVIDENCE_DOWNLOADED

evidence_bp = Blueprint("evidence", __name__)


@evidence_bp.route("/upload", methods=["POST"])
@permission_required(PERM_EVIDENCE_UPLOAD)
def upload_evidence():
    """
    Secure evidence intake endpoint.
    Restricted to evidence.upload permission.
    Expects multipart/form-data:
    - file: Binary payload
    - caseId or caseNumber: Associated docket identifier
    - name: Friendly artifact title
    - type: Evidence category (image, fingerprint, face, sketch, document, digital_artifact)
    - notes: Preliminary intake narrative
    - tags: Comma-separated categorization tags
    """
    current_user = getattr(g, "current_user", {})

    if "file" not in request.files:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Evidence file must be attached via 'file' multipart form field.",
        }), 400

    uploaded_file = request.files["file"]
    if not uploaded_file or not uploaded_file.filename:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "No valid file selected for evidence intake.",
        }), 400

    case_ref = request.form.get("caseId") or request.form.get("caseNumber")
    if not case_ref or not str(case_ref).strip():
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Associated case identifier (caseId or caseNumber) is required.",
        }), 400

    name = request.form.get("name")
    evidence_type = request.form.get("type", "image")
    notes = request.form.get("notes")
    raw_tags = request.form.get("tags")
    tags = [t.strip() for t in raw_tags.split(",") if t.strip()] if raw_tags else None

    # Enforce configured max file size
    max_bytes = current_app.config.get("MAX_CONTENT_LENGTH", 25 * 1024 * 1024)

    try:
        file_bytes = uploaded_file.read()
        evidence_doc = evidence_service.store_evidence(
            file_bytes=file_bytes,
            original_filename=uploaded_file.filename,
            case_id_or_number=case_ref.strip(),
            user=current_user,
            name=name,
            evidence_type=evidence_type,
            tags=tags,
            notes=notes,
            max_size_bytes=max_bytes,
        )
        return jsonify({
            "success": True,
            "message": f"Evidence {evidence_doc['evidenceNumber']} securely ingested into vault.",
            "evidence": evidence_doc,
        }), 201

    except ValueError as val_err:
        return jsonify({
            "success": False,
            "error": "Validation Error",
            "message": str(val_err),
        }), 400
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
    except Exception as exc:  # pylint: disable=broad-exception-caught
        return jsonify({
            "success": False,
            "error": "Server Error",
            "message": f"Evidence intake failed: {exc.__class__.__name__}",
        }), 500


@evidence_bp.route("", methods=["GET"])
@permission_required(PERM_EVIDENCE_READ)
def list_evidence():
    """
    List evidence items accessible under current user's clearance.
    Supports filtering by caseId, evidenceType, integrityStatus, search query, and pagination.
    """
    current_user = getattr(g, "current_user", {})

    case_ref = request.args.get("caseId") or request.args.get("caseNumber")
    evidence_type = request.args.get("type") or request.args.get("evidenceType")
    integrity_status = request.args.get("integrityStatus") or request.args.get("status")
    search_query = request.args.get("q")

    try:
        page = int(request.args.get("page", 1))
    except ValueError:
        page = 1

    try:
        limit = int(request.args.get("limit", 12))
    except ValueError:
        limit = 12

    sort_by = request.args.get("sort_by", "uploadedAt")
    sort_order = request.args.get("sort_order", "desc")

    result = evidence_service.list_accessible_evidence(
        user=current_user,
        case_id_or_number=case_ref,
        evidence_type=evidence_type,
        integrity_status=integrity_status,
        search_query=search_query,
        page=page,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    return jsonify({
        "success": True,
        "count": result["count"],
        "evidence": result["evidence"],
        "pagination": result["pagination"],
    }), 200


@evidence_bp.route("/<evidence_id>", methods=["GET"])
@permission_required(PERM_EVIDENCE_READ)
def get_evidence(evidence_id: str):
    """Retrieve sanitized metadata for a single evidence artifact."""
    current_user = getattr(g, "current_user", {})
    try:
        doc = evidence_service.get_evidence_by_id(evidence_id, current_user)
        return jsonify({
            "success": True,
            "evidence": doc,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Evidence artifact '{evidence_id}' does not exist.",
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403


@evidence_bp.route("/<evidence_id>/download", methods=["GET"])
@permission_required(PERM_EVIDENCE_DOWNLOAD)
def download_evidence(evidence_id: str):
    """
    Stream original immutable evidence bytes for authorized download.
    Restricted to evidence.download permission (Viewers denied).
    Enforces case access check and records audit log.
    """
    current_user = getattr(g, "current_user", {})
    try:
        file_bytes, filename, media_type = evidence_service.get_evidence_file_bytes(
            evidence_id, current_user
        )

        # Record audit log
        audit_service.log_event(
            action=ACTION_EVIDENCE_DOWNLOADED,
            actor=current_user,
            target=evidence_id,
            target_type="evidence",
            details={
                "evidenceId": evidence_id,
                "filename": filename,
                "mediaType": media_type,
                "fileSizeBytes": len(file_bytes),
            },
            ip_address=request.remote_addr or "127.0.0.1",
        )

        return send_file(
            io.BytesIO(file_bytes),
            mimetype=media_type,
            as_attachment=True,
            download_name=filename,
        )
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Evidence artifact '{evidence_id}' does not exist.",
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403
    except FileNotFoundError as fnf_err:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": str(fnf_err),
        }), 404


@evidence_bp.route("/<evidence_id>/preview", methods=["GET"])
@permission_required(PERM_EVIDENCE_READ)
def preview_evidence(evidence_id: str):
    """
    Stream supported image or document bytes for inline browser preview.
    Guarantees authorization check before streaming.
    """
    current_user = getattr(g, "current_user", {})
    try:
        file_bytes, _, media_type = evidence_service.get_evidence_file_bytes(
            evidence_id, current_user
        )
        return send_file(
            io.BytesIO(file_bytes),
            mimetype=media_type,
            as_attachment=False,
        )
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Evidence artifact '{evidence_id}' does not exist.",
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403
    except FileNotFoundError as fnf_err:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": str(fnf_err),
        }), 404


@evidence_bp.route("/<evidence_id>/verify", methods=["POST"])
@permission_required(PERM_EVIDENCE_READ)
def verify_evidence_integrity(evidence_id: str):
    """
    Recalculate SHA-256 hash against original on-disk evidence bytes.
    Verifies that evidence has not suffered tampering or silent corruption.
    """
    current_user = getattr(g, "current_user", {})
    try:
        report = evidence_service.verify_evidence_integrity(evidence_id, current_user)
        return jsonify({
            "success": True,
            "message": f"Integrity check completed: status is [{report['integrityStatus'].upper()}].",
            "verification": report,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Evidence artifact '{evidence_id}' does not exist.",
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403


@evidence_bp.route("/<evidence_id>/analyses", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_analyses(evidence_id: str):
    """Retrieve saved AI analysis results linked to this evidence artifact."""
    current_user = getattr(g, "current_user", {})
    try:
        analyses = evidence_service.get_evidence_analyses(evidence_id, current_user)
        return jsonify({
            "success": True,
            "count": len(analyses),
            "analyses": analyses,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Evidence artifact '{evidence_id}' does not exist.",
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403


@evidence_bp.route("/<evidence_id>/analyses", methods=["POST"])
@permission_required(PERM_ANALYSIS_RUN)
def associate_analysis(evidence_id: str):
    """Associate a new AI analysis report with an evidence item."""
    current_user = getattr(g, "current_user", {})
    payload = request.get_json(silent=True) or {}

    try:
        analysis = evidence_service.associate_analysis_result(
            evidence_id, payload, current_user
        )
        return jsonify({
            "success": True,
            "message": "Analysis result successfully associated with evidence.",
            "analysis": analysis,
        }), 201
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Evidence artifact '{evidence_id}' does not exist.",
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403


@evidence_bp.route("/<evidence_id>/custody", methods=["GET"])
@permission_required(PERM_CUSTODY_READ)
def get_custody(evidence_id: str):
    """Retrieve verified chain of custody records for this evidence item."""
    current_user = getattr(g, "current_user", {})
    try:
        blocks = evidence_service.get_evidence_custody(evidence_id, current_user)
        return jsonify({
            "success": True,
            "count": len(blocks),
            "custody": blocks,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Evidence artifact '{evidence_id}' does not exist.",
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403


@evidence_bp.route("/<evidence_id>/custody", methods=["POST"])
@permission_required(PERM_CUSTODY_CREATE)
def add_custody_event(evidence_id: str):
    """
    Record a chain of custody handover or action for this evidence item.
    Restricted to custody.create clearance (Admin and Investigator).
    """
    from services.custody_service import custody_service
    current_user = getattr(g, "current_user", {})
    payload = request.get_json(silent=True) or {}

    try:
        event = custody_service.record_custody_event(evidence_id, payload, current_user)
        return jsonify({
            "success": True,
            "message": f"Custody event {event['action']} recorded for {event['evidenceNumber']}.",
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
