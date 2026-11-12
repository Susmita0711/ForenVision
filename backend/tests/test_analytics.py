"""
Unit and Integration tests for Forensic Analytics & Operations Intelligence Module:
- Aggregation accuracy across cases, evidence, analysis jobs, processing times, and reports.
- Date range filtering (presets 7d, 30d, 90d, 1y, all and custom ISO ranges).
- Permissions and confidentiality: Case RBAC isolation and workload visibility boundaries.
- Empty datasets: Validates zero fabrication of mock/random numbers.
- Scientific invariant: Model confidence is separated from forensic accuracy.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone, timedelta
from pathlib import Path
import pytest

from services.case_service import case_service
from services.evidence_service import evidence_service
from services.custody_service import custody_service
from services.image_forensics_service import image_forensics_service
from services.object_detection_service import object_detection_service
from services.fingerprint_service import fingerprint_service
from services.face_analysis_service import face_analysis_service
from services.sketch_service import sketch_service
from services.report_service import report_service
from services.analytics_service import analytics_service


def get_token_for(client, email: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_system_state():
    """Reset all state caches across services before and after each test."""
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    custody_service.reset_in_memory_state()
    image_forensics_service.reset_in_memory_state()
    object_detection_service.reset_in_memory_state()
    fingerprint_service.reset_in_memory_state()
    face_analysis_service.reset_in_memory_state()
    sketch_service.reset_in_memory_state()
    report_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    custody_service.reset_in_memory_state()
    image_forensics_service.reset_in_memory_state()
    object_detection_service.reset_in_memory_state()
    fingerprint_service.reset_in_memory_state()
    face_analysis_service.reset_in_memory_state()
    sketch_service.reset_in_memory_state()
    report_service.reset_in_memory_state()


def test_empty_datasets_and_zero_fabrication(client):
    """
    Verify that an empty database returns explicit empty structures (zeros and empty lists)
    without fabricating mock telemetry or random statistics.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/analytics/overview?range=all", headers=headers)
    assert res.status_code == 200
    data = res.get_json()["data"]

    # Verify zero fabrication
    assert data["casesByStatus"] == []
    assert data["casesOverTime"] == []
    assert data["totalCasesInRange"] == 0

    assert data["evidenceByType"] == []
    assert data["evidenceIngestionOverTime"] == []
    assert data["totalEvidenceInRange"] == 0

    assert data["analysisJobsByStatus"] == []
    assert data["totalAnalysesInRange"] == 0

    proc = data["processingTimes"]
    assert proc["available"] is False
    assert proc["overallAvgMs"] == 0.0
    assert proc["totalJobsMeasured"] == 0
    assert proc["byModule"] == []

    assert data["reportGeneration"]["totalReports"] == 0
    assert data["reportGeneration"]["byClassification"] == []
    assert data["reportGeneration"]["overTime"] == []

    # Verify metric definitions
    assert "metricDefinitions" in data
    defs = data["metricDefinitions"]
    assert "casesByStatus" in defs
    assert "forensicAccuracyNotice" in defs
    assert "FRE 702" in defs["forensicAccuracyNotice"] or "OSAC" in defs["forensicAccuracyNotice"]


def test_aggregation_accuracy_across_all_metrics(client):
    """
    Test accuracy of database-backed aggregations across:
    - Cases by status (Active, Closed, Under Review)
    - Evidence by type (Image, Document, Video)
    - Analysis jobs and processing times (measured in milliseconds)
    - Report generation activity
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create cases with distinct statuses
    case1 = client.post("/api/cases", json={
        "title": "Case Alpha",
        "incidentType": "Digital Forgery",
        "priority": "high",
    }, headers=headers).get_json()["case"]

    case2 = client.post("/api/cases", json={
        "title": "Case Beta",
        "incidentType": "Securities Fraud",
        "priority": "medium",
    }, headers=headers).get_json()["case"]

    case3 = client.post("/api/cases", json={
        "title": "Case Gamma",
        "incidentType": "Cyber Intrusion",
        "priority": "low",
    }, headers=headers).get_json()["case"]

    # Update case statuses
    client.patch(f"/api/cases/{case2['id']}", json={"status": "under_review"}, headers=headers)
    client.patch(f"/api/cases/{case3['id']}", json={"status": "closed"}, headers=headers)

    # 2. Upload evidence with distinct types
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"\x00" * 32)
    client.post("/api/evidence/upload", data={
        "file": (io.BytesIO(png_bytes), "evidence1.png"),
        "caseId": case1["id"],
        "type": "image",
    }, content_type="multipart/form-data", headers=headers)

    client.post("/api/evidence/upload", data={
        "file": (io.BytesIO(png_bytes), "evidence2.png"),
        "caseId": case1["id"],
        "type": "image",
    }, content_type="multipart/form-data", headers=headers)

    # In-memory document insertion for multi-type testing
    evidence_service._memory_evidence["doc-ev-001"] = {
        "id": "doc-ev-001",
        "caseId": case2["id"],
        "caseNumber": case2["caseNumber"],
        "originalFileName": "contract_ledger.pdf",
        "name": "contract_ledger.pdf",
        "type": "document",
        "detectedMediaType": "application/pdf",
        "fileSizeBytes": 102400,
        "sha256Hash": "a" * 64,
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
        "integrityStatus": "verified",
    }

    # 3. Insert real analysis records with processing times in ms
    now_iso = datetime.now(timezone.utc).isoformat()
    image_forensics_service._memory_analysis_records["ela-001"] = {
        "analysisId": "ela-001",
        "caseId": case1["id"],
        "category": "image_forensics",
        "status": "completed",
        "processingTimeMs": 120.0,
        "timestamp": now_iso,
    }

    object_detection_service._memory_analysis_records["yolo-001"] = {
        "analysisId": "yolo-001",
        "caseId": case1["id"],
        "category": "object_detection",
        "status": "completed",
        "processingTimeMs": 45.0,
        "timestamp": now_iso,
    }

    fingerprint_service._memory_analysis_records["fp-001"] = {
        "analysisId": "fp-001",
        "caseId": case2["id"],
        "category": "fingerprint_minutiae",
        "status": "completed",
        "processingTimeMs": 85.0,
        "timestamp": now_iso,
    }

    # 4. Generate a report
    gen_res = client.post("/api/reports/generate", json={
        "caseId": case1["id"],
        "title": "Comprehensive Dossier Alpha",
        "classification": "OFFICIAL COURT EXHIBIT",
    }, headers=headers)
    assert gen_res.status_code == 201

    # 5. Query analytics overview
    res = client.get("/api/analytics/overview?range=all", headers=headers)
    assert res.status_code == 200
    data = res.get_json()["data"]

    # Verify Cases by Status
    status_map = {item["status"]: item["count"] for item in data["casesByStatus"]}
    assert status_map.get("ACTIVE", 0) >= 1 or status_map.get("OPEN", 0) >= 1
    assert status_map.get("UNDER_REVIEW", 0) == 1
    assert status_map.get("CLOSED", 0) == 1
    assert data["totalCasesInRange"] == 3

    # Verify Cases Over Time
    assert len(data["casesOverTime"]) >= 1
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    assert any(entry["date"] == today_str for entry in data["casesOverTime"])

    # Verify Evidence by Type
    type_map = {item["type"]: item["count"] for item in data["evidenceByType"]}
    assert type_map.get("image", 0) == 2
    assert type_map.get("document", 0) == 1
    assert data["totalEvidenceInRange"] == 3

    # Verify Analysis Jobs
    job_status_map = {item["status"]: item["count"] for item in data["analysisJobsByStatus"]}
    assert job_status_map.get("completed", 0) == 3

    # Verify Processing Times
    proc = data["processingTimes"]
    assert proc["available"] is True
    assert proc["totalJobsMeasured"] == 3
    expected_avg = round((120.0 + 45.0 + 85.0) / 3, 2)  # 83.33 ms
    assert proc["overallAvgMs"] == expected_avg
    assert proc["overallMinMs"] == 45.0
    assert proc["overallMaxMs"] == 120.0
    assert len(proc["byModule"]) == 3

    # Verify Reports Activity
    assert data["reportGeneration"]["totalReports"] == 1
    assert data["reportGeneration"]["byClassification"][0]["classification"] == "OFFICIAL COURT EXHIBIT"
    assert data["reportGeneration"]["byClassification"][0]["count"] == 1


def test_date_range_filters(client):
    """
    Test filtering by preset intervals (7d, 30d, 90d, 1y) and custom ISO ranges.
    Verifies older records are excluded when a narrower window is specified.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    now = datetime.now(timezone.utc)
    t_recent = (now - timedelta(days=2)).isoformat()
    t_mid = (now - timedelta(days=20)).isoformat()
    t_old = (now - timedelta(days=60)).isoformat()

    # Create cases with historical creation dates directly in memory
    case_service._memory_cases["c-recent"] = {
        "id": "c-recent",
        "caseNumber": "CAS-2026-REC",
        "title": "Recent Intake",
        "status": "ACTIVE",
        "createdAt": t_recent,
        "is_restricted": False,
        "assignedExaminers": [],
    }

    case_service._memory_cases["c-mid"] = {
        "id": "c-mid",
        "caseNumber": "CAS-2026-MID",
        "title": "Mid-range Intake",
        "status": "UNDER_REVIEW",
        "createdAt": t_mid,
        "is_restricted": False,
        "assignedExaminers": [],
    }

    case_service._memory_cases["c-old"] = {
        "id": "c-old",
        "caseNumber": "CAS-2026-OLD",
        "title": "Old Intake",
        "status": "CLOSED",
        "createdAt": t_old,
        "is_restricted": False,
        "assignedExaminers": [],
    }

    # 1. Preset 7d: should only include recent (1 case)
    res_7d = client.get("/api/analytics/overview?range=7d", headers=headers)
    assert res_7d.status_code == 200
    data_7d = res_7d.get_json()["data"]
    assert data_7d["totalCasesInRange"] == 1
    assert data_7d["casesByStatus"][0]["status"] == "ACTIVE"

    # 2. Preset 30d: should include recent + mid (2 cases)
    res_30d = client.get("/api/analytics/overview?range=30d", headers=headers)
    assert res_30d.status_code == 200
    data_30d = res_30d.get_json()["data"]
    assert data_30d["totalCasesInRange"] == 2

    # 3. Preset all: should include all 3 cases
    res_all = client.get("/api/analytics/overview?range=all", headers=headers)
    assert res_all.status_code == 200
    data_all = res_all.get_json()["data"]
    assert data_all["totalCasesInRange"] == 3

    # 4. Custom date range: e.g. covering only the mid period
    start_mid_iso = (now - timedelta(days=25)).strftime("%Y-%m-%d")
    end_mid_iso = (now - timedelta(days=15)).strftime("%Y-%m-%d")
    res_custom = client.get(f"/api/analytics/overview?startDate={start_mid_iso}&endDate={end_mid_iso}", headers=headers)
    assert res_custom.status_code == 200
    data_custom = res_custom.get_json()["data"]
    assert data_custom["totalCasesInRange"] == 1
    assert data_custom["casesByStatus"][0]["status"] == "UNDER_REVIEW"


def test_permissions_and_case_confidentiality(client):
    """
    Test RBAC and confidentiality controls:
    - Unauthenticated requests receive 401.
    - Restricted case isolation: Unassigned investigators cannot see restricted case counts.
    - Investigator workload visibility:
      - Admins can view agency-wide workload.
      - Standard examiners receive ONLY their personal workload.
      - Case titles of restricted dockets are never exposed.
    """
    # 1. Unauthenticated checks (401)
    res_unauth = client.get("/api/analytics/overview")
    assert res_unauth.status_code == 401

    res_workload_unauth = client.get("/api/analytics/workload")
    assert res_workload_unauth.status_code == 401

    res_defs_unauth = client.get("/api/analytics/definitions")
    assert res_defs_unauth.status_code == 401

    # 2. Case Confidentiality
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    investigator_token = get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!")

    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    inv_headers = {"Authorization": f"Bearer {investigator_token}"}

    # Admin creates a restricted case assigned strictly to analyst only
    client.post("/api/cases", json={
        "title": "Classified Operational Docket 99",
        "incidentType": "Special Inquiry",
        "is_restricted": True,
        "assignedExaminers": ["user-analyst-001"],
    }, headers=admin_headers)

    # Admin creates an open unrestricted case
    client.post("/api/cases", json={
        "title": "Public Wire Fraud Case",
        "incidentType": "Financial Fraud",
        "is_restricted": False,
    }, headers=admin_headers)

    # Admin queries analytics -> sees both cases
    admin_res = client.get("/api/analytics/overview?range=all", headers=admin_headers)
    assert admin_res.status_code == 200
    assert admin_res.get_json()["data"]["totalCasesInRange"] == 2

    # Investigator queries analytics -> sees ONLY the open case (restricted excluded)
    inv_res = client.get("/api/analytics/overview?range=all", headers=inv_headers)
    assert inv_res.status_code == 200
    inv_data = inv_res.get_json()["data"]
    assert inv_data["totalCasesInRange"] == 1

    # 3. Investigator Workload Visibility Boundaries
    admin_workload_res = client.get("/api/analytics/workload", headers=admin_headers)
    assert admin_workload_res.status_code == 200
    admin_workload = admin_workload_res.get_json()["data"]
    assert admin_workload["isAuthorized"] is True
    assert admin_workload["scope"] == "ALL_PERSONNEL"
    assert len(admin_workload["workload"]) >= 1

    inv_workload_res = client.get("/api/analytics/workload", headers=inv_headers)
    assert inv_workload_res.status_code == 200
    inv_workload = inv_workload_res.get_json()["data"]
    assert inv_workload["isAuthorized"] is False
    assert inv_workload["scope"] == "PERSONAL_ONLY"
    assert "restricted to administrative clearance" in inv_workload["notice"].lower()
    # Ensure investigator only sees at most 1 workload entry (their own)
    assert len(inv_workload["workload"]) <= 1


def test_metric_definitions_endpoint(client):
    """
    Verify GET /api/analytics/definitions returns comprehensive definitions
    and the mandatory legal disclaimer regarding algorithmic confidence vs forensic accuracy.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/analytics/definitions", headers=headers)
    assert res.status_code == 200
    data = res.get_json()["data"]

    defs = data["definitions"]
    assert "casesByStatus" in defs
    assert "casesOverTime" in defs
    assert "evidenceByType" in defs
    assert "evidenceIngestionOverTime" in defs
    assert "analysisJobsByStatus" in defs
    assert "processingTimes" in defs
    assert "reportGenerationActivity" in defs
    assert "investigatorWorkload" in defs

    notice = data["forensicAccuracyNotice"]
    assert "FRE 702" in notice or "OSAC" in notice
    assert "does NOT" in notice
