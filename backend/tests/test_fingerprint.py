"""
Unit and Integration tests for Fingerprint Analysis & Biometric Comparison Module:
- Scientific methodology and forensic caveats endpoint
- Preprocessing and standalone image quality evaluation
- Genuine mated pair comparison (SIFT-RANSAC alignment and inlier verification)
- Impostor non-mated pair comparison (demonstrating statistical divergence)
- Topological minutiae extraction (ridge terminations and bifurcations)
- Derived visualization generation and authenticated streaming
- Case clearance and unauthorized access enforcement (403)
- Non-image and corrupted file rejection (400)
- Historical comparison auditing and persistence
"""

import io
from pathlib import Path
import pytest

from services.case_service import case_service
from services.evidence_service import evidence_service
from services.fingerprint_service import fingerprint_service


FIXTURES_DIR = Path(__file__).parent / "fixtures"
PRINT_1_PATH = FIXTURES_DIR / "sample_print_1.jpg"
PRINT_MATE_PATH = FIXTURES_DIR / "sample_print_1_mate.jpg"
PRINT_2_PATH = FIXTURES_DIR / "sample_print_2.jpg"


def get_token_for(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_system_state():
    """Reset all in-memory states before and after each test."""
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    fingerprint_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    fingerprint_service.reset_in_memory_state()


def test_get_methodology_documentation(client):
    """
    Verify GET /api/analysis/fingerprint/methodology returns complete,
    transparent documentation on the SIFT-RANSAC algorithm and forensic disclaimers.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    res = client.get("/api/analysis/fingerprint/methodology", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.get_json()

    assert data["status"] == "success"
    info = data["data"]
    assert "methodology" in info
    assert "preprocessing" in info["methodology"]
    assert "alignmentAndMatching" in info["methodology"]
    assert "scientificLimitations" in info["methodology"]
    assert "forensicDisclaimer" in info
    assert "ACE-V" in info["forensicDisclaimer"]
    assert "individualization" in info["forensicDisclaimer"].lower()


def test_standalone_quality_assessment(client):
    """
    Verify POST /api/analysis/fingerprint/assess-quality computes
    clarity score, dynamic range, and identifies potential quality issues.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Quality Audit Docket"}, headers=headers).get_json()["case"]

    with open(PRINT_1_PATH, "rb") as f:
        print_bytes = f.read()

    ev_res = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(print_bytes), "latent_lift_1.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    )
    assert ev_res.status_code == 201
    evidence_id = ev_res.get_json()["evidence"]["id"]

    res = client.post(
        "/api/analysis/fingerprint/assess-quality",
        json={"evidenceId": evidence_id},
        headers=headers,
    )
    assert res.status_code == 200
    quality = res.get_json()["quality"]

    assert "qualityTier" in quality
    assert quality["qualityTier"] in ["EXCELLENT", "ACCEPTABLE", "MARGINAL", "POOR / INSUFFICIENT"]
    assert "clarityScore" in quality
    assert 0.0 <= quality["clarityScore"] <= 100.0
    assert "usableAreaPercent" in quality
    assert quality["usableAreaPercent"] > 0.0
    assert "warnings" in quality
    assert isinstance(quality["warnings"], list)


def test_genuine_pair_comparison(client):
    """
    Execute comparison between mated impressions (same donor finger with physical rotation/translation).
    Confirms strong inlier count, geometric alignment recovery, minutiae extraction,
    and visualization generation.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Mated Biometric Docket"}, headers=headers).get_json()["case"]

    with open(PRINT_1_PATH, "rb") as f:
        bytes_1 = f.read()
    with open(PRINT_MATE_PATH, "rb") as f:
        bytes_mate = f.read()

    ev1 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(bytes_1), "latent_probe.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    ev2 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(bytes_mate), "tenprint_reference.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Run biometric comparison
    cmp_res = client.post(
        "/api/analysis/fingerprint/compare",
        json={
            "probeEvidenceId": ev1["id"],
            "referenceEvidenceId": ev2["id"],
            "loweRatio": 0.75,
            "ransacThreshold": 5.0,
            "maxFeatures": 800,
        },
        headers=headers,
    )
    assert cmp_res.status_code == 200
    data = cmp_res.get_json()["data"]

    # Verify Probe and Reference structures
    assert data["probeEvidence"]["id"] == ev1["id"]
    assert data["referenceEvidence"]["id"] == ev2["id"]
    assert data["probeEvidence"]["minutiae"]["total"] > 0
    assert data["referenceEvidence"]["minutiae"]["total"] > 0

    # Verify Comparison Metrics (Genuine Mate should yield high inliers)
    metrics = data["comparisonMetrics"]
    assert metrics["inlierCount"] >= 25
    assert metrics["inlierRatio"] >= 0.35
    assert metrics["correspondenceTier"] == "STRONG_CORRESPONDENCE"
    assert "alignment" in metrics
    assert metrics["alignment"] is not None
    assert "rotationDegrees" in metrics["alignment"]

    # Verify forensic disclaimer is present
    assert "forensicDisclaimer" in data
    assert "ACE-V" in data["forensicDisclaimer"]

    # Verify visualization retrieval
    analysis_id = data["id"]
    vis_res = client.get(f"/api/analysis/fingerprint/derived/{analysis_id}", headers=headers)
    assert vis_res.status_code == 200
    assert vis_res.content_type == "image/jpeg"
    assert len(vis_res.data) > 1000


def test_impostor_pair_comparison(client):
    """
    Execute comparison between non-mated impressions (different fingers).
    Confirms algorithmic divergence (near-zero inliers and low inlier ratio).
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Impostor Biometric Docket"}, headers=headers).get_json()["case"]

    with open(PRINT_1_PATH, "rb") as f:
        bytes_1 = f.read()
    with open(PRINT_2_PATH, "rb") as f:
        bytes_2 = f.read()

    ev1 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(bytes_1), "finger_a.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    ev2 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(bytes_2), "finger_b.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Run biometric comparison on non-mated impressions
    cmp_res = client.post(
        "/api/analysis/fingerprint/compare",
        json={
            "probeEvidenceId": ev1["id"],
            "referenceEvidenceId": ev2["id"],
        },
        headers=headers,
    )
    assert cmp_res.status_code == 200
    metrics = cmp_res.get_json()["data"]["comparisonMetrics"]

    # Impostor non-mate must have low inliers and not qualify as a match
    assert metrics["inlierCount"] < 12
    assert metrics["correspondenceTier"] in ["NO_SIGNIFICANT_CORRESPONDENCE", "INCONCLUSIVE_CORRESPONDENCE"]


def test_unauthorized_case_access_denied(client):
    """
    Verify investigators cannot compare fingerprints or view visualizations
    from cases where they lack clearance.
    """
    examiner1_token = get_token_for(client, "investigator@forenvision.internal", "InvestigatorPass123!")
    examiner2_token = get_token_for(client, "analyst@forenvision.internal", "AnalystPass123!")

    headers1 = {"Authorization": f"Bearer {examiner1_token}"}
    headers2 = {"Authorization": f"Bearer {examiner2_token}"}

    # Examiner 1 creates private case
    case_res = client.post(
        "/api/cases",
        json={"title": "Classified Fingerprint Docket", "is_restricted": True},
        headers=headers1,
    ).get_json()["case"]

    with open(PRINT_1_PATH, "rb") as f:
        bytes_1 = f.read()
    with open(PRINT_MATE_PATH, "rb") as f:
        bytes_2 = f.read()

    ev1 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(bytes_1), "secret_print1.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers1,
    ).get_json()["evidence"]

    ev2 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(bytes_2), "secret_print2.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers1,
    ).get_json()["evidence"]

    # Examiner 1 can compare successfully
    res1 = client.post(
        "/api/analysis/fingerprint/compare",
        json={"probeEvidenceId": ev1["id"], "referenceEvidenceId": ev2["id"]},
        headers=headers1,
    )
    assert res1.status_code == 200
    analysis_id = res1.get_json()["data"]["id"]

    # Examiner 2 receives 403 Forbidden on comparison
    res2 = client.post(
        "/api/analysis/fingerprint/compare",
        json={"probeEvidenceId": ev1["id"], "referenceEvidenceId": ev2["id"]},
        headers=headers2,
    )
    assert res2.status_code == 403

    # Examiner 2 receives 403 Forbidden on streaming visualization
    unauth_vis = client.get(
        f"/api/analysis/fingerprint/derived/{analysis_id}",
        headers=headers2,
    )
    assert unauth_vis.status_code == 403


def test_non_image_evidence_rejected(client):
    """
    Verify rejection of non-image evidence with 400 Bad Request.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Non-Image Biometrics"}, headers=headers).get_json()["case"]

    with open(PRINT_1_PATH, "rb") as f:
        bytes_1 = f.read()

    ev_img = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(bytes_1), "valid_finger.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    ev_pdf = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(b"%PDF-1.4 Mock document"), "audit.pdf"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    res = client.post(
        "/api/analysis/fingerprint/compare",
        json={"probeEvidenceId": ev_img["id"], "referenceEvidenceId": ev_pdf["id"]},
        headers=headers,
    )
    assert res.status_code == 400
    assert "photographic image" in res.get_json()["message"].lower()


def test_fingerprint_comparison_history(client):
    """
    Verify that prior fingerprint comparison runs are recorded in history and queryable.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "History Biometric Docket"}, headers=headers).get_json()["case"]

    with open(PRINT_1_PATH, "rb") as f:
        bytes_1 = f.read()
    with open(PRINT_MATE_PATH, "rb") as f:
        bytes_2 = f.read()

    ev1 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(bytes_1), "hist_print1.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    ev2 = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(bytes_2), "hist_print2.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    client.post(
        "/api/analysis/fingerprint/compare",
        json={"probeEvidenceId": ev1["id"], "referenceEvidenceId": ev2["id"]},
        headers=headers,
    )

    hist_res = client.get(f"/api/analysis/fingerprint/history/{ev1['id']}", headers=headers)
    assert hist_res.status_code == 200
    history = hist_res.get_json()["history"]
    assert len(history) == 1
    assert history[0]["category"] == "fingerprint_minutiae"
