import functools
from typing import Callable, Any
from flask import request, jsonify, g
import jwt

from services.token_service import decode_access_token
from services.user_service import user_service, sanitize_user, normalize_role
from services.permission_service import permission_service
from services.audit_service import audit_service


def jwt_required(fn: Callable) -> Callable:
    """
    Middleware decorator that verifies and decodes the JWT access token.
    Extracts token from the Authorization header (Bearer) or HttpOnly cookie.
    Validates signature, expiration, and ensures user account is active.
    Attaches sanitized user entity to flask.g.current_user.
    """
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "").strip()
        token = None

        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        elif "forenvision_token" in request.cookies:
            token = request.cookies.get("forenvision_token")

            # CSRF protection for cookie-authenticated mutating requests
            if request.method in ("POST", "PUT", "PATCH", "DELETE"):
                csrf_header = request.headers.get("X-Requested-With") or request.headers.get("X-CSRF-Token")
                origin = request.headers.get("Origin")
                if not csrf_header and not origin:
                    return jsonify({
                        "success": False,
                        "error": "Forbidden",
                        "message": "Missing CSRF verification header for cookie authentication.",
                    }), 403

        if not token:
            return jsonify({
                "success": False,
                "error": "Unauthorized",
                "message": "Authentication required. Bearer token or session cookie missing.",
            }), 401

        try:
            payload = decode_access_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({
                "success": False,
                "error": "Unauthorized",
                "message": "Authentication token has expired. Please log in again.",
            }), 401
        except jwt.InvalidTokenError:
            return jsonify({
                "success": False,
                "error": "Unauthorized",
                "message": "Invalid authentication token signature.",
            }), 401

        user_id = payload.get("sub")
        user = user_service.find_by_id(user_id) if user_id else None

        if not user:
            return jsonify({
                "success": False,
                "error": "Unauthorized",
                "message": "User account associated with this token no longer exists.",
            }), 401

        if not user.get("is_active", True):
            # Log deactivation rejection
            client_ip = request.remote_addr or "127.0.0.1"
            audit_service.log_auth_failure(
                actor=user,
                resource=request.path,
                required_permission="active_account",
                reason="Deactivated account attempted API access",
                ip_address=client_ip,
            )
            return jsonify({
                "success": False,
                "error": "Forbidden",
                "message": "Access Denied: Account has been deactivated. Please contact an administrator.",
            }), 403

        g.current_user = sanitize_user(user)
        g.raw_user = user
        g.token_payload = payload
        return fn(*args, **kwargs)

    return wrapper


def roles_required(*allowed_roles: str) -> Callable:
    """
    Middleware decorator that enforces server-side role-based authorization.
    Must be used in conjunction with @jwt_required.
    Accepts roles such as 'admin', 'investigator', 'analyst', 'viewer'.
    """
    normalized_allowed = {normalize_role(r) for r in allowed_roles}

    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        @jwt_required
        def wrapper(*args, **kwargs):
            current_user = getattr(g, "current_user", None)
            if not current_user:
                return jsonify({
                    "success": False,
                    "error": "Unauthorized",
                    "message": "Authentication required.",
                }), 401

            user_role = normalize_role(current_user.get("role"))
            if user_role not in normalized_allowed:
                client_ip = request.remote_addr or "127.0.0.1"
                audit_service.log_auth_failure(
                    actor=current_user,
                    resource=request.path,
                    required_permission=f"roles:{list(normalized_allowed)}",
                    reason=f"Role '{user_role}' denied clearance",
                    ip_address=client_ip,
                )
                return jsonify({
                    "success": False,
                    "error": "Forbidden",
                    "message": f"Access Denied: Insufficient clearance: requires role(s): {list(normalized_allowed)}.",
                }), 403

            return fn(*args, **kwargs)

        return wrapper

    return decorator


def permission_required(*required_permissions: str) -> Callable:
    """
    Middleware decorator enforcing explicit permission checks.
    Evaluates role permissions and custom user grants via PermissionService.
    Guarantees consistent 403 Forbidden responses with audit logging.
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        @jwt_required
        def wrapper(*args, **kwargs):
            current_user = getattr(g, "current_user", None)
            if not current_user:
                return jsonify({
                    "success": False,
                    "error": "Unauthorized",
                    "message": "Authentication required.",
                }), 401

            # User must satisfy all specified permissions
            raw_user = getattr(g, "raw_user", current_user)
            missing = [
                p for p in required_permissions
                if not permission_service.user_has_permission(raw_user, p)
            ]

            if missing:
                client_ip = request.remote_addr or "127.0.0.1"
                audit_service.log_auth_failure(
                    actor=current_user,
                    resource=request.path,
                    required_permission=",".join(missing),
                    reason=f"Missing explicit permission(s): {missing}",
                    ip_address=client_ip,
                )
                return jsonify({
                    "success": False,
                    "error": "Forbidden",
                    "message": f"Access Denied: Insufficient clearance: requires permission(s): {missing}.",
                }), 403

            return fn(*args, **kwargs)

        return wrapper

    return decorator


def workflow_required(workflow_name: str) -> Callable:
    """
    Middleware decorator enforcing explicit clearance for specialized AI workflows
    (e.g., face analysis or sketch analysis for analysts).
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        @jwt_required
        def wrapper(*args, **kwargs):
            current_user = getattr(g, "current_user", None)
            if not current_user:
                return jsonify({
                    "success": False,
                    "error": "Unauthorized",
                    "message": "Authentication required.",
                }), 401

            raw_user = getattr(g, "raw_user", current_user)
            if not permission_service.user_can_access_workflow(raw_user, workflow_name):
                client_ip = request.remote_addr or "127.0.0.1"
                audit_service.log_auth_failure(
                    actor=current_user,
                    resource=request.path,
                    required_permission=f"workflow:{workflow_name}",
                    reason=f"User lacks explicit clearance for {workflow_name}",
                    ip_address=client_ip,
                )
                return jsonify({
                    "success": False,
                    "error": "Forbidden",
                    "message": f"Access Denied: Explicit authorization required for '{workflow_name}' workflow.",
                }), 403

            return fn(*args, **kwargs)

        return wrapper

    return decorator
