"""
Case Routes Blueprint for ForenVision AI.
Provides complete case lifecycle management:
- Creation, listing with search/filter/pagination/sorting
- Retrieval of case details, evidence, analysis results, and audit trails
- Case editing, status workflow transitions, and soft-delete archival
- Case investigator & examiner assignment
Enforces role-based authorization, case-level access clearances, and audit logging.
"""

from __future__ import annotations

from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import jwt_required, permission_required
from services.case_service import case_service
from services.permission_service import (
    PERM_CASES_READ,
    PERM_CASES_CREATE,
    PERM_CASES_UPDATE,
    PERM_CASES_ARCHIVE,
    PERM_CASES_ASSIGN,
    PERM_EVIDENCE_READ,
    PERM_EVIDENCE_UPLOAD,
    PERM_ANALYSIS_READ,
)

case_bp = Blueprint("cases", __name__)


@case_bp.route("", methods=["GET"])
@permission_required(PERM_CASES_READ)
def list_cases():
    """
    List cases accessible to current user with full search, filtering,
    pagination, and multi-field sorting.
    """
    current_user = getattr(g, "current_user", {})

    status_filter = request.args.get("status")
    priority_filter = request.args.get("priority")
    incident_type = request.args.get("incidentType") or request.args.get("incident_type")
    search_query = request.args.get("q", "")
    tag = request.args.get("tag")

    try:
        page = int(request.args.get("page", 1))
    except ValueError:
        page = 1

    try:
        limit = int(request.args.get("limit", 10))
    except ValueError:
        limit = 10

    sort_by = request.args.get("sort_by", "createdAt")
    sort_order = request.args.get("sort_order", "desc")

    result = case_service.list_accessible_cases(
        user=current_user,
        status=status_filter,
        priority=priority_filter,
        incident_type=incident_type,
        search_query=search_query,
        tag=tag,
        page=page,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    return jsonify({
        "success": True,
        "count": result["count"],
        "cases": result["cases"],
        "pagination": result["pagination"],
    }), 200


@case_bp.route("", methods=["POST"])
@permission_required(PERM_CASES_CREATE)
def create_case():
    """
    Create a new forensic investigation case.
    Restricted to Administrator and Investigator clearance (cases.create).
    Generates unique docket identifier and records audit log.
    """
    current_user = getattr(g, "current_user", {})
    data = request.get_json(silent=True) or {}

    title = data.get("title")
    if not title or not str(title).strip():
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Case title is required.",
        }), 400

    incident_type = (
        data.get("incidentType")
        or data.get("incident_type")
        or "Digital Forgery"
    )
    priority = data.get("priority") or "medium"
    description = data.get("description") or ""
    tags = data.get("tags") or []
    is_restricted = bool(data.get("is_restricted", False))
    lead_investigator = data.get("leadInvestigator")
    assigned_examiners = data.get("assignedExaminers")

    try:
        created = case_service.create_case(
            title=title,
            incident_type=incident_type,
            priority=priority,
            description=description,
            user=current_user,
            tags=tags,
            is_restricted=is_restricted,
            lead_investigator=lead_investigator,
            assigned_examiners=assigned_examiners,
        )
        return jsonify({
            "success": True,
            "message": f"Case {created['caseNumber']} created successfully.",
            "case": created,
        }), 201
    except ValueError as val_err:
        return jsonify({
            "success": False,
            "error": "Validation Error",
            "message": str(val_err),
        }), 400
    except Exception as exc:  # pylint: disable=broad-exception-caught
        return jsonify({
            "success": False,
            "error": "Server Error",
            "message": f"Unable to create case: {exc.__class__.__name__}",
        }), 500


@case_bp.route("/<case_id>", methods=["GET"])
@permission_required(PERM_CASES_READ)
def get_case(case_id: str):
    """Retrieve details for a specific case by ID or caseNumber."""
    current_user = getattr(g, "current_user", {})
    try:
        case_data = case_service.get_case_by_id(case_id, current_user)
        return jsonify({
            "success": True,
            "case": case_data,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Case '{case_id}' was not found.",
        }), 404
    except PermissionError:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": f"Access to case '{case_id}' is restricted.",
        }), 403


@case_bp.route("/<case_id>", methods=["PATCH", "PUT"])
@permission_required(PERM_CASES_UPDATE)
def update_case(case_id: str):
    """
    Update case information (title, description, priority, tags, examiners).
    Enforces validation and records changes in audit history.
    """
    current_user = getattr(g, "current_user", {})
    data = request.get_json(silent=True) or {}

    if not data:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "No update fields provided in request payload.",
        }), 400

    try:
        updated = case_service.update_case(case_id, data, current_user)
        return jsonify({
            "success": True,
            "message": f"Case {updated['caseNumber']} updated successfully.",
            "case": updated,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Case '{case_id}' was not found.",
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
            "error": "Validation Error",
            "message": str(val_err),
        }), 400
    except Exception as exc:  # pylint: disable=broad-exception-caught
        return jsonify({
            "success": False,
            "error": "Server Error",
            "message": f"Failed to update case: {exc.__class__.__name__}",
        }), 500


@case_bp.route("/<case_id>/status", methods=["PATCH"])
@permission_required(PERM_CASES_UPDATE)
def change_status(case_id: str):
    """
    Transition case status (open, in_progress, under_review, closed, archived).
    Records workflow transition in audit logs.
    """
    current_user = getattr(g, "current_user", {})
    data = request.get_json(silent=True) or {}

    new_status = data.get("status")
    if not new_status:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Target status field is required.",
        }), 400

    reason = data.get("reason")

    try:
        updated = case_service.change_case_status(case_id, new_status, current_user, reason)
        return jsonify({
            "success": True,
            "message": f"Case status updated to [{updated['status'].upper()}].",
            "case": updated,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Case '{case_id}' was not found.",
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
            "error": "Validation Error",
            "message": str(val_err),
        }), 400


@case_bp.route("/<case_id>/assign", methods=["POST"])
@permission_required(PERM_CASES_ASSIGN)
def assign_case(case_id: str):
    """
    Assign lead investigator and assigned examiners to a case docket.
    Restricted to Administrator clearance (cases.assign).
    """
    current_user = getattr(g, "current_user", {})
    data = request.get_json(silent=True) or {}

    lead_investigator = data.get("leadInvestigator")
    assigned_examiners = data.get("assignedExaminers")

    try:
        updated = case_service.assign_case_examiners(
            case_id_or_number=case_id,
            lead_investigator=lead_investigator,
            assigned_examiners=assigned_examiners,
            user=current_user,
        )
        return jsonify({
            "success": True,
            "message": f"Case {updated['caseNumber']} assignment updated successfully.",
            "case": updated,
            "assignedExaminers": updated.get("assignedExaminers"),
        }), 200
    except KeyError:
        return jsonify({"success": False, "error": "Not Found", "message": f"Case '{case_id}' not found."}), 404
    except PermissionError as perm_err:
        return jsonify({"success": False, "error": "Forbidden", "message": str(perm_err)}), 403
    except ValueError as val_err:
        return jsonify({"success": False, "error": "Validation Error", "message": str(val_err)}), 400


@case_bp.route("/<case_id>/archive", methods=["POST"])
@case_bp.route("/<case_id>", methods=["DELETE"])
@permission_required(PERM_CASES_ARCHIVE)
def archive_case(case_id: str):
    """
    Soft-delete / archive a case docket.
    Restricted to Administrator clearance (cases.archive).
    Preserves historical evidence and chain of custody logs.
    """
    current_user = getattr(g, "current_user", {})
    data = request.get_json(silent=True) or {}
    reason = data.get("reason", "Archival requested by administrator.")

    try:
        archived = case_service.archive_case(case_id, current_user, reason)
        return jsonify({
            "success": True,
            "message": f"Case {archived['caseNumber']} successfully archived.",
            "case": archived,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Case '{case_id}' was not found.",
        }), 404
    except PermissionError as perm_err:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(perm_err),
        }), 403


@case_bp.route("/<case_id>/evidence", methods=["GET"])
@permission_required(PERM_EVIDENCE_READ)
def get_case_evidence(case_id: str):
    """Retrieve all evidence items associated with an authorized case."""
    current_user = getattr(g, "current_user", {})
    try:
        evidence = case_service.get_case_evidence(case_id, current_user)
        return jsonify({
            "success": True,
            "count": len(evidence),
            "evidence": evidence,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Case '{case_id}' was not found.",
        }), 404
    except PermissionError:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": f"Access to case '{case_id}' is restricted.",
        }), 403


@case_bp.route("/<case_id>/evidence", methods=["POST"])
@permission_required(PERM_EVIDENCE_UPLOAD)
def attach_case_evidence(case_id: str):
    """Attach a verified forensic evidence artifact to a case docket."""
    current_user = getattr(g, "current_user", {})
    data = request.get_json(silent=True) or {}

    try:
        evidence = case_service.attach_evidence_to_case(case_id, data, current_user)
        return jsonify({
            "success": True,
            "message": f"Evidence {evidence['evidenceNumber']} attached successfully.",
            "evidence": evidence,
        }), 201
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Case '{case_id}' was not found.",
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
            "error": "Validation Error",
            "message": str(val_err),
        }), 400


@case_bp.route("/<case_id>/analyses", methods=["GET"])
@permission_required(PERM_ANALYSIS_READ)
def get_case_analyses(case_id: str):
    """Retrieve saved AI analysis results associated with an authorized case."""
    current_user = getattr(g, "current_user", {})
    try:
        analyses = case_service.get_case_analyses(case_id, current_user)
        return jsonify({
            "success": True,
            "count": len(analyses),
            "analyses": analyses,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Case '{case_id}' was not found.",
        }), 404
    except PermissionError:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": f"Access to case '{case_id}' is restricted.",
        }), 403


@case_bp.route("/<case_id>/audit", methods=["GET"])
@permission_required(PERM_CASES_READ)
def get_case_audit(case_id: str):
    """Retrieve immutable audit history targeting an authorized case."""
    current_user = getattr(g, "current_user", {})
    try:
        audit_logs = case_service.get_case_audit_logs(case_id, current_user)
        return jsonify({
            "success": True,
            "count": len(audit_logs),
            "audit_logs": audit_logs,
        }), 200
    except KeyError:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Case '{case_id}' was not found.",
        }), 404
    except PermissionError:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": f"Access to case '{case_id}' is restricted.",
        }), 403
