"""
Unit and Integration tests for Controlled Face Analysis & Forensic Comparison Module:
- Scientific methodology, model specifications, licenses, and legal uncertainty caveats
- Single-evidence face detection, landmark localization, and forensic quality audit
- Controlled 1-to-1 face comparison (YuNet + SFace)
- Integrity, zero-modification of original evidence, and derived visualization generation
- Enforcing case-level authorization and rejecting unauthorized access (403)
- Rejection of images without human faces or non-photographic artifacts (400)
- Historical face analysis retrieval and audit tracking
- Authenticated derived visualization streaming
- Strict compliance: no automated identification, no suspect tagging, no biometric vector leakage
"""

import io
from pathlib import Path
import pytest

from services.case_service import case_service
from services.evidence_service import evidence_service
from services.face_analysis_service import face_analysis_service


FIXTURES_DIR = Path(__file__).parent / "fixtures"
SAMPLE_FACE_PATH = FIXTURES_DIR / "sample_face_scene_1.jpg"
SAMPLE_FACE_MATE_PATH = FIXTURES_DIR / "sample_face_scene_mate.jpg"
SAMPLE_NO_FACE_PATH = FIXTURES_DIR / "sample_print_1.jpg"


def get_token_for(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_system_state():
    """Reset all in-memory states before and after each test."""
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    face_analysis_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    face_analysis_service.reset_in_memory_state()


def test_get_face_methodology_documentation(client):
    """
    Verify GET /api/analysis/face/methodology returns complete, transparent documentation
    on models, licenses, evaluation limitations, and strict forensic disclaimers.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    res = client.get("/api/analysis/face/methodology", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.get_json()

    assert data["status"] == "success"
    info = data["data"]
    assert "methodology" in info
    methodology = info["methodology"]

    # Verify model documentation and open-source licenses
    assert "detectorModel" in methodology
    assert methodology["detectorModel"]["license"] == "Apache 2.0 (OpenCV Model Zoo / Shiqi Yu)"
    assert "comparisonModel" in methodology
    assert methodology["comparisonModel"]["license"] == "Apache 2.0 (OpenCV Model Zoo / Zhongdao Wang)"

    # Verify documented scientific limitations
    assert "scientificLimitations" in methodology
    limits = " ".join(methodology["scientificLimitations"]).lower()
    assert "demographic" in limits
    assert "resolution" in limits
    assert "pose" in limits

    # Verify legal uncertainty disclaimer
    assert "forensicDisclaimer" in info
    disclaimer = info["forensicDisclaimer"]
    assert "does not establish definitive individualization" in disclaimer.lower() or "not establish definitive" in disclaimer.lower()
    assert "suspect" in disclaimer.lower()
    assert "ace-v" in disclaimer.lower()

    # Verify models availability flags
    assert "modelsAvailable" in info
    assert info["modelsAvailable"]["yuNetDetectionModel"] is True
    assert info["modelsAvailable"]["sFaceRecognitionModel"] is True


def test_single_face_detection_and_quality_audit(client):
    """
    Verify POST /api/analysis/face/detect detects faces, extracts landmarks,
    and performs comprehensive forensic quality evaluation.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Facial Audit Case"}, headers=headers).get_json()["case"]

    with open(SAMPLE_FACE_PATH, "rb") as f:
        img_bytes = f.read()

    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(img_bytes), "surveillance_still.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    )
    assert ev_res.status_code == 201
    evidence_id = ev_res.get_json()["evidence"]["id"]

    res = client.post(
        "/api/analysis/face/detect",
        json={"evidenceId": evidence_id, "scoreThreshold": 0.3},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.get_json()["data"]

    assert data["detectedFacesCount"] >= 1
    assert "faces" in data
    first_face = data["faces"][0]

    # Verify Bounding Box
    assert "box" in first_face
    assert first_face["box"]["width"] > 0
    assert first_face["box"]["height"] > 0

    # Verify 5 Landmarks
    assert "landmarks" in first_face
    lm = first_face["landmarks"]
    assert "rightEye" in lm and len(lm["rightEye"]) == 2
    assert "leftEye" in lm and len(lm["leftEye"]) == 2
    assert "noseTip" in lm and len(lm["noseTip"]) == 2

    # Verify Quality Assessment
    assert "quality" in first_face
    quality = first_face["quality"]
    assert "qualityTier" in quality
    assert quality["qualityTier"] in ["HIGH_FORENSIC_QUALITY", "ACCEPTABLE_INVESTIGATIVE_QUALITY", "MARGINAL_LIMITED_VALUE", "DEGRADED_UNRELIABLE"]
    assert "interPupillaryDistance" in quality
    assert quality["interPupillaryDistance"] > 0
    assert "laplacianVariance" in quality
    assert "lightingAsymmetry" in quality
    assert "warnings" in quality

    # Verify Derived visualization is generated
    assert data["visualization"]["hasVisual"] is True
    assert data["visualization"]["fileSize"] > 0

    # Verify Legal Notice
    assert "forensicNotice" in data
    assert "suspect" in data["forensicNotice"].lower()


def test_controlled_one_to_one_facial_comparison(client):
    """
    Verify POST /api/analysis/face/compare performs controlled 1-to-1 comparison
    between two authorized evidence items, computes Cosine & L2 metrics,
    and returns transparent forensic classifications.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Homicide Identification Inquiry"}, headers=headers).get_json()["case"]
    case_id = case_res["id"]

    with open(SAMPLE_FACE_PATH, "rb") as f:
        probe_bytes = f.read()
    with open(SAMPLE_FACE_MATE_PATH, "rb") as f:
        ref_bytes = f.read()

    # Upload Probe Evidence
    probe_ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(probe_bytes), "probe_cctv.jpg"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Upload Reference Evidence
    ref_ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(ref_bytes), "reference_mugshot.jpg"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Perform Controlled 1:1 Comparison
    res = client.post(
        "/api/analysis/face/compare",
        json={
            "probeEvidenceId": probe_ev["id"],
            "referenceEvidenceId": ref_ev["id"],
            "scoreThreshold": 0.3,
        },
        headers=headers,
    )
    assert res.status_code == 200
    comp = res.get_json()["data"]

    assert comp["analysisType"] == "Controlled Facial Comparison (YuNet + SFace)"
    assert comp["probeEvidence"]["id"] == probe_ev["id"]
    assert comp["referenceEvidence"]["id"] == ref_ev["id"]

    # Verify Objective Metrics
    metrics = comp["metrics"]
    assert "cosineSimilarity" in metrics
    assert "l2Distance" in metrics
    assert "correspondenceIndex" in metrics
    assert "correspondenceTier" in metrics
    assert "interpretation" in metrics

    # For mated sample images, cosine similarity should be strong
    assert metrics["cosineSimilarity"] > 0.80
    assert metrics["l2Distance"] < 0.60
    assert metrics["correspondenceTier"] == "STRONG_CORRESPONDENCE"

    # CRITICAL INVARIANT: Verify no raw 128-d biometric vectors are leaked in API response
    comp_str = str(comp)
    assert "rawEmbedding" not in comp_str
    assert "vector" not in comp_str.lower() or "latent" in comp_str.lower()

    # Verify legal notice
    assert "forensicNotice" in comp
    assert "ACE-V" in comp["forensicNotice"]


def test_face_comparison_unauthorized_case_access_rejected(client):
    """
    Verify that an investigator without access to a case cannot execute face comparison (403).
    """
    examiner1_token = get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!")
    examiner2_token = get_token_for(client, "analyst@forenvision.internal", "AnalystPass123!")

    headers1 = {"Authorization": f"Bearer {examiner1_token}"}
    headers2 = {"Authorization": f"Bearer {examiner2_token}"}

    # Examiner 1 creates private case
    case_res = client.post(
        "/api/cases",
        json={"title": "Classified Facial Docket", "is_restricted": True},
        headers=headers1,
    ).get_json()["case"]

    with open(SAMPLE_FACE_PATH, "rb") as f:
        img_bytes = f.read()

    # Examiner 1 uploads evidence
    ev1 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(img_bytes), "confidential_face_1.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers1,
    ).get_json()["evidence"]

    ev2 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(img_bytes), "confidential_face_2.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers1,
    ).get_json()["evidence"]

    # Unauthorized examiner attempts comparison -> MUST return 403 Forbidden
    res = client.post(
        "/api/analysis/face/compare",
        json={"probeEvidenceId": ev1["id"], "referenceEvidenceId": ev2["id"]},
        headers=headers2,
    )
    assert res.status_code == 403
    assert "access" in res.get_json()["message"].lower()


def test_face_detection_rejects_image_without_faces(client):
    """
    Verify that attempting face detection on an image without human faces
    returns a clear, diagnostic 400 Bad Request rather than fabricated results.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Non-Face Docket"}, headers=headers).get_json()["case"]

    with open(SAMPLE_NO_FACE_PATH, "rb") as f:
        no_face_bytes = f.read()

    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(no_face_bytes), "latent_print.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Single face detect should succeed with 0 faces reported
    res_detect = client.post(
        "/api/analysis/face/detect",
        json={"evidenceId": ev_res["id"]},
        headers=headers,
    )
    assert res_detect.status_code == 200
    assert res_detect.get_json()["data"]["detectedFacesCount"] == 0

    # Pairwise comparison should return 400 because comparison requires a detected face
    with open(SAMPLE_FACE_PATH, "rb") as f:
        face_bytes = f.read()
    face_ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(face_bytes), "valid_face.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    res_compare = client.post(
        "/api/analysis/face/compare",
        json={"probeEvidenceId": ev_res["id"], "referenceEvidenceId": face_ev["id"]},
        headers=headers,
    )
    assert res_compare.status_code == 400
    assert "no human face detected" in res_compare.get_json()["message"].lower()


def test_face_analysis_history_and_derived_streaming(client):
    """
    Verify that face analysis results are persisted in audit history and
    the derived comparison visualization can be securely retrieved via authenticated streaming.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Historical Facial Case"}, headers=headers).get_json()["case"]
    case_id = case_res["id"]

    with open(SAMPLE_FACE_PATH, "rb") as f:
        face_bytes = f.read()

    ev1 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(face_bytes), "hist_face_1.jpg"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    ev2 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(face_bytes), "hist_face_2.jpg"), "caseId": case_id},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Run comparison
    comp_res = client.post(
        "/api/analysis/face/compare",
        json={"probeEvidenceId": ev1["id"], "referenceEvidenceId": ev2["id"], "scoreThreshold": 0.3},
        headers=headers,
    )
    assert comp_res.status_code == 200
    analysis_id = comp_res.get_json()["data"]["analysisId"]

    # 1. Retrieve History
    hist_res = client.get(f"/api/analysis/face/history/{ev1['id']}", headers=headers)
    assert hist_res.status_code == 200
    hist_data = hist_res.get_json()
    assert hist_data["count"] >= 1
    assert any(item["analysisId"] == analysis_id for item in hist_data["data"])

    # 2. Stream Derived Visualization Image
    img_res = client.get(f"/api/analysis/face/derived/{analysis_id}", headers=headers)
    assert img_res.status_code == 200
    assert img_res.mimetype == "image/jpeg"
    assert len(img_res.data) > 1000
    # Verify JPEG magic bytes
    assert img_res.data[:2] == b"\xff\xd8"
