"""
AI-Assisted Object Detection API Routes for ForenVision AI.
Provides endpoints for executing YOLOv4-tiny neural network inference on authorized evidence,
streaming annotated visualizations, and retrieving model specifications and analysis history.
Enforces granular permissions and audit logging.
"""

from __future__ import annotations

import io
from flask import Blueprint, jsonify, request, g, send_file

from middleware.auth_middleware import jwt_required, permission_required
from services.object_detection_service import object_detection_service
from services.permission_service import (
    PERM_ANALYSIS_RUN,
    PERM_ANALYSIS_READ,
)
from services.audit_service import audit_service, ACTION_ANALYSIS_EXECUTED

detection_bp = Blueprint("detection_routes", __name__)


@detection_bp.route("/model-info", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_model_info():
    """
    Retrieve model specifications, licensing, architecture, classes, and forensic boundaries.
    """
    try:
        model_id = request.args.get("modelId")
        info = object_detection_service.get_model_info(model_id=model_id)
        return jsonify({
            "status": "success",
            "modelInfo": info,
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to retrieve model specifications: {str(e)}",
        }), 500


@detection_bp.route("/run", methods=["POST"])
@permission_required(PERM_ANALYSIS_RUN)
def run_detection():
    """
    Execute deep-learning object detection on an authorized image evidence item.
    Restricted to analysis.run clearance (Viewers denied).
    """
    data = request.get_json(silent=True) or {}
    evidence_id = data.get("evidenceId") or request.args.get("evidenceId")

    if not evidence_id:
        return jsonify({
            "status": "error",
            "message": "Missing required field 'evidenceId'.",
        }), 400

    confidence_threshold = data.get("confidenceThreshold", 0.30)
    nms_threshold = data.get("nmsThreshold", 0.40)
    save_analysis = data.get("saveAnalysis", True)
    model_id = data.get("modelId", "yolov4-tiny")

    try:
        user = getattr(g, "current_user", {})
        result = object_detection_service.run_detection(
            evidence_id=str(evidence_id).strip(),
            user=user,
            confidence_threshold=float(confidence_threshold),
            nms_threshold=float(nms_threshold),
            save_analysis=bool(save_analysis),
            model_id=str(model_id),
        )

        audit_service.log_event(
            action=ACTION_ANALYSIS_EXECUTED,
            actor=user,
            target=str(evidence_id),
            target_type="evidence",
            details={
                "workflow": "object_detection",
                "modelId": str(model_id),
                "analysisId": result.get("analysisId"),
                "detectedCount": result.get("summary", {}).get("totalObjects", 0),
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
        return jsonify({"status": "error", "message": f"Detection failed: {str(e)}"}), 500


@detection_bp.route("/derived/<analysis_id>", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_derived_image(analysis_id: str):
    """
    Stream derived annotated bounding-box visualization JPEG for authorized examiners.
    """
    try:
        user = getattr(g, "current_user", {})
        file_bytes, media_type = object_detection_service.get_derived_image(
            analysis_id, user
        )
        return send_file(
            io.BytesIO(file_bytes),
            mimetype=media_type,
            as_attachment=False,
            download_name=f"{analysis_id}_detection.jpg",
        )
    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except FileNotFoundError as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to retrieve visualization: {str(e)}"}), 500


@detection_bp.route("/history/<evidence_id>", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_history(evidence_id: str):
    """Retrieve history of object detections targeting this evidence artifact."""
    try:
        user = getattr(g, "current_user", {})
        history = object_detection_service.get_detection_history(evidence_id, user)
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
