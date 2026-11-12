from flask import Blueprint, request, jsonify, g
from services.user_service import user_service, sanitize_user
from services.permission_service import (
    PERM_USERS_READ,
    PERM_USERS_CREATE,
    PERM_USERS_DEACTIVATE,
    PERM_USERS_ASSIGN_ROLE,
)
from middleware.auth_middleware import jwt_required, permission_required

user_bp = Blueprint("users", __name__)


@user_bp.route("", methods=["GET"])
@permission_required(PERM_USERS_READ)
def list_users():
    """
    List all registered forensic examiners.
    Requires users.read permission (Admin, Investigator, Analyst).
    """
    users = user_service.list_users()
    return jsonify({
        "success": True,
        "users": users,
        "count": len(users),
    }), 200


@user_bp.route("/profile", methods=["GET"])
@jwt_required
def get_user_profile():
    return jsonify({
        "success": True,
        "user": g.current_user,
    }), 200


@user_bp.route("/profile", methods=["PUT", "PATCH"])
@jwt_required
def update_user_profile():
    data = request.get_json(silent=True) or {}
    user_id = g.current_user["id"]
    try:
        updated_user = user_service.update_profile(user_id, data)
        return jsonify({
            "success": True,
            "message": "Profile updated successfully.",
            "user": updated_user,
        }), 200
    except KeyError:
        return jsonify({"success": False, "error": "Not Found", "message": "User not found."}), 404
    except ValueError as ve:
        return jsonify({"success": False, "error": "Bad Request", "message": str(ve)}), 400


@user_bp.route("/<user_id>", methods=["GET"])
@jwt_required
def get_user_by_id(user_id: str):
    """
    Retrieve specific user profile by user identifier.
    Accessible to users with users.read permission or self-profile retrieval.
    """
    current_user = getattr(g, "current_user", {})
    actor_id = current_user.get("id")

    # Allowed if viewing own profile or holds users.read permission
    is_self = str(actor_id) == str(user_id)
    from services.permission_service import permission_service
    has_perm = permission_service.user_has_permission(current_user, PERM_USERS_READ)

    if not is_self and not has_perm:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": "Insufficient clearance to view other personnel profiles.",
        }), 403

    user = user_service.find_by_id(user_id)
    if not user:
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": f"Examiner with identifier '{user_id}' was not found.",
        }), 404

    return jsonify({
        "success": True,
        "user": sanitize_user(user),
    }), 200


@user_bp.route("", methods=["POST"])
@permission_required(PERM_USERS_CREATE)
def provision_user():
    """
    Provision a new examiner with arbitrary role clearance (including Administrator).
    Restricted to Administrator clearance (users.create).
    """
    data = request.get_json(silent=True) or {}
    email = data.get("email", "")
    password = data.get("password", "")
    name = data.get("name", "")
    badge_number = data.get("badge_number") or data.get("badgeNumber") or ""
    department = data.get("department", "")
    role = data.get("role")
    authorized_workflows = data.get("authorized_workflows") or data.get("authorizedWorkflows")

    try:
        user = user_service.register_user(
            email=email,
            password=password,
            name=name,
            badge_number=badge_number,
            department=department,
            role=role,
            is_public=False,  # Admin can assign any role
            authorized_workflows=authorized_workflows,
            creator=g.current_user,
        )
        return jsonify({
            "success": True,
            "message": "Examiner credentials provisioned successfully.",
            "user": user,
        }), 201
    except ValueError as ve:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": str(ve),
        }), 400


@user_bp.route("/<user_id>/status", methods=["PATCH"])
@permission_required(PERM_USERS_DEACTIVATE)
def update_user_status(user_id: str):
    """
    Activate or deactivate an examiner account.
    Restricted to Administrator clearance (users.deactivate).
    Prevents administrators from deactivating their own account or the last active admin.
    """
    data = request.get_json(silent=True) or {}
    if "is_active" not in data and "active" not in data:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Missing 'is_active' or 'active' boolean field in payload.",
        }), 400

    is_active = bool(data["is_active"] if "is_active" in data else data["active"])
    actor = g.current_user

    try:
        updated_user = user_service.set_user_status(user_id, is_active, actor)
        action_word = "activated" if is_active else "deactivated"
        return jsonify({
            "success": True,
            "message": f"User account has been {action_word}.",
            "user": updated_user,
        }), 200
    except KeyError:
        return jsonify({"success": False, "error": "Not Found", "message": "User not found."}), 404
    except ValueError as ve:
        return jsonify({"success": False, "error": "Forbidden", "message": str(ve)}), 403


@user_bp.route("/<user_id>/role", methods=["PATCH", "PUT"])
@permission_required(PERM_USERS_ASSIGN_ROLE)
def update_user_role(user_id: str):
    """
    Assign role and specialized workflow clearances to an examiner account.
    Restricted to Administrator clearance (users.assign_role).
    Prevents demoting the last active administrator.
    """
    data = request.get_json(silent=True) or {}
    new_role = data.get("role")
    if not new_role:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": "Missing required 'role' field in payload.",
        }), 400

    authorized_workflows = data.get("authorized_workflows") or data.get("authorizedWorkflows")
    actor = g.current_user

    try:
        updated_user = user_service.change_user_role(
            user_id=user_id,
            new_role=new_role,
            actor=actor,
            authorized_workflows=authorized_workflows,
        )
        return jsonify({
            "success": True,
            "message": f"Clearance role updated to [{updated_user['role']}].",
            "user": updated_user,
        }), 200
    except KeyError:
        return jsonify({"success": False, "error": "Not Found", "message": "User not found."}), 404
    except ValueError as ve:
        return jsonify({"success": False, "error": "Bad Request", "message": str(ve)}), 400
