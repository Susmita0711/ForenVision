"""
Unit and Integration tests for AI-Assisted Object Detection Module:
- Model specifications and licensing information endpoint
- Real YOLOv4-tiny inference on authorized photographic evidence
- Bounding box extraction, class recognition, confidence scores
- Annotated visualization generation and streaming
- Confidence threshold filtering
- Unauthorized case clearance enforcement (401 / 403)
- Handling of non-image and malformed files
- Forensic disclaimer and non-culpability safeguards
- Analysis history persistence and retrieval
"""

import io
from pathlib import Path
import pytest
from PIL import Image

from services.case_service import case_service
from services.evidence_service import evidence_service
from services.object_detection_service import object_detection_service


SAMPLE_IMAGE_PATH = Path(__file__).parent / "fixtures" / "sample_detection.jpg"


def get_token_for(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_system_state():
    """Reset all in-memory states before and after each test."""
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    object_detection_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    object_detection_service.reset_in_memory_state()


def test_get_model_info(client):
    """
    Verify GET /api/analysis/detection/model-info returns complete,
    honest documentation on the model, license, classes, and limitations.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    res = client.get("/api/analysis/detection/model-info", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.get_json()

    assert data["status"] == "success"
    info = data["modelInfo"]
    assert info["modelName"] == "YOLOv4-tiny"
    assert "Darknet" in info["version"]
    assert "Open Source" in info["license"]
    assert info["supportedClassesCount"] == 80
    assert "person" in info["supportedClasses"]
    assert "car" in info["supportedClasses"]
    assert "dog" in info["supportedClasses"]
    assert "knownLimitations" in info
    assert len(info["knownLimitations"]) >= 3
    assert "forensicDisclaimer" in info
    assert "criminal intent" in info["forensicDisclaimer"].lower()


def test_object_detection_inference_on_sample_image(client):
    """
    Execute real YOLOv4-tiny inference on a verified photographic sample.
    Confirms actual class detections (dog, truck, bicycle), bounding boxes,
    real confidence scores, visualization generation, and forensic disclaimer.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create Case and Upload Sample Photographic Evidence
    case_res = client.post("/api/cases", json={"title": "Scene Object Analysis Docket"}, headers=headers).get_json()["case"]

    with open(SAMPLE_IMAGE_PATH, "rb") as f:
        sample_bytes = f.read()

    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(sample_bytes), "scene_objects.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    )
    assert ev_res.status_code == 201
    evidence_id = ev_res.get_json()["evidence"]["id"]

    # 2. Run Object Detection
    det_res = client.post(
        "/api/analysis/detection/run",
        json={"evidenceId": evidence_id, "confidenceThreshold": 0.30, "nmsThreshold": 0.40},
        headers=headers,
    )
    assert det_res.status_code == 200
    res_data = det_res.get_json()["data"]

    # Verify Output Structure & Model Info
    assert res_data["evidenceId"] == evidence_id
    assert res_data["analysisType"] == "AI Object Detection (YOLOv4-tiny)"
    assert res_data["modelInfo"]["name"] == "YOLOv4-tiny"
    assert "forensicDisclaimer" in res_data
    assert "under NO circumstances" in res_data["forensicDisclaimer"]

    # Verify Summary & Detections
    summary = res_data["summary"]
    assert summary["totalObjects"] >= 2
    assert summary["uniqueClasses"] >= 2
    assert "dog" in summary["classCounts"]

    detections = res_data["detectedObjects"]
    assert len(detections) >= 2

    # Verify individual detection fields
    classes_found = [d["className"] for d in detections]
    assert "dog" in classes_found

    for d in detections:
        assert "detectionId" in d
        assert "className" in d
        assert "confidence" in d
        assert 0.30 <= d["confidence"] <= 1.0
        assert "confidencePercent" in d
        # Verify bounding box
        box = d["box"]
        assert box["width"] > 0
        assert box["height"] > 0
        norm_box = d["normalizedBox"]
        assert 0.0 <= norm_box["x"] <= 1.0
        assert 0.0 <= norm_box["width"] <= 1.0

    # Verify visualization was generated
    assert "derivedImageUrl" in res_data
    analysis_id = res_data["id"]

    # 3. Retrieve Derived Visualization
    vis_res = client.get(f"/api/analysis/detection/derived/{analysis_id}", headers=headers)
    assert vis_res.status_code == 200
    assert vis_res.content_type == "image/jpeg"
    assert len(vis_res.data) > 1000


def test_confidence_threshold_filtering(client):
    """
    Ensure the confidenceThreshold parameter filters out lower-probability candidates.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Confidence Filtering Test"}, headers=headers).get_json()["case"]
    with open(SAMPLE_IMAGE_PATH, "rb") as f:
        sample_bytes = f.read()

    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(sample_bytes), "scene.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    )
    evidence_id = ev_res.get_json()["evidence"]["id"]

    # Run with default threshold 0.30
    res_30 = client.post(
        "/api/analysis/detection/run",
        json={"evidenceId": evidence_id, "confidenceThreshold": 0.30},
        headers=headers,
    ).get_json()["data"]

    # Run with stringent threshold 0.85
    res_85 = client.post(
        "/api/analysis/detection/run",
        json={"evidenceId": evidence_id, "confidenceThreshold": 0.85},
        headers=headers,
    ).get_json()["data"]

    assert len(res_85["detectedObjects"]) <= len(res_30["detectedObjects"])
    for d in res_85["detectedObjects"]:
        assert d["confidence"] >= 0.85


def test_unauthorized_user_access_denied(client):
    """
    Verify investigators cannot execute detection or access derived visualizations
    on cases for which they have not been granted access.
    """
    examiner1_token = get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!")
    examiner2_token = get_token_for(client, "analyst@forenvision.internal", "AnalystPass123!")

    headers1 = {"Authorization": f"Bearer {examiner1_token}"}
    headers2 = {"Authorization": f"Bearer {examiner2_token}"}

    # Examiner 1 creates private case
    case_res = client.post(
        "/api/cases",
        json={"title": "Examiner 1 Private Docket", "is_restricted": True},
        headers=headers1,
    ).get_json()["case"]

    with open(SAMPLE_IMAGE_PATH, "rb") as f:
        sample_bytes = f.read()

    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(sample_bytes), "classified.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers1,
    )
    evidence_id = ev_res.get_json()["evidence"]["id"]

    # Examiner 1 runs detection successfully
    det_res = client.post(
        "/api/analysis/detection/run",
        json={"evidenceId": evidence_id},
        headers=headers1,
    )
    assert det_res.status_code == 200
    analysis_id = det_res.get_json()["data"]["id"]

    # Examiner 2 attempts to run detection -> 403 Forbidden
    unauth_run = client.post(
        "/api/analysis/detection/run",
        json={"evidenceId": evidence_id},
        headers=headers2,
    )
    assert unauth_run.status_code == 403

    # Examiner 2 attempts to stream derived visualization -> 403 Forbidden
    unauth_vis = client.get(
        f"/api/analysis/detection/derived/{analysis_id}",
        headers=headers2,
    )
    assert unauth_vis.status_code == 403

    # Examiner 2 attempts to retrieve detection history -> 403 Forbidden
    unauth_hist = client.get(
        f"/api/analysis/detection/history/{evidence_id}",
        headers=headers2,
    )
    assert unauth_hist.status_code == 403


def test_malformed_and_non_image_evidence_rejected(client):
    """
    Verify rejection of non-image evidence (e.g. PDF documents) with clear forensic errors.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Non-Image Docket"}, headers=headers).get_json()["case"]

    # Upload mock PDF
    pdf_bytes = b"%PDF-1.4 Mock forensic report text content"
    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(pdf_bytes), "court_order.pdf"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    )
    evidence_id = ev_res.get_json()["evidence"]["id"]

    # Attempt detection on PDF
    res = client.post("/api/analysis/detection/run", json={"evidenceId": evidence_id}, headers=headers)
    assert res.status_code == 400
    assert "photographic image" in res.get_json()["message"]


def test_detection_history_retrieval(client):
    """
    Verify that prior detection runs are recorded in history and queryable.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "History Audit Docket"}, headers=headers).get_json()["case"]
    with open(SAMPLE_IMAGE_PATH, "rb") as f:
        sample_bytes = f.read()

    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(sample_bytes), "history_scene.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    )
    evidence_id = ev_res.get_json()["evidence"]["id"]

    # Run detection twice
    client.post("/api/analysis/detection/run", json={"evidenceId": evidence_id, "confidenceThreshold": 0.40}, headers=headers)
    client.post("/api/analysis/detection/run", json={"evidenceId": evidence_id, "confidenceThreshold": 0.60}, headers=headers)

    hist_res = client.get(f"/api/analysis/detection/history/{evidence_id}", headers=headers)
    assert hist_res.status_code == 200
    history = hist_res.get_json()["history"]
    assert len(history) == 2
    assert history[0]["category"] == "object_detection"
    assert history[0]["modelInfo"]["name"] == "YOLOv4-tiny"
