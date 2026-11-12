from flask import Blueprint, request, jsonify, g, current_app
from services.user_service import user_service
from services.token_service import create_access_token
from middleware.auth_middleware import jwt_required

auth_bp = Blueprint("auth", __name__)


def set_auth_cookie(response, token: str):
    """Set secure HttpOnly authentication cookie on the response."""
    is_prod = current_app.config.get("ENV_NAME") == "production"
    response.set_cookie(
        "forenvision_token",
        token,
        httponly=True,
        samesite="Lax",
        secure=is_prod,
        path="/",
        max_age=current_app.config.get("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 1440) * 60,
    )
    return response


def clear_auth_cookie(response):
    """Clear authentication cookie on logout."""
    response.set_cookie(
        "forenvision_token",
        "",
        httponly=True,
        samesite="Lax",
        secure=False,
        path="/",
        max_age=0,
        expires=0,
    )
    return response


@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Public examiner registration endpoint.
    Registers a new forensic investigator, analyst, or viewer.
    Rejects attempts to self-grant administrator clearance.
    """
    data = request.get_json(silent=True) or {}
    email = data.get("email", "")
    password = data.get("password", "")
    name = data.get("name", "")
    badge_number = data.get("badge_number") or data.get("badgeNumber") or ""
    department = data.get("department", "")
    role = data.get("role")

    try:
        user = user_service.register_user(
            email=email,
            password=password,
            name=name,
            badge_number=badge_number,
            department=department,
            role=role,
            is_public=True,
        )
    except PermissionError as pe:
        return jsonify({
            "success": False,
            "error": "Forbidden",
            "message": str(pe),
        }), 403
    except ValueError as ve:
        return jsonify({
            "success": False,
            "error": "Bad Request",
            "message": str(ve),
        }), 400

    token = create_access_token(user)
    resp = jsonify({
        "success": True,
        "message": "Examiner registration successful.",
        "user": user,
        "token": token,
    })
    set_auth_cookie(resp, token)
    return resp, 201


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    User authentication endpoint.
    Validates credentials with rate limiting and account activation checks.
    Issues cryptographically signed JWT token and sets secure HttpOnly cookie.
    """
    data = request.get_json(silent=True) or {}
    email = data.get("email") or data.get("username") or ""
    password = data.get("password") or data.get("badgePassword") or ""
    client_ip = request.remote_addr or ""

    user, err_msg, status_code = user_service.authenticate(email, password, client_ip)
    if not user:
        return jsonify({
            "success": False,
            "error": "Unauthorized" if status_code == 401 else "Forbidden" if status_code == 403 else "Too Many Requests",
            "message": err_msg,
        }), status_code

    token = create_access_token(user)
    resp = jsonify({
        "success": True,
        "message": "Authentication successful.",
        "user": user,
        "token": token,
    })
    set_auth_cookie(resp, token)
    return resp, 200


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """
    User session termination endpoint.
    Clears the HttpOnly authentication cookie.
    """
    resp = jsonify({
        "success": True,
        "message": "Successfully signed out of forensic terminal.",
    })
    clear_auth_cookie(resp)
    return resp, 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required
def get_current_user():
    """
    Retrieve authenticated examiner identity and clearance profile.
    Requires valid JWT in Bearer header or HttpOnly cookie.
    """
    return jsonify({
        "success": True,
        "user": g.current_user,
    }), 200


@auth_bp.route("/profile", methods=["GET"])
@jwt_required
def get_profile():
    """Profile retrieval alias for current authenticated user."""
    return jsonify({
        "success": True,
        "user": g.current_user,
    }), 200


@auth_bp.route("/profile", methods=["PUT", "PATCH"])
@jwt_required
def update_profile():
    """
    Update profile metadata (name, department, badge number) or update passkey.
    Validates current password if password change requested.
    Prevents self-escalation of roles.
    """
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
