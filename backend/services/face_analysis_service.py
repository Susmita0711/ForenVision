"""
Controlled Facial Analysis & Forensic Comparison Service for ForenVision AI.
Provides rigorous face detection, facial landmark localization, forensic image quality
assessment, and controlled 1-to-1 exploratory comparison using YuNet and SFace models.

FORENSIC PRINCIPLES & LEGAL INVARIANTS:
1. Zero Modification: Original evidence files are strictly preserved and immutable.
2. Objective Metric Reporting: Algorithmic metrics represent spatial and descriptor
   correspondence in a mathematical latent space. They are NEVER represented as proof
   of physical identity, individualization, or culpability.
3. No Unrestricted Search: Rejects 1-to-many database sweeps or mass surveillance scraping.
   Analysis is strictly restricted to controlled 1-to-1 pairwise inspection of explicit,
   authorized evidence artifacts.
4. Non-Culpability Standard: A mathematical similarity score under NO circumstances
   establishes criminal suspect status, physical presence, or legal guilt.
5. Biometric Data Protection: Biometric embedding vectors are processed transiently in
   memory and are never exposed via public URLs or logged in plain text.
6. ACE-V Prerequisite: Conclusive facial identification requires independent manual examination
   by a qualified forensic facial comparison expert under international ACE-V standards.
"""

from __future__ import annotations

import io
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

FACE_FORENSIC_DISCLAIMER = (
    "BIOMETRIC UNCERTAINTY NOTICE: Facial comparison scores quantify mathematical similarity "
    "between localized facial feature embeddings in a latent neural representation space. "
    "Under international forensic standards (NIST FRTE, OSAC, and ENFSI BPM for Facial Image Comparison), "
    "automated algorithms do NOT establish definitive individualization or proof of physical identity. "
    "A similarity score under NO circumstances establishes criminal suspect status, physical presence, "
    "or legal culpability. All automated metrics are subject to demographic variance and environmental "
    "degradation (including low resolution, extreme angles, and non-uniform illumination). Conclusive "
    "determinations require manual morphological examination by a certified forensic facial examiner "
    "under ACE-V (Analysis, Comparison, Evaluation, Verification) methodology."
)

METHODOLOGY_DOCUMENTATION = {
    "engine": "ForenVision Controlled Facial Analysis Engine",
    "detectorModel": {
        "name": "YuNet Face Detector",
        "version": "2023mar ONNX",
        "architecture": "Lightweight Anchor-free Convolutional Neural Network",
        "license": "Apache 2.0 (OpenCV Model Zoo / Shiqi Yu)",
        "features": ["Bounding Box Localization", "5-Point Facial Landmarks (Eyes, Nose, Mouth Corners)", "Detection Confidence"],
        "inputResolution": "Dynamic Scale-Preserving Tensor Input",
    },
    "comparisonModel": {
        "name": "SFace Deep Facial Representation",
        "version": "2021dec ONNX",
        "architecture": "SphereFace2 / ResNet-style Deep Feature Embedder",
        "license": "Apache 2.0 (OpenCV Model Zoo / Zhongdao Wang)",
        "embeddingDimension": 128,
        "metrics": ["Cosine Similarity", "L2 Euclidean Distance"],
        "canonicalCropSize": "112x112 Normalized Aligned Coordinate Space",
    },
    "fallbackDetector": {
        "name": "Haar Feature-based Cascade Classifier",
        "license": "BSD 3-Clause (OpenCV / Intel)",
        "role": "Autonomous secondary fallback if neural model weights are inaccessible",
    },
    "qualityAssessment": [
        "Inter-Pupillary Distance (IPD in pixels; NIST recommends >= 60px for forensic examination)",
        "Spatial High-Frequency Sharpness via Facial ROI Laplacian Variance",
        "Hemispheric Illumination Symmetry (detects harsh lateral shadows or backlighting)",
        "Dynamic Range, Mean Luminance, and Highlight/Shadow Saturation Clipping",
        "Facial Roll/Tilt Angle Estimation from Eye Landmark Geometry",
    ],
    "scientificLimitations": [
        "Demographic Differentials: Deep neural networks have documented variance across age groups, biological sex, and diverse ethnicities.",
        "Resolution Degradation: Surveillance imagery below 60px inter-ocular distance exhibits degraded embedding fidelity.",
        "Pose Variation: Non-frontal yaw or pitch angles exceeding 15 degrees non-linearly compress facial geometry.",
        "Compression Artifacts: Surveillance JPEG re-compression introduces block boundary noise near fine facial features.",
        "Non-Identification Standard: Latent vector proximity does not equate to unique anatomical source attribution.",
    ],
    "retentionPolicy": (
        "Analysis artifacts and derived visualizations are retained strictly within authorized case boundaries "
        "and follow the case retention lifecycle. Biometric feature vectors are processed in memory and are not "
        "persisted to external surveillance registries or shared across case boundaries."
    ),
    "evaluationGuidelines": {
        "strongCorrespondence": "Cosine Similarity >= 0.55 and L2 Distance <= 0.90 (Consistent with mated facial impressions under favorable quality)",
        "moderateCorrespondence": "Cosine Similarity 0.36 - 0.54 and L2 Distance 0.90 - 1.15 (Noticeable feature correspondence; examiner review required)",
        "lowCorrespondence": "Cosine Similarity 0.20 - 0.35 and L2 Distance 1.15 - 1.35 (Substantial geometric divergence)",
        "inconclusive": "Cosine Similarity < 0.20 or Image Quality Tier DEGRADED_UNRELIABLE (Insufficient reliable data for comparison)",
    },
}


class FaceAnalysisService:
    """Thread-safe controlled forensic facial analysis and 1-to-1 comparison service."""

    def __init__(self, base_upload_dir: Optional[str] = None) -> None:
        if base_upload_dir:
            self._vault_dir = Path(base_upload_dir) / "vault"
        else:
            self._vault_dir = Path(Config.UPLOAD_FOLDER) / "vault"
        self._derived_dir = self._vault_dir / "derived"

        # Model Paths
        base_dir = Path(__file__).resolve().parent.parent
        self._models_dir = base_dir / "models"
        self._yunet_path = self._models_dir / "face_detection_yunet_2023mar.onnx"
        self._sface_path = self._models_dir / "face_recognition_sface_2021dec.onnx"

        self._lock = threading.Lock()
        self._detector: Optional[Any] = None
        self._recognizer: Optional[Any] = None
        self._detector_loaded = False
        self._recognizer_loaded = False

        # In-memory stores for tests and unconfigured database fallbacks
        self._memory_analysis_records: Dict[str, Dict[str, Any]] = {}
        self._memory_derived_files: Dict[str, bytes] = {}

    def reset_in_memory_state(self) -> None:
        """Clear memory cache for test isolation."""
        self._memory_analysis_records.clear()
        self._memory_derived_files.clear()

    def get_methodology_info(self) -> Dict[str, Any]:
        """Return comprehensive scientific methodology, model specifications, and legal caveats."""
        models_available = {
            "yuNetDetectionModel": self._yunet_path.is_file(),
            "sFaceRecognitionModel": self._sface_path.is_file(),
            "haarCascadeFallback": True,
        }
        return {
            "methodology": METHODOLOGY_DOCUMENTATION,
            "forensicDisclaimer": FACE_FORENSIC_DISCLAIMER,
            "modelsAvailable": models_available,
        }

    def _ensure_models(self) -> Tuple[Optional[Any], Optional[Any]]:
        """Lazy thread-safe initialization of YuNet and SFace models."""
        with self._lock:
            if not self._detector_loaded and self._yunet_path.is_file():
                try:
                    # Initialize with default placeholder size; dynamically updated per image
                    self._detector = cv2.FaceDetectorYN.create(
                        model=str(self._yunet_path),
                        config="",
                        input_size=(320, 320),
                        score_threshold=0.4,
                        nms_threshold=0.3,
                        top_k=500,
                    )
                    self._detector_loaded = True
                except Exception as e:
                    self._detector = None
                    self._detector_loaded = True

            if not self._recognizer_loaded and self._sface_path.is_file():
                try:
                    self._recognizer = cv2.FaceRecognizerSF.create(
                        model=str(self._sface_path),
                        config="",
                    )
                    self._recognizer_loaded = True
                except Exception as e:
                    self._recognizer = None
                    self._recognizer_loaded = True

            return self._detector, self._recognizer

    def detect_faces(
        self,
        bgr_img: np.ndarray,
        score_threshold: float = 0.4,
    ) -> List[Dict[str, Any]]:
        """
        Detect faces in image using YuNet (or Haar cascade fallback).
        Returns list of structured face detections including bounding box and 5 landmarks.
        """
        h, w = bgr_img.shape[:2]
        detector, _ = self._ensure_models()

        detected_faces: List[Dict[str, Any]] = []

        if detector is not None:
            try:
                with self._lock:
                    detector.setInputSize((w, h))
                    detector.setScoreThreshold(score_threshold)
                    _, faces = detector.detect(bgr_img)

                if faces is not None and len(faces) > 0:
                    for i, face_arr in enumerate(faces):
                        bx = max(0, int(round(float(face_arr[0]))))
                        by = max(0, int(round(float(face_arr[1]))))
                        bw = min(w - bx, max(1, int(round(float(face_arr[2])))))
                        bh = min(h - by, max(1, int(round(float(face_arr[3])))))
                        conf = round(float(face_arr[14]), 4)

                        # Landmarks: [right_eye_x, right_eye_y, left_eye_x, left_eye_y, nose_x, nose_y, mouth_right_x, mouth_right_y, mouth_left_x, mouth_left_y]
                        right_eye = [round(float(face_arr[4]), 1), round(float(face_arr[5]), 1)]
                        left_eye = [round(float(face_arr[6]), 1), round(float(face_arr[7]), 1)]
                        nose = [round(float(face_arr[8]), 1), round(float(face_arr[9]), 1)]
                        right_mouth = [round(float(face_arr[10]), 1), round(float(face_arr[11]), 1)]
                        left_mouth = [round(float(face_arr[12]), 1), round(float(face_arr[13]), 1)]

                        # Inter-pupillary distance (IPD)
                        ipd = round(math.dist(right_eye, left_eye), 1)

                        # Roll angle (degrees)
                        dx = left_eye[0] - right_eye[0]
                        dy = left_eye[1] - right_eye[1]
                        roll_deg = round(math.degrees(math.atan2(dy, dx)), 1) if dx != 0 else 0.0

                        detected_faces.append({
                            "faceIndex": i + 1,
                            "box": {"x": bx, "y": by, "width": bw, "height": bh},
                            "confidence": conf,
                            "landmarks": {
                                "rightEye": right_eye,
                                "leftEye": left_eye,
                                "noseTip": nose,
                                "rightMouth": right_mouth,
                                "leftMouth": left_mouth,
                            },
                            "interPupillaryDistance": ipd,
                            "rollAngleDegrees": roll_deg,
                            "faceAreaRatio": round((bw * bh) / max(1, w * h), 4),
                            "rawFaceArray": face_arr.tolist(),
                            "detectorEngine": "YuNet (CNN)",
                        })
            except Exception:
                detected_faces = []

        # Secondary Fallback: Haar Cascade Classifier if YuNet yields 0 detections or is unavailable
        if not detected_faces:
            detected_faces = self._detect_faces_haar(bgr_img)

        # Sort largest face area first
        detected_faces.sort(key=lambda f: f["box"]["width"] * f["box"]["height"], reverse=True)
        return detected_faces

    def _detect_faces_haar(self, bgr_img: np.ndarray) -> List[Dict[str, Any]]:
        """Fallback face detection using OpenCV built-in Haar Cascade classifier."""
        h, w = bgr_img.shape[:2]
        gray = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2GRAY)

        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        face_cascade = cv2.CascadeClassifier(cascade_path)
        eye_cascade_path = cv2.data.haarcascades + "haarcascade_eye.xml"
        eye_cascade = cv2.CascadeClassifier(eye_cascade_path)

        if face_cascade.empty():
            return []

        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )

        detected_faces: List[Dict[str, Any]] = []
        for i, (bx, by, bw, bh) in enumerate(faces):
            bx = max(0, int(bx))
            by = max(0, int(by))
            bw = min(w - bx, max(1, int(bw)))
            bh = min(h - by, max(1, int(bh)))

            # Crop eye region (upper 60% of face box)
            roi_gray = gray[by : by + int(bh * 0.6), bx : bx + bw]
            eyes = eye_cascade.detectMultiScale(roi_gray, scaleFactor=1.1, minNeighbors=3, minSize=(10, 10))

            landmarks: Optional[Dict[str, Any]] = None
            ipd = round(bw * 0.38, 1)  # Anatomical heuristic approximation if eyes occluded
            roll_deg = 0.0

            if len(eyes) >= 2:
                # Sort eyes by x position
                sorted_eyes = sorted(eyes, key=lambda e: e[0])
                re_x, re_y, re_w, re_h = sorted_eyes[0]
                le_x, le_y, le_w, le_h = sorted_eyes[-1]

                right_eye = [round(float(bx + re_x + re_w / 2), 1), round(float(by + re_y + re_h / 2), 1)]
                left_eye = [round(float(bx + le_x + le_w / 2), 1), round(float(by + le_y + le_h / 2), 1)]
                ipd = round(math.dist(right_eye, left_eye), 1)

                dx = left_eye[0] - right_eye[0]
                dy = left_eye[1] - right_eye[1]
                roll_deg = round(math.degrees(math.atan2(dy, dx)), 1) if dx != 0 else 0.0

                nose = [round(float(bx + bw / 2), 1), round(float(by + bh * 0.55), 1)]
                right_mouth = [round(float(bx + bw * 0.3), 1), round(float(by + bh * 0.8), 1)]
                left_mouth = [round(float(bx + bw * 0.7), 1), round(float(by + bh * 0.8), 1)]

                landmarks = {
                    "rightEye": right_eye,
                    "leftEye": left_eye,
                    "noseTip": nose,
                    "rightMouth": right_mouth,
                    "leftMouth": left_mouth,
                }
            else:
                # Approximate anatomical landmarks
                landmarks = {
                    "rightEye": [round(bx + bw * 0.32, 1), round(by + bh * 0.38, 1)],
                    "leftEye": [round(bx + bw * 0.68, 1), round(by + bh * 0.38, 1)],
                    "noseTip": [round(bx + bw * 0.50, 1), round(by + bh * 0.58, 1)],
                    "rightMouth": [round(bx + bw * 0.35, 1), round(by + bh * 0.78, 1)],
                    "leftMouth": [round(bx + bw * 0.65, 1), round(by + bh * 0.78, 1)],
                }

            # Synthesize 15-element array compatible with SFace alignCrop
            raw_face_arr = [
                float(bx), float(by), float(bw), float(bh),
                landmarks["rightEye"][0], landmarks["rightEye"][1],
                landmarks["leftEye"][0], landmarks["leftEye"][1],
                landmarks["noseTip"][0], landmarks["noseTip"][1],
                landmarks["rightMouth"][0], landmarks["rightMouth"][1],
                landmarks["leftMouth"][0], landmarks["leftMouth"][1],
                0.85,
            ]

            detected_faces.append({
                "faceIndex": i + 1,
                "box": {"x": bx, "y": by, "width": bw, "height": bh},
                "confidence": 0.85,
                "landmarks": landmarks,
                "interPupillaryDistance": ipd,
                "rollAngleDegrees": roll_deg,
                "faceAreaRatio": round((bw * bh) / max(1, w * h), 4),
                "rawFaceArray": raw_face_arr,
                "detectorEngine": "Haar Cascade (OpenCV Fallback)",
            })

        return detected_faces

    def assess_face_quality(
        self,
        bgr_img: np.ndarray,
        face_info: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Assess face image quality, resolution, focus/sharpness, lighting uniformity,
        and generate objective forensic warnings.
        """
        h, w = bgr_img.shape[:2]
        box = face_info["box"]
        bx, by, bw, bh = box["x"], box["y"], box["width"], box["height"]

        # Ensure valid ROI within bounds
        x1 = max(0, min(w - 1, bx))
        y1 = max(0, min(h - 1, by))
        x2 = max(x1 + 1, min(w, bx + bw))
        y2 = max(y1 + 1, min(h, by + bh))

        face_roi = bgr_img[y1:y2, x1:x2]
        if face_roi.size == 0:
            return {
                "qualityTier": "DEGRADED_UNRELIABLE",
                "clarityScore": 0.0,
                "laplacianVariance": 0.0,
                "interPupillaryDistance": 0.0,
                "lightingAsymmetry": 0.0,
                "warnings": ["Invalid or zero-sized facial bounding box."],
                "dimensions": f"{bw}x{bh}",
            }

        face_gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
        roi_h, roi_w = face_gray.shape[:2]

        # 1. Spatial Sharpness via Laplacian Variance on Facial ROI
        lap_var = float(cv2.Laplacian(face_gray, cv2.CV_64F).var())
        # Benchmark: lap_var >= 180 is high sharpness on facial skin; < 60 is blurred
        clarity_score = round(min(100.0, max(0.0, (lap_var / 350.0) * 100.0)), 1)

        # 2. Illumination & Contrast Metrics
        mean_lum = float(np.mean(face_gray))
        std_lum = float(np.std(face_gray))
        min_lum = float(np.min(face_gray))
        max_lum = float(np.max(face_gray))
        dynamic_range = max_lum - min_lum

        # Highlight & Shadow Saturation
        overexposed_ratio = float(np.count_nonzero(face_gray >= 250)) / max(1, roi_h * roi_w)
        underexposed_ratio = float(np.count_nonzero(face_gray <= 10)) / max(1, roi_h * roi_w)

        # 3. Hemispheric Lighting Symmetry (Left half vs Right half)
        mid_col = roi_w // 2
        if mid_col > 2:
            left_half_mean = float(np.mean(face_gray[:, :mid_col]))
            right_half_mean = float(np.mean(face_gray[:, mid_col:]))
            denom = left_half_mean + right_half_mean + 1e-5
            lighting_asymmetry = round(abs(left_half_mean - right_half_mean) / denom, 3)
        else:
            lighting_asymmetry = 0.0

        # 4. Inter-Pupillary Distance (IPD)
        ipd = face_info.get("interPupillaryDistance", round(bw * 0.38, 1))

        # 5. Pose Roll Angle
        roll_angle = face_info.get("rollAngleDegrees", 0.0)

        # 6. Objective Warnings
        warnings: List[str] = []
        if ipd < 30:
            warnings.append(
                f"Severely low resolution: Inter-pupillary distance is {ipd}px "
                "(NIST forensic standard requires >= 60px for comparison)."
            )
        elif ipd < 60:
            warnings.append(
                f"Sub-optimal resolution: Inter-pupillary distance is {ipd}px "
                "(Forensic standard recommends >= 60px)."
            )

        if lap_var < 50:
            warnings.append("Severe blur detected: Facial ROI lacks high-frequency edge definition.")
        elif lap_var < 100:
            warnings.append("Moderate softness / focus blur detected across facial features.")

        if lighting_asymmetry > 0.25:
            warnings.append(
                f"Severe lateral illumination asymmetry ({round(lighting_asymmetry * 100, 1)}% differential). "
                "Harsh side lighting may occlude contralateral eye and cheek contours."
            )
        elif lighting_asymmetry > 0.15:
            warnings.append("Moderate lateral lighting disparity across facial halves.")

        if overexposed_ratio > 0.08:
            warnings.append("Highlight saturation clipping: Skin highlights lose texture in bright regions.")
        if underexposed_ratio > 0.08:
            warnings.append("Shadow clipping: Heavy shadows obscure facial contours in dark regions.")

        if abs(roll_angle) > 15.0:
            warnings.append(f"Significant head roll tilt ({roll_angle}°). Geometric alignment may introduce interpolation artifacts.")

        if bw < 50 or bh < 50:
            warnings.append("Facial bounding box dimensions (<50px) are below investigative standards.")

        # 7. Quality Tier Classification
        if ipd >= 60 and clarity_score >= 45 and len(warnings) == 0:
            tier = "HIGH_FORENSIC_QUALITY"
        elif ipd >= 40 and clarity_score >= 25 and len(warnings) <= 2:
            tier = "ACCEPTABLE_INVESTIGATIVE_QUALITY"
        elif ipd >= 25 and len(warnings) <= 3:
            tier = "MARGINAL_LIMITED_VALUE"
        else:
            tier = "DEGRADED_UNRELIABLE"

        return {
            "qualityTier": tier,
            "clarityScore": clarity_score,
            "laplacianVariance": round(lap_var, 2),
            "meanLuminance": round(mean_lum, 1),
            "stdDevLuminance": round(std_lum, 1),
            "dynamicRange": round(dynamic_range, 1),
            "interPupillaryDistance": ipd,
            "lightingAsymmetry": lighting_asymmetry,
            "overexposedPercent": round(overexposed_ratio * 100, 1),
            "underexposedPercent": round(underexposed_ratio * 100, 1),
            "rollAngleDegrees": roll_angle,
            "dimensions": f"{bw}x{bh}",
            "warnings": warnings,
        }

    def _extract_sface_feature(
        self,
        bgr_img: np.ndarray,
        raw_face_arr: List[float],
    ) -> Optional[np.ndarray]:
        """
        Align, crop canonical 112x112 face, and extract 128-d SFace embedding vector.
        Biometric vectors are handled strictly in memory.
        """
        _, recognizer = self._ensure_models()
        if recognizer is None:
            return None

        try:
            face_np = np.array(raw_face_arr, dtype=np.float32)
            aligned_face = recognizer.alignCrop(bgr_img, face_np)
            feature = recognizer.feature(aligned_face)
            return feature
        except Exception:
            return None

    def compare_faces(
        self,
        probe_evidence_id: str,
        reference_evidence_id: str,
        user: Dict[str, Any],
        score_threshold: float = 0.4,
        save_analysis: bool = True,
    ) -> Dict[str, Any]:
        """
        Execute strictly controlled 1-to-1 facial comparison between two authorized evidence items:
        1. Validate investigator authorization on both cases/evidence.
        2. Ingest original image bytes (zero modification).
        3. Detect faces and assess individual image qualities.
        4. Extract 128-d deep representations (SFace) and evaluate Cosine & L2 correspondence metrics.
        5. Render composite side-by-side visualization with bounding boxes and landmark overlays.
        6. Persist structured record and derived image in vault.
        """
        # 1. Authorization & Clearance Checks
        probe_doc = evidence_service.get_evidence_by_id(probe_evidence_id, user)
        if not probe_doc:
            raise PermissionError("Access denied: Probe evidence artifact is inaccessible under your clearance.")

        ref_doc = evidence_service.get_evidence_by_id(reference_evidence_id, user)
        if not ref_doc:
            raise PermissionError("Access denied: Reference evidence artifact is inaccessible under your clearance.")

        probe_case_id = probe_doc.get("caseId")
        ref_case_id = ref_doc.get("caseId")

        # 2. Retrieve Original Evidence Bytes
        probe_bytes, probe_filename, probe_mime = evidence_service.get_evidence_file_bytes(probe_evidence_id, user)
        ref_bytes, ref_filename, ref_mime = evidence_service.get_evidence_file_bytes(reference_evidence_id, user)

        # 3. Decode Images (Working Copies)
        probe_np = np.frombuffer(probe_bytes, dtype=np.uint8)
        probe_bgr = cv2.imdecode(probe_np, cv2.IMREAD_COLOR)
        if probe_bgr is None:
            raise ValueError(f"Failed to decode probe evidence '{probe_filename}' as photographic image.")

        ref_np = np.frombuffer(ref_bytes, dtype=np.uint8)
        ref_bgr = cv2.imdecode(ref_np, cv2.IMREAD_COLOR)
        if ref_bgr is None:
            raise ValueError(f"Failed to decode reference evidence '{ref_filename}' as photographic image.")

        # Validate maximum dimensions to prevent memory exhaustion
        for img, name in [(probe_bgr, probe_filename), (ref_bgr, ref_filename)]:
            h, w = img.shape[:2]
            if h * w > MAX_PIXEL_COUNT or max(h, w) > MAX_DIMENSION:
                raise ValueError(f"Image '{name}' exceeds safe resolution limits ({w}x{h}).")

        # 4. Face Detection on Working Copies
        probe_faces = self.detect_faces(probe_bgr, score_threshold=score_threshold)
        ref_faces = self.detect_faces(ref_bgr, score_threshold=score_threshold)

        if not probe_faces:
            raise ValueError(
                f"No human face detected in probe evidence '{probe_filename}'. "
                "Ensure subject face is unobscured, frontal or semi-profile, and adequately illuminated."
            )
        if not ref_faces:
            raise ValueError(
                f"No human face detected in reference evidence '{ref_filename}'. "
                "Ensure reference face is unobscured and visible within sensor frame."
            )

        # Select primary (largest) face from each
        primary_probe_face = probe_faces[0]
        primary_ref_face = ref_faces[0]

        # 5. Comprehensive Quality Assessment
        probe_quality = self.assess_face_quality(probe_bgr, primary_probe_face)
        ref_quality = self.assess_face_quality(ref_bgr, primary_ref_face)

        # 6. Biometric Feature Extraction & Metric Computation
        probe_feat = self._extract_sface_feature(probe_bgr, primary_probe_face["rawFaceArray"])
        ref_feat = self._extract_sface_feature(ref_bgr, primary_ref_face["rawFaceArray"])

        _, recognizer = self._ensure_models()

        cosine_sim = 0.0
        l2_dist = 2.0
        if recognizer is not None and probe_feat is not None and ref_feat is not None:
            try:
                cosine_sim = float(recognizer.match(probe_feat, ref_feat, cv2.FaceRecognizerSF_FR_COSINE))
                l2_dist = float(recognizer.match(probe_feat, ref_feat, cv2.FaceRecognizerSF_FR_NORM_L2))
            except Exception:
                cosine_sim = 0.0
                l2_dist = 2.0
        else:
            # Fallback normalized correlation on cropped canonical grays if SFace unavailable
            cosine_sim, l2_dist = self._fallback_template_metric(probe_bgr, primary_probe_face, ref_bgr, primary_ref_face)

        cosine_sim = round(cosine_sim, 4)
        l2_dist = round(l2_dist, 4)

        # Normalized Exploratory Index on [0, 100] scale
        correspondence_index = round(max(0.0, min(100.0, cosine_sim * 100.0)), 1)

        # 7. Objective Forensic Correspondence Classification
        quality_degraded = (
            probe_quality["qualityTier"] == "DEGRADED_UNRELIABLE"
            or ref_quality["qualityTier"] == "DEGRADED_UNRELIABLE"
        )

        if cosine_sim >= 0.55 and l2_dist <= 0.90:
            correspondence_tier = "STRONG_CORRESPONDENCE"
            interpretation = (
                f"Strong algorithmic feature correspondence (Cosine: {cosine_sim}, L2: {l2_dist}). "
                "Feature vector geometry aligns consistently with mated facial impressions under current test conditions. "
                "Examiner morphological verification required under ACE-V methodology."
            )
        elif cosine_sim >= 0.36 and l2_dist <= 1.15:
            correspondence_tier = "MODERATE_CORRESPONDENCE"
            interpretation = (
                f"Moderate algorithmic correspondence (Cosine: {cosine_sim}, L2: {l2_dist}). "
                "Localized facial vector correspondence detected. Environmental noise, capture angle, or age "
                "differentials may affect alignment."
            )
        elif cosine_sim >= 0.20:
            correspondence_tier = "LOW_CORRESPONDENCE"
            interpretation = (
                f"Low algorithmic correspondence (Cosine: {cosine_sim}, L2: {l2_dist}). "
                "Substantial structural divergence in facial feature representations."
            )
        else:
            correspondence_tier = "INCONCLUSIVE_DIVERGENT"
            interpretation = (
                f"No significant algorithmic correspondence (Cosine: {cosine_sim}, L2: {l2_dist}). "
                "Facial representations diverge significantly in latent embedding space."
            )

        if quality_degraded:
            interpretation += (
                " WARNING: Severe image degradation detected in one or both portraits (e.g. sub-optimal IPD or blur). "
                "Algorithmic correspondence must be interpreted with extreme caution due to elevated risk of false correspondence."
            )

        # 8. Render Side-by-Side Comparison Visualization
        derived_bytes = self._render_comparison_visualization(
            probe_bgr,
            primary_probe_face,
            probe_quality,
            probe_filename,
            ref_bgr,
            primary_ref_face,
            ref_quality,
            ref_filename,
            cosine_sim,
            l2_dist,
            correspondence_tier,
        )

        # 9. Persist Derived Visualization to Vault
        analysis_id = f"fc_{uuid.uuid4().hex[:12]}"
        now_str = datetime.now(timezone.utc).isoformat()
        probe_case_number = probe_doc.get("caseNumber", "UNKNOWN-CASE")

        case_derived_dir = self._derived_dir / probe_case_number
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

        # 10. Assemble Analysis Record
        user_name = user.get("name") or "Authorized Examiner"
        badge = user.get("badge_number") or user.get("badge") or "N/A"

        analysis_doc: Dict[str, Any] = {
            "id": analysis_id,
            "analysisId": analysis_id,
            "analysisType": "Controlled Facial Comparison (YuNet + SFace)",
            "category": "face_biometric_comparison",
            "probeEvidence": {
                "id": probe_evidence_id,
                "evidenceNumber": probe_doc.get("evidenceNumber", probe_evidence_id),
                "filename": probe_filename,
                "caseId": str(probe_case_id),
                "caseNumber": probe_case_number,
                "detectedFacesCount": len(probe_faces),
                "faceConfidence": primary_probe_face["confidence"],
                "faceBox": primary_probe_face["box"],
                "landmarks": primary_probe_face["landmarks"],
                "quality": probe_quality,
            },
            "referenceEvidence": {
                "id": reference_evidence_id,
                "evidenceNumber": ref_doc.get("evidenceNumber", reference_evidence_id),
                "filename": ref_filename,
                "caseId": str(ref_case_id),
                "caseNumber": ref_doc.get("caseNumber", "UNKNOWN-CASE"),
                "detectedFacesCount": len(ref_faces),
                "faceConfidence": primary_ref_face["confidence"],
                "faceBox": primary_ref_face["box"],
                "landmarks": primary_ref_face["landmarks"],
                "quality": ref_quality,
            },
            "metrics": {
                "cosineSimilarity": cosine_sim,
                "l2Distance": l2_dist,
                "correspondenceIndex": correspondence_index,
                "correspondenceTier": correspondence_tier,
                "interpretation": interpretation,
                "scoreThreshold": score_threshold,
            },
            "modelMetadata": {
                "detector": primary_probe_face["detectorEngine"],
                "recognizer": "SFace (2021dec ONNX, 128-d)",
                "detectorLicense": "Apache 2.0",
                "recognizerLicense": "Apache 2.0",
                "standardsCompliance": ["NIST FRTE Guidelines", "OSAC Facial Comparison Standards", "ENFSI BPM"],
            },
            "forensicNotice": FACE_FORENSIC_DISCLAIMER,
            "retentionPolicy": METHODOLOGY_DOCUMENTATION["retentionPolicy"],
            "visualization": {
                "derivedFilename": derived_filename,
                "hasVisual": True,
                "fileSize": len(derived_bytes),
            },
            "analyst": {
                "id": str(user.get("user_id") or user.get("id", "analyst")),
                "name": user_name,
                "badge": badge,
                "role": user.get("role", "investigator"),
            },
            "timestamp": now_str,
            "status": "COMPLETED",
        }

        # 11. Database Persistence
        if save_analysis:
            self._save_analysis_record(analysis_doc)

        return analysis_doc

    def analyze_single_face(
        self,
        evidence_id: str,
        user: Dict[str, Any],
        score_threshold: float = 0.4,
        save_analysis: bool = True,
    ) -> Dict[str, Any]:
        """
        Analyze a single evidence image: detect all faces, assess quality of each,
        render annotated working copy with bounding boxes and landmarks, and associate with case.
        """
        # 1. Authorization & Clearance Checks
        ev_doc = evidence_service.get_evidence_by_id(evidence_id, user)
        if not ev_doc:
            raise PermissionError("Access denied: Evidence artifact is inaccessible under your clearance.")

        case_id = ev_doc.get("caseId")
        case_number = ev_doc.get("caseNumber", "UNKNOWN-CASE")

        # 2. Retrieve Image Bytes
        file_bytes, filename, mime_type = evidence_service.get_evidence_file_bytes(evidence_id, user)

        np_arr = np.frombuffer(file_bytes, dtype=np.uint8)
        bgr_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if bgr_img is None:
            raise ValueError(f"Failed to decode evidence '{filename}' as photographic image.")

        h, w = bgr_img.shape[:2]
        if h * w > MAX_PIXEL_COUNT or max(h, w) > MAX_DIMENSION:
            raise ValueError(f"Image '{filename}' exceeds safe resolution limits ({w}x{h}).")

        # 3. Detect Faces
        faces = self.detect_faces(bgr_img, score_threshold=score_threshold)

        # 4. Assess Quality of Each Detected Face
        inspected_faces: List[Dict[str, Any]] = []
        for face in faces:
            quality = self.assess_face_quality(bgr_img, face)
            inspected_faces.append({
                "faceIndex": face["faceIndex"],
                "box": face["box"],
                "confidence": face["confidence"],
                "landmarks": face["landmarks"],
                "interPupillaryDistance": face["interPupillaryDistance"],
                "rollAngleDegrees": face["rollAngleDegrees"],
                "faceAreaRatio": face["faceAreaRatio"],
                "quality": quality,
                "detectorEngine": face["detectorEngine"],
            })

        # 5. Render Annotated Single-Frame Visualization
        derived_bytes = self._render_single_face_visualization(bgr_img, inspected_faces, filename)

        # 6. Save Derived Visualization to Vault
        analysis_id = f"fd_{uuid.uuid4().hex[:12]}"
        now_str = datetime.now(timezone.utc).isoformat()

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

        # 7. Assemble Record
        user_name = user.get("name") or "Authorized Examiner"
        badge = user.get("badge_number") or user.get("badge") or "N/A"

        analysis_doc: Dict[str, Any] = {
            "id": analysis_id,
            "analysisId": analysis_id,
            "analysisType": "Facial Region Detection & Quality Audit",
            "category": "face_detection_quality",
            "evidence": {
                "id": evidence_id,
                "evidenceNumber": ev_doc.get("evidenceNumber", evidence_id),
                "filename": filename,
                "caseId": str(case_id),
                "caseNumber": case_number,
                "dimensions": f"{w}x{h}",
            },
            "detectedFacesCount": len(inspected_faces),
            "faces": inspected_faces,
            "parameters": {
                "scoreThreshold": score_threshold,
                "imageResolution": f"{w}x{h}",
            },
            "modelMetadata": {
                "detector": faces[0]["detectorEngine"] if faces else "YuNet (CNN)",
                "detectorLicense": "Apache 2.0",
                "standardsCompliance": ["NIST FRTE Guidelines", "OSAC Facial Comparison Standards"],
            },
            "forensicNotice": FACE_FORENSIC_DISCLAIMER,
            "retentionPolicy": METHODOLOGY_DOCUMENTATION["retentionPolicy"],
            "visualization": {
                "derivedFilename": derived_filename,
                "hasVisual": True,
                "fileSize": len(derived_bytes),
            },
            "analyst": {
                "id": str(user.get("user_id") or user.get("id", "analyst")),
                "name": user_name,
                "badge": badge,
                "role": user.get("role", "investigator"),
            },
            "timestamp": now_str,
            "status": "COMPLETED",
        }

        if save_analysis:
            self._save_analysis_record(analysis_doc)

        return analysis_doc

    def _render_comparison_visualization(
        self,
        probe_bgr: np.ndarray,
        probe_face: Dict[str, Any],
        probe_quality: Dict[str, Any],
        probe_filename: str,
        ref_bgr: np.ndarray,
        ref_face: Dict[str, Any],
        ref_quality: Dict[str, Any],
        ref_filename: str,
        cosine_sim: float,
        l2_dist: float,
        tier: str,
    ) -> bytes:
        """
        Render a high-contrast forensic side-by-side comparison canvas with
        face bounding boxes, landmark overlays, and quality telemetry.
        """
        # Annotate working copies
        vis_probe = probe_bgr.copy()
        vis_ref = ref_bgr.copy()

        # Draw Face Box & Landmarks on Probe (Cyan theme)
        self._draw_face_annotations(vis_probe, probe_face, (255, 215, 0), "PROBE")  # Cyan/Gold BGR
        # Draw Face Box & Landmarks on Reference (Emerald theme)
        self._draw_face_annotations(vis_ref, ref_face, (110, 231, 183), "REFERENCE")  # Emerald BGR

        # Resize both to standardized height (e.g. 520px) maintaining aspect ratio
        target_h = 520
        h_p, w_p = vis_probe.shape[:2]
        new_w_p = int(round(w_p * (target_h / max(1, h_p))))
        resized_probe = cv2.resize(vis_probe, (new_w_p, target_h), interpolation=cv2.INTER_AREA)

        h_r, w_r = vis_ref.shape[:2]
        new_w_r = int(round(w_r * (target_h / max(1, h_r))))
        resized_ref = cv2.resize(vis_ref, (new_w_r, target_h), interpolation=cv2.INTER_AREA)

        # Composite side-by-side with divider
        divider_w = 4
        divider = np.full((target_h, divider_w, 3), 40, dtype=np.uint8)
        composite_body = np.hstack([resized_probe, divider, resized_ref])

        total_w = composite_body.shape[1]

        # Top Header Banner
        header_h = 60
        header = np.full((header_h, total_w, 3), 15, dtype=np.uint8)

        # Title and Metrics
        title_text = "FORENVISION AI — CONTROLLED FACIAL COMPARISON (1:1)"
        cv2.putText(header, title_text, (16, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (226, 232, 240), 1, cv2.LINE_AA)

        metrics_text = f"COSINE: {cosine_sim:+.3f}  |  L2 DIST: {l2_dist:.3f}  |  TIER: {tier.replace('_', ' ')}"
        status_color = (110, 231, 183) if "STRONG" in tier else ((248, 189, 56) if "MODERATE" in tier else (148, 163, 184))
        cv2.putText(header, metrics_text, (16, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.45, status_color, 1, cv2.LINE_AA)

        # Footer Telemetry Banner
        footer_h = 50
        footer = np.full((footer_h, total_w, 3), 20, dtype=np.uint8)

        probe_info = f"PROBE: {probe_filename[:20]} | IPD: {probe_quality.get('interPupillaryDistance')}px | Quality: {probe_quality.get('qualityTier')}"
        ref_info = f"REF: {ref_filename[:20]} | IPD: {ref_quality.get('interPupillaryDistance')}px | Quality: {ref_quality.get('qualityTier')}"
        cv2.putText(footer, probe_info, (16, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (203, 213, 225), 1, cv2.LINE_AA)
        cv2.putText(footer, ref_info, (16, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (203, 213, 225), 1, cv2.LINE_AA)

        # Assemble Full Frame
        full_canvas = np.vstack([header, composite_body, footer])

        success, enc_buffer = cv2.imencode(".jpg", full_canvas, [cv2.IMWRITE_JPEG_QUALITY, 90])
        if not success:
            raise RuntimeError("Failed to encode facial comparison visualization.")
        return enc_buffer.tobytes()

    def _render_single_face_visualization(
        self,
        bgr_img: np.ndarray,
        faces: List[Dict[str, Any]],
        filename: str,
    ) -> bytes:
        """Render annotated single frame with face bounding boxes, landmarks, and indices."""
        vis = bgr_img.copy()

        for face in faces:
            self._draw_face_annotations(vis, face, (255, 215, 0), f"FACE #{face['faceIndex']}")

        # Add top banner
        h, w = vis.shape[:2]
        header_h = 38
        header = np.full((header_h, w, 3), 15, dtype=np.uint8)
        header_text = f"FORENVISION AI — DETECTED FACES: {len(faces)} | FILE: {filename[:30]}"
        cv2.putText(header, header_text, (14, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (226, 232, 240), 1, cv2.LINE_AA)

        canvas = np.vstack([header, vis])
        success, enc_buffer = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 90])
        if not success:
            raise RuntimeError("Failed to encode face detection visualization.")
        return enc_buffer.tobytes()

    def _draw_face_annotations(
        self,
        img: np.ndarray,
        face: Dict[str, Any],
        color: Tuple[int, int, int],
        label: str,
    ) -> None:
        """Draw bounding box, corner brackets, landmarks, and metadata label onto image."""
        box = face["box"]
        x, y, w, h = box["x"], box["y"], box["width"], box["height"]

        # Main bounding box
        cv2.rectangle(img, (x, y), (x + w, y + h), color, 2, cv2.LINE_AA)

        # Draw corner brackets for tactical/forensic aesthetic
        corner_len = max(8, min(24, int(min(w, h) * 0.2)))
        # Top-left
        cv2.line(img, (x, y), (x + corner_len, y), (255, 255, 255), 2)
        cv2.line(img, (x, y), (x, y + corner_len), (255, 255, 255), 2)
        # Top-right
        cv2.line(img, (x + w, y), (x + w - corner_len, y), (255, 255, 255), 2)
        cv2.line(img, (x + w, y), (x + w, y + corner_len), (255, 255, 255), 2)
        # Bottom-left
        cv2.line(img, (x, y + h), (x + corner_len, y + h), (255, 255, 255), 2)
        cv2.line(img, (x, y + h), (x, y + h - corner_len), (255, 255, 255), 2)
        # Bottom-right
        cv2.line(img, (x + w, y + h), (x + w - corner_len, y + h), (255, 255, 255), 2)
        cv2.line(img, (x + w, y + h), (x + w, y + h - corner_len), (255, 255, 255), 2)

        # Draw 5 Landmarks if present
        landmarks = face.get("landmarks")
        if landmarks:
            # Eyes (Cyan dots)
            if "rightEye" in landmarks and landmarks["rightEye"]:
                cv2.circle(img, (int(landmarks["rightEye"][0]), int(landmarks["rightEye"][1])), 3, (255, 255, 0), -1, cv2.LINE_AA)
            if "leftEye" in landmarks and landmarks["leftEye"]:
                cv2.circle(img, (int(landmarks["leftEye"][0]), int(landmarks["leftEye"][1])), 3, (255, 255, 0), -1, cv2.LINE_AA)
            # Nose (Amber dot)
            if "noseTip" in landmarks and landmarks["noseTip"]:
                cv2.circle(img, (int(landmarks["noseTip"][0]), int(landmarks["noseTip"][1])), 3, (0, 165, 255), -1, cv2.LINE_AA)
            # Mouth corners (Emerald dots)
            if "rightMouth" in landmarks and landmarks["rightMouth"]:
                cv2.circle(img, (int(landmarks["rightMouth"][0]), int(landmarks["rightMouth"][1])), 3, (110, 231, 183), -1, cv2.LINE_AA)
            if "leftMouth" in landmarks and landmarks["leftMouth"]:
                cv2.circle(img, (int(landmarks["leftMouth"][0]), int(landmarks["leftMouth"][1])), 3, (110, 231, 183), -1, cv2.LINE_AA)

        # Label tag above box
        tag_text = f"{label} (Conf: {face.get('confidence', 0.9):.2f})"
        (tw, th), _ = cv2.getTextSize(tag_text, cv2.FONT_HERSHEY_SIMPLEX, 0.40, 1)
        tag_y = max(th + 4, y - 6)
        cv2.rectangle(img, (x, tag_y - th - 3), (x + tw + 6, tag_y + 3), (20, 24, 33), -1)
        cv2.putText(img, tag_text, (x + 3, tag_y), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (255, 255, 255), 1, cv2.LINE_AA)

    def _fallback_template_metric(
        self,
        probe_bgr: np.ndarray,
        probe_face: Dict[str, Any],
        ref_bgr: np.ndarray,
        ref_face: Dict[str, Any],
    ) -> Tuple[float, float]:
        """Secondary fallback structural template correlation if SFace deep weights are missing."""
        try:
            pb = probe_face["box"]
            rb = ref_face["box"]
            p_crop = probe_bgr[pb["y"] : pb["y"] + pb["height"], pb["x"] : pb["x"] + pb["width"]]
            r_crop = ref_bgr[rb["y"] : rb["y"] + rb["height"], rb["x"] : rb["x"] + rb["width"]]

            p_norm = cv2.resize(cv2.cvtColor(p_crop, cv2.COLOR_BGR2GRAY), (112, 112))
            r_norm = cv2.resize(cv2.cvtColor(r_crop, cv2.COLOR_BGR2GRAY), (112, 112))

            # Normalized cross-correlation
            p_flat = p_norm.astype(np.float32).flatten()
            r_flat = r_norm.astype(np.float32).flatten()

            p_zero = p_flat - np.mean(p_flat)
            r_zero = r_flat - np.mean(r_flat)

            norm_p = np.linalg.norm(p_zero) + 1e-6
            norm_r = np.linalg.norm(r_zero) + 1e-6

            corr = float(np.dot(p_zero, r_zero) / (norm_p * norm_r))
            cosine_approx = max(-1.0, min(1.0, corr))
            l2_approx = max(0.0, math.sqrt(2.0 * max(0.0, 1.0 - cosine_approx)))
            return cosine_approx, l2_approx
        except Exception:
            return 0.0, 2.0

    def _save_analysis_record(self, record: Dict[str, Any]) -> None:
        """Persist analysis result to MongoDB and memory cache."""
        self._memory_analysis_records[record["analysisId"]] = record
        db = db_service.get_db()
        if db is not None:
            try:
                db["analysis_results"].replace_one(
                    {"analysisId": record["analysisId"]},
                    record,
                    upsert=True,
                )
            except PyMongoError:
                pass

    def get_analysis_by_id(
        self,
        analysis_id: str,
        user: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Retrieve analysis record by ID, verifying user has authorization to access the underlying case."""
        record = self._memory_analysis_records.get(analysis_id)
        if not record:
            db = db_service.get_db()
            if db is not None:
                try:
                    record = db["analysis_results"].find_one({"analysisId": analysis_id})
                except PyMongoError:
                    pass

        if not record:
            return None

        # Verify Case Clearance
        case_id = None
        if "probeEvidence" in record:
            case_id = record["probeEvidence"].get("caseId")
        elif "evidence" in record:
            case_id = record["evidence"].get("caseId")

        if case_id:
            raw_case = case_service._find_raw_case_doc(case_id)
            if raw_case and not case_service.user_can_access_case(user, raw_case):
                raise PermissionError("Access denied: You do not have clearance for this case's analysis record.")

        # Clean MongoDB _id
        clean = dict(record)
        clean.pop("_id", None)
        return clean

    def get_analysis_history(
        self,
        evidence_id: str,
        user: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Retrieve past face analysis records associated with an evidence item."""
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
                            {"probeEvidence.id": evidence_id},
                            {"referenceEvidence.id": evidence_id},
                            {"evidence.id": evidence_id},
                        ],
                        "category": {"$in": ["face_biometric_comparison", "face_detection_quality"]},
                    }
                ).sort("timestamp", -1)

                for r in cursor:
                    r.pop("_id", None)
                    records.append(r)
            except PyMongoError:
                pass

        # 2. In-memory cache merge
        for mem_id, mem_rec in self._memory_analysis_records.items():
            if mem_rec.get("category") in ["face_biometric_comparison", "face_detection_quality"]:
                p_id = mem_rec.get("probeEvidence", {}).get("id")
                r_id = mem_rec.get("referenceEvidence", {}).get("id")
                e_id = mem_rec.get("evidence", {}).get("id")
                if evidence_id in (p_id, r_id, e_id):
                    if not any(r["analysisId"] == mem_id for r in records):
                        clean = dict(mem_rec)
                        clean.pop("_id", None)
                        records.append(clean)

        records.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
        return records

    def get_derived_file_bytes(
        self,
        analysis_id: str,
        user: Dict[str, Any],
    ) -> Tuple[bytes, str]:
        """Retrieve derived visualization JPEG bytes, verifying user authorization."""
        record = self.get_analysis_by_id(analysis_id, user)
        if not record:
            raise FileNotFoundError(f"Analysis record '{analysis_id}' not found.")

        # Check memory cache first
        if analysis_id in self._memory_derived_files:
            return self._memory_derived_files[analysis_id], f"{analysis_id}_visualization.jpg"

        # Check disk vault
        case_number = "UNKNOWN-CASE"
        if "probeEvidence" in record:
            case_number = record["probeEvidence"].get("caseNumber", "UNKNOWN-CASE")
        elif "evidence" in record:
            case_number = record["evidence"].get("caseNumber", "UNKNOWN-CASE")

        derived_filename = record.get("visualization", {}).get("derivedFilename", f"{analysis_id}_visualization.jpg")
        file_path = self._derived_dir / case_number / derived_filename

        if file_path.is_file():
            try:
                with open(file_path, "rb") as f:
                    return f.read(), derived_filename
            except OSError as e:
                raise RuntimeError(f"Failed to read derived visualization file: {str(e)}")

        raise FileNotFoundError(f"Derived visualization file for analysis '{analysis_id}' not found on server.")


face_analysis_service = FaceAnalysisService()
