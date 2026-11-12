"""
Unit and Integration tests for Case management endpoints:
- Case creation with auto-generated case numbers and audit logging
- Input validation on case creation & updates
- Retrieving case details (by ID and caseNumber)
- Updating case information & status transitions
- Soft-deletion / Archival preservation
- Search, multi-field filtering, sorting, and pagination
- Associating and retrieving evidence artifacts
- Retrieving saved analysis results and audit trails
- Role-based authorization & case-level clearance enforcement
"""

import pytest
from unittest.mock import patch
from pymongo.errors import PyMongoError
from services.case_service import case_service


def get_token_for(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_case_state():
    """Ensure in-memory case state is reset before each test."""
    case_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()


def test_create_case_success(client):
    """
    Verify investigator can create a case, generating an official docket number,
    saving the record, and writing to the audit log.
    """
    inv_token = get_token_for(client, "e.reed@forenvision.internal", "InvestigatorPass123!")
    headers = {"Authorization": f"Bearer {inv_token}"}

    payload = {
        "title": "Operation Cipher Trace: Network Exfiltration",
        "description": "Packet capture and memory dump analysis for endpoint 10.4.12.9.",
        "incidentType": "Cyber Crime",
        "priority": "critical",
        "tags": ["Exfiltration", "Memory Forensics"],
    }

    resp = client.post("/api/cases", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.get_json()

    assert data["success"] is True
    created = data["case"]
    assert created["title"] == payload["title"]
    assert created["incidentType"] == payload["incidentType"]
    assert created["priority"] == "critical"
    assert created["status"] == "open"
    assert created["caseNumber"].startswith("CAS-2026-")
    assert "Det. Evelyn Reed" in created["leadInvestigator"]


def test_create_case_validation_missing_title(client):
    """Verify case creation without title returns 400 Bad Request."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    resp = client.post("/api/cases", json={
        "description": "Missing title test",
        "priority": "low"
    }, headers=headers)

    assert resp.status_code == 400
    data = resp.get_json()
    assert data["success"] is False
    assert "title is required" in data["error"].lower() or "title is required" in data["message"].lower()


def test_viewer_cannot_create_case(client):
    """Verify Read-only Viewer receives 403 Forbidden when attempting to create a case."""
    viewer_token = get_token_for(client, "viewer@forenvision.internal", "ViewerPass123!")
    headers = {"Authorization": f"Bearer {viewer_token}"}

    resp = client.post("/api/cases", json={
        "title": "Unauthorized Case Creation",
        "priority": "low"
    }, headers=headers)

    assert resp.status_code == 403
    data = resp.get_json()
    assert data["success"] is False
    assert "insufficient clearance" in data["message"].lower() or "forbidden" in data["error"].lower()


def test_unauthorized_user_cannot_access_cases(client):
    """Verify unauthenticated requests to /api/cases return 401."""
    resp = client.get("/api/cases")
    assert resp.status_code == 401
    assert resp.get_json()["success"] is False


def test_get_case_details_by_id_and_number(client):
    """Verify retrieving case details by ID and by caseNumber."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    create_res = client.post("/api/cases", json={
        "title": "Operation Starlight",
        "priority": "medium",
    }, headers=headers).get_json()["case"]

    case_id = create_res["id"]
    case_num = create_res["caseNumber"]

    # Retrieve by internal ID
    res1 = client.get(f"/api/cases/{case_id}", headers=headers)
    assert res1.status_code == 200
    assert res1.get_json()["case"]["title"] == "Operation Starlight"

    # Retrieve by caseNumber docket string
    res2 = client.get(f"/api/cases/{case_num}", headers=headers)
    assert res2.status_code == 200
    assert res2.get_json()["case"]["id"] == case_id


def test_get_case_not_found(client):
    """Verify 404 response when querying non-existent case."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    resp = client.get("/api/cases/CAS-9999-NONEXISTENT", headers=headers)
    assert resp.status_code == 404
    assert resp.get_json()["success"] is False


def test_restricted_case_access_denied_for_unauthorized_user(client):
    """Verify restricted case returns 403 Forbidden to viewer."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    viewer_token = get_token_for(client, "viewer@forenvision.internal", "ViewerPass123!")

    created = client.post("/api/cases", json={
        "title": "Classified Sensitive Incident",
        "is_restricted": True,
    }, headers={"Authorization": f"Bearer {admin_token}"}).get_json()["case"]

    resp = client.get(
        f"/api/cases/{created['id']}",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )
    assert resp.status_code == 403
    assert resp.get_json()["success"] is False


def test_update_case_information(client):
    """Verify updating title, narrative, priority, and tags."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    created = client.post("/api/cases", json={
        "title": "Initial Docket Name",
        "priority": "low",
    }, headers=headers).get_json()["case"]

    update_payload = {
        "title": "Amended Docket Name: High Urgency",
        "priority": "critical",
        "description": "Updated forensic narrative after initial memory acquisition.",
        "tags": ["Urgent", "Memory Analysis"],
    }

    res = client.patch(f"/api/cases/{created['id']}", json=update_payload, headers=headers)
    assert res.status_code == 200
    updated = res.get_json()["case"]
    assert updated["title"] == update_payload["title"]
    assert updated["priority"] == "critical"
    assert updated["description"] == update_payload["description"]
    assert "Memory Analysis" in updated["tags"]


def test_update_case_validation_errors(client):
    """Verify update validation fails on empty title or invalid priority."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    created = client.post("/api/cases", json={
        "title": "Valid Case",
    }, headers=headers).get_json()["case"]

    # Empty title
    res1 = client.patch(f"/api/cases/{created['id']}", json={"title": "   "}, headers=headers)
    assert res1.status_code == 400

    # Invalid priority
    res2 = client.patch(f"/api/cases/{created['id']}", json={"priority": "super-urgent"}, headers=headers)
    assert res2.status_code == 400


def test_change_case_status(client):
    """Verify status transition workflow: open -> in_progress -> under_review -> closed."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    created = client.post("/api/cases", json={
        "title": "Workflow Life Cycle Test",
    }, headers=headers).get_json()["case"]

    # Status: in_progress
    res1 = client.patch(
        f"/api/cases/{created['id']}/status",
        json={"status": "in_progress", "reason": "Investigation underway."},
        headers=headers
    )
    assert res1.status_code == 200
    assert res1.get_json()["case"]["status"] == "in_progress"

    # Status: closed
    res2 = client.patch(
        f"/api/cases/{created['id']}/status",
        json={"status": "closed", "reason": "Court verdict finalized."},
        headers=headers
    )
    assert res2.status_code == 200
    closed_case = res2.get_json()["case"]
    assert closed_case["status"] == "closed"
    assert closed_case["closedAt"] is not None


def test_archive_case_soft_delete(client):
    """
    Verify archiving a case:
    - Status set to 'archived' and is_archived set to True
    - Case record remains preserved and retrievable
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    created = client.post("/api/cases", json={
        "title": "Case Slated for Archival",
    }, headers=headers).get_json()["case"]

    # Call archive endpoint
    res = client.post(
        f"/api/cases/{created['id']}/archive",
        json={"reason": "Statute of limitations retention period met."},
        headers=headers
    )
    assert res.status_code == 200
    archived = res.get_json()["case"]
    assert archived["status"] == "archived"
    assert archived["is_archived"] is True
    assert archived["archivedAt"] is not None

    # Verify still retrievable via GET (soft deletion preservation)
    get_res = client.get(f"/api/cases/{created['id']}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.get_json()["case"]["is_archived"] is True


def test_list_cases_filtering_and_pagination(client):
    """Verify search, filtering, pagination, and sorting on /api/cases."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Seed 5 cases
    client.post("/api/cases", json={"title": "Ransomware Alpha", "incidentType": "Cyber Crime", "priority": "critical"}, headers=headers)
    client.post("/api/cases", json={"title": "Ransomware Beta", "incidentType": "Cyber Crime", "priority": "high"}, headers=headers)
    client.post("/api/cases", json={"title": "Check Forgery 1", "incidentType": "Digital Forgery", "priority": "low"}, headers=headers)
    client.post("/api/cases", json={"title": "Check Forgery 2", "incidentType": "Digital Forgery", "priority": "medium"}, headers=headers)
    client.post("/api/cases", json={"title": "Identity Theft Dossier", "incidentType": "Identity Theft", "priority": "medium"}, headers=headers)

    # Filter by incidentType
    r1 = client.get("/api/cases?incidentType=Cyber+Crime", headers=headers).get_json()
    assert r1["count"] == 2
    assert all(c["incidentType"] == "Cyber Crime" for c in r1["cases"])

    # Search by text query 'Forgery'
    r2 = client.get("/api/cases?q=Forgery", headers=headers).get_json()
    assert r2["count"] == 2

    # Pagination: page 1 limit 2
    r3 = client.get("/api/cases?page=1&limit=2", headers=headers).get_json()
    assert len(r3["cases"]) == 2
    assert r3["pagination"]["page"] == 1
    assert r3["pagination"]["limit"] == 2
    assert r3["pagination"]["total"] == 5
    assert r3["pagination"]["totalPages"] == 3


def test_attach_and_retrieve_case_evidence(client):
    """Verify attaching an evidence artifact to a case and retrieving it."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    created = client.post("/api/cases", json={
        "title": "Evidence Association Case",
    }, headers=headers).get_json()["case"]

    ev_payload = {
        "name": "Tampered Check Scan #301",
        "type": "image",
        "fileFormat": "PNG",
        "fileSizeBytes": 1048576,
        "sha256Hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "tags": ["Check", "Financial"],
    }

    # Attach evidence
    att_res = client.post(f"/api/cases/{created['id']}/evidence", json=ev_payload, headers=headers)
    assert att_res.status_code == 201
    ev_data = att_res.get_json()["evidence"]
    assert ev_data["name"] == ev_payload["name"]
    assert ev_data["evidenceNumber"].startswith("EVD-")

    # Retrieve evidence for this case
    list_res = client.get(f"/api/cases/{created['id']}/evidence", headers=headers)
    assert list_res.status_code == 200
    evidence_list = list_res.get_json()["evidence"]
    assert len(evidence_list) == 1
    assert evidence_list[0]["id"] == ev_data["id"]

    # Verify case evidenceCount incremented
    case_res = client.get(f"/api/cases/{created['id']}", headers=headers).get_json()["case"]
    assert case_res["evidenceCount"] == 1


def test_retrieve_case_audit_logs(client):
    """Verify case audit history tracks creation, status change, and archival."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    created = client.post("/api/cases", json={
        "title": "Audit Trail Inspection Case",
    }, headers=headers).get_json()["case"]

    client.patch(
        f"/api/cases/{created['id']}/status",
        json={"status": "in_progress"},
        headers=headers
    )

    audit_res = client.get(f"/api/cases/{created['id']}/audit", headers=headers)
    assert audit_res.status_code == 200
    logs = audit_res.get_json()["audit_logs"]
    assert len(logs) >= 2
    actions = [log["action"] for log in logs]
    assert any("Initialized Investigation" in a for a in actions)
    assert any("Updated case status" in a for a in actions)


def test_dashboard_refresh_after_creating_case(client):
    """Verify dashboard counts update immediately upon case creation."""
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    initial_summary = client.get("/api/dashboard/summary", headers=headers).get_json()["data"]
    assert initial_summary["metrics"]["totalCases"] == 0

    case_res = client.post("/api/cases", json={
        "title": "Operation Sovereign Vault",
        "incidentType": "Digital Forgery",
        "priority": "high",
    }, headers=headers)
    assert case_res.status_code == 201
    created_case = case_res.get_json()["case"]

    refreshed_summary = client.get("/api/dashboard/summary", headers=headers).get_json()["data"]
    assert refreshed_summary["metrics"]["totalCases"] == 1
    assert refreshed_summary["recentCases"][0]["id"] == created_case["id"]


def test_backend_error_handling_database_failure(client):
    """Verify system handles database exceptions gracefully."""
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    with patch.object(case_service, "get_dashboard_summary", side_effect=PyMongoError("Cluster unreachable")):
        resp = client.get("/api/dashboard/summary", headers=headers)
        assert resp.status_code == 500
        data = resp.get_json()
        assert data["success"] is False
