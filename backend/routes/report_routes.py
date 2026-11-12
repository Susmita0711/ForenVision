"""
Forensic Reporting & Court Exhibit API Routes for ForenVision AI.
Provides endpoints for generating authenticated case dossiers, listing authorized reports,
retrieving report metadata, and securely streaming court-admissible PDF files.
Enforces granular reports.create and reports.read permissions.
"""

from __future__ import annotations

import io
import logging
from flask import Blueprint, jsonify, request, g, send_file

from middleware.auth_middleware import jwt_required, permission_required
from services.report_service import report_service
from services.permission_service import (
    PERM_REPORTS_READ,
    PERM_REPORTS_CREATE,
)
from services.audit_service import audit_service, ACTION_REPORT_GENERATED

report_bp = Blueprint("report_routes", __name__)


@report_bp.route("", methods=["GET"])
@permission_required(PERM_REPORTS_READ)
def list_reports():
    """
    List all forensic reports accessible to the current user under case clearance RBAC.
    """
    case_id_or_number = request.args.get("caseId") or request.args.get("caseNumber")
    try:
        user = getattr(g, "current_user", {})
        reports = report_service.list_reports(user, case_id_or_number=case_id_or_number)
        return jsonify({
            "status": "success",
            "count": len(reports),
            "data": reports,
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to list reports: {str(e)}",
        }), 500


@report_bp.route("/generate", methods=["POST"])
@permission_required(PERM_REPORTS_CREATE)
def generate_report():
    """
    Generate an authenticated forensic examination dossier from real database records.
    Restricted to reports.create clearance (Admin, Investigator, Analyst).
    Builds a court-admissible PDF with ReportLab and persists metadata to vault and database.
    """
    data = request.get_json(silent=True) or {}
    case_ref = data.get("caseId") or data.get("caseNumber")

    if not case_ref:
        return jsonify({
            "status": "error",
            "message": "Missing required field 'caseId' or 'caseNumber'.",
        }), 400

    title = data.get("title")
    classification = data.get("classification", "OFFICIAL COURT EXHIBIT")
    investigator_notes = data.get("investigatorNotes")

    try:
        user = getattr(g, "current_user", {})
        report_doc = report_service.generate_case_report(
            case_id_or_number=str(case_ref),
            user=user,
            title=title,
            classification=classification,
            investigator_notes=investigator_notes,
        )

        # Log audit event
        audit_service.log_event(
            action=ACTION_REPORT_GENERATED,
            actor=user,
            target=report_doc.get("reportNumber") or str(report_doc.get("id")),
            target_type="report",
            details={
                "reportId": report_doc.get("id"),
                "reportNumber": report_doc.get("reportNumber"),
                "caseId": report_doc.get("caseId"),
                "classification": classification,
            },
            ip_address=request.remote_addr or "127.0.0.1",
        )

        return jsonify({
            "status": "success",
            "message": "Forensic report generated and sealed successfully.",
            "data": report_doc,
        }), 201

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except (FileNotFoundError, KeyError) as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        logging.getLogger("forenvision.reports").error("Report generation failed: %s", str(e), exc_info=True)
        return jsonify({"status": "error", "message": f"Report generation failed: {str(e)}"}), 500


@report_bp.route("/<report_id>", methods=["GET"])
@permission_required(PERM_REPORTS_READ)
def get_report(report_id: str):
    """
    Retrieve report metadata and structured findings, enforcing case clearance.
    """
    try:
        user = getattr(g, "current_user", {})
        report_doc = report_service.get_report_by_id(report_id, user)
        if not report_doc:
            return jsonify({
                "status": "error",
                "message": f"Report '{report_id}' not found.",
            }), 404

        return jsonify({
            "status": "success",
            "data": report_doc,
        }), 200

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to retrieve report: {str(e)}"}), 500


@report_bp.route("/<report_id>/pdf", methods=["GET"])
@permission_required(PERM_REPORTS_READ)
def download_report_pdf(report_id: str):
    """
    Securely stream the generated PDF file.
    Enforces JWT case clearance. Disallows unauthenticated public access.
    """
    try:
        user = getattr(g, "current_user", {})
        pdf_bytes, filename = report_service.get_report_pdf_bytes(report_id, user)

        as_attachment = request.args.get("download", "false").lower() == "true"

        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=as_attachment,
            download_name=filename,
        )

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except FileNotFoundError as e:
        return jsonify({"status": "error", "message": str(e)}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to stream report PDF: {str(e)}"}), 500


@report_bp.route("/<report_id>/preview", methods=["GET"])
@permission_required(PERM_REPORTS_READ)
def get_printable_preview(report_id: str):
    """
    Retrieve formatted structured data optimized for the printable browser report view.
    """
    try:
        user = getattr(g, "current_user", {})
        report_doc = report_service.get_report_by_id(report_id, user)
        if not report_doc:
            return jsonify({
                "status": "error",
                "message": f"Report '{report_id}' not found.",
            }), 404

        return jsonify({
            "status": "success",
            "data": report_doc,
        }), 200

    except PermissionError as e:
        return jsonify({"status": "error", "message": str(e)}), 403
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to retrieve preview: {str(e)}"}), 500
