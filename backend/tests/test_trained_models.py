"""
Integration Tests for Dataset-Trained ForenVision AI Models:
- Custom YOLOv8n Firearm & Person Detector (ONNX via OpenCV DNN)
- Dual Forensic Scan Ensemble (YOLOv8n + YOLOv4-tiny)
- CUHK Cross-Modality Sketch-to-Photo Feature Adapter (NumPy/SFace)
- Report compiler accuracy for object detection results
- Settings endpoint RBAC and persistence
"""

from __future__ import annotations

import io
from pathlib import Path
import pytest

from services.case_service import case_service
from services.evidence_service import evidence_service
from services.object_detection_service import object_detection_service
from services.sketch_service import sketch_service
from services.report_service import report_service


BASE_DIR = Path(__file__).resolve().parent.parent.parent
GUN_VAL_IMAGE = BASE_DIR / "datasets" / "prepared" / "gun_detection" / "images" / "val" / "000_0.jpg"
GUN_TEST_IMAGE = BASE_DIR / "datasets" / "prepared" / "gun_detection" / "images" / "test" / "009_9.jpeg"
CUHK_SKETCH_IMAGE = BASE_DIR / "datasets" / "raw" / "cuhk_face_sketch" / "sketches" / "F2-005-01-sz1.jpg"
CUHK_PHOTO_IMAGE = BASE_DIR / "datasets" / "raw" / "cuhk_face_sketch" / "photos" / "f-005-01.jpg"


def get_token_for(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_state():
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    object_detection_service.reset_in_memory_state()
    sketch_service.reset_in_memory_state()
    report_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    object_detection_service.reset_in_memory_state()
    sketch_service.reset_in_memory_state()
    report_service.reset_in_memory_state()


def test_gun_detector_model_info_and_available_models(client):
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    # Default model info lists availableModels including trained gun detector
    default_res = client.get("/api/analysis/detection/model-info", headers=headers)
    assert default_res.status_code == 200
    default_info = default_res.get_json()["modelInfo"]
    assert "availableModels" in default_info
    ids = {m["modelId"] for m in default_info["availableModels"]}
    assert {"yolov4-tiny", "forensic-gun-yolov8", "combined"}.issubset(ids)

    # Specific model info for trained YOLOv8n firearm & person model
    gun_res = client.get("/api/analysis/detection/model-info?modelId=forensic-gun-yolov8", headers=headers)
    assert gun_res.status_code == 200
    gun_info = gun_res.get_json()["modelInfo"]
    assert gun_info["modelId"] == "forensic-gun-yolov8"
    assert gun_info["supportedClasses"] == ["person", "gun"]
    assert "evaluationMetrics" in gun_info
    assert gun_info["evaluationMetrics"]["heldOutTest"]["mAP50"] >= 0.0
    assert gun_info["onnxSha256"]


def test_trained_gun_detector_and_combined_inference(client):
    assert GUN_VAL_IMAGE.is_file(), f"Missing gun dataset image at {GUN_VAL_IMAGE}"
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Firearm Scene Analysis"}, headers=headers).get_json()["case"]
    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(GUN_VAL_IMAGE.read_bytes()), "scene_000.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    )
    assert ev_res.status_code == 201
    evidence_id = ev_res.get_json()["evidence"]["id"]

    # 1. Run trained YOLOv8n gun & person detector
    det_res = client.post(
        "/api/analysis/detection/run",
        json={
            "evidenceId": evidence_id,
            "modelId": "forensic-gun-yolov8",
            "confidenceThreshold": 0.25,
            "nmsThreshold": 0.45,
        },
        headers=headers,
    )
    assert det_res.status_code == 200
    data = det_res.get_json()["data"]
    assert data["modelId"] == "forensic-gun-yolov8"
    assert data["summary"]["totalObjects"] >= 1
    assert all(d["className"] in {"person", "gun"} for d in data["detectedObjects"])

    vis_res = client.get(f"/api/analysis/detection/derived/{data['id']}", headers=headers)
    assert vis_res.status_code == 200
    assert vis_res.data[:2] == b"\xff\xd8"

    # 2. Run Dual Forensic Scan (combined)
    comb_res = client.post(
        "/api/analysis/detection/run",
        json={
            "evidenceId": evidence_id,
            "modelId": "combined",
            "confidenceThreshold": 0.25,
            "nmsThreshold": 0.45,
        },
        headers=headers,
    )
    assert comb_res.status_code == 200
    comb_data = comb_res.get_json()["data"]
    assert comb_data["modelId"] == "combined"
    assert comb_data["summary"]["totalObjects"] >= 1
    assert all("sourceModel" in d for d in comb_data["detectedObjects"])

    # 3. Invalid modelId rejected cleanly
    bad_res = client.post(
        "/api/analysis/detection/run",
        json={"evidenceId": evidence_id, "modelId": "unknown-model"},
        headers=headers,
    )
    assert bad_res.status_code == 400


def test_cuhk_experimental_sketch_probe_and_clearance(client):
    assert CUHK_SKETCH_IMAGE.is_file() and CUHK_PHOTO_IMAGE.is_file()
    inv_token = get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!")
    viewer_token = get_token_for(client, "viewer@forenvision.internal", "ViewerPass123!")
    headers_inv = {"Authorization": f"Bearer {inv_token}"}
    headers_viewer = {"Authorization": f"Bearer {viewer_token}"}

    # Verify methodology includes trained experimental model while keeping official Daubert status
    meth_res = client.get("/api/analysis/sketch/methodology", headers=headers_inv)
    assert meth_res.status_code == 200
    meth_data = meth_res.get_json()["data"]
    assert meth_data["modelStatus"]["automatedMatching"] == "UNAVAILABLE_UNVALIDATED"
    assert meth_data["experimentalModel"]["available"] is True
    assert meth_data["experimentalModel"]["evaluationMetrics"]["heldOutTest"]["cuhkTrainedAdapter"]["rocAuc"] > 0.9

    case_res = client.post("/api/cases", json={"title": "CUHK Probe Docket", "is_restricted": True}, headers=headers_inv).get_json()["case"]
    case_id = case_res["id"]

    sketch_ev = client.post(
        "/api/analysis/sketch/upload",
        data={"file": (io.BytesIO(CUHK_SKETCH_IMAGE.read_bytes()), "sketch_f005.jpg"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=headers_inv,
    ).get_json()["data"]

    photo_ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(CUHK_PHOTO_IMAGE.read_bytes()), "photo_f005.jpg"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=headers_inv,
    ).get_json()["evidence"]

    # Viewer denied
    denied = client.post(
        "/api/analysis/sketch/compare-experimental",
        json={"sketchEvidenceId": sketch_ev["id"], "referenceEvidenceId": photo_ev["id"]},
        headers=headers_viewer,
    )
    assert denied.status_code == 403

    # Authorized investigator runs CUHK experimental cross-modality probe
    probe_res = client.post(
        "/api/analysis/sketch/compare-experimental",
        json={"sketchEvidenceId": sketch_ev["id"], "referenceEvidenceId": photo_ev["id"]},
        headers=headers_inv,
    )
    assert probe_res.status_code == 200
    probe = probe_res.get_json()["data"]
    assert probe["experimentalStatus"] == "EXPERIMENTAL_CUHK_TRAINED_DIAGNOSTIC"
    assert probe["admissibilityStatus"] == "NOT_VALIDATED_FOR_DAUBERT_FRYE_IDENTIFICATION"
    assert -1.0 <= probe["metrics"]["alignedCosineSimilarity"] <= 1.0
    assert probe["sketchEvidence"]["faceDetection"]["detected"] is True
    assert probe["referenceEvidence"]["faceDetection"]["detected"] is True

    vis_res = client.get(f"/api/analysis/sketch/derived/{probe['analysisId']}", headers=headers_inv)
    assert vis_res.status_code == 200
    assert vis_res.data[:2] == b"\xff\xd8"


def test_settings_rbac_and_pdf_report_with_object_detection(client):
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    inv_token = get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    inv_headers = {"Authorization": f"Bearer {inv_token}"}

    # Settings endpoints enforce admin RBAC
    assert client.get("/api/settings", headers=inv_headers).status_code == 403
    get_set = client.get("/api/settings", headers=admin_headers)
    assert get_set.status_code == 200
    assert "autoVerifyHashes" in get_set.get_json()["settings"]

    upd_set = client.patch("/api/settings", json={"retentionPolicyDays": 540}, headers=admin_headers)
    assert upd_set.status_code == 200
    assert upd_set.get_json()["settings"]["retentionPolicyDays"] == 540

    # Generate PDF report containing a real object detection run
    case_res = client.post("/api/cases", json={"title": "Report Detection Integration"}, headers=admin_headers).get_json()["case"]
    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(GUN_TEST_IMAGE.read_bytes()), "test_009.jpeg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=admin_headers,
    ).get_json()["evidence"]

    client.post(
        "/api/analysis/detection/run",
        json={"evidenceId": ev_res["id"], "modelId": "forensic-gun-yolov8", "confidenceThreshold": 0.25},
        headers=admin_headers,
    )

    rep_res = client.post(
        "/api/reports/generate",
        json={"caseId": case_res["id"], "title": "Firearm Localization Court Exhibit"},
        headers=admin_headers,
    )
    assert rep_res.status_code == 201
    report_id = rep_res.get_json()["data"]["id"]
    pdf_res = client.get(f"/api/reports/{report_id}/pdf", headers=admin_headers)
    assert pdf_res.status_code == 200
    assert pdf_res.data[:4] == b"%PDF"


def test_history_json_sanitization_and_report_inclusion(client):
    from bson import ObjectId
    from services.case_service import case_service as cs

    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    case_res = client.post("/api/cases", json={"title": "Sanitization & Full Report Check"}, headers=headers).get_json()["case"]
    ev_scene = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(GUN_TEST_IMAGE.read_bytes()), "scene.jpeg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]
    ev_sketch = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(CUHK_SKETCH_IMAGE.read_bytes()), "sketch.jpg"), "caseId": case_res["id"], "type": "sketch"},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]
    ev_photo = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(CUHK_PHOTO_IMAGE.read_bytes()), "photo.jpg"), "caseId": case_res["id"], "type": "face"},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Execute ELA + experimental CUHK probe
    ela_res = client.post("/api/analysis/image/ela", json={"evidenceId": ev_scene["id"]}, headers=headers)
    assert ela_res.status_code == 200
    probe_res = client.post(
        "/api/analysis/sketch/compare-experimental",
        json={"sketchEvidenceId": ev_sketch["id"], "referenceEvidenceId": ev_photo["id"]},
        headers=headers,
    )
    assert probe_res.status_code == 200

    # Simulate MongoDB ObjectId presence in both memory analysis caches to guard JSON serialization
    for rec in cs._memory_analyses:
        rec["_id"] = ObjectId()
        rec["_derivedDiskPath"] = "/tmp/private/test.jpg"
    for rec in evidence_service._memory_analyses:
        rec["_id"] = ObjectId()
        rec["_derivedDiskPath"] = "/tmp/private/test.jpg"

    hist_img = client.get(f"/api/analysis/image/history/{ev_scene['id']}", headers=headers)
    assert hist_img.status_code == 200
    assert len(hist_img.get_json()["history"]) >= 1
    assert "_id" not in hist_img.get_json()["history"][0]

    ev_analyses = client.get(f"/api/evidence/{ev_scene['id']}/analyses", headers=headers)
    assert ev_analyses.status_code == 200

    rep = client.post(
        "/api/reports/generate",
        json={"caseId": case_res["id"], "title": "Multi-Modal Forensic Report"},
        headers=headers,
    )
    assert rep.status_code == 201
    rep_data = rep.get_json()["data"]
    assert len(rep_data["analyses"]["imageForensics"]) >= 1
    assert len(rep_data["analyses"]["sketchSessions"]) >= 1


def test_real_detection_confidence_and_analytics_benchmarks(client):
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    case_res = client.post(
        "/api/cases",
        json={"title": "Real Accuracy Telemetry Check"},
        headers=headers,
    ).get_json()["case"]

    ev_scene = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(GUN_VAL_IMAGE.read_bytes()), "scene_000.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # 1. Trained YOLOv8n gun model returns real per-run confidence stats + verified benchmarks
    gun_det = client.post(
        "/api/analysis/detection/run",
        json={"evidenceId": ev_scene["id"], "modelId": "forensic-gun-yolov8", "confidenceThreshold": 0.25},
        headers=headers,
    )
    assert gun_det.status_code == 200
    det_data = gun_det.get_json()["data"]
    cstats = det_data["summary"]["confidenceStats"]
    assert cstats["meanPercent"] is not None
    assert 0.0 < cstats["minPercent"] <= cstats["meanPercent"] <= cstats["maxPercent"] <= 100.0
    assert "gun" in cstats["perClassMeanPercent"]
    assert det_data["modelInfo"]["benchmarkMetrics"]["heldOutTest"]["mAP50"] == 0.995

    # 2. YOLOv4-tiny baseline leaves benchmarkMetrics None (zero fabricated benchmarks)
    coco_det = client.post(
        "/api/analysis/detection/run",
        json={"evidenceId": ev_scene["id"], "modelId": "yolov4-tiny", "confidenceThreshold": 0.25},
        headers=headers,
    )
    assert coco_det.status_code == 200
    assert coco_det.get_json()["data"]["modelInfo"]["benchmarkMetrics"] is None

    # 3. Analytics overview aggregates real benchmarks + live DB detection confidence
    ov_res = client.get("/api/analytics/overview?range=all", headers=headers)
    assert ov_res.status_code == 200
    ov = ov_res.get_json()["data"]
    mad = ov["modelAccuracyAndDetections"]
    assert mad["trainedBenchmarks"]["gunDetector"]["evaluationMetrics"]["heldOutTest"]["mAP50"] == 0.995
    assert mad["trainedBenchmarks"]["sketchAdapter"]["evaluationMetrics"]["heldOutTest"]["cuhkTrainedAdapter"]["rank1Accuracy"] == 0.8929
    live_od = mad["liveDetectionStats"]["objectDetection"]
    assert live_od["runsCount"] >= 2
    assert live_od["meanConfidencePercent"] > 0
    assert ov["processingTimes"]["available"] is True


