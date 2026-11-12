"""
Criminal Sketch Analysis & Forensic Morphological Review Service for ForenVision AI.
Provides evidence management for witness composite sketches, image preprocessing
(grayscale normalization, CLAHE contrast enhancement, edge/pencil stroke filtering),
forensic spatial annotations, side-by-side comparison sessions, and audit persistence.

FORENSIC PRINCIPLES & LEGAL INVARIANTS:
1. Zero Modification: Original sketch and reference evidence files are preserved immutably.
2. No Fabricated Similarity Scores: Rejects invented percentage bars or unvalidated metrics.
3. No Autonomous Accusation: Models and algorithms under NO circumstances identify suspects,
   accuse individuals, or establish criminal culpability.
4. No Unrestricted Scraping: Reference images are selected exclusively by authorized investigators
   from case-associated evidence; mass scraping of public photos or unrestricted databases is barred.
5. Experimental Status: Due to witness cognitive distortions and lack of Daubert/Frye validation,
   cross-modality sketch-to-photo automated matching is marked as UNVALIDATED / EXPERIMENTAL.
6. ACE-V Prerequisite: Examination is conducted as a structured morphological review by qualified
   forensic facial comparison examiners under international standards.
"""

from __future__ import annotations

import io
import json
import math
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError
from pymongo.errors import PyMongoError

from config import Config
from services.db import db_service
from services.case_service import case_service
from services.evidence_service import evidence_service


MAX_PIXEL_COUNT = 100_000_000
MAX_DIMENSION = 10_000

SKETCH_FORENSIC_DISCLAIMER = (
    "SKETCH FORENSIC LIMITATIONS NOTICE: Composite sketches are qualitative cognitive representations "
    "derived from witness memory, not photographic records. Due to human cognitive distortions "
    "(such as weapon focus, acute stress, retrograde interference, and post-event misinformation) "
    "and artist subjectivity, sketch-to-photo comparison cannot reliably establish physical identity "
    "or individualization. Automated sketch-to-photo matching models lack empirical forensic validation "
    "under Daubert/Frye legal standards and are marked as EXPERIMENTAL / UNAVAILABLE for conclusive "
    "identification. Examination must be conducted manually by a qualified examiner under the ACE-V "
    "(Analysis, Comparison, Evaluation, Verification) framework. Comparison results under NO circumstances "
    "accuse an individual, establish suspect status, or prove legal guilt."
)

SKETCH_METHODOLOGY_DOCUMENTATION = {
    "engine": "ForenVision Forensic Sketch Analysis & Morphological Review Engine",
    "evaluationStatus": "CONTROLLED_INVESTIGATIVE_REVIEW (NO_AUTOMATED_ACCUSATION)",
    "automatedMatchingStatus": "UNVALIDATED_CROSS_MODALITY_MODEL_UNAVAILABLE",
    "scientificRationale": (
        "In accordance with forensic science guidelines (NIST/OSAC), witness composite drawings cannot be "
        "treated as biometric templates. Automated generative or cross-domain deep embeddings currently "
        "lack peer-reviewed validation across diverse populations and exhibit high false-match rates. "
        "ForenVision AI provides rigorous image preprocessing, morphological annotation mapping, "
        "and structured human examiner checklists without fabricating algorithmic similarity scores."
    ),
    "supportedPreprocessing": [
        "Grayscale Dynamic Range Normalization [0, 255]",
        "Contrast Limited Adaptive Histogram Equalization (CLAHE)",
        "Pencil / Pen Stroke Edge Extraction (Canny & Sobel Filtering)",
        "Line Art Inversion (Dark-on-Light / Light-on-Dark)",
        "Gamma and Linear Contrast / Brightness Scaling",
    ],
    "morphologicalFeatureCategories": [
        "orbital_eyes",
        "eyebrows",
        "nasal_bridge_aperture",
        "mouth_lips",
        "mandibular_jawline_chin",
        "hairline_cranial",
        "auricular_ears",
        "scars_marks_tattoos",
        "general_facial_proportions",
    ],
    "standardsCompliance": [
        "OSAC Facial Comparison Standards (ASTM E3115 / E3149)",
        "ENFSI Best Practice Manual for Facial Image Comparison",
        "Daubert / Frye Forensic Admissibility Standards",
    ],
    "retentionPolicy": (
        "Sketch comparison sessions and derived review visualizations are retained strictly within "
        "authorized case boundaries and follow the associated legal case retention lifecycle. "
        "Sketches and reference imagery are never pooled into unrestricted public surveillance galleries."
    ),
}


class SketchService:
    """Thread-safe forensic sketch analysis, preprocessing, and morphological comparison service."""

    def __init__(self, base_upload_dir: Optional[str] = None) -> None:
        if base_upload_dir:
            self._vault_dir = Path(base_upload_dir) / "vault"
        else:
            self._vault_dir = Path(Config.UPLOAD_FOLDER) / "vault"
        self._derived_dir = self._vault_dir / "derived"

        # Trained Cross-Modality Experimental Adapter Paths
        base_dir = Path(__file__).resolve().parent.parent
        self._models_dir = base_dir / "models"
        self._yunet_path = self._models_dir / "face_detection_yunet_2023mar.onnx"
        self._sface_path = self._models_dir / "face_recognition_sface_2021dec.onnx"
        self._adapter_npz_path = Path(Config.CUHK_SKETCH_NPZ_PATH)
        self._adapter_meta_path = Path(Config.CUHK_SKETCH_METADATA_PATH)

        self._model_lock = threading.Lock()
        self._detector: Optional[Any] = None
        self._recognizer: Optional[Any] = None
        self._adapter_weights: Optional[Dict[str, np.ndarray]] = None
        self._adapter_meta: Optional[Dict[str, Any]] = None

        # In-memory stores for tests and unconfigured database fallbacks
        self._memory_sessions: Dict[str, Dict[str, Any]] = {}
        self._memory_derived_files: Dict[str, bytes] = {}

    def reset_in_memory_state(self) -> None:
        """Clear memory cache for test isolation."""
        self._memory_sessions.clear()
        self._memory_derived_files.clear()

    def _load_adapter_metadata(self) -> Optional[Dict[str, Any]]:
        if self._adapter_meta is not None:
            return self._adapter_meta
        if self._adapter_meta_path.is_file():
            try:
                self._adapter_meta = json.loads(self._adapter_meta_path.read_text(encoding="utf-8"))
                return self._adapter_meta
            except Exception:
                return None
        return None

    def get_methodology_info(self) -> Dict[str, Any]:
        """Return comprehensive methodology specifications, scientific limitations, and legal disclaimers."""
        adapter_meta = self._load_adapter_metadata()
        adapter_available = self._adapter_npz_path.is_file() and self._yunet_path.is_file() and self._sface_path.is_file()
        return {
            "methodology": SKETCH_METHODOLOGY_DOCUMENTATION,
            "forensicDisclaimer": SKETCH_FORENSIC_DISCLAIMER,
            "modelStatus": {
                "automatedMatching": "UNAVAILABLE_UNVALIDATED",
                "validationRationale": "No appropriately licensed model meets Daubert/Frye standards for sketch-to-photo identification.",
                "humanReviewRequired": True,
                "experimentalCrossModalityAvailable": adapter_available,
            },
            "experimentalModel": {
                "available": adapter_available,
                "modelId": (adapter_meta or {}).get("modelId", "cuhk-sketch-cross-modality-v1"),
                "modelName": (adapter_meta or {}).get("modelName", "CUHK Cross-Modality Sketch-to-Photo Feature Adapter"),
                "version": (adapter_meta or {}).get("version", "1.0.0-cuhk-sface"),
                "architecture": (adapter_meta or {}).get("architecture"),
                "trainingDataset": (adapter_meta or {}).get("trainingDataset"),
                "evaluationMetrics": (adapter_meta or {}).get("evaluationMetrics"),
                "admissibilityNotice": (
                    "EXPERIMENTAL INVESTIGATIVE AID ONLY: Trained on 188 CUHK Face Sketch pairs "
                    "for exploratory lead triage. NOT validated under Daubert/Frye for judicial identification."
                ),
            } if adapter_available else None,
        }

    def preprocess_image_array(
        self,
        bgr_img: np.ndarray,
        params: Dict[str, Any],
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Apply documented forensic preprocessing filters onto a working copy:
        - Grayscale conversion
        - CLAHE contrast enhancement
        - Edge detection / pencil stroke extraction (Canny / Sobel)
        - Inversion
        - Brightness / Contrast adjustment
        """
        work_img = bgr_img.copy()
        effective_params: Dict[str, Any] = {}

        # 1. Grayscale Conversion
        to_gray = bool(params.get("grayscale", True))
        effective_params["grayscale"] = to_gray

        if to_gray:
            gray = cv2.cvtColor(work_img, cv2.COLOR_BGR2GRAY)
        else:
            gray = None

        # 2. Brightness & Contrast Adjustment
        contrast = float(params.get("contrast", 1.0))
        contrast = max(0.2, min(3.0, contrast))
        brightness = int(params.get("brightness", 0))
        brightness = max(-100, min(100, brightness))
        effective_params["contrast"] = contrast
        effective_params["brightness"] = brightness

        if to_gray and gray is not None:
            gray = cv2.convertScaleAbs(gray, alpha=contrast, beta=brightness)
        else:
            work_img = cv2.convertScaleAbs(work_img, alpha=contrast, beta=brightness)

        # 3. Dynamic Range Normalization
        normalize = bool(params.get("normalize", False))
        effective_params["normalize"] = normalize
        if normalize:
            if to_gray and gray is not None:
                gray = cv2.normalize(gray, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
            else:
                work_img = cv2.normalize(work_img, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)

        # 4. Contrast Limited Adaptive Histogram Equalization (CLAHE)
        use_clahe = bool(params.get("clahe", False))
        clip_limit = float(params.get("claheClipLimit", 2.0))
        effective_params["clahe"] = use_clahe
        effective_params["claheClipLimit"] = clip_limit

        if use_clahe:
            clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
            if to_gray and gray is not None:
                gray = clahe.apply(gray)
            else:
                # Apply to L-channel in LAB space
                lab = cv2.cvtColor(work_img, cv2.COLOR_BGR2LAB)
                l, a, b = cv2.split(lab)
                l = clahe.apply(l)
                lab = cv2.merge((l, a, b))
                work_img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

        # 5. Edge / Stroke Extraction Filters
        edge_filter = str(params.get("edgeFilter", "none")).lower()
        canny_low = int(params.get("cannyLow", 50))
        canny_high = int(params.get("cannyHigh", 150))
        effective_params["edgeFilter"] = edge_filter
        effective_params["cannyLow"] = canny_low
        effective_params["cannyHigh"] = canny_high

        if edge_filter == "canny":
            src_for_edge = gray if (to_gray and gray is not None) else cv2.cvtColor(work_img, cv2.COLOR_BGR2GRAY)
            edge_res = cv2.Canny(src_for_edge, canny_low, canny_high)
            gray = edge_res
            to_gray = True
        elif edge_filter == "sobel":
            src_for_edge = gray if (to_gray and gray is not None) else cv2.cvtColor(work_img, cv2.COLOR_BGR2GRAY)
            grad_x = cv2.Sobel(src_for_edge, cv2.CV_16S, 1, 0, ksize=3)
            grad_y = cv2.Sobel(src_for_edge, cv2.CV_16S, 0, 1, ksize=3)
            abs_x = cv2.convertScaleAbs(grad_x)
            abs_y = cv2.convertScaleAbs(grad_y)
            gray = cv2.addWeighted(abs_x, 0.5, abs_y, 0.5, 0)
            to_gray = True

        # 6. Line Art Inversion
        invert = bool(params.get("invert", False))
        effective_params["invert"] = invert
        if invert:
            if to_gray and gray is not None:
                gray = cv2.bitwise_not(gray)
            else:
                work_img = cv2.bitwise_not(work_img)

        # Final conversion back to 3-channel BGR for rendering
        if to_gray and gray is not None:
            final_bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        else:
            final_bgr = work_img

        return final_bgr, effective_params

    def preprocess_evidence(
        self,
        evidence_id: str,
        user: Dict[str, Any],
        params: Dict[str, Any],
    ) -> Tuple[bytes, Dict[str, Any]]:
        """
        Retrieve evidence working copy, apply preprocessing, and return JPEG bytes.
        Verifies case clearance and preserves original evidence.
        """
        # Authorization and retrieval
        file_bytes, filename, mime_type = evidence_service.get_evidence_file_bytes(evidence_id, user)

        np_arr = np.frombuffer(file_bytes, dtype=np.uint8)
        bgr_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if bgr_img is None:
            raise ValueError(f"Failed to decode evidence '{filename}' as photographic/sketch image.")

        processed_bgr, effective_params = self.preprocess_image_array(bgr_img, params)

        success, enc_buffer = cv2.imencode(".jpg", processed_bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if not success:
            raise RuntimeError("Failed to encode preprocessed image.")

        return enc_buffer.tobytes(), effective_params

    def save_comparison_session(
        self,
        data: Dict[str, Any],
        user: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Create and persist a complete forensic sketch comparison session:
        1. Validates investigator access to sketch and reference evidence.
        2. Ingests working copies and applies preprocessing parameters.
        3. Validates and records morphological annotations and examiner notes.
        4. Renders annotated side-by-side comparison canvas with spatial markers.
        5. Persists session document to MongoDB and saves derived visualization to vault.
        """
        sketch_id = str(data.get("sketchEvidenceId", "")).strip()
        ref_id = str(data.get("referenceEvidenceId", "")).strip()

        if not sketch_id:
            raise ValueError("Missing required field 'sketchEvidenceId'.")
        if not ref_id:
            raise ValueError("Missing required field 'referenceEvidenceId'.")
        if sketch_id == ref_id:
            raise ValueError("Sketch and Reference evidence cannot be the identical artifact.")

        # 1. Authorization checks
        sketch_doc = evidence_service.get_evidence_by_id(sketch_id, user)
        if not sketch_doc:
            raise PermissionError("Access denied: Sketch evidence artifact is inaccessible under your clearance.")

        ref_doc = evidence_service.get_evidence_by_id(ref_id, user)
        if not ref_doc:
            raise PermissionError("Access denied: Reference evidence artifact is inaccessible under your clearance.")

        # 2. Retrieve Working Copies
        sketch_bytes, sketch_filename, _ = evidence_service.get_evidence_file_bytes(sketch_id, user)
        ref_bytes, ref_filename, _ = evidence_service.get_evidence_file_bytes(ref_id, user)

        sketch_bgr = cv2.imdecode(np.frombuffer(sketch_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        ref_bgr = cv2.imdecode(np.frombuffer(ref_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)

        if sketch_bgr is None or ref_bgr is None:
            raise ValueError("Failed to decode photographic bytes for sketch or reference evidence.")

        # 3. Apply Preprocessing Parameters
        sketch_params = data.get("sketchPreprocessing") or {}
        ref_params = data.get("referencePreprocessing") or {}

        proc_sketch_bgr, effective_sketch_params = self.preprocess_image_array(sketch_bgr, sketch_params)
        proc_ref_bgr, effective_ref_params = self.preprocess_image_array(ref_bgr, ref_params)

        # 4. Parse Annotations
        raw_annotations = data.get("annotations") or []
        validated_annotations: List[Dict[str, Any]] = []

        for idx, ann in enumerate(raw_annotations):
            if not isinstance(ann, dict):
                continue
            ann_id = str(ann.get("id") or f"ann_{idx + 1}")
            target = str(ann.get("target", "sketch")).lower()
            if target not in ("sketch", "reference"):
                target = "sketch"

            feature = str(ann.get("feature", "general_facial_proportions"))
            x = float(ann.get("x", 0.0))
            y = float(ann.get("y", 0.0))
            w = float(ann.get("width", 0.0)) if "width" in ann else None
            h = float(ann.get("height", 0.0)) if "height" in ann else None
            notes = str(ann.get("notes", "")).strip()
            linked_id = str(ann.get("linkedAnnotationId", "")).strip() or None

            validated_annotations.append({
                "id": ann_id,
                "target": target,
                "feature": feature,
                "x": round(x, 2),
                "y": round(y, 2),
                "width": round(w, 2) if w is not None else None,
                "height": round(h, 2) if h is not None else None,
                "notes": notes,
                "linkedAnnotationId": linked_id,
            })

        # 5. Morphological Checklist & Examiner Notes
        morph_checklist = data.get("morphologicalChecklist") or {}
        examiner_notes = str(data.get("examinerNotes", "")).strip()
        session_title = str(data.get("title", f"Sketch Review — {sketch_doc.get('caseNumber', 'CASE')}")).strip()

        # 6. Render Composite Annotated Visualization
        derived_bytes = self._render_session_visualization(
            proc_sketch_bgr,
            sketch_filename,
            proc_ref_bgr,
            ref_filename,
            validated_annotations,
            session_title,
        )

        # 7. Persist Derived Image to Case Vault
        session_id = f"sk_{uuid.uuid4().hex[:12]}"
        now_str = datetime.now(timezone.utc).isoformat()
        case_number = sketch_doc.get("caseNumber", "UNKNOWN-CASE")

        case_derived_dir = self._derived_dir / case_number
        case_derived_dir.mkdir(parents=True, exist_ok=True)
        derived_filename = f"{session_id}_comparison.jpg"
        derived_file_path = case_derived_dir / derived_filename

        try:
            with open(derived_file_path, "wb") as f:
                f.write(derived_bytes)
            os.chmod(derived_file_path, 0o640)
        except OSError:
            pass

        self._memory_derived_files[session_id] = derived_bytes

        # 8. Assemble Session Record
        user_name = user.get("name") or "Authorized Examiner"
        badge = user.get("badge_number") or user.get("badge") or "N/A"

        session_doc: Dict[str, Any] = {
            "id": session_id,
            "sessionId": session_id,
            "analysisId": session_id,
            "analysisType": "Forensic Sketch Morphological Comparison",
            "category": "sketch_comparison_session",
            "title": session_title,
            "caseId": str(sketch_doc.get("caseId")),
            "caseNumber": case_number,
            "sketchEvidence": {
                "id": sketch_id,
                "evidenceNumber": sketch_doc.get("evidenceNumber", sketch_id),
                "filename": sketch_filename,
                "sha256": sketch_doc.get("sha256Hash", "N/A"),
                "dimensions": f"{sketch_bgr.shape[1]}x{sketch_bgr.shape[0]}",
                "preprocessing": effective_sketch_params,
            },
            "referenceEvidence": {
                "id": ref_id,
                "evidenceNumber": ref_doc.get("evidenceNumber", ref_id),
                "filename": ref_filename,
                "sha256": ref_doc.get("sha256Hash", "N/A"),
                "dimensions": f"{ref_bgr.shape[1]}x{ref_bgr.shape[0]}",
                "preprocessing": effective_ref_params,
            },
            "annotations": validated_annotations,
            "annotationsCount": len(validated_annotations),
            "morphologicalChecklist": morph_checklist,
            "examinerNotes": examiner_notes,
            "methodology": {
                "engine": SKETCH_METHODOLOGY_DOCUMENTATION["engine"],
                "matchingModel": "UNAVAILABLE (Forensic Non-Admissibility Standard)",
                "evaluationFramework": "ACE-V Morphological Feature Comparison",
                "standardsCompliance": SKETCH_METHODOLOGY_DOCUMENTATION["standardsCompliance"],
            },
            "forensicNotice": SKETCH_FORENSIC_DISCLAIMER,
            "retentionPolicy": SKETCH_METHODOLOGY_DOCUMENTATION["retentionPolicy"],
            "visualization": {
                "derivedFilename": derived_filename,
                "hasVisual": True,
                "fileSize": len(derived_bytes),
            },
            "examiner": {
                "id": str(user.get("user_id") or user.get("id", "examiner")),
                "name": user_name,
                "badge": badge,
                "role": user.get("role", "investigator"),
            },
            "timestamp": now_str,
            "status": "COMPLETED",
        }

        # 9. Database Persistence
        self._save_session_record(session_doc)

        return session_doc

    def _render_session_visualization(
        self,
        sketch_bgr: np.ndarray,
        sketch_filename: str,
        ref_bgr: np.ndarray,
        ref_filename: str,
        annotations: List[Dict[str, Any]],
        title: str,
    ) -> bytes:
        """
        Render a forensic composite side-by-side canvas of sketch and reference
        with numbered spatial annotation markers and metadata telemetry banner.
        """
        vis_sketch = sketch_bgr.copy()
        vis_ref = ref_bgr.copy()

        h_s, w_s = vis_sketch.shape[:2]
        h_r, w_r = vis_ref.shape[:2]

        # Draw annotations on Sketch (Cyan markers)
        sketch_anns = [a for a in annotations if a.get("target") == "sketch"]
        for idx, ann in enumerate(sketch_anns):
            self._draw_annotation_marker(vis_sketch, ann, idx + 1, (255, 215, 0))  # Cyan/Gold

        # Draw annotations on Reference (Emerald markers)
        ref_anns = [a for a in annotations if a.get("target") == "reference"]
        for idx, ann in enumerate(ref_anns):
            self._draw_annotation_marker(vis_ref, ann, idx + 1, (110, 231, 183))  # Emerald

        # Scale to common height (520px)
        target_h = 520
        new_w_s = int(round(w_s * (target_h / max(1, h_s))))
        resized_sketch = cv2.resize(vis_sketch, (new_w_s, target_h), interpolation=cv2.INTER_AREA)

        new_w_r = int(round(w_r * (target_h / max(1, h_r))))
        resized_ref = cv2.resize(vis_ref, (new_w_r, target_h), interpolation=cv2.INTER_AREA)

        # Composite side-by-side with divider
        divider = np.full((target_h, 4, 3), 40, dtype=np.uint8)
        composite_body = np.hstack([resized_sketch, divider, resized_ref])
        total_w = composite_body.shape[1]

        # Top Header Banner
        header_h = 56
        header = np.full((header_h, total_w, 3), 15, dtype=np.uint8)
        cv2.putText(header, f"FORENVISION AI — {title.upper()[:60]}", (16, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (226, 232, 240), 1, cv2.LINE_AA)
        cv2.putText(
            header,
            "ACE-V MORPHOLOGICAL COMPARISON  |  ANNOTATIONS: " + str(len(annotations)) + "  |  NO AUTOMATED ACCUSATION",
            (16, 44),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.40,
            (148, 163, 184),
            1,
            cv2.LINE_AA,
        )

        # Footer Telemetry Banner
        footer_h = 44
        footer = np.full((footer_h, total_w, 3), 20, dtype=np.uint8)
        cv2.putText(footer, f"SKETCH COMPOSITE: {sketch_filename[:35]}", (16, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (203, 213, 225), 1, cv2.LINE_AA)
        cv2.putText(footer, f"REFERENCE EXEMPLAR: {ref_filename[:35]}", (total_w // 2 + 16, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (203, 213, 225), 1, cv2.LINE_AA)

        full_canvas = np.vstack([header, composite_body, footer])

        success, enc_buffer = cv2.imencode(".jpg", full_canvas, [cv2.IMWRITE_JPEG_QUALITY, 90])
        if not success:
            raise RuntimeError("Failed to encode sketch comparison visualization.")
        return enc_buffer.tobytes()

    def _draw_annotation_marker(
        self,
        img: np.ndarray,
        ann: Dict[str, Any],
        number: int,
        color: Tuple[int, int, int],
    ) -> None:
        """Draw numbered target reticle and label for a forensic annotation."""
        h, w = img.shape[:2]
        x_raw = ann.get("x", 0.0)
        y_raw = ann.get("y", 0.0)

        # Support normalized [0, 1] or absolute pixel coordinates
        if 0.0 <= x_raw <= 1.0 and 0.0 <= y_raw <= 1.0:
            px = int(round(x_raw * w))
            py = int(round(y_raw * h))
        else:
            px = int(round(x_raw))
            py = int(round(y_raw))

        px = max(10, min(w - 10, px))
        py = max(10, min(h - 10, py))

        # Target reticle
        cv2.circle(img, (px, py), 12, color, 2, cv2.LINE_AA)
        cv2.circle(img, (px, py), 2, color, -1, cv2.LINE_AA)
        cv2.line(img, (px - 16, py), (px + 16, py), color, 1, cv2.LINE_AA)
        cv2.line(img, (px, py - 16), (px, py + 16), color, 1, cv2.LINE_AA)

        # Number badge
        tag = f"#{number}"
        cv2.putText(img, tag, (px + 14, py - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)

    def _save_session_record(self, record: Dict[str, Any]) -> None:
        """Persist session record to MongoDB and memory store."""
        self._memory_sessions[record["sessionId"]] = record
        db = db_service.get_db()
        if db is not None:
            try:
                db["analysis_results"].replace_one(
                    {"sessionId": record["sessionId"]},
                    record,
                    upsert=True,
                )
            except PyMongoError:
                pass

    def get_session_by_id(
        self,
        session_id: str,
        user: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Retrieve comparison session by ID, validating case authorization."""
        record = self._memory_sessions.get(session_id)
        if not record:
            db = db_service.get_db()
            if db is not None:
                try:
                    record = db["analysis_results"].find_one({"sessionId": session_id})
                except PyMongoError:
                    pass

        if not record:
            return None

        # Verify Case Clearance
        case_id = record.get("caseId")
        if case_id:
            raw_case = case_service._find_raw_case_doc(case_id)
            if raw_case and not case_service.user_can_access_case(user, raw_case):
                raise PermissionError("Access denied: You do not have clearance for this case's sketch session.")

        clean = dict(record)
        clean.pop("_id", None)
        return clean

    def get_sessions_history(
        self,
        evidence_id: str,
        user: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Retrieve all sketch comparison sessions associated with an evidence item."""
        ev_doc = evidence_service.get_evidence_by_id(evidence_id, user)
        if not ev_doc:
            raise PermissionError("Access denied: Evidence artifact is inaccessible under your clearance.")

        records: List[Dict[str, Any]] = []

        # 1. MongoDB Query
        db = db_service.get_db()
        if db is not None:
            try:
                cursor = db["analysis_results"].find(
                    {
                        "$or": [
                            {"sketchEvidence.id": evidence_id},
                            {"referenceEvidence.id": evidence_id},
                            {"caseId": ev_doc.get("caseId")},
                        ],
                        "category": "sketch_comparison_session",
                    }
                ).sort("timestamp", -1)

                for r in cursor:
                    r.pop("_id", None)
                    records.append(r)
            except PyMongoError:
                pass

        # 2. In-memory cache merge
        for mem_id, mem_rec in self._memory_sessions.items():
            if mem_rec.get("category") == "sketch_comparison_session":
                s_id = mem_rec.get("sketchEvidence", {}).get("id")
                r_id = mem_rec.get("referenceEvidence", {}).get("id")
                c_id = mem_rec.get("caseId")
                if evidence_id in (s_id, r_id) or ev_doc.get("caseId") == c_id:
                    if not any(r["sessionId"] == mem_id for r in records):
                        clean = dict(mem_rec)
                        clean.pop("_id", None)
                        records.append(clean)

        records.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
        return records

    def get_derived_visualization_bytes(
        self,
        session_id: str,
        user: Dict[str, Any],
    ) -> Tuple[bytes, str]:
        """Retrieve derived comparison visualization JPEG bytes, enforcing authorization."""
        record = self.get_session_by_id(session_id, user)
        if not record:
            raise FileNotFoundError(f"Sketch comparison session '{session_id}' not found.")

        # Check memory cache
        if session_id in self._memory_derived_files:
            return self._memory_derived_files[session_id], f"{session_id}_comparison.jpg"

        # Check disk vault
        case_number = record.get("caseNumber", "UNKNOWN-CASE")
        derived_filename = record.get("visualization", {}).get("derivedFilename", f"{session_id}_comparison.jpg")
        file_path = self._derived_dir / case_number / derived_filename

        if file_path.is_file():
            try:
                with open(file_path, "rb") as f:
                    return f.read(), derived_filename
            except OSError as e:
                raise RuntimeError(f"Failed to read derived visualization file: {str(e)}")

        raise FileNotFoundError(f"Derived visualization file for session '{session_id}' not found on server.")

    def _ensure_experimental_models(self) -> Tuple[Any, Any, Dict[str, np.ndarray]]:
        """Thread-safe lazy loader for YuNet, SFace, and trained CUHK cross-modality adapter."""
        with self._model_lock:
            if self._detector is None:
                if not self._yunet_path.is_file():
                    raise FileNotFoundError(f"YuNet model missing at {self._yunet_path}")
                self._detector = cv2.FaceDetectorYN.create(
                    model=str(self._yunet_path),
                    config="",
                    input_size=(320, 320),
                    score_threshold=0.30,
                    nms_threshold=0.30,
                    top_k=50,
                )
            if self._recognizer is None:
                if not self._sface_path.is_file():
                    raise FileNotFoundError(f"SFace model missing at {self._sface_path}")
                self._recognizer = cv2.FaceRecognizerSF.create(
                    model=str(self._sface_path),
                    config="",
                )
            if self._adapter_weights is None:
                if not self._adapter_npz_path.is_file():
                    raise FileNotFoundError(
                        f"Trained CUHK sketch adapter weights missing at {self._adapter_npz_path}"
                    )
                with np.load(self._adapter_npz_path) as data:
                    self._adapter_weights = {k: data[k].copy() for k in data.files}
            return self._detector, self._recognizer, self._adapter_weights

    def _project_branch(self, emb: np.ndarray, weights: Dict[str, np.ndarray], prefix: str) -> np.ndarray:
        """Apply trained residual MLP projection head to a 128-D SFace embedding."""
        x = emb.reshape(1, -1).astype(np.float32)
        w1 = weights[f"{prefix}_fc1_weight"]
        b1 = weights[f"{prefix}_fc1_bias"]
        mean = weights[f"{prefix}_bn1_running_mean"]
        var = weights[f"{prefix}_bn1_running_var"]
        gamma = weights[f"{prefix}_bn1_weight"]
        beta = weights[f"{prefix}_bn1_bias"]
        w2 = weights[f"{prefix}_fc2_weight"]
        b2 = weights[f"{prefix}_fc2_bias"]
        rw = weights[f"{prefix}_res_weight"]

        h = x @ w1.T + b1
        h = gamma * (h - mean) / np.sqrt(var + 1e-5) + beta
        h = np.maximum(0.0, h)
        delta = h @ w2.T + b2
        out = x + rw * delta
        out = out.flatten()
        norm = float(np.linalg.norm(out))
        return out / (norm + 1e-12)

    def _extract_face_embedding(
        self,
        bgr_img: np.ndarray,
        detector: Any,
        recognizer: Any,
        is_sketch: bool = False,
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        """Detect face, align 112x112 crop, and extract normalized 128-D SFace embedding."""
        work = bgr_img.copy()
        if is_sketch:
            gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            work = cv2.cvtColor(clahe.apply(gray), cv2.COLOR_GRAY2BGR)

        pad = 48
        padded = cv2.copyMakeBorder(work, pad, pad, pad, pad, cv2.BORDER_REPLICATE)
        ph, pw = padded.shape[:2]

        with self._model_lock:
            detector.setInputSize((pw, ph))
            _, faces = detector.detect(padded)

        detection_method = "YuNet"
        if faces is None or len(faces) == 0:
            # Controlled fallback: resize directly to 112x112 when tightly cropped face image lacks margins
            detection_method = "CenterCropFallback"
            aligned = cv2.resize(work, (112, 112), interpolation=cv2.INTER_AREA)
            face_info = {
                "detected": False,
                "method": detection_method,
                "confidence": 0.0,
                "box": [0, 0, work.shape[1], work.shape[0]],
            }
        else:
            best = faces[int(np.argmax(faces[:, 14]))]
            aligned = recognizer.alignCrop(padded, best)
            x, y, bw, bh = best[:4]
            face_info = {
                "detected": True,
                "method": detection_method,
                "confidence": round(float(best[14]), 4),
                "box": [
                    max(0, int(round(x - pad))),
                    max(0, int(round(y - pad))),
                    int(round(bw)),
                    int(round(bh)),
                ],
            }

        with self._model_lock:
            feat = recognizer.feature(aligned).flatten().astype(np.float32)

        norm = float(np.linalg.norm(feat))
        if norm > 1e-9:
            feat = feat / norm
        return feat, aligned, face_info

    def compare_sketch_experimental(
        self,
        sketch_evidence_id: str,
        reference_evidence_id: str,
        user: Dict[str, Any],
        save_analysis: bool = True,
    ) -> Dict[str, Any]:
        """
        Execute experimental CUHK-trained cross-modality sketch-to-photo comparison.
        Returns objective baseline SFace & CUHK-aligned cosine/L2 diagnostics plus
        explicit non-admissibility disclaimers.
        """
        if not sketch_evidence_id or not reference_evidence_id:
            raise ValueError("Both 'sketchEvidenceId' and 'referenceEvidenceId' are required.")
        if sketch_evidence_id == reference_evidence_id:
            raise ValueError("Sketch and Reference evidence cannot be the identical artifact.")

        sketch_doc = evidence_service.get_evidence_by_id(sketch_evidence_id, user)
        if not sketch_doc:
            raise PermissionError("Access denied: Sketch evidence artifact is inaccessible under your clearance.")
        ref_doc = evidence_service.get_evidence_by_id(reference_evidence_id, user)
        if not ref_doc:
            raise PermissionError("Access denied: Reference evidence artifact is inaccessible under your clearance.")

        sketch_bytes, sketch_filename, _ = evidence_service.get_evidence_file_bytes(sketch_evidence_id, user)
        ref_bytes, ref_filename, _ = evidence_service.get_evidence_file_bytes(reference_evidence_id, user)

        sketch_bgr = cv2.imdecode(np.frombuffer(sketch_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        ref_bgr = cv2.imdecode(np.frombuffer(ref_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if sketch_bgr is None or ref_bgr is None:
            raise ValueError("Failed to decode image bytes for sketch or reference artifact.")

        detector, recognizer, weights = self._ensure_experimental_models()

        s_raw, s_crop, s_face_info = self._extract_face_embedding(sketch_bgr, detector, recognizer, is_sketch=True)
        p_raw, p_crop, p_face_info = self._extract_face_embedding(ref_bgr, detector, recognizer, is_sketch=False)

        baseline_cos = float(np.dot(s_raw, p_raw))
        s_aligned = self._project_branch(s_raw, weights, "sketch_proj")
        p_aligned = self._project_branch(p_raw, weights, "photo_proj")

        aligned_cos = float(np.dot(s_aligned, p_aligned))
        aligned_l2 = float(np.linalg.norm(s_aligned - p_aligned))

        if aligned_cos >= 0.40:
            band = "STRONG_CROSS_MODALITY_CORRESPONDENCE"
        elif aligned_cos >= 0.25:
            band = "MODERATE_CROSS_MODALITY_CORRESPONDENCE"
        elif aligned_cos >= 0.12:
            band = "LOW_CROSS_MODALITY_CORRESPONDENCE"
        else:
            band = "WEAK_OR_DIVERGENT"

        # Render side-by-side experimental probe canvas
        s_vis = cv2.resize(s_crop, (224, 224), interpolation=cv2.INTER_CUBIC)
        p_vis = cv2.resize(p_crop, (224, 224), interpolation=cv2.INTER_CUBIC)
        divider = np.full((224, 6, 3), 30, dtype=np.uint8)
        body = np.hstack([s_vis, divider, p_vis])
        tw = body.shape[1]

        header = np.full((52, tw, 3), 15, dtype=np.uint8)
        cv2.putText(header, "CUHK EXPERIMENTAL CROSS-MODALITY PROBE", (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (56, 189, 248), 1, cv2.LINE_AA)
        cv2.putText(header, f"ALIGNED COS: {aligned_cos:.4f} | RAW SFACE: {baseline_cos:.4f} | NOT ADMISSIBLE", (12, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (251, 191, 36), 1, cv2.LINE_AA)

        footer = np.full((34, tw, 3), 20, dtype=np.uint8)
        cv2.putText(footer, "ALIGNED SKETCH", (18, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (203, 213, 225), 1, cv2.LINE_AA)
        cv2.putText(footer, "ALIGNED REFERENCE", (250, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (203, 213, 225), 1, cv2.LINE_AA)

        canvas = np.vstack([header, body, footer])
        ok, enc = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if not ok:
            raise RuntimeError("Failed to encode experimental sketch probe visualization.")
        derived_bytes = enc.tobytes()

        analysis_id = f"skexp_{uuid.uuid4().hex[:12]}"
        case_number = sketch_doc.get("caseNumber", "UNKNOWN-CASE")
        now_str = datetime.now(timezone.utc).isoformat()
        derived_filename = f"{analysis_id}_experimental_probe.jpg"

        case_derived_dir = self._derived_dir / case_number
        case_derived_dir.mkdir(parents=True, exist_ok=True)
        derived_file_path = case_derived_dir / derived_filename
        try:
            with open(derived_file_path, "wb") as f:
                f.write(derived_bytes)
            os.chmod(derived_file_path, 0o640)
        except OSError:
            pass
        self._memory_derived_files[analysis_id] = derived_bytes

        adapter_meta = self._load_adapter_metadata() or {}
        user_name = user.get("name") or "Authorized Examiner"
        badge = user.get("badge_number") or user.get("badge") or "N/A"

        result_doc: Dict[str, Any] = {
            "id": analysis_id,
            "sessionId": analysis_id,
            "analysisId": analysis_id,
            "analysisType": "Experimental CUHK Cross-Modality Sketch Probe",
            "category": "sketch_experimental_probe",
            "experimentalStatus": "EXPERIMENTAL_CUHK_TRAINED_DIAGNOSTIC",
            "admissibilityStatus": "NOT_VALIDATED_FOR_DAUBERT_FRYE_IDENTIFICATION",
            "caseId": str(sketch_doc.get("caseId")),
            "caseNumber": case_number,
            "sketchEvidence": {
                "id": sketch_evidence_id,
                "evidenceNumber": sketch_doc.get("evidenceNumber", sketch_evidence_id),
                "filename": sketch_filename,
                "faceDetection": s_face_info,
            },
            "referenceEvidence": {
                "id": reference_evidence_id,
                "evidenceNumber": ref_doc.get("evidenceNumber", reference_evidence_id),
                "filename": ref_filename,
                "faceDetection": p_face_info,
            },
            "metrics": {
                "alignedCosineSimilarity": round(aligned_cos, 4),
                "baselineRawSFaceSimilarity": round(baseline_cos, 4),
                "alignmentDelta": round(aligned_cos - baseline_cos, 4),
                "alignedL2Distance": round(aligned_l2, 4),
                "exploratoryBand": band,
            },
            "modelInfo": {
                "modelId": adapter_meta.get("modelId", "cuhk-sketch-cross-modality-v1"),
                "modelName": adapter_meta.get("modelName", "CUHK Cross-Modality Sketch-to-Photo Feature Adapter"),
                "version": adapter_meta.get("version", "1.0.0-cuhk-sface"),
                "trainingDataset": adapter_meta.get("trainingDataset"),
                "benchmarkTestMetrics": (adapter_meta.get("evaluationMetrics") or {}).get("heldOutTest"),
                "benchmarkEvaluation": adapter_meta.get("evaluationMetrics"),
            },
            "visualization": {
                "derivedFilename": derived_filename,
                "derivedImageUrl": f"/api/analysis/sketch/derived/{analysis_id}",
                "hasVisual": True,
                "fileSize": len(derived_bytes),
            },
            "forensicDisclaimer": SKETCH_FORENSIC_DISCLAIMER,
            "performedBy": f"{user_name} ({badge})" if badge != "N/A" else user_name,
            "timestamp": now_str,
            "status": "COMPLETED",
        }

        if save_analysis:
            self._save_session_record(result_doc)

        return result_doc


sketch_service = SketchService()
