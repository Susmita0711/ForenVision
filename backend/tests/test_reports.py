"""
Unit and Integration tests for Forensic Reporting & Court Exhibit Dossier Module:
- Complete case report with real database records (case metadata, evidence, custody, AI analyses).
- Selective section inclusion: Fingerprint, face, and sketch sections only appear when actual results exist.
- Case with missing data: Transparently notes missing evidence and incomplete data without fabrication.
- Clear distinction: (1) Objective Observations, (2) Automated Diagnostics, (3) Investigator Interpretations.
- Strict authorization: RBAC case clearance enforced for generation, view, and PDF download (401/403).
- PDF generation integrity: Validates %PDF magic bytes, file size, streaming headers, and SHA-256 digital digest.
- Stored-record consistency: Verifies metadata and PDF hash match across list, get, and preview endpoints.
"""

from __future__ import annotations

import hashlib
import io
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


def test_complete_case_report_generation(client):
    """
    Test generating a comprehensive forensic dossier for a case with real evidence,
    custody transactions, and multi-module forensic analysis results.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create a Case
    case_res = client.post("/api/cases", json={
        "title": "Operation Apex Ledger",
        "incidentType": "Securities Fraud & Evidence Tampering",
        "description": "Forensic audit of suspected altered digital exhibits and physical ledger prints.",
    }, headers=headers).get_json()["case"]
    case_id = case_res["id"]
    case_number = case_res["caseNumber"]

    # 2. Upload an Evidence Item via /api/evidence/upload
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + (b"\xaa" * 120)
    expected_evidence_hash = hashlib.sha256(png_bytes).hexdigest()
    ev_upload_res = client.post("/api/evidence/upload", data={
        "file": (io.BytesIO(png_bytes), "ledger_scan_page1.png"),
        "caseId": case_id,
        "name": "Altered Ledger Scan Page 1",
        "type": "image",
    }, content_type="multipart/form-data", headers=headers)
    assert ev_upload_res.status_code == 201
    ev_res = ev_upload_res.get_json()["evidence"]
    evidence_id = ev_res["id"]

    # 3. Add a Custody Transfer Event
    custody_client_res = client.post("/api/custody", json={
        "evidenceId": evidence_id,
        "eventType": "transferred",
        "newCustodian": {"name": "Senior Examiner Dr. Reynolds"},
        "reason": "Secured transfer to digital forensics isolation laboratory.",
    }, headers=headers)
    assert custody_client_res.status_code == 201

    # 4. Record Real Analysis Results into service memory caches / DB
    # A. Image Forensics (ELA)
    image_forensics_service._memory_analysis_records["ela-record-001"] = {
        "id": "ela-record-001",
        "analysisId": "ela-record-001",
        "evidenceId": evidence_id,
        "caseId": case_id,
        "category": "image_forensics",
        "analysisType": "ela",
        "parameters": {"scale": 15, "quality": 95},
        "createdAt": "2026-10-19T20:00:00Z",
        "statistics": {"meanError": 4.12, "maxError": 42.0},
    }

    # B. Object Detection
    object_detection_service._memory_analysis_records["det-record-001"] = {
        "id": "det-record-001",
        "analysisId": "det-record-001",
        "evidenceId": evidence_id,
        "caseId": case_id,
        "category": "object_detection",
        "model": "YOLOv8n",
        "version": "8.0.0",
        "confidenceThreshold": 0.25,
        "detections": [
            {"class": "laptop", "confidence": 0.91, "box": [10, 20, 100, 80]},
            {"class": "cell phone", "confidence": 0.84, "box": [120, 40, 180, 120]},
        ],
        "createdAt": "2026-10-19T20:05:00Z",
    }

    # C. Fingerprint SIFT-RANSAC
    fingerprint_service._memory_analysis_records["fp-record-001"] = {
        "id": "fp-record-001",
        "analysisId": "fp-record-001",
        "caseId": case_id,
        "category": "fingerprint_minutiae",
        "method": "SIFT-RANSAC Minutiae-Constrained Matcher",
        "score": 0.82,
        "inliers": 38,
        "matchDecision": "PROBATIVE_SIMILARITY",
        "createdAt": "2026-10-19T20:10:00Z",
    }

    # D. Controlled Face Analysis
    face_analysis_service._memory_analysis_records["face-record-001"] = {
        "id": "face-record-001",
        "analysisId": "face-record-001",
        "caseId": case_id,
        "category": "face_biometric_comparison",
        "model": "InceptionResnetV1-VGGFace2",
        "euclideanDistance": 0.58,
        "cosineSimilarity": 0.81,
        "uncertaintyWarning": "Mathematical vector correspondence only. Not identity proof.",
        "createdAt": "2026-10-19T20:15:00Z",
    }

    # E. Witness Sketch Review Session
    sketch_service._memory_sessions["sketch-sess-001"] = {
        "id": "sketch-sess-001",
        "sessionId": "sketch-sess-001",
        "caseId": case_id,
        "category": "sketch_comparison_session",
        "sketchEvidenceId": evidence_id,
        "annotations": [{"label": "distinctive scar on jawline"}],
        "methodology": "Morphological visual comparison",
        "createdAt": "2026-10-19T20:20:00Z",
    }

    # 5. Generate Forensic Report via POST /api/reports/generate
    gen_res = client.post("/api/reports/generate", json={
        "caseId": case_id,
        "title": "Comprehensive Exhibit Dossier - Operation Apex Ledger",
        "classification": "CONFIDENTIAL COURT EXHIBIT",
        "investigatorNotes": "Cross-referenced altered ledger headers with recovered laptop timestamps. Corroborating physical latent print points.",
    }, headers=headers)

    assert gen_res.status_code == 201, f"Generate failed: {gen_res.get_json()}"
    report_data = gen_res.get_json()["data"]

    # Verify Report Metadata
    assert report_data["reportId"].startswith("REP-")
    assert report_data["caseId"] == case_id
    assert report_data["caseNumber"] == case_number
    assert report_data["classification"] == "CONFIDENTIAL COURT EXHIBIT"
    assert report_data["investigator"]["email"] == "admin@forenvision.internal"
    assert report_data["version"] == "v1.0"

    # Verify Evidence Inventory & Hashes
    evidence_inventory = report_data["evidenceInventory"]
    assert len(evidence_inventory) >= 1
    found_ev = next(e for e in evidence_inventory if e["id"] == evidence_id)
    assert found_ev["sha256"] == expected_evidence_hash

    # Verify Custody Timeline
    custody_events = report_data["chainOfCustody"]
    assert len(custody_events) >= 1

    # Verify Section A: Observations
    sec_a = report_data["sectionA_observations"]
    assert sec_a["physicalDigitalEvidenceFacts"]["totalEvidenceItems"] >= 1
    assert sec_a["chainOfCustodyAudit"]["totalCustodyEvents"] >= 1

    # Verify Section B: Automated Diagnostics (All modules present because real records exist)
    sec_b = report_data["sectionB_automated_diagnostics"]
    assert sec_b["imageForensics"] is not None
    assert sec_b["imageForensics"]["totalAnalyses"] >= 1
    assert sec_b["objectDetection"] is not None
    assert sec_b["objectDetection"]["totalDetectionsCount"] == 2
    assert sec_b["fingerprintComparison"] is not None
    assert sec_b["fingerprintComparison"]["totalComparisons"] >= 1
    assert sec_b["faceAnalysis"] is not None
    assert sec_b["faceAnalysis"]["totalEvaluations"] >= 1
    assert sec_b["witnessSketchReview"] is not None
    assert sec_b["witnessSketchReview"]["totalSessions"] >= 1

    # Verify Section C: Human Interpretation & Review Notes
    sec_c = report_data["sectionC_investigator_interpretations"]
    assert "Cross-referenced altered ledger" in sec_c["investigatorReviewNotes"]
    assert "ACE-V" in sec_c["verificationMethodology"]

    # Verify Limitations & Incomplete Data
    limitations = report_data["limitationsAndGaps"]
    assert "dataIntegrityGaps" in limitations
    assert "modelBoundaryDisclaimers" in limitations

    # Verify Digital Digest
    digest = report_data["digitalDigest"]
    assert len(digest["sha256_metadata"]) == 64
    assert len(digest["sha256_pdf"]) == 64


def test_case_with_missing_data_and_selective_sections(client):
    """
    Test generating a report for a case that has no evidence and no analysis records.
    Verifies:
    - Fingerprint, Face, and Sketch sections are NOT fabricated (evaluated to None / omitted).
    - Missing data is clearly documented in limitations.
    - No artificial scores or placeholder findings are created.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Create empty case
    case_res = client.post("/api/cases", json={
        "title": "Cold Docket - Preliminary Intake",
        "incidentType": "Pending Investigation",
    }, headers=headers).get_json()["case"]
    case_id = case_res["id"]

    gen_res = client.post("/api/reports/generate", json={
        "caseId": case_id,
        "title": "Preliminary Intake Status Dossier",
        "classification": "INTERNAL DRAFT",
    }, headers=headers)

    assert gen_res.status_code == 201
    report = gen_res.get_json()["data"]

    # Verify that selective sections are None because NO real records exist
    sec_b = report["sectionB_automated_diagnostics"]
    assert sec_b["fingerprintComparison"] is None
    assert sec_b["faceAnalysis"] is None
    assert sec_b["witnessSketchReview"] is None
    assert sec_b["imageForensics"]["totalAnalyses"] == 0
    assert sec_b["objectDetection"]["totalRuns"] == 0

    # Verify evidence inventory is empty without errors
    assert len(report["evidenceInventory"]) == 0

    # Verify limitations explicitly identify missing records
    gaps = report["limitationsAndGaps"]["dataIntegrityGaps"]
    gap_text = " ".join(gaps)
    assert "zero uploaded physical or digital evidence artifacts" in gap_text
    assert "No automated diagnostic examinations" in gap_text


def test_unauthorized_report_access(client):
    """
    Test RBAC and case-level clearance enforcement:
    - Unauthenticated requests receive 401.
    - Investigators cannot access reports or generate reports for cases they are not assigned to (403).
    - Direct PDF download enforces JWT clearance (no public link leaks).
    """
    # 1. Unauthenticated checks (401)
    res_no_auth = client.get("/api/reports")
    assert res_no_auth.status_code == 401

    res_gen_no_auth = client.post("/api/reports/generate", json={"caseId": "fake-case"})
    assert res_gen_no_auth.status_code == 401

    res_pdf_no_auth = client.get("/api/reports/REP-12345/pdf")
    assert res_pdf_no_auth.status_code == 401

    # 2. Case clearance check (403)
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    investigator_token = get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!")

    # Admin creates a restricted case assigned strictly to analyst only
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    case_res = client.post("/api/cases", json={
        "title": "Classified Internal Affairs Docket",
        "incidentType": "Restricted Inquiry",
        "is_restricted": True,
        "assignedExaminers": ["user-analyst-001"],  # Investigator not included
    }, headers=admin_headers).get_json()["case"]
    case_id = case_res["id"]

    investigator_headers = {"Authorization": f"Bearer {investigator_token}"}

    # Investigator attempts to generate report for unassigned case -> 403 Forbidden
    res_inv_gen = client.post("/api/reports/generate", json={
        "caseId": case_id,
        "title": "Unauthorized Dossier Attempt",
    }, headers=investigator_headers)
    assert res_inv_gen.status_code == 403
    assert "restricted" in res_inv_gen.get_json()["message"].lower() or "access" in res_inv_gen.get_json()["message"].lower()

    # Admin generates report for the case
    admin_gen = client.post("/api/reports/generate", json={
        "caseId": case_id,
        "title": "Authorized Admin Dossier",
    }, headers=admin_headers)
    assert admin_gen.status_code == 201
    report_id = admin_gen.get_json()["data"]["reportId"]

    # Investigator attempts to view report -> 403 Forbidden
    res_inv_view = client.get(f"/api/reports/{report_id}", headers=investigator_headers)
    assert res_inv_view.status_code == 403

    # Investigator attempts to download PDF -> 403 Forbidden
    res_inv_pdf = client.get(f"/api/reports/{report_id}/pdf", headers=investigator_headers)
    assert res_inv_pdf.status_code == 403

    # Admin CAN view and download the PDF
    res_admin_view = client.get(f"/api/reports/{report_id}", headers=admin_headers)
    assert res_admin_view.status_code == 200

    res_admin_pdf = client.get(f"/api/reports/{report_id}/pdf", headers=admin_headers)
    assert res_admin_pdf.status_code == 200
    assert res_admin_pdf.content_type == "application/pdf"


def test_pdf_generation_integrity_and_streaming(client):
    """
    Test PDF generation via ReportLab:
    - Output starts with %PDF- header magic bytes.
    - PDF file is well-formed with legitimate binary content (> 1000 bytes).
    - Calculated SHA-256 matches the digital digest in report metadata.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    case_res = client.post("/api/cases", json={
        "title": "Operation Starlight Forensic Audit",
        "incidentType": "Cyber Intrusion",
    }, headers=headers).get_json()["case"]
    case_id = case_res["id"]

    # Generate Report
    gen_res = client.post("/api/reports/generate", json={
        "caseId": case_id,
        "title": "Operation Starlight Court Exhibit",
        "classification": "TOP SECRET // FORENSIC RESTRICTED",
    }, headers=headers)
    assert gen_res.status_code == 201
    report_data = gen_res.get_json()["data"]
    report_id = report_data["reportId"]
    expected_pdf_hash = report_data["digitalDigest"]["sha256_pdf"]

    # Fetch PDF stream
    pdf_resp = client.get(f"/api/reports/{report_id}/pdf?download=true", headers=headers)
    assert pdf_resp.status_code == 200
    assert pdf_resp.content_type == "application/pdf"
    assert "attachment" in pdf_resp.headers.get("Content-Disposition", "")
    assert f"{report_id}_dossier.pdf" in pdf_resp.headers.get("Content-Disposition", "") or f"{report_id}.pdf" in pdf_resp.headers.get("Content-Disposition", "")

    pdf_bytes = pdf_resp.data
    # Verify %PDF- magic bytes
    assert pdf_bytes.startswith(b"%PDF-"), f"Invalid PDF header: {pdf_bytes[:10]}"
    assert len(pdf_bytes) > 2000, f"PDF file size too small: {len(pdf_bytes)} bytes"

    # Verify SHA-256 integrity
    actual_pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    assert actual_pdf_hash == expected_pdf_hash, "PDF binary digest mismatch"


def test_stored_record_consistency(client):
    """
    Test consistency across report storage and retrieval endpoints:
    - GET /api/reports (list) includes report metadata.
    - GET /api/reports/<id> returns complete dossier.
    - GET /api/reports/<id>/preview returns printable view layout.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    case_res = client.post("/api/cases", json={
        "title": "Operation Integrity Check",
        "incidentType": "Record Verification",
    }, headers=headers).get_json()["case"]
    case_id = case_res["id"]

    # Generate Report
    gen_res = client.post("/api/reports/generate", json={
        "caseId": case_id,
        "title": "Integrity Check Dossier V1",
        "classification": "CONFIDENTIAL",
    }, headers=headers)
    assert gen_res.status_code == 201
    created_report = gen_res.get_json()["data"]
    report_id = created_report["reportId"]

    # 1. Retrieve via GET /api/reports (list)
    list_res = client.get(f"/api/reports?caseId={case_id}", headers=headers)
    assert list_res.status_code == 200
    reports = list_res.get_json()["data"]
    assert len(reports) == 1
    assert reports[0]["reportId"] == report_id
    assert reports[0]["caseId"] == case_id
    assert reports[0]["digitalDigest"]["sha256_pdf"] == created_report["digitalDigest"]["sha256_pdf"]

    # 2. Retrieve via GET /api/reports/<id>
    get_res = client.get(f"/api/reports/{report_id}", headers=headers)
    assert get_res.status_code == 200
    retrieved_report = get_res.get_json()["data"]
    assert retrieved_report["reportId"] == report_id
    assert retrieved_report["title"] == "Integrity Check Dossier V1"
    assert retrieved_report["digitalDigest"]["sha256_pdf"] == created_report["digitalDigest"]["sha256_pdf"]

    # 3. Retrieve via GET /api/reports/<id>/preview (Printable Report View)
    prev_res = client.get(f"/api/reports/{report_id}/preview", headers=headers)
    assert prev_res.status_code == 200
    preview_data = prev_res.get_json()["data"]
    assert preview_data["reportId"] == report_id
    assert "sectionA_observations" in preview_data
    assert "sectionB_automated_diagnostics" in preview_data
    assert "sectionC_investigator_interpretations" in preview_data
    assert "limitationsAndGaps" in preview_data


def test_invalid_report_requests_and_not_found(client):
    """
    Test validation errors:
    - Missing caseId returns 400.
    - Non-existent caseId returns 404.
    - Non-existent reportId returns 404.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Missing caseId
    res_bad = client.post("/api/reports/generate", json={"title": "No Case"}, headers=headers)
    assert res_bad.status_code == 400

    # Non-existent caseId
    res_non_case = client.post("/api/reports/generate", json={"caseId": "case-non-existent-999"}, headers=headers)
    assert res_non_case.status_code == 404

    # Non-existent reportId
    res_non_rpt = client.get("/api/reports/REP-DOES-NOT-EXIST", headers=headers)
    assert res_non_rpt.status_code == 404

    res_non_pdf = client.get("/api/reports/REP-DOES-NOT-EXIST/pdf", headers=headers)
    assert res_non_pdf.status_code == 404
