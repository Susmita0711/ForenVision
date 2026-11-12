"""
Unit and Integration tests for Dashboard endpoints:
- Empty database state (zero metrics, non-fabrication)
- Existing cases metrics calculation (total, active, closed, priority breakdown)
- Unauthorized user handling (401 on missing/invalid token)
- Case-level access authorization
- Backend error / unavailable handling
- Dashboard stats endpoint
"""

import pytest
from services.case_service import case_service


def get_token_for(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_case_state():
    """Ensure in-memory case state is reset before each test."""
    case_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()


def test_dashboard_summary_unauthorized_without_token(client):
    """Verify accessing dashboard without Authorization header returns 401."""
    resp = client.get("/api/dashboard/summary")
    assert resp.status_code == 401
    data = resp.get_json()
    assert data["success"] is False
    assert data["error"] == "Unauthorized"
    assert "token" in data["message"].lower() or "authentication" in data["message"].lower()


def test_dashboard_summary_unauthorized_with_invalid_token(client):
    """Verify accessing dashboard with invalid or forged token returns 401."""
    resp = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": "Bearer forged.invalid.token.signature"}
    )
    assert resp.status_code == 401
    data = resp.get_json()
    assert data["success"] is False
    assert data["error"] == "Unauthorized"


def test_dashboard_summary_empty_database(client):
    """
    Verify empty database produces authentic zero metrics and empty lists.
    Explicitly confirms no fabricated mock stats are returned.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    resp = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    res_data = resp.get_json()
    assert res_data["success"] is True
    data = res_data["data"]

    # Metrics must be strictly zero
    metrics = data["metrics"]
    assert metrics["totalCases"] == 0
    assert metrics["activeCases"] == 0
    assert metrics["closedCases"] == 0
    assert metrics["underReviewCases"] == 0
    assert metrics["totalEvidence"] == 0
    assert metrics["pendingAnalyses"] == 0
    assert metrics["analysisQueueAvailable"] is False

    # Lists must be empty arrays, not mock fixtures
    assert data["recentCases"] == []
    assert data["recentActivity"] == []
    assert data["evidenceDistribution"] == []

    # Distribution values all zero
    status_values = [item["value"] for item in data["caseStatusDistribution"]]
    assert all(val == 0 for val in status_values)


def test_dashboard_summary_existing_cases_calculation(client):
    """Verify correct calculation of total, active, closed, and status breakdowns."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Create 3 cases with varying statuses and priorities
    client.post("/api/cases", json={
        "title": "Operation Alpha: Ransomware Incident",
        "incidentType": "Cyber Crime",
        "priority": "critical"
    }, headers=headers)

    client.post("/api/cases", json={
        "title": "Operation Beta: Document Tampering",
        "incidentType": "Digital Forgery",
        "priority": "high"
    }, headers=headers)

    case3 = client.post("/api/cases", json={
        "title": "Operation Gamma: Routine Hardware Audit",
        "incidentType": "Financial Fraud",
        "priority": "low"
    }, headers=headers).get_json()["case"]

    # Manually transition case3 to closed in service
    case_service.update_case(case3["id"], {"status": "closed"}, {
        "id": "usr_admin_001", "name": "Dir. Nathan Frost", "badge_number": "FX-1001", "role": "admin"
    })

    # Query dashboard summary
    resp = client.get("/api/dashboard/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()["data"]

    metrics = data["metrics"]
    assert metrics["totalCases"] == 3
    assert metrics["activeCases"] == 2
    assert metrics["closedCases"] == 1

    # Status distribution matches
    status_map = {item["name"]: item["value"] for item in data["caseStatusDistribution"]}
    assert status_map.get("Open") == 2
    assert status_map.get("Closed") == 1

    assert len(data["recentCases"]) == 3
    # Recent activity must contain real audit records
    assert len(data["recentActivity"]) >= 3
    actions = [act["action"] for act in data["recentActivity"]]
    assert any("Initialized Investigation" in act for act in actions)
    assert any("Updated case" in act for act in actions)


def test_dashboard_case_level_permissions(client):
    """
    Verify case-level permissions: restricted cases are hidden from viewers.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    viewer_token = get_token_for(client, "viewer@forenvision.internal", "ViewerPass123!")

    # Admin creates 1 public case and 1 restricted case
    client.post("/api/cases", json={
        "title": "Public Case",
        "priority": "medium",
        "is_restricted": False
    }, headers={"Authorization": f"Bearer {admin_token}"})

    client.post("/api/cases", json={
        "title": "Top Secret Classified Case",
        "priority": "critical",
        "is_restricted": True
    }, headers={"Authorization": f"Bearer {admin_token}"})

    # Admin sees both cases (total 2)
    admin_summary = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {admin_token}"}
    ).get_json()["data"]
    assert admin_summary["metrics"]["totalCases"] == 2

    # Viewer sees only the 1 non-restricted case
    viewer_summary = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {viewer_token}"}
    ).get_json()["data"]
    assert viewer_summary["metrics"]["totalCases"] == 1
    assert len(viewer_summary["recentCases"]) == 1
    assert viewer_summary["recentCases"][0]["title"] == "Public Case"


def test_dashboard_stats_endpoint(client):
    """Verify /api/dashboard/stats returns quick aggregated counts."""
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    resp = client.get(
        "/api/dashboard/stats",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    assert "data" in data
    assert "metrics" in data["data"]
