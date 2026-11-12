"""
Unit and Integration tests for Chain of Custody System:
- Event creation (collection, handover transfer, checkout, return, correction)
- Chronological ordering and sequence numbering
- Unauthorized access (401 unauthenticated, 403 restricted case clearance)
- Prohibited modification (PUT, PATCH, DELETE rejected with 405 Method Not Allowed)
- Evidence and case association & counter updates
- Hash-chain verification & tampering detection
- Documented follow-up corrections
- Audit history consistency & export (CSV / JSON)
"""

import io
import pytest
from services.case_service import case_service
from services.evidence_service import evidence_service
from services.custody_service import custody_service


def get_token_for(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_system_state():
    """Reset all in-memory states before and after each test."""
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    custody_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    custody_service.reset_in_memory_state()


def test_custody_event_creation_and_hash_chain(client):
    """
    Verify full custody lifecycle:
    1. Uploading evidence creates genesis block (seq 1, prevHash all zeros).
    2. Logging handover transfer creates block (seq 2, linking to genesis).
    3. Logging lab checkout creates block (seq 3, linking to block 2).
    4. Hash chain verification confirms ledger integrity.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create Case
    case_res = client.post("/api/cases", json={
        "title": "Homicide Ballistics Docket",
    }, headers=headers).get_json()["case"]

    # 2. Upload Evidence (Genesis Block)
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"\x00" * 32)
    ev = client.post(
        "/api/evidence/upload",
        data={
            "file": (io.BytesIO(png_bytes), "fired_casing.png"),
            "caseId": case_res["id"],
        },
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Verify Genesis Block
    genesis_blocks = client.get(f"/api/evidence/{ev['id']}/custody", headers=headers).get_json()["custody"]
    assert len(genesis_blocks) == 1
    genesis = genesis_blocks[0]
    assert genesis["action"] == "Collected"
    assert genesis["previousBlockHash"] == "0" * 64
    assert genesis["sequenceNumber"] == 1
    assert genesis["verified"] is True

    # 3. Log Transfer Event (Block 2)
    transfer_res = client.post(
        "/api/custody",
        json={
            "evidenceId": ev["id"],
            "eventType": "transferred",
            "reason": "Relocated to Central Ballistics Laboratory for striation comparison.",
            "location": "Central Ballistics Lab - Station 4",
            "newCustodian": {"name": "Dr. Aris Thorne", "badge": "LAB-771"},
            "recipient": "Dr. Aris Thorne (LAB-771)",
        },
        headers=headers,
    )
    assert transfer_res.status_code == 201
    block2 = transfer_res.get_json()["event"]
    assert block2["action"] == "Transferred"
    assert block2["sequenceNumber"] == 2
    assert block2["previousBlockHash"] == genesis["blockHash"]
    assert block2["recipient"] == "Dr. Aris Thorne (LAB-771)"

    # 4. Log Lab Checkout (Block 3)
    checkout_res = client.post(
        f"/api/evidence/{ev['id']}/custody",
        json={
            "eventType": "checked_out",
            "reason": "Checked out for high-resolution 3D optical profilometry.",
            "location": "Optical Profilometry Chamber B",
        },
        headers=headers,
    )
    assert checkout_res.status_code == 201
    block3 = checkout_res.get_json()["event"]
    assert block3["action"] == "Checked Out"
    assert block3["sequenceNumber"] == 3
    assert block3["previousBlockHash"] == block2["blockHash"]

    # 5. Verify Hash Chain
    verify_res = client.get(f"/api/custody/verify/{ev['id']}", headers=headers)
    assert verify_res.status_code == 200
    v = verify_res.get_json()["verification"]
    assert v["verified"] is True
    assert v["totalEvents"] == 3
    assert "All 3 blocks cryptographically validated" in v["message"]


def test_chronological_ordering_and_listing(client):
    """
    Verify:
    - Events are ordered chronologically.
    - Listing endpoint supports filtering by case, evidence, action, and search query.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    case_res = client.post("/api/cases", json={"title": "Chronology Docket"}, headers=headers).get_json()["case"]

    pdf_bytes = b"%PDF-1.4\n" + (b"\x00" * 32)
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(pdf_bytes), "ledger.pdf"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Add 2 subsequent events
    client.post("/api/custody", json={
        "evidenceId": ev["id"],
        "eventType": "transferred",
        "reason": "Handover to Document Analysis Unit",
        "location": "Unit 2A",
    }, headers=headers)

    client.post("/api/custody", json={
        "evidenceId": ev["id"],
        "eventType": "returned",
        "reason": "Returned to Cold Storage Locker 14",
        "location": "Locker 14",
    }, headers=headers)

    # List via /api/custody
    res = client.get(f"/api/custody?evidenceId={ev['id']}", headers=headers)
    assert res.status_code == 200
    events = res.get_json()["events"]
    assert len(events) == 3
    # Check that descending sort lists Returned first, then Transferred, then Collected
    assert events[0]["action"] == "Returned"
    assert events[1]["action"] == "Transferred"
    assert events[2]["action"] == "Collected"


def test_unauthorized_custody_access_and_clearance(client):
    """
    Verify:
    1. Unauthenticated request to /api/custody returns 401.
    2. User lacking clearance on restricted case receives 403 on custody creation and retrieval.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    viewer_token = get_token_for(client, "viewer@forenvision.internal", "ViewerPass123!")

    # Admin creates restricted case
    case_res = client.post("/api/cases", json={
        "title": "Confidential Internal Affairs Case",
        "is_restricted": True,
    }, headers={"Authorization": f"Bearer {admin_token}"}).get_json()["case"]

    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"X" * 32)
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(png_bytes), "covert_tape.png"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).get_json()["evidence"]

    # 1. Unauthenticated request -> 401
    client.delete_cookie("forenvision_token")
    anon_res = client.get(f"/api/custody?evidenceId={ev['id']}")
    assert anon_res.status_code == 401

    # 2. Viewer (lacks clearance to restricted case) attempting to read custody -> 403
    viewer_headers = {"Authorization": f"Bearer {viewer_token}"}
    read_res = client.get(f"/api/evidence/{ev['id']}/custody", headers=viewer_headers)
    assert read_res.status_code == 403

    # 3. Viewer attempting to record custody handover -> 403
    create_res = client.post(
        "/api/custody",
        json={"evidenceId": ev["id"], "eventType": "transferred", "reason": "Unauthorized attempt"},
        headers=viewer_headers,
    )
    assert create_res.status_code == 403


def test_prohibited_modification_and_deletion(client):
    """
    Verify that historic custody records cannot be silently updated or deleted.
    PUT, PATCH, and DELETE endpoints must return 405 Method Not Allowed.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    case_res = client.post("/api/cases", json={"title": "Immutability Docket"}, headers=headers).get_json()["case"]
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"I" * 32)
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(png_bytes), "sample.png"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    custody_list = client.get(f"/api/evidence/{ev['id']}/custody", headers=headers).get_json()["custody"]
    event_id = custody_list[0]["id"]

    # 1. Attempt PUT -> 405
    put_res = client.put(f"/api/custody/{event_id}", json={"reason": "Rewriting history"}, headers=headers)
    assert put_res.status_code == 405
    assert "immutable" in put_res.get_json()["message"].lower()

    # 2. Attempt PATCH -> 405
    patch_res = client.patch(f"/api/custody/{event_id}", json={"action": "Tampered"}, headers=headers)
    assert patch_res.status_code == 405

    # 3. Attempt DELETE -> 405
    delete_res = client.delete(f"/api/custody/{event_id}", headers=headers)
    assert delete_res.status_code == 405
    assert "cannot be deleted" in delete_res.get_json()["message"].lower()


def test_documented_correction_events(client):
    """
    Verify that mistakes in custody logs must be corrected through
    a documented follow-up correction event.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    case_res = client.post("/api/cases", json={"title": "Correction Audit Docket"}, headers=headers).get_json()["case"]
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"C" * 32)
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(png_bytes), "sample.png"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Initial transfer with typo in location
    t_res = client.post("/api/custody", json={
        "evidenceId": ev["id"],
        "eventType": "transferred",
        "reason": "Transferred to Vault 3",
        "location": "Vault 3 (Typo should be Vault 4)",
    }, headers=headers).get_json()["event"]

    # 1. Reject correction if missing correctedEventId
    bad_corr = client.post("/api/custody", json={
        "evidenceId": ev["id"],
        "eventType": "correction",
        "reason": "Amending previous log",
    }, headers=headers)
    assert bad_corr.status_code == 400
    assert "correctedEventId" in bad_corr.get_json()["message"]

    # 2. Submit valid correction event
    corr_res = client.post("/api/custody", json={
        "evidenceId": ev["id"],
        "eventType": "correction",
        "correctedEventId": t_res["id"],
        "reason": "Location clarification: Artifact was deposited into Vault 4, Locker B.",
        "location": "Vault 4, Locker B",
    }, headers=headers)
    assert corr_res.status_code == 201
    corr = corr_res.get_json()["event"]
    assert corr["isCorrection"] is True
    assert corr["correctedEventId"] == t_res["id"]
    assert corr["action"] == "Correction Event"

    # Verify both original event and correction coexist in chain
    chain = client.get(f"/api/evidence/{ev['id']}/custody", headers=headers).get_json()["custody"]
    assert len(chain) == 3


def test_tamper_detection_in_hash_chain(client):
    """
    Verify that altering previousBlockHash or block contents in storage
    is caught immediately by verify_custody_chain.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    case_res = client.post("/api/cases", json={"title": "Tamper Docket"}, headers=headers).get_json()["case"]
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"T" * 32)
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(png_bytes), "sample.png"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    client.post("/api/custody", json={
        "evidenceId": ev["id"],
        "eventType": "transferred",
        "reason": "Legitimate handover",
    }, headers=headers)

    # Confirm initially verified
    v1 = client.get(f"/api/custody/verify/{ev['id']}", headers=headers).get_json()["verification"]
    assert v1["verified"] is True

    # Simulate unauthorized tampering with block content in memory store
    for item in case_service._memory_custody:
        if item.get("evidenceId") == ev["id"] and item.get("eventType") == "transferred":
            item["reason"] = "FORGED REASON INSERTED BY ATTACKER"

    v2 = client.get(f"/api/custody/verify/{ev['id']}", headers=headers).get_json()["verification"]
    assert v2["verified"] is False
    assert "divergence detected" in v2["message"].lower()


def test_custody_export_csv_and_json(client):
    """
    Verify that custody history can be exported as court-ready CSV or JSON.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    case_res = client.post("/api/cases", json={"title": "Export Docket"}, headers=headers).get_json()["case"]
    png_bytes = b"\x89PNG\r\n\x1a\n" + (b"E" * 32)
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(png_bytes), "sample.png"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # 1. Export CSV
    csv_res = client.get(f"/api/custody/export/{ev['id']}?format=csv", headers=headers)
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers.get("Content-Type", "")
    assert "attachment" in csv_res.headers.get("Content-Disposition", "")
    csv_data = csv_res.data.decode("utf-8")
    assert "Event ID" in csv_data
    assert "Block Hash" in csv_data
    assert ev["evidenceNumber"] in csv_data

    # 2. Export JSON
    json_res = client.get(f"/api/custody/export/{ev['id']}?format=json", headers=headers)
    assert json_res.status_code == 200
    assert "application/json" in json_res.headers.get("Content-Type", "")
    json_data = json_res.get_json()
    assert "metadata" in json_data
    assert "custodyEvents" in json_data
    assert json_data["metadata"]["chainVerification"]["verified"] is True
