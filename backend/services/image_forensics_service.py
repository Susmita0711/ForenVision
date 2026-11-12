"""
Forensic Image Analysis Service for ForenVision AI.
Provides rigorous image forensics without fabricating metadata or manipulation scores:
- Feature A: Safe EXIF, camera, timestamp, orientation, and GPS metadata extraction
- Feature B: Documented Error Level Analysis (ELA) JPEG recompression comparison
- Parameterized contrast and recompression controls
- Objective statistical metrics (mean error, peak error, standard deviation)
- Isolated derived working copy storage (never overwriting originals)
- Strict case clearance and dimension validation
- Transparent forensic disclaimers
"""

from __future__ import annotations

import io
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, ImageChops, ImageStat, ExifTags, UnidentifiedImageError
from pymongo.errors import PyMongoError

from services.db import db_service
from services.case_service import case_service
from services.evidence_service import evidence_service


# Maximum allowed image pixel count (100 Megapixels) to prevent decompression bombs
MAX_PIXEL_COUNT = 100_000_000
MAX_DIMENSION = 10_000
Image.MAX_IMAGE_PIXELS = MAX_PIXEL_COUNT

# Standard forensic EXIF fields to check for completeness
STANDARD_METADATA_FIELDS = [
    ("Camera Make", "Make"),
    ("Camera Model", "Model"),
    ("Software / Firmware", "Software"),
    ("Original Capture Timestamp", "DateTimeOriginal"),
    ("Digitized Timestamp", "DateTimeDigitized"),
    ("Lens Specification", "LensModel"),
    ("Focal Length", "FocalLength"),
    ("F-Number / Aperture", "FNumber"),
    ("Exposure Time", "ExposureTime"),
    ("ISO Speed", "ISOSpeedRatings"),
    ("GPS Geolocation", "GPSInfo"),
]

ORIENTATION_DESCRIPTIONS: Dict[int, str] = {
    1: "Horizontal (normal)",
    2: "Mirrored horizontal",
    3: "Rotated 180 degrees",
    4: "Mirrored vertical",
    5: "Mirrored horizontal & rotated 270 CW",
    6: "Rotated 90 CW",
    7: "Mirrored horizontal & rotated 90 CW",
    8: "Rotated 270 CW",
}

ELA_FORENSIC_DISCLAIMER = (
    "IMPORTANT FORENSIC NOTICE: Error Level Analysis (ELA) visualizes JPEG compression rate "
    "variance across an image matrix. Natural photographic textures, high-contrast boundaries, "
    "saturated chromatic areas, and standard multi-generation resaves routinely produce pronounced "
    "ELA error levels without intentional forgery. ELA is an exploratory visual diagnostic, "
    "NOT conclusive proof of manipulation."
)

TIMESTAMP_INTEGRITY_NOTICE = (
    "TIMESTAMP INTEGRITY WARNING: Embedded EXIF timestamps (DateTimeOriginal, DateTimeDigitized) "
    "are easily altered, stripped, or falsified using standard consumer software, camera clock drift, "
    "or file transfer utilities. They should not be accepted as authoritative proof of chronological occurrence."
)


def serialize_exif_value(val: Any) -> Any:
    """Recursively convert EXIF values (IFDRational, bytes, tuples) into JSON-serializable primitives."""
    if hasattr(val, "numerator") and hasattr(val, "denominator"):
        try:
            return float(val) if val.denominator != 0 else 0.0
        except ZeroDivisionError:
            return 0.0
    if isinstance(val, bytes):
        try:
            cleaned = val.decode("utf-8", errors="replace").rstrip("\x00").strip()
            return cleaned if cleaned else val.hex()
        except Exception:
            return val.hex()
    if isinstance(val, (tuple, list)):
        return [serialize_exif_value(x) for x in val]
    if isinstance(val, dict):
        return {str(k): serialize_exif_value(v) for k, v in val.items()}
    return val


def parse_gps_coordinates(gps_dict: Dict[int, Any]) -> Dict[str, Any]:
    """Parse raw GPSInfo IFD into decimal latitude and longitude."""
    gps_info: Dict[str, Any] = {"hasGpsData": False}
    if not gps_dict:
        return gps_info

    # Map tag IDs to canonical tag names
    named_gps: Dict[str, Any] = {}
    for tag_id, val in gps_dict.items():
        name = ExifTags.GPSTAGS.get(tag_id, str(tag_id))
        named_gps[name] = val

    def to_decimal(coords: Any, ref: str) -> Optional[float]:
        try:
            if not coords or len(coords) < 3:
                return None
            d = float(coords[0])
            m = float(coords[1])
            s = float(coords[2])
            dec = d + (m / 60.0) + (s / 3600.0)
            if ref in ("S", "W"):
                dec = -dec
            return round(dec, 6)
        except Exception:
            return None

    lat = to_decimal(named_gps.get("GPSLatitude"), named_gps.get("GPSLatitudeRef", "N"))
    lng = to_decimal(named_gps.get("GPSLongitude"), named_gps.get("GPSLongitudeRef", "E"))

    if lat is not None and lng is not None:
        gps_info["hasGpsData"] = True
        gps_info["latitude"] = lat
        gps_info["longitude"] = lng

    if "GPSAltitude" in named_gps:
        try:
            alt = float(named_gps["GPSAltitude"])
            ref = named_gps.get("GPSAltitudeRef", 0)
            if ref == 1:
                alt = -alt
            gps_info["altitudeMeters"] = round(alt, 2)
        except Exception:
            pass

    if "GPSTimeStamp" in named_gps and "GPSDateStamp" in named_gps:
        try:
            date_str = str(named_gps["GPSDateStamp"]).replace(":", "-")
            h, m, s = [int(float(x)) for x in named_gps["GPSTimeStamp"][:3]]
            gps_info["gpsTimestamp"] = f"{date_str}T{h:02d}:{m:02d}:{s:02d}Z"
        except Exception:
            pass

    return gps_info


class ImageForensicsService:
    """Dedicated Image Forensics and Error Level Analysis (ELA) Service."""

    def __init__(self) -> None:
        self._upload_dir = Path("uploads").resolve()
        self._derived_dir = self._upload_dir / "vault" / "derived"
        self._derived_dir.mkdir(parents=True, exist_ok=True)
        self._memory_derived_files: Dict[str, bytes] = {}
        self._memory_analysis_records: Dict[str, Dict[str, Any]] = {}

    def reset_in_memory_state(self) -> None:
        """Clear memory state for test isolation."""
        self._memory_derived_files.clear()
        self._memory_analysis_records.clear()

    # -------------------------------------------------------------------------
    # FEATURE A: Metadata Extraction
    # -------------------------------------------------------------------------

    def extract_image_metadata(
        self, evidence_id_or_number: str, user: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract detailed EXIF, camera, timestamps, orientation, and GPS metadata.
        Guarantees:
        - Never fabricates missing metadata
        - Sanitizes all binary values before returning
        - Enforces case authorization
        - Highlights timestamp trustworthiness limitations
        """
        # 1. Retrieve original bytes verifying authorization
        file_bytes, filename, media_type = evidence_service.get_evidence_file_bytes(
            evidence_id_or_number, user
        )

        raw_ev = evidence_service._find_raw_evidence(evidence_id_or_number)
        if not raw_ev:
            raise KeyError(f"Evidence artifact '{evidence_id_or_number}' does not exist.")

        evidence_id = str(raw_ev.get("id") or raw_ev.get("_id"))
        evidence_number = raw_ev.get("evidenceNumber", evidence_id)
        case_id = raw_ev.get("caseId") or raw_ev.get("caseNumber")
        case_number = raw_ev.get("caseNumber", "CASE")

        # 2. Open image with dimension validation
        try:
            img = Image.open(io.BytesIO(file_bytes))
        except (UnidentifiedImageError, OSError) as err:
            raise ValueError(f"Uploaded artifact is not a readable image format: {err}") from err

        if img.width > MAX_DIMENSION or img.height > MAX_DIMENSION:
            raise ValueError(f"Image dimensions ({img.width}x{img.height}) exceed maximum allowed threshold.")

        format_str = img.format or Path(filename).suffix.replace(".", "").upper() or "IMAGE"

        # 3. Extract EXIF dictionary
        raw_exif_dict: Dict[str, Any] = {}
        exif_obj = None
        gps_dict: Dict[int, Any] = {}

        try:
            exif_obj = img.getexif()
        except Exception:
            exif_obj = None

        if exif_obj:
            for k, v in exif_obj.items():
                tag_name = ExifTags.TAGS.get(k, str(k))
                raw_exif_dict[tag_name] = serialize_exif_value(v)

            # Check SubIFDs (Exif IFD and GPS IFD)
            try:
                exif_ifd = exif_obj.get_ifd(ExifTags.IFD.Exif)
                for k, v in exif_ifd.items():
                    tag_name = ExifTags.TAGS.get(k, str(k))
                    raw_exif_dict[tag_name] = serialize_exif_value(v)
            except Exception:
                pass

            try:
                gps_dict = exif_obj.get_ifd(ExifTags.IFD.GPSInfo)
            except Exception:
                gps_dict = {}

        # 4. Structured Sections
        # Camera
        camera_info = {
            "make": raw_exif_dict.get("Make"),
            "model": raw_exif_dict.get("Model"),
            "software": raw_exif_dict.get("Software"),
            "lensModel": raw_exif_dict.get("LensModel"),
            "focalLength": raw_exif_dict.get("FocalLength"),
            "fNumber": raw_exif_dict.get("FNumber"),
            "exposureTime": str(raw_exif_dict.get("ExposureTime")) if raw_exif_dict.get("ExposureTime") is not None else None,
            "isoSpeedRatings": raw_exif_dict.get("ISOSpeedRatings") or raw_exif_dict.get("PhotographicSensitivity"),
        }

        # Timestamps
        timestamps = {
            "dateTime": raw_exif_dict.get("DateTime"),
            "dateTimeOriginal": raw_exif_dict.get("DateTimeOriginal"),
            "dateTimeDigitized": raw_exif_dict.get("DateTimeDigitized"),
            "offsetTime": raw_exif_dict.get("OffsetTime"),
            "offsetTimeOriginal": raw_exif_dict.get("OffsetTimeOriginal"),
        }

        # Orientation
        orientation_val = raw_exif_dict.get("Orientation")
        orientation_code = int(orientation_val) if orientation_val and str(orientation_val).isdigit() else None
        orientation_info = {
            "value": orientation_code,
            "description": ORIENTATION_DESCRIPTIONS.get(orientation_code, "Unspecified") if orientation_code else "Standard (1)",
        }

        # GPS Geolocation
        gps_info = parse_gps_coordinates(gps_dict)

        # 5. Missing Metadata Audit
        missing_fields: List[str] = []
        for label, tag_key in STANDARD_METADATA_FIELDS:
            if tag_key == "GPSInfo":
                if not gps_info.get("hasGpsData"):
                    missing_fields.append("GPS Geolocation Coordinates")
            elif not raw_exif_dict.get(tag_key):
                missing_fields.append(label)

        has_exif = bool(raw_exif_dict)

        result_doc = {
            "evidenceId": evidence_id,
            "evidenceNumber": evidence_number,
            "caseId": str(case_id),
            "caseNumber": case_number,
            "filename": filename,
            "mediaType": media_type,
            "fileFormat": format_str,
            "fileSizeBytes": len(file_bytes),
            "dimensions": {
                "width": img.width,
                "height": img.height,
                "aspectRatio": round(img.width / max(1, img.height), 2),
                "totalPixels": img.width * img.height,
            },
            "colorMode": img.mode,
            "hasExif": has_exif,
            "camera": camera_info,
            "timestamps": timestamps,
            "timestampTrustworthinessNotice": TIMESTAMP_INTEGRITY_NOTICE,
            "orientation": orientation_info,
            "gps": gps_info,
            "missingFields": missing_fields,
            "rawExif": raw_exif_dict,
            "extractedAt": datetime.now(timezone.utc).isoformat(),
        }

        return result_doc

    # -------------------------------------------------------------------------
    # FEATURE B: Error Level Analysis (ELA)
    # -------------------------------------------------------------------------

    def perform_error_level_analysis(
        self,
        evidence_id_or_number: str,
        user: Dict[str, Any],
        quality: int = 90,
        scale: int = 15,
        save_analysis: bool = True,
    ) -> Dict[str, Any]:
        """
        Execute documented Error Level Analysis (ELA) via JPEG recompression.
        Guarantees:
        - Never alters or overwrites original evidence bytes
        - Saves derived ELA visualization separately in secure vault
        - Calculates un-fabricated mathematical error metrics (mean, peak, std dev)
        - Preserves all processing parameters
        - Attaches transparent forensic disclaimer
        """
        # Validate parameters
        quality = max(60, min(98, int(quality)))
        scale = max(5, min(50, int(scale)))

        # 1. Retrieve original bytes securely
        file_bytes, filename, media_type = evidence_service.get_evidence_file_bytes(
            evidence_id_or_number, user
        )

        raw_ev = evidence_service._find_raw_evidence(evidence_id_or_number)
        if not raw_ev:
            raise KeyError(f"Evidence artifact '{evidence_id_or_number}' does not exist.")

        evidence_id = str(raw_ev.get("id") or raw_ev.get("_id"))
        evidence_number = raw_ev.get("evidenceNumber", evidence_id)
        case_id = raw_ev.get("caseId") or raw_ev.get("caseNumber")
        case_number = raw_ev.get("caseNumber", "CASE")

        # 2. Load separate working copy
        try:
            original_image = Image.open(io.BytesIO(file_bytes))
        except (UnidentifiedImageError, OSError) as err:
            raise ValueError(f"Uploaded artifact is not a valid image format: {err}") from err

        if original_image.width > MAX_DIMENSION or original_image.height > MAX_DIMENSION:
            raise ValueError(f"Image dimensions ({original_image.width}x{original_image.height}) exceed limits.")

        # Convert to RGB for standardized JPEG difference comparison
        working_rgb = original_image.convert("RGB")

        # 3. Documented JPEG Recompression
        recompressed_buffer = io.BytesIO()
        working_rgb.save(recompressed_buffer, format="JPEG", quality=quality)
        recompressed_buffer.seek(0)
        recompressed_image = Image.open(recompressed_buffer)

        # 4. Compute pixel difference matrix
        difference = ImageChops.difference(working_rgb, recompressed_image)

        # Calculate objective statistical metrics
        extrema = difference.getextrema()
        peak_error = max(e[1] for e in extrema)

        stat = ImageStat.Stat(difference)
        mean_error = sum(stat.mean) / len(stat.mean)
        std_dev_error = sum(stat.stddev) / len(stat.stddev)

        # 5. Scale difference for human visual inspection
        scaled_diff = difference.point(lambda p: min(255, int(p * scale)))

        # Save derived visualization image to memory buffer and disk
        derived_buffer = io.BytesIO()
        scaled_diff.save(derived_buffer, format="JPEG", quality=95)
        derived_bytes = derived_buffer.getvalue()

        analysis_id = f"ela_{uuid.uuid4().hex[:12]}"
        now_str = datetime.now(timezone.utc).isoformat()

        # Save derived file to private vault directory
        case_derived_dir = self._derived_dir / case_number
        case_derived_dir.mkdir(parents=True, exist_ok=True)
        derived_filename = f"{analysis_id}_visualization.jpg"
        derived_file_path = case_derived_dir / derived_filename

        try:
            with open(derived_file_path, "wb") as f:
                f.write(derived_bytes)
            os.chmod(derived_file_path, 0o640)
        except OSError:
            pass

        self._memory_derived_files[analysis_id] = derived_bytes

        # Extract metadata
        metadata_report = self.extract_image_metadata(evidence_id, user)

        user_name = user.get("name") or "Authorized Examiner"
        badge = user.get("badge_number") or user.get("badge") or "N/A"

        analysis_doc: Dict[str, Any] = {
            "id": analysis_id,
            "analysisId": analysis_id,
            "evidenceId": evidence_id,
            "evidenceNumber": evidence_number,
            "caseId": str(case_id),
            "caseNumber": case_number,
            "analysisType": "Error Level Analysis (ELA)",
            "category": "image_forgery",
            "modelEngine": "ForenVision PIL-ELA Diagnostic Engine v2.0",
            "parameters": {
                "quality": quality,
                "scale": scale,
                "recompressionAlgorithm": "JPEG Quantization Delta",
            },
            "statistics": {
                "meanError": round(mean_error, 3),
                "peakError": peak_error,
                "stdDevError": round(std_dev_error, 3),
                "dimensions": f"{working_rgb.width}x{working_rgb.height}",
                "totalPixels": working_rgb.width * working_rgb.height,
            },
            "derivedStorageRef": f"vault://{case_number}/derived/{derived_filename}",
            "_derivedDiskPath": str(derived_file_path),
            "derivedImageUrl": f"/api/analysis/image/derived/{analysis_id}",
            "metadata": metadata_report,
            "forensicDisclaimer": ELA_FORENSIC_DISCLAIMER,
            "timestamp": now_str,
            "performedBy": f"{user_name} ({badge})" if badge != "N/A" else user_name,
            "status": "completed",
        }

        # 6. Persist to MongoDB & Memory Stores if requested
        if save_analysis:
            db = db_service.get_db()
            if db is not None:
                try:
                    db["analysis_results"].insert_one(dict(analysis_doc))
                except PyMongoError:
                    pass

            self._memory_analysis_records[analysis_id] = analysis_doc
            case_service._memory_analyses.insert(0, analysis_doc)

            # Record in Case Activity Log
            case_service.record_activity(
                actor=user_name,
                badge=badge,
                action=f"Executed ELA Diagnostic on {evidence_number} in {case_number} (Q={quality}, S={scale})",
                target=evidence_number,
                target_type="image_forensics_analysis",
            )

        return analysis_doc

    def get_derived_image_bytes(
        self, analysis_id: str, user: Dict[str, Any]
    ) -> Tuple[bytes, str, str]:
        """
        Retrieve derived ELA visualization bytes with case clearance check.
        Returns: (file_bytes, filename, mimetype)
        """
        record = self._find_analysis_record(analysis_id)
        if not record:
            raise KeyError(f"Analysis result '{analysis_id}' not found.")

        # Check access to associated case
        case_id = record.get("caseId") or record.get("caseNumber")
        raw_case = case_service._find_raw_case_doc(case_id)
        if raw_case and not case_service.user_can_access_case(user, raw_case):
            raise PermissionError("Access restricted: You lack clearance to access derived analysis results for this case.")

        # Check disk
        disk_path = record.get("_derivedDiskPath")
        if disk_path:
            p = Path(disk_path).resolve()
            if p.exists() and str(p).startswith(str(self._upload_dir.resolve())):
                with open(p, "rb") as f:
                    return f.read(), f"{analysis_id}_ela.jpg", "image/jpeg"

        # Check memory
        if analysis_id in self._memory_derived_files:
            return self._memory_derived_files[analysis_id], f"{analysis_id}_ela.jpg", "image/jpeg"

        raise FileNotFoundError("Derived ELA visualization file is missing from private storage vault.")

    def get_evidence_analysis_history(
        self, evidence_id_or_number: str, user: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Retrieve historical analysis runs for an evidence artifact."""
        raw_ev = evidence_service._find_raw_evidence(evidence_id_or_number)
        if not raw_ev:
            raise KeyError(f"Evidence artifact '{evidence_id_or_number}' does not exist.")

        case_id = raw_ev.get("caseId") or raw_ev.get("caseNumber")
        raw_case = case_service._find_raw_case_doc(case_id)
        if raw_case and not case_service.user_can_access_case(user, raw_case):
            raise PermissionError("Access restricted: You lack clearance to access analysis history.")

        evidence_id = str(raw_ev.get("id") or raw_ev.get("_id"))
        evidence_number = raw_ev.get("evidenceNumber", evidence_id)

        history: List[Dict[str, Any]] = []
        image_categories = {
            "image_forgery",
            "image_forensics",
            "ela_recompression",
            "metadata_extraction",
        }
        db = db_service.get_db()
        if db is not None:
            try:
                cursor = db["analysis_results"].find(
                    {
                        "$or": [{"evidenceId": evidence_id}, {"evidenceNumber": evidence_number}],
                        "category": {"$in": list(image_categories)},
                    }
                ).sort("timestamp", -1)
                for doc in cursor:
                    doc["id"] = str(doc.get("id") or doc.get("analysisId") or doc.get("_id"))
                    doc.pop("_id", None)
                    history.append(doc)
            except PyMongoError:
                pass

        mem_history = [
            a for a in case_service._memory_analyses
            if (a.get("evidenceId") == evidence_id or a.get("evidenceNumber") == evidence_number)
            and (a.get("category") in image_categories or not a.get("category"))
        ]

        seen = set()
        deduped = []
        for h in history + mem_history:
            h_id = h.get("id") or h.get("analysisId")
            if h_id not in seen:
                seen.add(h_id)
                # Ensure internal MongoDB ObjectIds and private paths are stripped
                clean_h = dict(h)
                clean_h.pop("_id", None)
                clean_h.pop("_derivedDiskPath", None)
                deduped.append(clean_h)

        return deduped

    def _find_analysis_record(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        """Find analysis record by ID from DB or memory."""
        if analysis_id in self._memory_analysis_records:
            return self._memory_analysis_records[analysis_id]

        for a in case_service._memory_analyses:
            if a.get("id") == analysis_id or a.get("analysisId") == analysis_id:
                return a

        db = db_service.get_db()
        if db is not None:
            try:
                from bson import ObjectId  # pylint: disable=import-outside-toplevel
                query = {"_id": ObjectId(analysis_id)} if ObjectId.is_valid(analysis_id) else {"id": analysis_id}
                doc = db["analysis_results"].find_one(query)
                if doc:
                    doc["id"] = str(doc.get("id") or doc.get("analysisId") or doc.get("_id"))
                    doc.pop("_id", None)
                    return doc
            except PyMongoError:
                pass

        return None


image_forensics_service = ImageForensicsService()
