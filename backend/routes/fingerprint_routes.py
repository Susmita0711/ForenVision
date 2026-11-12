"""
Fingerprint Analysis & Biometric Comparison API Routes for ForenVision AI.
Provides endpoints for executing SIFT-RANSAC feature alignment, topological minutiae extraction,
image quality evaluation, and streaming derived side-by-side comparison visualizations.
Enforces granular permissions and audit logging.
"""

from __future__ import annotations

import io
from flask import Blueprint, jsonify, request, g, send_file
import numpy as np
import cv2

from middleware.auth_middleware import jwt_required, permission_required
from services.fingerprint_service import fingerprint_service
from services.evidence_service import evidence_service
from services.permission_service import (
    PERM_ANALYSIS_RUN,
    PERM_ANALYSIS_READ,
)
from services.audit_service import audit_service, ACTION_ANALYSIS_EXECUTED

fingerprint_bp = Blueprint("fingerprint_routes", __name__)


@fingerprint_bp.route("/methodology", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_methodology():
    """
    Retrieve scientific methodology, algorithm specifications, and legal caveats.
    """
    try:
        info = fingerprint_service.get_methodology_info()
        return jsonify({
            "status": "success",
            "data": info,
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to retrieve methodology documentation: {str(e)}",
        }), 500


@fingerprint_bp.route("/assess-quality", methods=["POST"])
@permission_required(PERM_ANALYSIS_RUN)
def assess_evidence_quality():
    """
    Perform standalone fingerprint quality and ridge clarity evaluation on an evidence item.
    Restricted to analysis.run clearance.
    """
    data = request.get_json(silent=True) or {}
    evidence_id = data.get("evidenceId")

    if not evidence_id:
        return jsonify({
            "status": "error",
            "message": "Missing required field 'evidenceId'.",
        }), 400

    try:
        user = getattr(g, "current_user", {})
        file_bytes, filename, mime_type = evidence_service.get_evidence_file_bytes(str(evidence_id), user)

        np_arr = np.frombuffer(file_bytes, dtype=np.uint8)
        gray = cv2.imdecode(np_arr, cv2.IMREAD_GRAYSCALE)
        if gray is None:
            return jsonify({
                "status": "error",
                "message": "Failed to decode evidence as photographic grayscale image.",
            }), 400

        quality = fingerprint_service.assess_image_quality(gray)
        return jsonify({
            "status": "success",
            "evidenceId": evidence_id,
            "filename": filename,
            "quality": quality,
        }), 200

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except FileNotFoundError as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"Quality assessment failed: {str(e)}"}), 500


@fingerprint_bp.route("/compare", methods=["POST"])
@permission_required(PERM_ANALYSIS_RUN)
def compare_fingerprints():
    """
    Execute full biometric comparison between two authorized fingerprint impressions.
    Restricted to analysis.run clearance.
    """
    data = request.get_json(silent=True) or {}
    probe_id = data.get("probeEvidenceId")
    ref_id = data.get("referenceEvidenceId")

    if not probe_id or not ref_id:
        return jsonify({
            "status": "error",
            "message": "Both 'probeEvidenceId' and 'referenceEvidenceId' are required.",
        }), 400

    lowe_ratio = float(data.get("loweRatio", 0.75))
    ransac_thresh = float(data.get("ransacThreshold", 5.0))
    min_inliers = int(data.get("minInliers", 12))
    save_analysis = bool(data.get("saveAnalysis", True))

    try:
        user = getattr(g, "current_user", {})
        result = fingerprint_service.compare_fingerprints(
            probe_evidence_id=str(probe_id),
            reference_evidence_id=str(ref_id),
            user=user,
            lowe_ratio=lowe_ratio,
            ransac_thresh=ransac_thresh,
            save_analysis=save_analysis,
        )

        audit_service.log_event(
            action=ACTION_ANALYSIS_EXECUTED,
            actor=user,
            target=f"{probe_id} <=> {ref_id}",
            target_type="evidence",
            details={
                "workflow": "fingerprint_comparison",
                "analysisId": result.get("analysisId"),
                "verifiedMatch": result.get("verifiedMatch"),
                "inlierCount": result.get("inlierCount"),
            },
            ip_address=request.remote_addr or "127.0.0.1",
        )

        return jsonify({
            "status": "success",
            "data": result,
        }), 200

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except FileNotFoundError as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": f"Biometric comparison failed: {str(e)}"}), 500


@fingerprint_bp.route("/derived/<analysis_id>", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_derived_image(analysis_id: str):
    """
    Stream derived feature alignment visualization for authorized examiners.
    """
    try:
        user = getattr(g, "current_user", {})
        file_bytes, media_type = fingerprint_service.get_derived_image(
            analysis_id, user
        )
        return send_file(
            io.BytesIO(file_bytes),
            mimetype=media_type,
            as_attachment=False,
            download_name=f"{analysis_id}_visualization.jpg",
        )
    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except FileNotFoundError as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to retrieve visualization: {str(e)}"}), 500


@fingerprint_bp.route("/history/<evidence_id>", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_history(evidence_id: str):
    """Retrieve history of fingerprint comparisons targeting this evidence item."""
    try:
        user = getattr(g, "current_user", {})
        history = fingerprint_service.get_fingerprint_history(evidence_id, user)
        return jsonify({
            "status": "success",
            "count": len(history),
            "data": history,
            "history": history,
        }), 200
    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to retrieve history: {str(e)}"}), 500
