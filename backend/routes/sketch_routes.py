"""
Criminal Sketch Analysis & Morphological Review API Routes for ForenVision AI.
Provides endpoints for sketch evidence ingestion, documented image preprocessing,
spatial annotations, side-by-side comparison session persistence, and derived visual streaming.
Enforces specialized workflow clearance (analysts require explicit authorization).
"""

from __future__ import annotations

import io
import base64
from flask import Blueprint, jsonify, request, g, send_file

from middleware.auth_middleware import jwt_required, permission_required, workflow_required
from services.sketch_service import sketch_service
from services.evidence_service import evidence_service
from services.permission_service import (
    PERM_EVIDENCE_UPLOAD,
    PERM_ANALYSIS_RUN,
    PERM_ANALYSIS_READ,
    WORKFLOW_SKETCH_ANALYSIS,
)
from services.audit_service import audit_service, ACTION_ANALYSIS_EXECUTED

sketch_bp = Blueprint("sketch_routes", __name__)


@sketch_bp.route("/methodology", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_methodology():
    """
    Retrieve scientific methodology, model evaluation status, standards compliance,
    and mandatory legal/forensic uncertainty disclaimers.
    """
    try:
        info = sketch_service.get_methodology_info()
        return jsonify({
            "status": "success",
            "data": info,
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to retrieve sketch methodology documentation: {str(e)}",
        }), 500


@sketch_bp.route("/upload", methods=["POST"])
@workflow_required(WORKFLOW_SKETCH_ANALYSIS)
@permission_required(PERM_EVIDENCE_UPLOAD)
def upload_sketch():
    """
    Upload and ingest an authorized witness composite drawing or digital sketch into a case.
    Preserves original immutable evidence bytes and records SHA-256 digest.
    """
    if "file" not in request.files:
        return jsonify({
            "status": "error",
            "message": "Missing required multipart file field 'file'.",
        }), 400

    uploaded_file = request.files["file"]
    case_id = request.form.get("caseId")
    notes = request.form.get("notes")

    if not case_id:
        return jsonify({
            "status": "error",
            "message": "Missing required field 'caseId'.",
        }), 400

    if not uploaded_file or not uploaded_file.filename:
        return jsonify({
            "status": "error",
            "message": "No file selected for upload.",
        }), 400

    try:
        user = getattr(g, "current_user", {})
        file_bytes = uploaded_file.read()

        ev_result = evidence_service.store_evidence(
            file_bytes=file_bytes,
            original_filename=uploaded_file.filename,
            case_id_or_number=case_id,
            user=user,
            evidence_type="sketch",
            notes=notes,
            tags=["SKETCH", "Witness Composite", "Facial Morphology"],
        )

        return jsonify({
            "status": "success",
            "message": "Sketch evidence ingested successfully into vault.",
            "data": ev_result,
        }), 201

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except KeyError as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": f"Sketch ingestion failed: {str(e)}"}), 500


@sketch_bp.route("/preprocess", methods=["POST"])
@permission_required(PERM_ANALYSIS_RUN)
@workflow_required(WORKFLOW_SKETCH_ANALYSIS)
def preprocess_image():
    """
    Apply documented forensic preprocessing filters onto a sketch or reference working copy.
    Returns JPEG data URL and effective parameter state.
    """
    data = request.get_json(silent=True) or {}
    evidence_id = data.get("evidenceId")

    if not evidence_id:
        return jsonify({
            "status": "error",
            "message": "Missing required field 'evidenceId'.",
        }), 400

    params = data.get("params") or {}

    try:
        user = getattr(g, "current_user", {})
        jpeg_bytes, effective_params = sketch_service.preprocess_evidence(
            evidence_id=str(evidence_id),
            user=user,
            params=params,
        )

        b64_encoded = base64.b64encode(jpeg_bytes).decode("ascii")
        data_url = f"data:image/jpeg;base64,{b64_encoded}"

        return jsonify({
            "status": "success",
            "evidenceId": evidence_id,
            "effectiveParams": effective_params,
            "previewDataUrl": data_url,
        }), 200

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except (FileNotFoundError, KeyError) as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": f"Preprocessing failed: {str(e)}"}), 500


@sketch_bp.route("/session", methods=["POST"])
@permission_required(PERM_ANALYSIS_RUN)
@workflow_required(WORKFLOW_SKETCH_ANALYSIS)
def create_session():
    """
    Save an authorized forensic sketch comparison and morphological review session.
    Persists parameters, spatial annotations, examiner checklist, and composite visualization.
    """
    data = request.get_json(silent=True) or {}
    try:
        user = getattr(g, "current_user", {})
        session_result = sketch_service.save_comparison_session(data, user)

        audit_service.log_event(
            action=ACTION_ANALYSIS_EXECUTED,
            actor=user,
            target=session_result.get("sessionId") or "sketch_session",
            target_type="analysis",
            details={
                "workflow": "sketch_comparison_session",
                "sessionId": session_result.get("sessionId"),
                "caseId": data.get("caseId"),
            },
            ip_address=request.remote_addr or "127.0.0.1",
        )

        return jsonify({
            "status": "success",
            "message": "Sketch comparison session recorded successfully.",
            "data": session_result,
        }), 201

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except (FileNotFoundError, KeyError) as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": f"Session recording failed: {str(e)}"}), 500


@sketch_bp.route("/compare-experimental", methods=["POST"])
@permission_required(PERM_ANALYSIS_RUN)
@workflow_required(WORKFLOW_SKETCH_ANALYSIS)
def compare_experimental():
    """
    Execute experimental CUHK-trained cross-modality sketch-to-photo diagnostic probe.
    Strictly exploratory; results carry mandatory Daubert/Frye non-admissibility caveats.
    """
    data = request.get_json(silent=True) or {}
    sketch_id = str(data.get("sketchEvidenceId", "")).strip()
    ref_id = str(data.get("referenceEvidenceId", "")).strip()
    save_analysis = bool(data.get("saveAnalysis", True))

    if not sketch_id or not ref_id:
        return jsonify({
            "status": "error",
            "message": "Both 'sketchEvidenceId' and 'referenceEvidenceId' are required.",
        }), 400

    try:
        user = getattr(g, "current_user", {})
        result = sketch_service.compare_sketch_experimental(
            sketch_evidence_id=sketch_id,
            reference_evidence_id=ref_id,
            user=user,
            save_analysis=save_analysis,
        )

        audit_service.log_event(
            action=ACTION_ANALYSIS_EXECUTED,
            actor=user,
            target=result.get("analysisId") or "sketch_experimental",
            target_type="analysis",
            details={
                "workflow": "sketch_experimental_probe",
                "analysisId": result.get("analysisId"),
                "sketchEvidenceId": sketch_id,
                "referenceEvidenceId": ref_id,
                "alignedCosineSimilarity": result.get("metrics", {}).get("alignedCosineSimilarity"),
            },
            ip_address=request.remote_addr or "127.0.0.1",
        )

        return jsonify({
            "status": "success",
            "data": result,
        }), 200

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except (FileNotFoundError, KeyError) as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": f"Experimental comparison failed: {str(e)}"}), 500


@sketch_bp.route("/session/<session_id>", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_session(session_id: str):
    """
    Retrieve full comparison session details, enforcing case clearance.
    """
    try:
        user = getattr(g, "current_user", {})
        session_doc = sketch_service.get_session_by_id(session_id, user)
        if not session_doc:
            return jsonify({
                "status": "error",
                "message": f"Sketch comparison session '{session_id}' not found.",
            }), 404

        return jsonify({
            "status": "success",
            "data": session_doc,
        }), 200

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to retrieve session: {str(e)}"}), 500


@sketch_bp.route("/history/<evidence_id>", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_history(evidence_id: str):
    """
    Retrieve past sketch comparison sessions associated with an evidence artifact or case.
    """
    try:
        user = getattr(g, "current_user", {})
        sessions = sketch_service.get_sessions_history(str(evidence_id), user)
        return jsonify({
            "status": "success",
            "evidenceId": evidence_id,
            "count": len(sessions),
            "data": sessions,
        }), 200

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except (FileNotFoundError, KeyError) as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to retrieve history: {str(e)}"}), 500


@sketch_bp.route("/derived/<session_id>", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_derived_visualization(session_id: str):
    """
    Securely stream derived sketch comparison visualization JPEG.
    Enforces JWT case authorization.
    """
    try:
        user = getattr(g, "current_user", {})
        image_bytes, filename = sketch_service.get_derived_visualization_bytes(str(session_id), user)

        return send_file(
            io.BytesIO(image_bytes),
            mimetype="image/jpeg",
            as_attachment=False,
            download_name=filename,
        )

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except FileNotFoundError as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to stream visualization: {str(e)}"}), 500
