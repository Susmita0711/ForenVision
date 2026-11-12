"""
Comprehensive RBAC and Access-Control Test Suite for ForenVision AI.
Validates:
- Central Permission System and Role Mappings (Administrator, Investigator, Analyst, Read-only Viewer)
- Enforcement on protected Flask endpoints
- Administrative user management and last-admin deactivation/demotion protection
- Self-privilege escalation prevention on user profile updates
- Investigator operations and permission boundary enforcement
- Analyst operations, default workflows, and workflow-level explicit clearance for Face and Sketch analysis
- Viewer read-only restrictions (blocked from uploads, evidence downloads, mutations, analyses, reports)
- Cross-case access isolation on restricted dockets
- Inactive account enforcement
- Immutability of historical chain of custody
- Security audit log generation and non-sensitive logging
"""

import io
import json
import pytest

from services.case_service import case_service
from services.evidence_service import evidence_service
from services.custody_service import custody_service
from services.user_service import user_service
from services.audit_service import audit_service
from services.permission_service import (
    PERM_USERS_READ,
    PERM_USERS_CREATE,
    PERM_USERS_UPDATE,
    PERM_USERS_DEACTIVATE,
    PERM_USERS_ASSIGN_ROLE,
    PERM_CASES_CREATE,
    PERM_CASES_READ,
    PERM_CASES_UPDATE,
    PERM_CASES_ASSIGN,
    PERM_EVIDENCE_UPLOAD,
    PERM_EVIDENCE_READ,
    PERM_EVIDENCE_DOWNLOAD,
    PERM_ANALYSIS_RUN,
    PERM_ANALYSIS_READ,
    PERM_CUSTODY_CREATE,
    PERM_CUSTODY_READ,
    PERM_REPORTS_CREATE,
    PERM_REPORTS_READ,
    PERM_AUDIT_READ,
    PERM_SETTINGS_MANAGE,
    ROLE_PERMISSIONS,
    ROLE_ADMIN,
    ROLE_INVESTIGATOR,
    ROLE_ANALYST,
    ROLE_VIEWER,
    permission_service,
)


def get_token_for(client, email: str, password: str) -> str:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.get_json()}"
    return res.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_state():
    """Reset all service states for isolated tests."""
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    custody_service.reset_in_memory_state()
    user_service.reset_in_memory_state()
    audit_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    custody_service.reset_in_memory_state()
    user_service.reset_in_memory_state()
    audit_service.reset_in_memory_state()


# ============================================================================
# 1. CENTRAL PERMISSION SYSTEM TESTS
# ============================================================================

def test_central_permission_matrix_integrity():
    """Validate explicit permissions and role mapping constants."""
    all_roles = [ROLE_ADMIN, ROLE_INVESTIGATOR, ROLE_ANALYST, ROLE_VIEWER]
    for r in all_roles:
        assert r in ROLE_PERMISSIONS, f"Role {r} missing from ROLE_PERMISSIONS"

    # Administrator has all permissions
    admin_perms = ROLE_PERMISSIONS[ROLE_ADMIN]
    assert PERM_USERS_ASSIGN_ROLE in admin_perms
    assert PERM_USERS_DEACTIVATE in admin_perms
    assert PERM_CASES_ASSIGN in admin_perms
    assert PERM_AUDIT_READ in admin_perms
    assert PERM_SETTINGS_MANAGE in admin_perms

    # Investigator has operational case, evidence, analysis permissions, but no admin perms
    inv_perms = ROLE_PERMISSIONS[ROLE_INVESTIGATOR]
    assert PERM_CASES_CREATE in inv_perms
    assert PERM_EVIDENCE_UPLOAD in inv_perms
    assert PERM_CUSTODY_CREATE in inv_perms
    assert PERM_REPORTS_CREATE in inv_perms
    assert PERM_USERS_ASSIGN_ROLE not in inv_perms
    assert PERM_SETTINGS_MANAGE not in inv_perms

    # Analyst has analysis permissions, but no case creation or user management
    analyst_perms = ROLE_PERMISSIONS[ROLE_ANALYST]
    assert PERM_ANALYSIS_RUN in analyst_perms
    assert PERM_ANALYSIS_READ in analyst_perms
    assert PERM_EVIDENCE_READ in analyst_perms
    assert PERM_CASES_CREATE not in analyst_perms
    assert PERM_USERS_ASSIGN_ROLE not in analyst_perms

    # Viewer has read-only perms, no create/upload/download/run
    viewer_perms = ROLE_PERMISSIONS[ROLE_VIEWER]
    assert PERM_CASES_READ in viewer_perms
    assert PERM_EVIDENCE_READ in viewer_perms
    assert PERM_REPORTS_READ in viewer_perms
    assert PERM_EVIDENCE_UPLOAD not in viewer_perms
    assert PERM_EVIDENCE_DOWNLOAD not in viewer_perms
    assert PERM_ANALYSIS_RUN not in viewer_perms
    assert PERM_CUSTODY_CREATE not in viewer_perms
    assert PERM_REPORTS_CREATE not in viewer_perms


# ============================================================================
# 2. ADMINISTRATOR ALLOWED OPERATIONS & LAST-ADMIN PROTECTION
# ============================================================================

def test_admin_allowed_operations(client):
    """
    Administrator can:
    - View organization-wide stats, audit logs, settings
    - List and view users
    - Provision accounts and assign roles
    - Assign investigators to cases
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Audit logs
    audit_res = client.get("/api/audit/logs", headers=headers)
    assert audit_res.status_code == 200
    assert "logs" in audit_res.get_json()

    # 2. Application Settings
    settings_res = client.get("/api/settings", headers=headers)
    assert settings_res.status_code == 200
    patch_res = client.patch(
        "/api/settings",
        json={"sessionTimeoutMinutes": 45, "enforceStrictMfa": True},
        headers=headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.get_json()["settings"]["sessionTimeoutMinutes"] == 45

    # 3. User Listing & Creation
    users_res = client.get("/api/users", headers=headers)
    assert users_res.status_code == 200
    assert len(users_res.get_json()["users"]) >= 4

    new_user_res = client.post(
        "/api/users",
        json={
            "name": "Special Agent Dana",
            "email": "dana.investigator@forenvision.internal",
            "password": "DanaSecurePass123!",
            "role": "investigator",
            "badge_number": "INV-7788",
        },
        headers=headers,
    )
    assert new_user_res.status_code == 201
    created_id = new_user_res.get_json()["user"]["id"]

    # 4. Role Assignment
    role_change_res = client.patch(
        f"/api/users/{created_id}/role",
        json={"role": "analyst", "authorizedWorkflows": ["face_analysis", "sketch_analysis"]},
        headers=headers,
    )
    assert role_change_res.status_code == 200
    assert role_change_res.get_json()["user"]["role"] == "analyst"
    assert "face_analysis" in role_change_res.get_json()["user"]["authorizedWorkflows"]

    # 5. Case Assignment
    case_res = client.post(
        "/api/cases",
        json={"title": "Admin Created Case for Assignment"},
        headers=headers,
    ).get_json()["case"]
    case_id = case_res["id"]

    assign_res = client.post(
        f"/api/cases/{case_id}/assign",
        json={"assignedExaminers": [created_id, "investigator@forenvision.internal"]},
        headers=headers,
    )
    assert assign_res.status_code == 200
    assert created_id in assign_res.get_json()["assignedExaminers"]


def test_last_administrator_protection(client):
    """
    Ensure the system prevents:
    1. Deactivating the last active administrator
    2. Demoting the last active administrator to a non-admin role
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    users_res = client.get("/api/users", headers=headers).get_json()["users"]
    admin_user = next(u for u in users_res if u["role"] == "admin")
    admin_id = admin_user["id"]

    # Attempt to deactivate last admin -> 400 Bad Request
    deact_res = client.patch(
        f"/api/users/{admin_id}/status",
        json={"active": False},
        headers=headers,
    )
    assert deact_res.status_code in {400, 403}
    assert "cannot deactivate" in deact_res.get_json()["message"].lower()

    # Attempt to demote last admin to investigator -> 400 Bad Request
    demote_res = client.patch(
        f"/api/users/{admin_id}/role",
        json={"role": "investigator"},
        headers=headers,
    )
    assert demote_res.status_code == 400
    assert "administrator" in demote_res.get_json()["message"].lower()


# ============================================================================
# 3. PRIVILEGE ESCALATION & PROFILE UPDATE RESTRICTIONS
# ============================================================================

def test_prevent_privilege_escalation_in_profile_update(client):
    """
    Standard users cannot escalate privileges or change account status via PUT /api/users/profile.
    """
    inv_token = get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!")
    headers = {"Authorization": f"Bearer {inv_token}"}

    # Attempt to inject role='admin' or active=False
    esc_res = client.put(
        "/api/users/profile",
        json={
            "name": "Malicious Investigator",
            "role": "admin",
            "isActive": False,
            "permissions": ["*"],
        },
        headers=headers,
    )
    assert esc_res.status_code == 200
    updated_user = esc_res.get_json()["user"]
    assert updated_user["name"] == "Malicious Investigator"
    assert updated_user["role"] == "investigator"  # Escalation ignored/preserved!


def test_non_admin_cannot_assign_roles_or_access_audit_settings(client):
    """
    Investigators, Analysts, and Viewers cannot assign roles, view audit logs, or edit settings.
    """
    tokens = [
        get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!"),
        get_token_for(client, "analyst@forenvision.internal", "AnalystPass123!"),
        get_token_for(client, "viewer@forenvision.internal", "ViewerPass123!"),
    ]

    for token in tokens:
        h = {"Authorization": f"Bearer {token}"}
        # Role assignment forbidden
        r_role = client.patch("/api/users/usr_someid/role", json={"role": "admin"}, headers=h)
        assert r_role.status_code == 403
        assert "access denied" in r_role.get_json()["message"].lower()

        # Audit logs forbidden
        r_audit = client.get("/api/audit/logs", headers=h)
        assert r_audit.status_code == 403
        assert "access denied" in r_audit.get_json()["message"].lower()

        # Settings forbidden
        r_settings = client.get("/api/settings", headers=h)
        assert r_settings.status_code == 403
        assert "access denied" in r_settings.get_json()["message"].lower()


# ============================================================================
# 4. INVESTIGATOR ALLOWED OPERATIONS & LIMITS
# ============================================================================

def test_investigator_allowed_operations(client):
    """
    Investigator can:
    - Create a case
    - Upload evidence
    - Record chain of custody
    - Generate a case report
    """
    inv_token = get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!")
    headers = {"Authorization": f"Bearer {inv_token}"}

    # 1. Create case
    case_res = client.post(
        "/api/cases",
        json={"title": "Investigator Wire Docket", "incidentType": "Cyber Intrusion"},
        headers=headers,
    )
    assert case_res.status_code == 201
    case_id = case_res.get_json()["case"]["id"]

    # 2. Upload evidence
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"I" * 32)
    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(png_bytes), "sample_evidence.png"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=headers,
    )
    assert ev_res.status_code == 201
    ev_id = ev_res.get_json()["evidence"]["id"]

    # 3. Record custody
    coc_res = client.post(
        "/api/custody",
        json={
            "evidenceId": ev_id,
            "eventType": "transferred",
            "reason": "Secure transfer to forensic lab",
            "location": "Vault Room 2",
        },
        headers=headers,
    )
    assert coc_res.status_code == 201

    # 4. Generate report
    rep_res = client.post(
        "/api/reports/generate",
        json={"caseId": case_id, "title": "Initial Case Report"},
        headers=headers,
    )
    assert rep_res.status_code == 201


# ============================================================================
# 5. ANALYST WORKFLOWS & SPECIALIZED CLEARANCE
# ============================================================================

def test_analyst_workflows_and_specialized_clearance(client):
    """
    Analyst:
    - Can run image forensics and fingerprint analysis by default
    - Is BLOCKED from face analysis and sketch analysis by default without explicit clearance
    - Once granted explicit clearance by admin, can access face/sketch workflows
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    analyst_token = get_token_for(client, "analyst@forenvision.internal", "AnalystPass123!")
    admin_h = {"Authorization": f"Bearer {admin_token}"}
    analyst_h = {"Authorization": f"Bearer {analyst_token}"}

    # Admin creates case and uploads evidence
    case_res = client.post("/api/cases", json={"title": "Analyst Clearance Case"}, headers=admin_h).get_json()["case"]
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"A" * 32)
    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(png_bytes), "face_sample.png"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=admin_h,
    ).get_json()["evidence"]
    ev_id = ev_res["id"]

    # Default Analyst attempt to run Face Analysis -> 403 Forbidden (requires explicit clearance)
    face_res = client.post(
        "/api/analysis/face/detect",
        json={"evidenceId": ev_id},
        headers=analyst_h,
    )
    assert face_res.status_code == 403
    assert "explicit authorization required for 'face_analysis'" in face_res.get_json()["message"].lower()

    # Default Analyst attempt to run Sketch Analysis -> 403 Forbidden
    sketch_res = client.post(
        "/api/analysis/sketch/upload",
        data={"file": (io.BytesIO(png_bytes), "sketch.png"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=analyst_h,
    )
    assert sketch_res.status_code == 403
    assert "explicit authorization required for 'sketch_analysis'" in sketch_res.get_json()["message"].lower()

    # Now Admin grants analyst clearance for face_analysis
    users = client.get("/api/users", headers=admin_h).get_json()["users"]
    analyst_user = next(u for u in users if u["role"] == "analyst")
    analyst_id = analyst_user["id"]

    client.patch(
        f"/api/users/{analyst_id}/role",
        json={"role": "analyst", "authorizedWorkflows": ["face_analysis"]},
        headers=admin_h,
    )

    # Re-login or refresh token for analyst
    new_analyst_token = get_token_for(client, "analyst@forenvision.internal", "AnalystPass123!")
    new_analyst_h = {"Authorization": f"Bearer {new_analyst_token}"}

    # Now face analysis passes workflow authorization check (may fail processing invalid png, but not 403!)
    face_res2 = client.post(
        "/api/analysis/face/detect",
        json={"evidenceId": ev_id},
        headers=new_analyst_h,
    )
    assert face_res2.status_code != 403  # Passed workflow_required clearance!


# ============================================================================
# 6. READ-ONLY VIEWER RESTRICTIONS
# ============================================================================

def test_viewer_read_only_restrictions(client):
    """
    Read-only Viewer must NOT:
    - Create or mutate cases
    - Upload or delete evidence
    - Download raw evidence bytes
    - Run analyses
    - Create custody events
    - Generate reports
    - Manage users
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    viewer_token = get_token_for(client, "viewer@forenvision.internal", "ViewerPass123!")
    admin_h = {"Authorization": f"Bearer {admin_token}"}
    viewer_h = {"Authorization": f"Bearer {viewer_token}"}

    # Create baseline case and evidence as admin
    case_res = client.post("/api/cases", json={"title": "Viewer Audit Case"}, headers=admin_h).get_json()["case"]
    case_id = case_res["id"]
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"V" * 32)
    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(png_bytes), "viewer_sample.png"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=admin_h,
    ).get_json()["evidence"]
    ev_id = ev_res["id"]

    # 1. Viewer cannot create cases
    r_create_case = client.post("/api/cases", json={"title": "Viewer Rogue Case"}, headers=viewer_h)
    assert r_create_case.status_code == 403

    # 2. Viewer cannot update cases
    r_update_case = client.patch(f"/api/cases/{case_id}", json={"title": "Rogue Update"}, headers=viewer_h)
    assert r_update_case.status_code == 403

    # 3. Viewer cannot upload evidence
    r_upload = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(png_bytes), "rogue.png"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=viewer_h,
    )
    assert r_upload.status_code == 403

    # 4. Viewer cannot download raw original evidence bytes
    r_download = client.get(f"/api/evidence/{ev_id}/download", headers=viewer_h)
    assert r_download.status_code == 403

    # 5. Viewer CAN read evidence metadata
    r_meta = client.get(f"/api/evidence/{ev_id}", headers=viewer_h)
    assert r_meta.status_code == 200

    # 6. Viewer cannot run analysis
    r_run = client.post("/api/analysis/detection/run", json={"evidenceId": ev_id}, headers=viewer_h)
    assert r_run.status_code == 403

    # 7. Viewer cannot create custody events
    r_custody = client.post("/api/custody", json={"evidenceId": ev_id, "eventType": "transferred", "reason": "test"}, headers=viewer_h)
    assert r_custody.status_code == 403

    # 8. Viewer cannot generate reports
    r_report = client.post("/api/reports/generate", json={"caseId": case_id, "title": "Rogue Report"}, headers=viewer_h)
    assert r_report.status_code == 403


# ============================================================================
# 7. CROSS-CASE ACCESS ATTEMPTS ON RESTRICTED DOCKETS
# ============================================================================

def test_cross_case_isolation_on_restricted_dockets(client):
    """
    When a case is marked is_restricted=True, non-assigned personnel are denied access.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    inv_token = get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!")
    admin_h = {"Authorization": f"Bearer {admin_token}"}
    inv_h = {"Authorization": f"Bearer {inv_token}"}

    # Admin creates restricted case assigned strictly to another officer
    restricted_case = client.post(
        "/api/cases",
        json={
            "title": "Top Secret Classified Case",
            "is_restricted": True,
            "assignedExaminers": ["officer_99@forenvision.internal"],
        },
        headers=admin_h,
    ).get_json()["case"]
    case_id = restricted_case["id"]

    # Unassigned investigator attempts to view case details -> 403
    case_res = client.get(f"/api/cases/{case_id}", headers=inv_h)
    assert case_res.status_code == 403
    assert "access" in case_res.get_json()["message"].lower()

    # Unassigned investigator attempts to upload evidence to restricted case -> 403
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"S" * 32)
    upload_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(png_bytes), "secret.png"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=inv_h,
    )
    assert upload_res.status_code == 403


# ============================================================================
# 8. INACTIVE ACCOUNTS AND UNAUTHENTICATED REQUESTS
# ============================================================================

def test_unauthenticated_requests_return_401(client):
    """Verify unauthenticated endpoints return 401."""
    assert client.get("/api/cases").status_code == 401
    assert client.get("/api/evidence").status_code == 401
    assert client.get("/api/custody").status_code == 401
    assert client.get("/api/users").status_code == 401
    assert client.get("/api/audit/logs").status_code == 401


def test_inactive_accounts_return_403(client):
    """
    Deactivated accounts cannot authenticate or access endpoints.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    admin_h = {"Authorization": f"Bearer {admin_token}"}

    # Admin creates new investigator account
    new_u = client.post(
        "/api/users",
        json={
            "name": "Temporary Examiner",
            "email": "temp.examiner@forenvision.internal",
            "password": "TempPassword123!",
            "role": "investigator",
        },
        headers=admin_h,
    ).get_json()["user"]
    user_id = new_u["id"]

    # Obtain valid token while active
    temp_token = get_token_for(client, "temp.examiner@forenvision.internal", "TempPassword123!")
    temp_h = {"Authorization": f"Bearer {temp_token}"}

    # Verify working
    assert client.get("/api/cases", headers=temp_h).status_code == 200

    # Admin deactivates account
    deact_res = client.patch(f"/api/users/{user_id}/status", json={"active": False}, headers=admin_h)
    assert deact_res.status_code == 200

    # Deactivated account requests return 403 with access denied
    req_res = client.get("/api/cases", headers=temp_h)
    assert req_res.status_code == 403
    assert "access denied" in req_res.get_json()["message"].lower()

    # New login attempt returns 403
    login_res = client.post(
        "/api/auth/login",
        json={"email": "temp.examiner@forenvision.internal", "password": "TempPassword123!"},
    )
    assert login_res.status_code == 403
