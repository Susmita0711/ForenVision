"""
Unit and Integration tests for Image Forensics Module:
- Feature A: Safe EXIF metadata extraction, camera info, timestamps, orientation, GPS coordinates, missing fields
- Feature B: Error Level Analysis (ELA) JPEG recompression comparison, objective statistical metrics
- Parameterized contrast and quality controls
- Preserving original bytes without modification/overwrite
- Unauthorized access enforcement (401 / 403)
- Malformed image and non-image error handling
- Output persistence and case linking
- Absence of fabricated tampering scores or unwarranted certainty
"""

import io
import pytest
from PIL import Image
from services.case_service import case_service
from services.evidence_service import evidence_service
from services.image_forensics_service import image_forensics_service


def get_token_for(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["token"]


@pytest.fixture(autouse=True)
def clean_system_state():
    """Reset all in-memory states before and after each test."""
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    image_forensics_service.reset_in_memory_state()
    yield
    case_service.reset_in_memory_state()
    evidence_service.reset_in_memory_state()
    image_forensics_service.reset_in_memory_state()


def create_sample_jpeg_bytes(width=200, height=150, color=(140, 100, 80)) -> bytes:
    """Generate a clean synthetic JPEG image in memory."""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def create_jpeg_with_exif_bytes() -> bytes:
    """Generate a synthetic JPEG containing standard EXIF and GPS tags."""
    img = Image.new("RGB", (120, 100), color=(100, 150, 200))
    exif = img.getexif()
    # Tag 271: Make, Tag 272: Model, Tag 305: Software, Tag 274: Orientation
    exif[271] = "ForenVision Optics Corp"
    exif[272] = "SpecCam-X900"
    exif[305] = "Firmware v4.2"
    exif[274] = 1

    # Exif SubIFD (Tag 36867: DateTimeOriginal)
    exif_ifd = exif.get_ifd(0x8769)
    exif_ifd[0x9003] = "2026:04:12 14:32:00"
    exif_ifd[0x920A] = 50.0  # FocalLength

    # GPS IFD (Tag 34853: GPSInfo)
    gps_ifd = exif.get_ifd(0x8825)
    # Latitude: 37 deg, 46 min, 29.88 sec N
    gps_ifd[1] = "N"
    gps_ifd[2] = (37.0, 46.0, 29.88)
    # Longitude: 122 deg, 25 min, 9.84 sec W
    gps_ifd[3] = "W"
    gps_ifd[4] = (122.0, 25.0, 9.84)
    gps_ifd[6] = 45.5  # Altitude meters

    # Explicitly attach sub-IFDs to root EXIF
    from PIL import ExifTags
    exif[ExifTags.Base.ExifOffset] = exif_ifd
    exif[ExifTags.Base.GPSInfo] = gps_ifd

    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def test_metadata_extraction_with_exif_and_gps(client):
    """
    Verify Feature A:
    - Extracts camera make, model, software, and focal length
    - Extracts timestamps and attaches trustworthiness warning
    - Parses GPS coordinates into decimal values
    - Correctly records missing metadata fields without fabricating values
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Camera EXIF Audit Docket"}, headers=headers).get_json()["case"]

    jpeg_bytes = create_jpeg_with_exif_bytes()
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(jpeg_bytes), "crime_scene_camera.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Call Metadata extraction
    res = client.post("/api/analysis/image/metadata", json={"evidenceId": ev["id"]}, headers=headers)
    assert res.status_code == 200
    meta = res.get_json()["metadata"]

    assert meta["hasExif"] is True
    assert meta["camera"]["make"] == "ForenVision Optics Corp"
    assert meta["camera"]["model"] == "SpecCam-X900"
    assert meta["camera"]["software"] == "Firmware v4.2"
    assert meta["camera"]["focalLength"] == 50.0

    # Timestamps & integrity notice
    assert meta["timestamps"]["dateTimeOriginal"] == "2026:04:12 14:32:00"
    assert "WARNING" in meta["timestampTrustworthinessNotice"]

    # GPS coordinates
    assert meta["gps"]["hasGpsData"] is True
    assert abs(meta["gps"]["latitude"] - 37.7749) < 0.01
    assert abs(meta["gps"]["longitude"] - (-122.4194)) < 0.01
    assert meta["gps"]["altitudeMeters"] == 45.5

    # Dimensions
    assert meta["dimensions"]["width"] == 120
    assert meta["dimensions"]["height"] == 100

    # Missing fields accurately recorded
    assert isinstance(meta["missingFields"], list)
    assert "Lens Specification" in meta["missingFields"]
    assert "F-Number / Aperture" in meta["missingFields"]


def test_metadata_extraction_clean_synthetic_no_exif(client):
    """Verify that images lacking EXIF accurately report hasExif=False and list missing fields."""
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "Stripped Image Docket"}, headers=headers).get_json()["case"]
    raw_bytes = create_sample_jpeg_bytes()
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(raw_bytes), "web_image.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    res = client.post("/api/analysis/image/metadata", json={"evidenceId": ev["id"]}, headers=headers)
    assert res.status_code == 200
    meta = res.get_json()["metadata"]

    assert meta["hasExif"] is False
    assert meta["camera"]["make"] is None
    assert meta["camera"]["model"] is None
    assert meta["gps"]["hasGpsData"] is False
    assert len(meta["missingFields"]) >= 8


def test_error_level_analysis_recompression_and_statistics(client):
    """
    Verify Feature B:
    - Runs documented JPEG recompression comparison
    - Computes objective mathematical error statistics (mean, peak, std dev)
    - Saves derived visualization to separate vault file
    - Never overwrites original evidence bytes
    - Attaches forensic disclaimer without fabricating manipulation verdicts
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "ELA Ballistics Case"}, headers=headers).get_json()["case"]

    original_bytes = create_sample_jpeg_bytes(width=160, height=120)
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(original_bytes), "macro_lens.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Run ELA diagnostic with custom parameters
    ela_res = client.post(
        "/api/analysis/image/ela",
        json={"evidenceId": ev["id"], "quality": 85, "scale": 20},
        headers=headers,
    )
    assert ela_res.status_code == 200
    analysis = ela_res.get_json()["analysis"]

    assert analysis["analysisType"] == "Error Level Analysis (ELA)"
    assert analysis["parameters"]["quality"] == 85
    assert analysis["parameters"]["scale"] == 20

    # Objective statistics
    stats = analysis["statistics"]
    assert "meanError" in stats
    assert "peakError" in stats
    assert "stdDevError" in stats
    assert stats["totalPixels"] == 160 * 120

    # Forensic disclaimer present
    assert "IMPORTANT FORENSIC NOTICE" in analysis["forensicDisclaimer"]
    assert "NOT conclusive proof of manipulation" in analysis["forensicDisclaimer"]

    # Verify original bytes remain 100% unaltered
    download_res = client.get(f"/api/evidence/{ev['id']}/download", headers=headers)
    assert download_res.status_code == 200
    assert download_res.data == original_bytes

    # Verify derived ELA visualization is streamable
    derived_url = analysis["derivedImageUrl"]
    derived_res = client.get(derived_url, headers=headers)
    assert derived_res.status_code == 200
    assert "image/jpeg" in derived_res.headers.get("Content-Type", "")
    assert len(derived_res.data) > 0


def test_unauthorized_analysis_access_enforced(client):
    """
    Verify:
    1. Unauthenticated requests to /api/analysis/image return 401.
    2. Users lacking clearance to a restricted case receive 403 on metadata & ELA.
    """
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    viewer_token = get_token_for(client, "viewer@forenvision.internal", "ViewerPass123!")

    case_res = client.post(
        "/api/cases",
        json={"title": "Restricted Wiretap Case", "is_restricted": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).get_json()["case"]

    raw_bytes = create_sample_jpeg_bytes()
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(raw_bytes), "confidential.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).get_json()["evidence"]

    # 1. Unauthenticated -> 401
    client.delete_cookie("forenvision_token")
    anon_res = client.post("/api/analysis/image/metadata", json={"evidenceId": ev["id"]})
    assert anon_res.status_code == 401

    # 2. Viewer (no clearance on restricted case) -> 403
    viewer_headers = {"Authorization": f"Bearer {viewer_token}"}
    forb_meta = client.post("/api/analysis/image/metadata", json={"evidenceId": ev["id"]}, headers=viewer_headers)
    assert forb_meta.status_code == 403

    forb_ela = client.post("/api/analysis/image/ela", json={"evidenceId": ev["id"]}, headers=viewer_headers)
    assert forb_ela.status_code == 403


def test_malformed_and_non_image_handling(client):
    """
    Verify safe error handling:
    - Attempting image forensics on a non-image (e.g. PDF or arbitrary text) returns 400.
    - Missing evidence ID returns 400.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "PDF Docket"}, headers=headers).get_json()["case"]

    pdf_bytes = b"%PDF-1.7\n%Text document stream"
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(pdf_bytes), "court_order.pdf"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Attempting ELA on PDF -> 400
    bad_ela = client.post("/api/analysis/image/ela", json={"evidenceId": ev["id"]}, headers=headers)
    assert bad_ela.status_code == 400
    assert "not a valid image" in bad_ela.get_json()["message"].lower()

    # Empty evidence ID -> 400
    empty_req = client.post("/api/analysis/image/metadata", json={}, headers=headers)
    assert empty_req.status_code == 400


def test_analysis_history_and_case_linking(client):
    """
    Verify:
    - Executing ELA creates analysis records linked to the case and evidence.
    - History endpoint retrieves prior analysis runs with preserved parameters.
    """
    token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post("/api/cases", json={"title": "History Docket"}, headers=headers).get_json()["case"]

    raw_bytes = create_sample_jpeg_bytes()
    ev = client.post(
        "/api/evidence/upload",
        data={"file": (io.BytesIO(raw_bytes), "evidence_photo.jpg"), "caseId": case_res["id"]},
        content_type="multipart/form-data",
        headers=headers,
    ).get_json()["evidence"]

    # Run ELA twice with different parameters
    client.post("/api/analysis/image/ela", json={"evidenceId": ev["id"], "quality": 95, "scale": 10}, headers=headers)
    client.post("/api/analysis/image/ela", json={"evidenceId": ev["id"], "quality": 80, "scale": 25}, headers=headers)

    # Fetch history
    hist_res = client.get(f"/api/analysis/image/history/{ev['id']}", headers=headers)
    assert hist_res.status_code == 200
    runs = hist_res.get_json()["history"]
    assert len(runs) == 2
    qualities = [r["parameters"]["quality"] for r in runs]
    assert 95 in qualities
    assert 80 in qualities
