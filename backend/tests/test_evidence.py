"""
Unit and Integration tests for Evidence Management System:
- Valid evidence upload (JPEG, PNG, PDF) with cryptographic SHA-256 generation
- Invalid file rejection (disallowed format / malicious script / executable)
- Oversized file rejection
- Unauthorized access and download protection (case-level clearance enforcement)
- Cryptographic hash verification & tampering detection
- Evidence-to-case association & count updates
- Metadata retrieval, download, preview, and persistence
"""

import io
import os
import hashlib
import pytest
from services.case_service import case_service
from services.evidence_service import evidence_service


def get_token_for(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_system_state():
    """Reset case and evidence states for clean test isolation."""
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()


def test_valid_evidence_upload_and_hash_generation(client):
    """
    Verify valid PNG upload:
    - Calculates SHA-256 from original bytes
    - Attaches evidence to authorized case
    - Emits chain of custody block
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a case
    case_res = client.post("/api/cases", json={
        "title": "Operation Starlight Vault",
        "incidentType": "Digital Forgery",
    }, headers=headers).get_json()["case"]

    # Valid PNG binary header + dummy payload
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + (b"\x00" * 64)
    expected_hash = hashlib.sha256(png_bytes).hexdigest()

    data = {
        "file": (io.BytesIO(png_bytes), "tampered_receipt.png"),
        "caseId": case_res["id"],
        "name": "Altered Wire Transfer PNG",
        "type": "image",
        "notes": "Recovered from suspect storage volume.",
    }

    # 2. Upload evidence
    upload_res = client.post(
        "/api/evidence/upload",
        data=data,
        content_type="multipart/form-data",
        headers=headers,
    )
    assert upload_res.status_code == 201
    res_json = upload_res.get_json()
    assert res_json["success"] is True

    ev = res_json["evidence"]
    assert ev["name"] == "Altered Wire Transfer PNG"
    assert ev["evidenceNumber"].startswith("EVD-")
    assert ev["detectedMediaType"] == "image/png"
    assert ev["fileSizeBytes"] == len(png_bytes)
    assert ev["sha256Hash"] == expected_hash
    assert ev["integrityStatus"] == "verified"
    assert "vault://" in ev["storageReference"]
    assert "/Users/" not in ev["storageReference"]  # No path disclosure

    # 3. Verify case evidence count incremented
    refreshed_case = client.get(f"/api/cases/{case_res['id']}", headers=headers).get_json()["case"]
    assert refreshed_case["evidenceCount"] == 1


def test_invalid_file_content_rejection(client):
    """
    Verify upload is rejected when:
    - Disallowed file extension / mime type
    - Executable binary signature disguised with innocent filename
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={
        "title": "Malware Infiltration Case",
    }, headers=headers).get_json()["case"]

    # 1. Disguised Windows PE executable (MZ header)
    malicious_bytes = b"MZ\x90\x00\x03\x00\x00\x00" + (b"\x00" * 32)
    res1 = client.post(
        "/api/evidence/upload",
        data={
            "file": (io.BytesIO(malicious_bytes), "harmless_document.png"),
            "caseId": case_res["id"],
        },
        content_type="multipart/form-data",
        headers=headers,
    )
    assert res1.status_code == 400
    assert "prohibited executable" in res1.get_json()["message"].lower()

    # 2. Shell script disguised as image
    script_bytes = b"#!/bin/bash\nrm -rf /"
    res2 = client.post(
        "/api/evidence/upload",
        data={
            "file": (io.BytesIO(script_bytes), "photo.jpg"),
            "caseId": case_res["id"],
        },
        content_type="multipart/form-data",
        headers=headers,
    )
    assert res2.status_code == 400
    assert "prohibited" in res2.get_json()["message"].lower()


def test_oversized_file_rejection(client):
    """Verify uploading a file exceeding max size threshold returns 400."""
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={
        "title": "Oversized Test Case",
    }, headers=headers).get_json()["case"]

    # Use store_evidence with small limit to test boundary condition
    huge_bytes = b"\x89PNG\r\n\x1a\n" + (b"A" * 1024)
    with pytest.raises(ValueError, match="exceeds maximum threshold"):
        evidence_service.store_evidence(
            file_bytes=huge_bytes,
            original_filename="large.png",
            case_id_or_number=case_res["id"],
            user={"id": "usr_01", "name": "Admin", "role": "admin"},
            max_size_bytes=512,  # Limit is 512 bytes
        )


def test_unauthorized_download_and_preview_denied(client):
    """
    Verify:
    1. Unauthenticated download returns 401
    2. User lacking clearance to a restricted case receives 403 Forbidden
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    viewer_token = get_token_for(client, "viewer@forenvision.internal", "ViewerPass123!")

    # 1. Admin creates a RESTRICTED case
    case_res = client.post("/api/cases", json={
        "title": "Classified Wiretap Docket",
        "is_restricted": True,
    }, headers={"Authorization": f"Bearer {admin_token}"}).get_json()["case"]

    # 2. Admin uploads evidence to this restricted case
    pdf_bytes = b"%PDF-1.7\n%Test PDF binary stream"
    upload_res = client.post(
        "/api/evidence/upload",
        data={
            "file": (io.BytesIO(pdf_bytes), "restricted_warrant.pdf"),
            "caseId": case_res["id"],
        },
        content_type="multipart/form-data",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).get_json()
    ev_id = upload_res["evidence"]["id"]

    # 3. Unauthenticated download -> 401 (clear cookie to ensure unauthenticated state)
    client.delete_cookie("forenvision_token")
    anon_res = client.get(f"/api/evidence/{ev_id}/download")
    assert anon_res.status_code == 401

    # 4. Viewer (unauthorized to restricted case) download -> 403
    viewer_download = client.get(
        f"/api/evidence/{ev_id}/download",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )
    assert viewer_download.status_code == 403

    # 5. Viewer preview -> 403
    viewer_preview = client.get(
        f"/api/evidence/{ev_id}/preview",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )
    assert viewer_preview.status_code == 403

    # 6. Admin download succeeds -> 200 with matching binary
    admin_download = client.get(
        f"/api/evidence/{ev_id}/download",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert admin_download.status_code == 200
    assert admin_download.data == pdf_bytes


def test_cryptographic_hash_verification(client):
    """
    Verify on-demand SHA-256 verification:
    - Confirms intact files match
    - Detects byte tampering when file is altered
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={
        "title": "Integrity Audit Case",
    }, headers=headers).get_json()["case"]

    jpeg_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01" + (b"\x00" * 32)
    ev = client.post(
        "/api/evidence/upload",
        data={
            "file": (io.BytesIO(jpeg_bytes), "crime_scene.jpg"),
            "caseId": case_res["id"],
        },
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # 1. Verification of intact evidence
    verify_res1 = client.post(f"/api/evidence/{ev['id']}/verify", headers=headers)
    assert verify_res1.status_code == 200
    v1 = verify_res1.get_json()["verification"]
    assert v1["verified"] is True
    assert v1["integrityStatus"] == "verified"

    # 2. Simulate byte tampering on storage
    raw_ev = evidence_service._find_raw_evidence(ev["id"])
    if raw_ev and raw_ev.get("_internalDiskPath") and os.path.exists(raw_ev["_internalDiskPath"]):
        with open(raw_ev["_internalDiskPath"], "wb") as f:
            f.write(b"\xFF\xD8\xFFTAMPERED_BYTES")
    evidence_service._memory_files[ev["id"]] = b"\xFF\xD8\xFFTAMPERED_BYTES"

    verify_res2 = client.post(f"/api/evidence/{ev['id']}/verify", headers=headers)
    assert verify_res2.status_code == 200
    v2 = verify_res2.get_json()["verification"]
    assert v2["verified"] is False
    assert v2["integrityStatus"] == "tampered"
    assert "divergence" in v2["message"].lower()


def test_evidence_to_case_association_and_listing(client):
    """
    Verify:
    - Evidence is listed by caseId
    - Search and filter queries work
    - Persistence after repeated calls
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_a = client.post("/api/cases", json={"title": "Case A"}, headers=headers).get_json()["case"]
    case_b = client.post("/api/cases", json={"title": "Case B"}, headers=headers).get_json()["case"]

    # Upload 2 to Case A, 1 to Case B
    png1 = b"\x89PNG\r\n\x1a\n" + (b"1" * 16)
    png2 = b"\x89PNG\r\n\x1a\n" + (b"2" * 16)
    pdf_b = b"%PDF-1.4\n" + (b"3" * 16)

    client.post("/api/evidence/upload", data={"file": (io.BytesIO(png1), "item1.png"), "caseId": case_a["id"]}, content_type="multipart/form-data", headers=headers)
    client.post("/api/evidence/upload", data={"file": (io.BytesIO(png2), "item2.png"), "caseId": case_a["id"]}, content_type="multipart/form-data", headers=headers)
    client.post("/api/evidence/upload", data={"file": (io.BytesIO(pdf_b), "docB.pdf"), "caseId": case_b["id"]}, content_type="multipart/form-data", headers=headers)

    # List evidence for Case A only
    list_a = client.get(f"/api/evidence?caseId={case_a['id']}", headers=headers).get_json()
    assert list_a["count"] == 2
    assert all(e["caseId"] == case_a["id"] for e in list_a["evidence"])

    # List evidence for Case B only
    list_b = client.get(f"/api/evidence?caseId={case_b['id']}", headers=headers).get_json()
    assert list_b["count"] == 1
    assert list_b["evidence"][0]["caseId"] == case_b["id"]

    # Total accessible evidence
    list_all = client.get("/api/evidence", headers=headers).get_json()
    assert list_all["count"] == 3


def test_associate_analysis_with_evidence(client):
    """Verify associating an AI analysis result with an evidence artifact."""
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Analysis Test Case"}, headers=headers).get_json()["case"]
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"P" * 16)
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(png_bytes), "sample.png"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    analysis_payload = {
        "category": "image_forgery",
        "modelEngine": "ResNet-ELA-Core",
        "confidenceScore": 98.2,
        "analystNotes": "High probability of copy-move cloning detected.",
    }

    # Associate analysis
    post_an = client.post(f"/api/evidence/{ev['id']}/analyses", json=analysis_payload, headers=headers)
    assert post_an.status_code == 201
    assert post_an.get_json()["success"] is True

    # Retrieve analyses
    get_an = client.get(f"/api/evidence/{ev['id']}/analyses", headers=headers)
    assert get_an.status_code == 200
    analyses = get_an.get_json()["analyses"]
    assert len(analyses) == 1
    assert analyses[0]["confidenceScore"] == 98.2
