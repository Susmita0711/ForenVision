"""
Unit and Integration tests for Criminal Sketch Analysis & Morphological Review Module:
- Scientific methodology, cognitive limitations, Daubert/Frye admissibility caveats
- Authorized sketch evidence upload and case association (preserving original bytes)
- Image preprocessing (grayscale, CLAHE, edge/stroke extraction, inversion)
- Comparison session recording (spatial annotations, morphological checklist, parameters)
- Enforcing case-level authorization and rejecting unauthorized access (403)
- Non-existent and corrupt evidence handling (404/400)
- Historical session auditing and persistence
- Authenticated derived visualization streaming
- Strict compliance: no fabricated similarity scores, no automated accusations, no mass scraping
"""

import io
from pathlib import Path
import pytest

from services.case_service import case_service
from services.evidence_service import evidence_service
from services.sketch_service import sketch_service


FIXTURES_DIR = Path(__file__).parent / "fixtures"
SAMPLE_SKETCH_PATH = FIXTURES_DIR / "sample_face_scene_1.jpg"
SAMPLE_PHOTO_PATH = FIXTURES_DIR / "sample_face_scene_mate.jpg"


def get_token_for(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_system_state():
    """Reset all in-memory states before and after each test."""
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    sketch_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    sketch_service.reset_in_memory_state()


def test_get_sketch_methodology_documentation(client):
    """
    Verify GET /api/analysis/sketch/methodology returns complete, transparent documentation
    on cognitive memory limitations, unvalidated model status, and forensic disclaimers.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    res = client.get("/api/analysis/sketch/methodology", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.get_json()

    assert data["status"] == "success"
    info = data["data"]
    assert "methodology" in info
    methodology = info["methodology"]

    # Verify model status transparently acknowledges lack of validated Daubert model
    assert info["modelStatus"]["automatedMatching"] == "UNAVAILABLE_UNVALIDATED"
    assert info["modelStatus"]["humanReviewRequired"] is True

    # Verify documented scientific limitations and cognitive factors
    assert "forensicDisclaimer" in info
    disclaimer = info["forensicDisclaimer"].lower()
    assert "witness memory" in disclaimer
    assert "daubert/frye" in disclaimer
    assert "ace-v" in disclaimer
    assert "suspect" in disclaimer

    # Verify preprocessing and morphological features
    assert "supportedPreprocessing" in methodology
    assert "morphologicalFeatureCategories" in methodology


def test_upload_sketch_evidence(client):
    """
    Verify POST /api/analysis/sketch/upload ingests sketch evidence into a case,
    computes SHA-256 hash, and marks type as 'sketch'.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Armed Robbery Composite Docket"}, headers=headers).get_json()["case"]
    case_id = case_res["id"]

    with open(SAMPLE_SKETCH_PATH, "rb") as f:
        sketch_bytes = f.read()

    res = client.post(
        "/api/analysis/sketch/upload",
        data={
            "file": (io.BytesIO(sketch_bytes), "witness_composite_1.jpg"),
            "caseId": case_id,
            "notes": "Composite sketch drawn from teller eyewitness interview.",
        },
        content_type="multipart/form-data",
        headers=headers,
    )
    assert res.status_code == 201
    ev_data = res.get_json()["data"]

    assert ev_data["type"] == "sketch"
    assert ev_data["caseId"] == case_id
    assert "sha256Hash" in ev_data
    assert len(ev_data["sha256Hash"]) == 64
    assert ev_data["originalFileName"] == "witness_composite_1.jpg"


def test_sketch_preprocessing_pipeline(client):
    """
    Verify POST /api/analysis/sketch/preprocess applies documented filters
    (grayscale, CLAHE, Canny edge detection, inversion) onto a working copy.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Preprocessing Docket"}, headers=headers).get_json()["case"]

    with open(SAMPLE_SKETCH_PATH, "rb") as f:
        sketch_bytes = f.read()

    ev_res = client.post(
        "/api/analysis/sketch/upload",
        data={"file": (io.BytesIO(sketch_bytes), "pencil_sketch.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["data"]
    evidence_id = ev_res["id"]

    # Apply edge extraction and CLAHE
    res = client.post(
        "/api/analysis/sketch/preprocess",
        json={
            "evidenceId": evidence_id,
            "params": {
                "grayscale": True,
                "clahe": True,
                "claheClipLimit": 2.5,
                "edgeFilter": "canny",
                "cannyLow": 60,
                "cannyHigh": 160,
                "invert": True,
                "contrast": 1.2,
            },
        },
        headers=headers,
    )
    assert res.status_code == 200
    data = res.get_json()

    assert data["status"] == "success"
    assert "previewDataUrl" in data
    assert data["previewDataUrl"].startswith("data:image/jpeg;base64,")
    assert data["effectiveParams"]["edgeFilter"] == "canny"
    assert data["effectiveParams"]["invert"] is True


def test_create_and_retrieve_comparison_session(client):
    """
    Verify POST /api/analysis/sketch/session saves full morphological comparison session,
    records spatial annotations and checklist, renders composite visualization, and links to case.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Bank Heist Review"}, headers=headers).get_json()["case"]
    case_id = case_res["id"]

    with open(SAMPLE_SKETCH_PATH, "rb") as f:
        sketch_bytes = f.read()
    with open(SAMPLE_PHOTO_PATH, "rb") as f:
        photo_bytes = f.read()

    # Upload Sketch
    sketch_ev = client.post(
        "/api/analysis/sketch/upload",
        data={"file": (io.BytesIO(sketch_bytes), "sketch_artist_dwg.jpg"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["data"]

    # Upload Reference Photo
    photo_ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(photo_bytes), "reference_custody_photo.jpg"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Create Comparison Session with Morphological Annotations
    session_payload = {
        "sketchEvidenceId": sketch_ev["id"],
        "referenceEvidenceId": photo_ev["id"],
        "title": "Bank Heist Witness Sketch vs Custody Exemplar",
        "sketchPreprocessing": {"grayscale": True, "clahe": True, "edgeFilter": "none"},
        "referencePreprocessing": {"grayscale": True, "contrast": 1.1},
        "annotations": [
            {
                "id": "ann_1",
                "target": "sketch",
                "feature": "orbital_eyes",
                "x": 0.45,
                "y": 0.42,
                "notes": "Witness noted hooded eyelids with downward lateral slant.",
            },
            {
                "id": "ann_2",
                "target": "reference",
                "feature": "orbital_eyes",
                "x": 0.46,
                "y": 0.43,
                "notes": "Exemplar exhibits noticeable downward orbital slant.",
                "linkedAnnotationId": "ann_1",
            },
            {
                "id": "ann_3",
                "target": "sketch",
                "feature": "mandibular_jawline_chin",
                "x": 0.50,
                "y": 0.75,
                "notes": "Prominent square mandibular angle in sketch.",
            },
        ],
        "morphologicalChecklist": {
            "orbitalCongruence": "Consistent",
            "nasalAperture": "Moderate Congruence",
            "mandibularContour": "Consistent",
            "hairlineReliability": "Inconclusive (Witness noted hat was worn)",
        },
        "examinerNotes": (
            "Manual morphological comparison conducted under OSAC facial comparison guidelines. "
            "Congruence observed in orbital structure and mandibular contour; ear morphology obscured by cap. "
            "No automated score utilized."
        ),
    }

    res = client.post("/api/analysis/sketch/session", json=session_payload, headers=headers)
    assert res.status_code == 201
    session_data = res.get_json()["data"]

    session_id = session_data["sessionId"]
    assert session_data["caseId"] == case_id
    assert session_data["annotationsCount"] == 3
    assert session_data["sketchEvidence"]["id"] == sketch_ev["id"]
    assert session_data["referenceEvidence"]["id"] == photo_ev["id"]

    # Verify no fabricated similarity percentage
    assert "similarityScore" not in session_data
    assert "matchPercentage" not in session_data

    # 1. Retrieve Single Session
    get_res = client.get(f"/api/analysis/sketch/session/{session_id}", headers=headers)
    assert get_res.status_code == 200
    retrieved = get_res.get_json()["data"]
    assert retrieved["title"] == session_payload["title"]

    # 2. Retrieve History for Sketch Evidence
    hist_res = client.get(f"/api/analysis/sketch/history/{sketch_ev['id']}", headers=headers)
    assert hist_res.status_code == 200
    assert hist_res.get_json()["count"] >= 1

    # 3. Stream Derived Composite Visualization
    vis_res = client.get(f"/api/analysis/sketch/derived/{session_id}", headers=headers)
    assert vis_res.status_code == 200
    assert vis_res.mimetype == "image/jpeg"
    assert len(vis_res.data) > 1000
    assert vis_res.data[:2] == b"\xff\xd8"


def test_sketch_unauthorized_case_access_rejected(client):
    """
    Verify that an examiner without clearance to a case receives 403 Forbidden
    when attempting to record a sketch session or stream derived visualizations.
    """
    examiner1_token = get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!")
    examiner2_token = get_token_for(client, "analyst@forenvision.internal", "AnalystPass123!")

    headers1 = {"Authorization": f"Bearer {examiner1_token}"}
    headers2 = {"Authorization": f"Bearer {examiner2_token}"}

    # Examiner 1 creates private case
    case_res = client.post(
        "/api/cases",
        json={"title": "Classified Sketch Inquiry", "is_restricted": True},
        headers=headers1,
    ).get_json()["case"]
    case_id = case_res["id"]

    with open(SAMPLE_SKETCH_PATH, "rb") as f:
        sketch_bytes = f.read()

    ev1 = client.post(
        "/api/analysis/sketch/upload",
        data={"file": (io.BytesIO(sketch_bytes), "confidential_sketch.jpg"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=headers1,
    ).get_json()["data"]

    ev2 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(sketch_bytes), "confidential_photo.jpg"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=headers1,
    ).get_json()["evidence"]

    # Examiner 2 receives 403 on comparison session creation
    unauth_session = client.post(
        "/api/analysis/sketch/session",
        json={"sketchEvidenceId": ev1["id"], "referenceEvidenceId": ev2["id"]},
        headers=headers2,
    )
    assert unauth_session.status_code == 403
    assert "access" in unauth_session.get_json()["message"].lower()

    # Examiner 1 creates session successfully
    auth_session = client.post(
        "/api/analysis/sketch/session",
        json={"sketchEvidenceId": ev1["id"], "referenceEvidenceId": ev2["id"]},
        headers=headers1,
    ).get_json()["data"]
    session_id = auth_session["sessionId"]

    # Examiner 2 receives 403 on streaming visualization
    unauth_vis = client.get(
        f"/api/analysis/sketch/derived/{session_id}",
        headers=headers2,
    )
    assert unauth_vis.status_code == 403


def test_sketch_error_handling_and_validation(client):
    """
    Verify rejection of invalid fields, missing files, identical evidence items, and non-existent records.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    # Missing caseId on upload
    bad_upload = client.post(
        "/api/analysis/sketch/upload",
        data={"file": (io.BytesIO(b"fakebytes"), "test.jpg")},
        content_type="multipart/form-data",
        headers=headers,
    )
    assert bad_upload.status_code == 400

    # Non-existent session retrieval
    non_existent = client.get("/api/analysis/sketch/session/sk_nonexistent123", headers=headers)
    assert non_existent.status_code == 404

    # Identical sketch and reference IDs rejected
    bad_session = client.post(
        "/api/analysis/sketch/session",
        json={"sketchEvidenceId": "evd_123", "referenceEvidenceId": "evd_123"},
        headers=headers,
    )
    assert bad_session.status_code == 400
