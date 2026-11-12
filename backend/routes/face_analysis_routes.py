"""
Controlled Face Analysis & Biometric Comparison API Routes for ForenVision AI.
Provides endpoints for face detection, facial landmark localization, forensic image quality
audits, controlled 1-to-1 facial comparison, and secure derived visualization streaming.
Enforces specialized workflow clearance (analysts require explicit authorization).
"""

from __future__ import annotations

import io
from flask import Blueprint, jsonify, request, g, send_file
import numpy as np
import cv2

from middleware.auth_middleware import jwt_required, permission_required, workflow_required
from services.face_analysis_service import face_analysis_service
from services.evidence_service import evidence_service
from services.permission_service import (
    PERM_ANALYSIS_RUN,
    PERM_ANALYSIS_READ,
    WORKFLOW_FACE_ANALYSIS,
)
from services.audit_service import audit_service, ACTION_ANALYSIS_EXECUTED

face_bp = Blueprint("face_analysis_routes", __name__)


@face_bp.route("/methodology", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_methodology():
    """
    Retrieve scientific methodology, model specifications, evaluation guidelines,
    and mandatory legal/forensic uncertainty disclaimers.
    """
    try:
        info = face_analysis_service.get_methodology_info()
        return jsonify({
            "status": "success",
            "data": info,
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to retrieve methodology documentation: {str(e)}",
        }), 500


@face_bp.route("/detect", methods=["POST"])
@permission_required(PERM_ANALYSIS_RUN)
@workflow_required(WORKFLOW_FACE_ANALYSIS)
def detect_faces():
    """
    Perform facial detection, landmark localization, and quality audit on a single evidence item.
    Enforces analysis.run clearance and explicit face_analysis authorization.
    """
    data = request.get_json(silent=True) or {}
    evidence_id = data.get("evidenceId")

    if not evidence_id:
        return jsonify({
            "status": "error",
            "message": "Missing required field 'evidenceId'.",
        }), 400

    score_threshold = float(data.get("scoreThreshold", 0.4))
    save_analysis = bool(data.get("saveAnalysis", True))

    try:
        user = getattr(g, "current_user", {})
        result = face_analysis_service.analyze_single_face(
            evidence_id=str(evidence_id),
            user=user,
            score_threshold=score_threshold,
            save_analysis=save_analysis,
        )

        audit_service.log_event(
            action=ACTION_ANALYSIS_EXECUTED,
            actor=user,
            target=str(evidence_id),
            target_type="evidence",
            details={
                "workflow": "face_detection",
                "analysisId": result.get("analysisId"),
                "facesDetected": result.get("detectedFacesCount", 0),
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
        return jsonify({"status": "error", "message": f"Facial detection failed: {str(e)}"}), 500


@face_bp.route("/compare", methods=["POST"])
@permission_required(PERM_ANALYSIS_RUN)
@workflow_required(WORKFLOW_FACE_ANALYSIS)
def compare_faces():
    """
    Execute controlled 1-to-1 facial comparison between two authorized evidence items.
    Rejects 1:N database searches. Requires explicit Probe and Reference items.
    Enforces analysis.run clearance and explicit face_analysis authorization.
    """
    data = request.get_json(silent=True) or {}
    probe_id = data.get("probeEvidenceId")
    ref_id = data.get("referenceEvidenceId")

    if not probe_id or not ref_id:
        return jsonify({
            "status": "error",
            "message": "Both 'probeEvidenceId' and 'referenceEvidenceId' are required for controlled 1-to-1 comparison.",
        }), 400

    score_threshold = float(data.get("scoreThreshold", 0.4))
    save_analysis = bool(data.get("saveAnalysis", True))

    try:
        user = getattr(g, "current_user", {})
        result = face_analysis_service.compare_faces(
            probe_evidence_id=str(probe_id),
            reference_evidence_id=str(ref_id),
            user=user,
            score_threshold=score_threshold,
            save_analysis=save_analysis,
        )

        audit_service.log_event(
            action=ACTION_ANALYSIS_EXECUTED,
            actor=user,
            target=f"{probe_id} <=> {ref_id}",
            target_type="evidence",
            details={
                "workflow": "face_comparison",
                "analysisId": result.get("analysisId"),
                "matchConfidence": result.get("cosineSimilarity"),
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
        return jsonify({"status": "error", "message": f"Facial comparison failed: {str(e)}"}), 500


@face_bp.route("/derived/<analysis_id>", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_derived_image(analysis_id: str):
    """
    Stream derived facial visualization image for authorized examiners.
    """
    try:
        user = getattr(g, "current_user", {})
        file_bytes, filename = face_analysis_service.get_derived_file_bytes(
            analysis_id, user
        )
        return send_file(
            io.BytesIO(file_bytes),
            mimetype="image/jpeg",
            as_attachment=False,
            download_name=filename,
        )
    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except FileNotFoundError as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to retrieve visualization: {str(e)}"}), 500


@face_bp.route("/history/<evidence_id>", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_face_history(evidence_id: str):
    """Retrieve history of face analyses targeting this evidence artifact."""
    try:
        user = getattr(g, "current_user", {})
        history = face_analysis_service.get_analysis_history(evidence_id, user)
        return jsonify({
            "status": "success",
            "count": len(history),
            "data": history,
        }), 200
    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to retrieve history: {str(e)}"}), 500
