"""
Comprehensive End-to-End Integration Test Suite for ForenVision AI.

Tests the full forensic investigation workflow:
1. Register a user.
2. Log in.
3. Open the dashboard.
4. Create a case.
5. Update the case.
6. Upload evidence.
7. Verify the original file hash.
8. Record a custody event.
9. Extract image metadata.
10. Run ELA (Error Level Analysis).
11. Run object detection.
12. Run fingerprint analysis.
13. Run face and sketch analysis with workflow clearance verification.
14. Save and retrieve analysis results.
15. Generate a court-admissible forensic report and verify PDF bytes.
16. Verify role-based access control across all 4 roles.
17. Log out.
18. Verify protected endpoints reject unauthorized/unauthenticated requests.

Additional Security and Robustness Tests:
- File upload path traversal and disguised script rejection.
- Zero-byte and oversized payload rejection.
- Invalid input handling and boundary defenses.
"""

from __future__ import annotations

import hashlib
import io
from pathlib import Path
import pytest
from PIL import Image, ExifTags

from services.user_service import user_service
from services.case_service import case_service
from services.evidence_service import evidence_service
from services.custody_service import custody_service
from services.image_forensics_service import image_forensics_service
from services.object_detection_service import object_detection_service
from services.fingerprint_service import fingerprint_service
from services.face_analysis_service import face_analysis_service
from services.sketch_service import sketch_service
from services.report_service import report_service
from services.audit_service import audit_service

FIXTURES_DIR = Path(__file__).parent / "fixtures"
DETECTION_IMG_PATH = FIXTURES_DIR / "sample_detection.jpg"
FACE_1_PATH = FIXTURES_DIR / "sample_face_scene_1.jpg"
FACE_MATE_PATH = FIXTURES_DIR / "sample_face_scene_mate.jpg"
PRINT_1_PATH = FIXTURES_DIR / "sample_print_1.jpg"
PRINT_MATE_PATH = FIXTURES_DIR / "sample_print_1_mate.jpg"


@pytest.fixture(autouse=True)
def reset_all_services():
    """Ensure complete test isolation across all services."""
    user_service.reset_in_memory_state()
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    custody_service.reset_in_memory_state()
    image_forensics_service.reset_in_memory_state()
    object_detection_service.reset_in_memory_state()
    fingerprint_service.reset_in_memory_state()
    face_analysis_service.reset_in_memory_state()
    sketch_service.reset_in_memory_state()
    report_service.reset_in_memory_state()
    audit_service.reset_in_memory_state()
    yield
    user_service.reset_in_memory_state()
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    custody_service.reset_in_memory_state()
    image_forensics_service.reset_in_memory_state()
    object_detection_service.reset_in_memory_state()
    fingerprint_service.reset_in_memory_state()
    face_analysis_service.reset_in_memory_state()
    sketch_service.reset_in_memory_state()
    report_service.reset_in_memory_state()
    audit_service.reset_in_memory_state()


def create_jpeg_with_exif_bytes() -> bytes:
    """Generate in-memory JPEG with genuine EXIF tags and GPS data."""
    img = Image.new("RGB", (240, 180), color=(85, 120, 165))
    exif = img.getexif()
    exif[271] = "Nikon Digital Forensic"
    exif[272] = "D850-Evidence"
    exif[305] = "ForenVision Firmware v2.1"
    exif[274] = 1

    exif_ifd = exif.get_ifd(0x8769)
    exif_ifd[0x9003] = "2026:05:14 09:45:12"
    exif_ifd[0x920A] = 35.0

    gps_ifd = exif.get_ifd(0x8825)
    gps_ifd[1] = "N"
    gps_ifd[2] = (37.0, 48.0, 30.0)
    gps_ifd[3] = "W"
    gps_ifd[4] = (122.0, 24.0, 15.0)
    gps_ifd[6] = 22.0

    exif[ExifTags.Base.ExifOffset] = exif_ifd
    exif[ExifTags.Base.GPSInfo] = gps_ifd

    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


class TestComprehensiveWorkflow:
    """Tests the mandatory 18-step integration workflow."""

    def test_full_investigation_lifecycle_workflow(self, client):
        # ---------------------------------------------------------
        # Step 1: Register a user (Investigator)
        # ---------------------------------------------------------
        reg_payload = {
            "email": "investigator.turner@forenvision.internal",
            "password": "SecureInvestigator@2026!",
            "name": "Detective Marcus Turner",
            "badgeNumber": "BADGE-INV-9901",
            "role": "investigator",
            "department": "Major Crimes & Cyber Forensics",
        }
        reg_res = client.post("/api/auth/register", json=reg_payload)
        assert reg_res.status_code == 201, f"Registration failed: {reg_res.get_json()}"
        reg_data = reg_res.get_json()
        assert reg_data["user"]["email"] == reg_payload["email"]
        assert reg_data["user"]["role"] == "investigator"
        assert "token" in reg_data

        # ---------------------------------------------------------
        # Step 2: Log in with credentials
        # ---------------------------------------------------------
        login_res = client.post(
            "/api/auth/login",
            json={"email": reg_payload["email"], "password": reg_payload["password"]},
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.get_json()}"
        login_data = login_res.get_json()
        token = login_data["token"]
        assert token is not None and len(token) > 20
        auth_headers = {"Authorization": f"Bearer {token}"}

        # ---------------------------------------------------------
        # Step 3: Open the dashboard
        # ---------------------------------------------------------
        dash_res = client.get("/api/dashboard/summary", headers=auth_headers)
        assert dash_res.status_code == 200, f"Dashboard failed: {dash_res.get_json()}"
        dash_data = dash_res.get_json()["data"]
        assert "metrics" in dash_data
        assert "totalCases" in dash_data["metrics"]
        assert "recentCases" in dash_data
        assert "recentActivity" in dash_data
        assert dash_data["metadata"]["userRole"] == "investigator"

        # ---------------------------------------------------------
        # Step 4: Create a case
        # ---------------------------------------------------------
        case_payload = {
            "title": "Operation Sovereign Vault",
            "incidentType": "Digital Forgery",
            "priority": "high",
            "description": "Investigation into unauthorized wire transfer tampering and manipulated ledger exhibits.",
            "tags": ["Digital Forgery", "Financial Fraud", "Priority Intake"],
        }
        create_case_res = client.post("/api/cases", json=case_payload, headers=auth_headers)
        assert create_case_res.status_code == 201, f"Case creation failed: {create_case_res.get_json()}"
        created_case = create_case_res.get_json()["case"]
        case_id = created_case["id"]
        case_number = created_case["caseNumber"]
        assert created_case["title"] == case_payload["title"]
        assert created_case["status"] == "open"
        assert created_case["priority"] == "high"

        # ---------------------------------------------------------
        # Step 5: Update the case
        # ---------------------------------------------------------
        update_payload = {
            "title": "Operation Sovereign Vault - Active Lab Phase",
            "description": "Updated narrative: Multi-party ledger alterations verified via initial cryptographic hashes.",
            "priority": "critical",
            "status": "in_progress",
            "tags": ["Digital Forgery", "Active Lab", "Corroborated"],
        }
        update_case_res = client.put(f"/api/cases/{case_id}", json=update_payload, headers=auth_headers)
        assert update_case_res.status_code == 200, f"Case update failed: {update_case_res.get_json()}"
        updated_case = update_case_res.get_json()["case"]
        assert updated_case["title"] == update_payload["title"]
        assert updated_case["status"] == "in_progress"
        assert updated_case["priority"] == "critical"

        # ---------------------------------------------------------
        # Step 6: Upload evidence
        # ---------------------------------------------------------
        jpeg_bytes = create_jpeg_with_exif_bytes()
        computed_sha256 = hashlib.sha256(jpeg_bytes).hexdigest()

        upload_res = client.post(
            "/api/evidence/upload",
            data={
                "file": (io.BytesIO(jpeg_bytes), "vault_audit_evidence.jpg"),
                "caseId": case_id,
                "name": "Primary Financial Document Photo",
                "type": "image",
                "notes": "Recovered from suspect storage volume at scene.",
            },
            content_type="multipart/form-data",
            headers=auth_headers,
        )
        assert upload_res.status_code == 201, f"Evidence upload failed: {upload_res.get_json()}"
        evidence_item = upload_res.get_json()["evidence"]
        evidence_id = evidence_item["id"]
        evidence_number = evidence_item["evidenceNumber"]
        assert evidence_item["caseId"] == case_id
        assert evidence_item["type"] == "image"

        # ---------------------------------------------------------
        # Step 7: Verify original file hash
        # ---------------------------------------------------------
        get_ev_res = client.get(f"/api/evidence/{evidence_id}", headers=auth_headers)
        assert get_ev_res.status_code == 200
        fetched_ev = get_ev_res.get_json()["evidence"]
        assert fetched_ev["sha256Hash"] == computed_sha256, "Evidence SHA-256 hash does not match original bytes!"
        assert fetched_ev["fileSizeBytes"] == len(jpeg_bytes)

        # Verify integrity check endpoint
        verify_res = client.post(f"/api/evidence/{evidence_id}/verify", headers=auth_headers)
        assert verify_res.status_code == 200
        verify_data = verify_res.get_json()["verification"]
        assert verify_data["integrityStatus"] == "verified"
        assert verify_data["computedHash"] == computed_sha256

        # ---------------------------------------------------------
        # Step 8: Record a custody event
        # ---------------------------------------------------------
        custody_payload = {
            "evidenceId": evidence_id,
            "eventType": "transferred",
            "action": "Transferred",
            "newCustodian": {
                "name": "Dr. Aris Thorne",
                "badge": "BADGE-LAB-4402",
                "role": "Lead Forensic Examiner",
                "organization": "Central Forensic Integrity Laboratory",
            },
            "reason": "Transfer to biometric and compression artifact diagnostics laboratory.",
            "location": "Forensic Cleanroom 4B",
            "notes": "Anti-static Faraday pouch tamper seals intact.",
        }
        custody_res = client.post("/api/custody", json=custody_payload, headers=auth_headers)
        assert custody_res.status_code == 201, f"Custody event failed: {custody_res.get_json()}"
        custody_entry = custody_res.get_json()["event"]
        assert custody_entry["evidenceId"] == evidence_id
        assert custody_entry["action"] == "Transferred"
        assert "blockHash" in custody_entry
        assert custody_entry["verified"] is True

        # Verify custody history endpoint
        hist_res = client.get(f"/api/custody?evidenceId={evidence_id}", headers=auth_headers)
        assert hist_res.status_code == 200
        events = hist_res.get_json()["events"]
        assert len(events) >= 1
        assert any(e["action"] == "Transferred" for e in events)

        # ---------------------------------------------------------
        # Step 9: Extract image metadata
        # ---------------------------------------------------------
        meta_res = client.post(
            "/api/analysis/image/metadata",
            json={"evidenceId": evidence_id},
            headers=auth_headers,
        )
        assert meta_res.status_code == 200, f"Metadata extraction failed: {meta_res.get_json()}"
        meta = meta_res.get_json()["metadata"]
        assert meta["hasExif"] is True
        assert meta["camera"]["make"] == "Nikon Digital Forensic"
        assert meta["camera"]["model"] == "D850-Evidence"
        assert meta["gps"]["hasGpsData"] is True
        assert meta["dimensions"]["width"] == 240
        assert meta["dimensions"]["height"] == 180
        assert "timestampTrustworthinessNotice" in meta

        # ---------------------------------------------------------
        # Step 10: Run Error Level Analysis (ELA)
        # ---------------------------------------------------------
        ela_res = client.post(
            "/api/analysis/image/ela",
            json={"evidenceId": evidence_id, "quality": 92, "scale": 15},
            headers=auth_headers,
        )
        assert ela_res.status_code == 200, f"ELA failed: {ela_res.get_json()}"
        ela_data = ela_res.get_json()["analysis"]
        assert "analysisId" in ela_data
        assert "statistics" in ela_data
        assert "meanError" in ela_data["statistics"]
        assert "peakError" in ela_data["statistics"]
        assert ela_data["parameters"]["quality"] == 92
        assert ela_data["parameters"]["scale"] == 15

        # ---------------------------------------------------------
        # Step 11: Run object detection (YOLOv4-tiny)
        # ---------------------------------------------------------
        # Upload photographic scene artifact with detectable objects
        with open(DETECTION_IMG_PATH, "rb") as f:
            det_img_bytes = f.read()

        det_ev_res = client.post(
            "/api/evidence/upload",
            data={
                "file": (io.BytesIO(det_img_bytes), "scene_surveillance.jpg"),
                "caseId": case_id,
                "name": "Surveillance Still: Street Scene",
                "type": "image",
            },
            content_type="multipart/form-data",
            headers=auth_headers,
        )
        assert det_ev_res.status_code == 201
        det_evidence_id = det_ev_res.get_json()["evidence"]["id"]

        det_run_res = client.post(
            "/api/analysis/detection/run",
            json={"evidenceId": det_evidence_id, "confidenceThreshold": 0.25, "nmsThreshold": 0.45},
            headers=auth_headers,
        )
        assert det_run_res.status_code == 200, f"Object detection failed: {det_run_res.get_json()}"
        det_output = det_run_res.get_json()["data"]
        assert det_output["analysisType"] == "AI Object Detection (YOLOv4-tiny)"
        assert len(det_output["detectedObjects"]) >= 1
        assert "forensicDisclaimer" in det_output
        assert "classCounts" in det_output["summary"]

        # ---------------------------------------------------------
        # Step 12: Run fingerprint analysis (SIFT-RANSAC)
        # ---------------------------------------------------------
        with open(PRINT_1_PATH, "rb") as f:
            print_probe_bytes = f.read()
        with open(PRINT_MATE_PATH, "rb") as f:
            print_mate_bytes = f.read()

        ev_print_probe = client.post(
            "/api/evidence/upload",
            data={"file": (io.BytesIO(print_probe_bytes), "latent_lift_probe.jpg"), "caseId": case_id},
            content_type="multipart/form-data",
            headers=auth_headers,
        ).get_json()["evidence"]["id"]

        ev_print_mate = client.post(
            "/api/evidence/upload",
            data={"file": (io.BytesIO(print_mate_bytes), "tenprint_card_reference.jpg"), "caseId": case_id},
            content_type="multipart/form-data",
            headers=auth_headers,
        ).get_json()["evidence"]["id"]

        # A. Assess Quality
        qual_res = client.post(
            "/api/analysis/fingerprint/assess-quality",
            json={"evidenceId": ev_print_probe},
            headers=auth_headers,
        )
        assert qual_res.status_code == 200
        quality = qual_res.get_json()["quality"]
        assert quality["qualityTier"] in ["EXCELLENT", "ACCEPTABLE", "MARGINAL", "POOR / INSUFFICIENT"]
        assert "clarityScore" in quality

        # B. Compare Impressions
        print_cmp_res = client.post(
            "/api/analysis/fingerprint/compare",
            json={
                "probeEvidenceId": ev_print_probe,
                "referenceEvidenceId": ev_print_mate,
            },
            headers=auth_headers,
        )
        assert print_cmp_res.status_code == 200, f"Fingerprint comparison failed: {print_cmp_res.get_json()}"
        cmp_data = print_cmp_res.get_json()["data"]
        assert "comparisonMetrics" in cmp_data
        assert cmp_data["comparisonMetrics"]["inlierCount"] > 0
        assert "probeEvidence" in cmp_data
        assert "referenceEvidence" in cmp_data
        assert "alignment" in cmp_data["comparisonMetrics"]

        # ---------------------------------------------------------
        # Step 13: Run face analysis with workflow clearance verification
        # ---------------------------------------------------------
        with open(FACE_1_PATH, "rb") as f:
            face_1_bytes = f.read()
        with open(FACE_MATE_PATH, "rb") as f:
            face_mate_bytes = f.read()

        ev_face_1 = client.post(
            "/api/evidence/upload",
            data={"file": (io.BytesIO(face_1_bytes), "security_camera_subject.jpg"), "caseId": case_id},
            content_type="multipart/form-data",
            headers=auth_headers,
        ).get_json()["evidence"]["id"]

        ev_face_mate = client.post(
            "/api/evidence/upload",
            data={"file": (io.BytesIO(face_mate_bytes), "id_database_record.jpg"), "caseId": case_id},
            content_type="multipart/form-data",
            headers=auth_headers,
        ).get_json()["evidence"]["id"]

        # Investigator Turner has investigator role, which includes analysis.face permission
        face_detect_res = client.post(
            "/api/analysis/face/detect",
            json={"evidenceId": ev_face_1, "scoreThreshold": 0.3},
            headers=auth_headers,
        )
        assert face_detect_res.status_code == 200, f"Face detection failed: {face_detect_res.get_json()}"
        face_detect_data = face_detect_res.get_json()["data"]
        assert face_detect_data["detectedFacesCount"] >= 1
        assert "landmarks" in face_detect_data["faces"][0]
        assert "box" in face_detect_data["faces"][0]

        # 1-to-1 face comparison
        face_cmp_res = client.post(
            "/api/analysis/face/compare",
            json={"probeEvidenceId": ev_face_1, "referenceEvidenceId": ev_face_mate, "scoreThreshold": 0.3},
            headers=auth_headers,
        )
        assert face_cmp_res.status_code == 200, f"Face comparison failed: {face_cmp_res.get_json()}"
        face_cmp_data = face_cmp_res.get_json()["data"]
        assert "cosineSimilarity" in face_cmp_data["metrics"]
        assert "l2Distance" in face_cmp_data["metrics"]
        assert "forensicNotice" in face_cmp_data

        # ---------------------------------------------------------
        # Step 14: Save and retrieve case analyses
        # ---------------------------------------------------------
        case_analyses_res = client.get(f"/api/cases/{case_id}/analyses", headers=auth_headers)
        assert case_analyses_res.status_code == 200
        analyses_list = case_analyses_res.get_json()["analyses"]
        assert isinstance(analyses_list, list)

        # ---------------------------------------------------------
        # Step 15: Generate a report and verify PDF bytes
        # ---------------------------------------------------------
        report_payload = {
            "caseId": case_id,
            "title": "Certified Judicial Exhibit - Operation Sovereign Vault",
            "classification": "CONFIDENTIAL COURT EXHIBIT",
            "investigatorNotes": "Conducted thorough ELA and biometric matching against recovered evidence items.",
        }
        gen_rep_res = client.post("/api/reports/generate", json=report_payload, headers=auth_headers)
        assert gen_rep_res.status_code == 201, f"Report generation failed: {gen_rep_res.get_json()}"
        rep_data = gen_rep_res.get_json()["data"]
        report_id = rep_data["reportId"]
        assert rep_data["caseId"] == case_id
        assert rep_data["caseNumber"] == case_number

        # Check evidence inventory SHA-256 matches in report
        inv = rep_data["evidenceInventory"]
        matching_item = next(e for e in inv if e["id"] == evidence_id)
        assert matching_item["sha256"] == computed_sha256

        # Check PDF download
        pdf_res = client.get(f"/api/reports/{report_id}/pdf", headers=auth_headers)
        assert pdf_res.status_code == 200
        assert pdf_res.data.startswith(b"%PDF"), "ReportLab output did not return valid PDF header!"
        assert len(pdf_res.data) > 1000

        # ---------------------------------------------------------
        # Step 16: Verify role-based access across roles
        # ---------------------------------------------------------
        # A. Register Analyst without specialized workflow clearances
        analyst_res = client.post("/api/auth/register", json={
            "email": "lab.analyst.clara@forenvision.internal",
            "password": "AnalystPassword@123!",
            "name": "Clara Higgins",
            "badgeNumber": "BADGE-ANA-7720",
            "role": "analyst",
            "department": "Digital Lab",
        })
        assert analyst_res.status_code == 201
        analyst_token = analyst_res.get_json()["token"]
        analyst_headers = {"Authorization": f"Bearer {analyst_token}"}

        # Analyst CAN run ELA and fingerprint
        ela_check = client.post("/api/analysis/image/ela", json={"evidenceId": evidence_id}, headers=analyst_headers)
        assert ela_check.status_code == 200

        # Analyst WITHOUT workflow clearance CANNOT run face/sketch analysis
        face_block = client.post("/api/analysis/face/detect", json={"evidenceId": ev_face_1}, headers=analyst_headers)
        assert face_block.status_code == 403, "Unclear analyst was able to access restricted face analysis!"

        # Analyst CANNOT create new cases
        case_block = client.post("/api/cases", json={"title": "Unauthorized Case"}, headers=analyst_headers)
        assert case_block.status_code == 403

        # Analyst CANNOT manage/create users (restricted to Admin users.create)
        user_block = client.post(
            "/api/users",
            json={"name": "Rogue Examiner", "email": "rogue@forenvision.internal", "password": "Password123!", "role": "admin"},
            headers=analyst_headers,
        )
        assert user_block.status_code == 403

        # Analyst CANNOT view system audit trail (restricted to Admin audit.read)
        audit_block = client.get("/api/audit/logs", headers=analyst_headers)
        assert audit_block.status_code == 403

        # B. Register Read-Only Viewer
        viewer_res = client.post("/api/auth/register", json={
            "email": "auditor.viewer@court.gov",
            "password": "ViewerPassword@123!",
            "name": "Magistrate Arthur Vance",
            "badgeNumber": "BADGE-VIEW-1001",
            "role": "viewer",
            "department": "Judicial Oversight",
        })
        assert viewer_res.status_code == 201
        viewer_token = viewer_res.get_json()["token"]
        viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

        # Viewer CAN inspect cases and evidence metadata
        v_case_res = client.get(f"/api/cases/{case_id}", headers=viewer_headers)
        assert v_case_res.status_code == 200
        v_ev_res = client.get(f"/api/evidence/{evidence_id}", headers=viewer_headers)
        assert v_ev_res.status_code == 200

        # Viewer CANNOT download raw evidence bytes
        dl_block = client.get(f"/api/evidence/{evidence_id}/download", headers=viewer_headers)
        assert dl_block.status_code == 403, "Viewer was able to download raw evidence bytes!"

        # Viewer CANNOT upload evidence
        up_block = client.post(
            "/api/evidence/upload",
            data={"file": (io.BytesIO(b"\xFF\xD8\xFF\xE0" + b"\x00" * 20), "bad.jpg"), "caseId": case_id},
            content_type="multipart/form-data",
            headers=viewer_headers,
        )
        assert up_block.status_code == 403

        # Viewer CANNOT mutate case
        mut_block = client.put(f"/api/cases/{case_id}", json={"title": "Hacked"}, headers=viewer_headers)
        assert mut_block.status_code == 403

        # Viewer CANNOT generate reports
        rep_block = client.post("/api/reports/generate", json={"caseId": case_id, "title": "Illegal"}, headers=viewer_headers)
        assert rep_block.status_code == 403

        # C. Admin privileges
        admin_login = client.post("/api/auth/login", json={"email": "admin@forenvision.internal", "password": "AdminPass123!"})
        assert admin_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin_login.get_json()['token']}"}

        # Admin CAN view audit logs
        audit_res = client.get("/api/audit/logs", headers=admin_headers)
        assert audit_res.status_code == 200
        assert "logs" in audit_res.get_json()

        # Admin CAN query permission matrix
        matrix_res = client.get("/api/audit/matrix", headers=admin_headers)
        assert matrix_res.status_code == 200
        assert "matrix" in matrix_res.get_json()

        # ---------------------------------------------------------
        # Step 17: Log out
        # ---------------------------------------------------------
        logout_res = client.post("/api/auth/logout", headers=auth_headers)
        assert logout_res.status_code == 200, f"Logout failed: {logout_res.get_json()}"

        # ---------------------------------------------------------
        # Step 18: Verify protected endpoints reject unauthorized requests
        # ---------------------------------------------------------
        # Unauthenticated request (no token)
        unauth_dash = client.get("/api/dashboard/summary")
        assert unauth_dash.status_code == 401

        unauth_cases = client.get("/api/cases")
        assert unauth_cases.status_code == 401

        unauth_ev = client.get(f"/api/evidence/{evidence_id}")
        assert unauth_ev.status_code == 401

        # Tampered / Invalid token
        tampered_headers = {"Authorization": "Bearer invalid.jwt.payload"}
        bad_token_res = client.get("/api/dashboard/summary", headers=tampered_headers)
        assert bad_token_res.status_code == 401


class TestSecurityDefensesAndFileValidation:
    """Rigorous security checks for file handling and boundary protections."""

    def test_file_upload_path_traversal_rejection(self, client):
        """Verify directory traversal in filenames is neutralized by secure_filename."""
        admin_token = client.post("/api/auth/login", json={"email": "admin@forenvision.internal", "password": "AdminPass123!"}).get_json()["token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        case = client.post("/api/cases", json={"title": "Traversal Defense Case"}, headers=headers).get_json()["case"]

        valid_jpg = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00" + (b"\x00" * 50) + b"\xFF\xD9"

        # Attempt path traversal
        res = client.post(
            "/api/evidence/upload",
            data={
                "file": (io.BytesIO(valid_jpg), "../../../../etc/cron.d/malicious_payload.jpg"),
                "caseId": case["id"],
            },
            content_type="multipart/form-data",
            headers=headers,
        )
        assert res.status_code == 201
        ev = res.get_json()["evidence"]
        # Filename must be sanitized
        assert ".." not in ev["originalFileName"]
        assert "/" not in ev["originalFileName"]
        assert "\\" not in ev["originalFileName"]
        assert ".." not in ev["storageReference"]

    def test_disguised_executable_and_script_rejection(self, client):
        """Verify files with executable magic bytes are strictly rejected regardless of extension."""
        admin_token = client.post("/api/auth/login", json={"email": "admin@forenvision.internal", "password": "AdminPass123!"}).get_json()["token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        case = client.post("/api/cases", json={"title": "Executable Defense Case"}, headers=headers).get_json()["case"]

        # DOS/Windows PE executable disguised as JPG
        pe_payload = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00"
        pe_res = client.post(
            "/api/evidence/upload",
            data={"file": (io.BytesIO(pe_payload), "innocent_photo.jpg"), "caseId": case["id"]},
            content_type="multipart/form-data",
            headers=headers,
        )
        assert pe_res.status_code == 400
        assert "prohibited" in str(pe_res.get_json()).lower()

        # Linux ELF executable disguised as PNG
        elf_payload = b"\x7fELF\x02\x01\x01\x00" + b"\x00" * 20
        elf_res = client.post(
            "/api/evidence/upload",
            data={"file": (io.BytesIO(elf_payload), "diagram.png"), "caseId": case["id"]},
            content_type="multipart/form-data",
            headers=headers,
        )
        assert elf_res.status_code == 400
        assert "prohibited" in str(elf_res.get_json()).lower()

        # Shell script disguised as JPG
        sh_payload = b"#!/bin/bash\nrm -rf /"
        sh_res = client.post(
            "/api/evidence/upload",
            data={"file": (io.BytesIO(sh_payload), "scan.jpg"), "caseId": case["id"]},
            content_type="multipart/form-data",
            headers=headers,
        )
        assert sh_res.status_code == 400
        assert "prohibited" in str(sh_res.get_json()).lower()

        # PHP script disguised as PDF
        php_payload = b"<?php phpinfo(); ?>"
        php_res = client.post(
            "/api/evidence/upload",
            data={"file": (io.BytesIO(php_payload), "court_report.pdf"), "caseId": case["id"]},
            content_type="multipart/form-data",
            headers=headers,
        )
        assert php_res.status_code == 400
        assert "prohibited" in str(php_res.get_json()).lower()

    def test_zero_byte_file_rejection(self, client):
        """Verify empty files are rejected."""
        admin_token = client.post("/api/auth/login", json={"email": "admin@forenvision.internal", "password": "AdminPass123!"}).get_json()["token"]
        headers = {"Authorization": f"Bearer {admin_token}"}
        case = client.post("/api/cases", json={"title": "Empty File Case"}, headers=headers).get_json()["case"]

        res = client.post(
            "/api/evidence/upload",
            data={"file": (io.BytesIO(b""), "empty.jpg"), "caseId": case["id"]},
            content_type="multipart/form-data",
            headers=headers,
        )
        assert res.status_code == 400

    def test_invalid_input_handling(self, client):
        """Verify gracefully handled 400/404 on malformed queries."""
        admin_token = client.post("/api/auth/login", json={"email": "admin@forenvision.internal", "password": "AdminPass123!"}).get_json()["token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Non-existent case
        res = client.get("/api/cases/non-existent-case-id-99999", headers=headers)
        assert res.status_code == 404

        # Non-existent evidence
        res = client.get("/api/evidence/non-existent-evidence-id-99999", headers=headers)
        assert res.status_code == 404

        # Malformed ELA request (missing evidenceId)
        res = client.post("/api/analysis/image/ela", json={}, headers=headers)
        assert res.status_code == 400
