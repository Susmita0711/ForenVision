"""
Centralized Permission & RBAC Service for ForenVision AI.

Defines canonical roles, granular permissions, role-to-permission mappings,
specialized biometric workflow clearances, and authorization evaluation logic.
"""

from __future__ import annotations
from typing import Any, Dict, Set, List

# Canonical User Roles
ROLE_ADMIN = "admin"
ROLE_INVESTIGATOR = "investigator"
ROLE_ANALYST = "analyst"
ROLE_VIEWER = "viewer"

CANONICAL_ROLES = {ROLE_ADMIN, ROLE_INVESTIGATOR, ROLE_ANALYST, ROLE_VIEWER}

# Explicit Permissions
PERM_USERS_READ = "users.read"
PERM_USERS_CREATE = "users.create"
PERM_USERS_UPDATE = "users.update"
PERM_USERS_DEACTIVATE = "users.deactivate"
PERM_USERS_ASSIGN_ROLE = "users.assign_role"

PERM_CASES_CREATE = "cases.create"
PERM_CASES_READ = "cases.read"
PERM_CASES_UPDATE = "cases.update"
PERM_CASES_ARCHIVE = "cases.archive"
PERM_CASES_ASSIGN = "cases.assign"

PERM_EVIDENCE_UPLOAD = "evidence.upload"
PERM_EVIDENCE_READ = "evidence.read"
PERM_EVIDENCE_DOWNLOAD = "evidence.download"

PERM_ANALYSIS_RUN = "analysis.run"
PERM_ANALYSIS_READ = "analysis.read"
PERM_ANALYSIS_UPDATE_NOTES = "analysis.update_notes"

PERM_CUSTODY_CREATE = "custody.create"
PERM_CUSTODY_READ = "custody.read"

PERM_REPORTS_CREATE = "reports.create"
PERM_REPORTS_READ = "reports.read"

PERM_AUDIT_READ = "audit.read"
PERM_SETTINGS_MANAGE = "settings.manage"

# Specialized Workflows requiring explicit authorization for Analysts
WORKFLOW_FACE_ANALYSIS = "face_analysis"
WORKFLOW_SKETCH_ANALYSIS = "sketch_analysis"

ALL_PERMISSIONS = {
    PERM_USERS_READ,
    PERM_USERS_CREATE,
    PERM_USERS_UPDATE,
    PERM_USERS_DEACTIVATE,
    PERM_USERS_ASSIGN_ROLE,
    PERM_CASES_CREATE,
    PERM_CASES_READ,
    PERM_CASES_UPDATE,
    PERM_CASES_ARCHIVE,
    PERM_CASES_ASSIGN,
    PERM_EVIDENCE_UPLOAD,
    PERM_EVIDENCE_READ,
    PERM_EVIDENCE_DOWNLOAD,
    PERM_ANALYSIS_RUN,
    PERM_ANALYSIS_READ,
    PERM_ANALYSIS_UPDATE_NOTES,
    PERM_CUSTODY_CREATE,
    PERM_CUSTODY_READ,
    PERM_REPORTS_CREATE,
    PERM_REPORTS_READ,
    PERM_AUDIT_READ,
    PERM_SETTINGS_MANAGE,
}

# Role-to-Permissions Mapping
ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    ROLE_ADMIN: set(ALL_PERMISSIONS),
    ROLE_INVESTIGATOR: {
        PERM_USERS_READ,
        PERM_CASES_CREATE,
        PERM_CASES_READ,
        PERM_CASES_UPDATE,
        PERM_EVIDENCE_UPLOAD,
        PERM_EVIDENCE_READ,
        PERM_EVIDENCE_DOWNLOAD,
        PERM_ANALYSIS_RUN,
        PERM_ANALYSIS_READ,
        PERM_ANALYSIS_UPDATE_NOTES,
        PERM_CUSTODY_CREATE,
        PERM_CUSTODY_READ,
        PERM_REPORTS_CREATE,
        PERM_REPORTS_READ,
    },
    ROLE_ANALYST: {
        PERM_USERS_READ,
        PERM_CASES_READ,
        PERM_EVIDENCE_READ,
        PERM_EVIDENCE_DOWNLOAD,
        PERM_ANALYSIS_RUN,
        PERM_ANALYSIS_READ,
        PERM_ANALYSIS_UPDATE_NOTES,
        PERM_CUSTODY_READ,
        PERM_REPORTS_CREATE,
        PERM_REPORTS_READ,
    },
    ROLE_VIEWER: {
        PERM_CASES_READ,
        PERM_EVIDENCE_READ,
        PERM_ANALYSIS_READ,
        PERM_CUSTODY_READ,
        PERM_REPORTS_READ,
    },
}


class PermissionService:
    """Centralized authorization and permission evaluation service."""

    @staticmethod
    def normalize_role_name(role: str | None) -> str:
        """Normalize arbitrary input role name to canonical role."""
        if not role:
            return ROLE_VIEWER
        norm = role.strip().lower().replace(" ", "_")
        aliases = {
            "administrator": ROLE_ADMIN,
            "admin": ROLE_ADMIN,
            "investigator": ROLE_INVESTIGATOR,
            "lead_examiner": ROLE_INVESTIGATOR,
            "analyst": ROLE_ANALYST,
            "technician": ROLE_ANALYST,
            "viewer": ROLE_VIEWER,
            "read_only_viewer": ROLE_VIEWER,
            "read-only viewer": ROLE_VIEWER,
        }
        return aliases.get(norm, ROLE_VIEWER)

    @classmethod
    def get_role_permissions(cls, role: str | None) -> Set[str]:
        """Retrieve the immutable permission set assigned to a given role."""
        norm_role = cls.normalize_role_name(role)
        return set(ROLE_PERMISSIONS.get(norm_role, set()))

    @classmethod
    def user_has_permission(cls, user: Dict[str, Any] | None, permission: str) -> bool:
        """
        Evaluate if a user entity possesses an explicit permission.
        Checks:
        1. User validity and active account status.
        2. Base role permissions.
        3. Any custom user-specific permission grants.
        """
        if not user:
            return False

        if not user.get("is_active", True):
            return False

        role = cls.normalize_role_name(user.get("role"))
        base_permissions = cls.get_role_permissions(role)

        if permission in base_permissions:
            return True

        # Check explicit custom permission grants if present
        custom_perms = set(user.get("custom_permissions") or [])
        return permission in custom_perms

    @classmethod
    def user_can_access_workflow(cls, user: Dict[str, Any] | None, workflow: str) -> bool:
        """
        Enforce strict authorization for specialized AI workflows (e.g. face analysis, sketch analysis).
        - Administrators: Always authorized.
        - Investigators: Authorized to request supported analyses on authorized cases.
        - Analysts: Only authorized when explicitly granted in 'authorized_workflows'.
        - Viewers: Never authorized to run analyses.
        """
        if not user or not user.get("is_active", True):
            return False

        role = cls.normalize_role_name(user.get("role"))
        if role == ROLE_ADMIN:
            return True

        if role == ROLE_VIEWER:
            return False

        if role == ROLE_INVESTIGATOR:
            return True

        if role == ROLE_ANALYST:
            auth_workflows = user.get("authorized_workflows") or []
            return workflow in auth_workflows or "all" in auth_workflows

        return False

    @classmethod
    def get_permission_matrix(cls) -> Dict[str, Dict[str, bool]]:
        """Return complete cross-tabulated permission matrix for all roles."""
        matrix: Dict[str, Dict[str, bool]] = {}
        for role in sorted(CANONICAL_ROLES):
            perms = cls.get_role_permissions(role)
            matrix[role] = {p: (p in perms) for p in sorted(ALL_PERMISSIONS)}
        return matrix


permission_service = PermissionService()
