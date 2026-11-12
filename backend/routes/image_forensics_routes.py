"""
Image Forensics Routes Blueprint for ForenVision AI.
Provides authenticated REST endpoints for:
- Metadata extraction (EXIF, camera, timestamps, orientation, GPS, missing fields)
- Error Level Analysis (ELA) JPEG recompression diagnostic
- Parameterized ELA visualization rendering
- Secure streaming of derived ELA working copies
- Analysis history retrieval linked to evidence and cases
Enforces granular permissions and audit logging.
"""

from __future__ import annotations

import io
from flask import Blueprint, request, jsonify, g, send_file
from middleware.auth_middleware import jwt_required, permission_required
from services.image_forensics_service import image_forensics_service
from services.permission_service import (
    PERM_ANALYSIS_RUN,
    PERM_ANALYSIS_READ,
)
from services.audit_service import audit_service, ACTION_ANALYSIS_EXECUTED

image_forensics_bp = Blueprint("image_forensics", __name__)


@image_forensics_bp.route("/metadata", methods=["POST"])
@permission_required(PERM_ANALYSIS_READ)
def extract_metadata():
    """
    Extract comprehensive EXIF, camera, timestamp, orientation, and GPS metadata.
    Expects JSON body:
    - evidenceId or evidenceNumber: Identifier of the target evidence artifact
    """
    current_user = getattr(g, "current_user", {})
    payload = request.get_json(silent=True) or {}

    evidence_ref = payload.get("evidenceId") or payload.get("evidenceNumber")
    if not evidence_ref:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Missing required field: 'evidenceId' or 'evidenceNumber' must be provided.",
        }), 400

    try:
        report = image_forensics_service.extract_image_metadata(evidence_ref, current_user)
        return jsonify({
            "success": True,
            "metadata": report,
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
            "message": f"Metadata extraction failed: {exc.__class__.__name__}",
        }), 500


@image_forensics_bp.route("/ela", methods=["POST"])
@permission_required(PERM_ANALYSIS_RUN)
def run_error_level_analysis():
    """
    Execute Error Level Analysis (ELA) via JPEG recompression.
    Restricted to analysis.run clearance (Admin, Investigator, Analyst. Viewers denied).
    Expects JSON body:
    - evidenceId or evidenceNumber: Target evidence artifact
    - quality: Integer recompression quality (default: 90)
    - scale: Integer contrast error scale multiplier (default: 15)
    - saveResult: Boolean indicating whether to persist result into case dossier (default: true)
    """
    current_user = getattr(g, "current_user", {})
    payload = request.get_json(silent=True) or {}

    evidence_ref = payload.get("evidenceId") or payload.get("evidenceNumber")
    if not evidence_ref:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Missing required field: 'evidenceId' or 'evidenceNumber' must be provided.",
        }), 400

    quality = payload.get("quality", 90)
    scale = payload.get("scale", 15)
    save_result = payload.get("saveResult", True)

    try:
        result = image_forensics_service.perform_error_level_analysis(
            evidence_id_or_number=evidence_ref,
            user=current_user,
            quality=quality,
            scale=scale,
            save_analysis=save_result,
        )

        audit_service.log_event(
            action=ACTION_ANALYSIS_EXECUTED,
            actor=current_user,
            target=str(evidence_ref),
            target_type="evidence",
            details={
                "workflow": "image_error_level_analysis",
                "analysisId": result.get("analysisId"),
                "quality": quality,
                "scale": scale,
            },
            ip_address=request.remote_addr or "127.0.0.1",
        )

        # Sanitize internal disk paths before returning to client
        client_response = dict(result)
        client_response.pop("_derivedDiskPath", None)

        return jsonify({
            "success": True,
            "message": "Error Level Analysis (ELA) executed successfully.",
            "analysis": client_response,
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
            "message": f"ELA processing failed: {exc.__class__.__name__}",
        }), 500


@image_forensics_bp.route("/derived/<analysis_id>", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_derived_visualization(analysis_id: str):
    """
    Stream the derived ELA visualization image.
    Enforces authorization check on the parent case and never exposes physical disk paths.
    """
    current_user = getattr(g, "current_user", {})
    try:
        file_bytes, filename, mimetype = image_forensics_service.get_derived_image_bytes(
            analysis_id, current_user
        )
        return send_file(
            io.BytesIO(file_bytes),
            mimetype=mimetype,
            as_attachment=False,
            download_name=filename,
        )
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Derived visualization '{analysis_id}' does not exist.",
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


@image_forensics_bp.route("/history/<evidence_id>", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_analysis_history(evidence_id: str):
    """Retrieve historical analysis runs for an evidence artifact."""
    current_user = getattr(g, "current_user", {})
    try:
        history = image_forensics_service.get_evidence_analysis_history(evidence_id, current_user)
        return jsonify({
            "success": True,
            "count": len(history),
            "history": history,
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
