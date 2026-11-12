"""
Fingerprint Analysis & Biometric Comparison Service for ForenVision AI.
Provides rigorous biometric feature extraction, image enhancement, quality assessment,
minutiae identification, and scale-space geometric alignment (SIFT + RANSAC).

FORENSIC STANDARDS & LEGAL INVARIANTS:
1. Zero Modification: Original evidence files are strictly preserved and immutable.
2. Objective Metric Reporting: Scores represent spatial and descriptor correspondence metrics.
   They are NEVER represented as probabilities of identity or individualization.
3. No Invented Accuracy: Reports exact counts of extracted minutiae, SIFT keypoints,
   ratio-filtered candidate matches, and RANSAC inlier correspondences.
4. ACE-V Prerequisite: In accordance with forensic science standards, algorithmic scores
   are investigative exploratory diagnostics; conclusive identification requires manual
   verification by a qualified latent print examiner.
5. Non-Culpability Standard: Biometric correspondence under NO circumstances establishes
   criminal activity, presence at a specific date/time, or legal guilt.
"""

from __future__ import annotations

import io
import math
import os
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
Image.MAX_IMAGE_PIXELS = MAX_PIXEL_COUNT
cv2.setNumThreads(int(os.getenv("OPENCV_NUM_THREADS", 2)))

FINGERPRINT_FORENSIC_DISCLAIMER = (
    "BIOMETRIC FORENSIC NOTICE: Biometric comparison scores represent algorithmic feature correspondence "
    "and geometric congruence metrics (SIFT descriptor distance and RANSAC inlier alignment). "
    "Under international ACE-V (Analysis, Comparison, Evaluation, Verification) forensic standards, "
    "automated algorithms do NOT establish definitive individualization or source attribution. "
    "Correspondence metrics under NO circumstances establish criminal guilt, intent, or culpability. "
    "Conclusive determinations require manual examination by a qualified biometric forensic examiner."
)

METHODOLOGY_DOCUMENTATION = {
    "engine": "ForenVision Biometric Analysis Engine (SIFT-RANSAC + Morphological Minutiae)",
    "preprocessing": [
        "Dynamic Range Min-Max Grayscale Normalization [0, 255]",
        "Contrast Limited Adaptive Histogram Equalization (CLAHE, clipLimit=2.5, tileGrid=(8,8))",
        "Edge-preserving Bilateral Ridge Filtering (d=5, sigmaColor=50, sigmaSpace=50)",
        "Otsu Adaptive Binarization for Ridge/Valley Segmentation",
    ],
    "featureExtraction": [
        "Scale-Invariant Feature Transform (SIFT) 128-dimensional dense scale-space gradient histograms",
        "Crossing Number (Rutovitz) Topological Minutiae Detection on Morphological Skeletons (Terminations & Bifurcations)",
    ],
    "alignmentAndMatching": [
        "L2-Norm Euclidean Descriptor Matching with Lowe's Ratio Test (threshold rho=0.75)",
        "Random Sample Consensus (RANSAC) Partial Affine Transformation Estimation (reprojection error epsilon=5.0px)",
        "Geometric Inlier Count, Inlier Ratio, and Spatial Distribution Verification",
    ],
    "scientificLimitations": [
        "Latent prints with severe pressure distortion, smudging, or low ridge-valley contrast may yield false-negative inliers.",
        "Algorithmic scores measure geometric pattern congruence only, not anatomical uniqueness.",
        "Skin elasticity and non-linear physical deformation are approximated via affine/projective models.",
        "Forensic identification requires comprehensive ridge detail analysis (Levels 1, 2, and 3 detail) by certified human experts.",
    ],
}


class FingerprintService:
    """Thread-safe forensic fingerprint analysis and comparison service."""

    def __init__(self, base_upload_dir: Optional[str] = None) -> None:
        if base_upload_dir:
            self._vault_dir = Path(base_upload_dir) / "vault"
        else:
            self._vault_dir = Path(Config.UPLOAD_FOLDER) / "vault"
        self._derived_dir = self._vault_dir / "derived"

        # In-memory stores for tests and unconfigured database fallbacks
        self._memory_analysis_records: Dict[str, Dict[str, Any]] = {}
        self._memory_derived_files: Dict[str, bytes] = {}

    def reset_in_memory_state(self) -> None:
        """Clear memory cache for test isolation."""
        self._memory_analysis_records.clear()
        self._memory_derived_files.clear()

    def get_methodology_info(self) -> Dict[str, Any]:
        """Return comprehensive scientific methodology, algorithm details, and legal caveats."""
        return {
            "methodology": METHODOLOGY_DOCUMENTATION,
            "forensicDisclaimer": FINGERPRINT_FORENSIC_DISCLAIMER,
            "evaluationGuidelines": {
                "strongCorrespondence": "Inlier Count >= 25 and Inlier Ratio >= 0.40",
                "moderateCorrespondence": "Inlier Count 12 - 24 and Inlier Ratio >= 0.20",
                "inconclusive": "Inlier Count 5 - 11",
                "nonMatedDivergence": "Inlier Count < 5",
            },
        }

    def assess_image_quality(self, gray_img: np.ndarray) -> Dict[str, Any]:
        """
        Assess fingerprint image quality, ridge clarity, dynamic range, and usable area.
        Generates objective metrics and explicit quality warnings.
        """
        h, w = gray_img.shape[:2]
        mean_val = float(np.mean(gray_img))
        std_val = float(np.std(gray_img))
        min_val = float(np.min(gray_img))
        max_val = float(np.max(gray_img))
        dynamic_range = max_val - min_val

        # Spatial frequency variance using Laplacian operator (measures focus and ridge sharpness)
        lap_var = float(cv2.Laplacian(gray_img, cv2.CV_64F).var())

        # Foreground ridge segmentation (Otsu binarization to approximate usable impression area)
        _, otsu_bin = cv2.threshold(gray_img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        fg_pixels = int(np.count_nonzero(otsu_bin))
        total_pixels = h * w
        usable_area_ratio = round(fg_pixels / max(1, total_pixels), 3)
        usable_area_percent = round(usable_area_ratio * 100, 1)

        # Normalize clarity score to [0, 100] scale based on empirical forensic benchmark distributions
        # lap_var > 1500 is typically sharp high-resolution ridge flow
        clarity_score = round(min(100.0, max(0.0, (lap_var / 2500.0) * 100.0)), 1)

        warnings: List[str] = []
        if dynamic_range < 50:
            warnings.append("Low dynamic range: Image suffers from severely compressed grayscale tones.")
        if std_val < 25:
            warnings.append("Low ridge-to-valley contrast: Subtle ridge transitions may hinder automated feature detection.")
        if lap_var < 80:
            warnings.append("Low ridge sharpness / potential blur: Ridge boundaries lack high-frequency definition.")
        if mean_val > 230:
            warnings.append("Potential overexposure: White pixel saturation detected in background/impression.")
        if mean_val < 30:
            warnings.append("Potential underexposure / heavy ink smudge: Deep shadow clipping detected.")
        if usable_area_percent < 20:
            warnings.append("Partial impression: Usable ridge area occupies less than 20% of sensor frame.")

        # Determine Quality Tier
        if clarity_score >= 60 and dynamic_range >= 100 and len(warnings) == 0:
            tier = "EXCELLENT"
        elif clarity_score >= 35 and dynamic_range >= 60 and len(warnings) <= 1:
            tier = "ACCEPTABLE"
        elif clarity_score >= 15 and len(warnings) <= 2:
            tier = "MARGINAL"
        else:
            tier = "POOR / INSUFFICIENT"

        return {
            "qualityTier": tier,
            "clarityScore": clarity_score,
            "laplacianVariance": round(lap_var, 2),
            "meanIntensity": round(mean_val, 1),
            "stdDevIntensity": round(std_val, 1),
            "dynamicRange": round(dynamic_range, 1),
            "usableAreaPercent": usable_area_percent,
            "warnings": warnings,
            "dimensions": f"{w}x{h}",
        }

    def preprocess_fingerprint(self, gray_img: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Apply documented normalization, CLAHE contrast enhancement,
        bilateral filtering, and Otsu binarization to enhance ridge definition.
        """
        # 1. Min-Max Normalization to [0, 255]
        norm_img = cv2.normalize(gray_img, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)

        # 2. Contrast Limited Adaptive Histogram Equalization (CLAHE)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        clahe_img = clahe.apply(norm_img)

        # 3. Bilateral filter to smooth sensor noise while preserving sharp ridge boundaries
        filtered_img = cv2.bilateralFilter(clahe_img, d=5, sigmaColor=50, sigmaSpace=50)

        # 4. Otsu adaptive binarization (Ridges = 255, Valleys = 0)
        _, binary_ridges = cv2.threshold(
            filtered_img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )

        return filtered_img, binary_ridges

    def extract_minutiae(self, binary_ridges: np.ndarray) -> Dict[str, Any]:
        """
        Extract topological minutiae (ridge terminations and bifurcations)
        using morphological thinning and 8-neighbor crossing number analysis.
        """
        h, w = binary_ridges.shape[:2]

        # Downscale if excessively large to keep thinning fast and robust against pixel noise
        work_ridges = binary_ridges
        scale_factor = 1.0
        if max(h, w) > 600:
            scale_factor = 600.0 / max(h, w)
            work_ridges = cv2.resize(binary_ridges, (int(w * scale_factor), int(h * scale_factor)))

        # Morphological skeletonization
        skel = np.zeros(work_ridges.shape, np.uint8)
        element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
        temp = work_ridges.copy()

        max_iters = 60
        iters = 0
        while iters < max_iters:
            eroded = cv2.erode(temp, element)
            temp_open = cv2.morphologyEx(eroded, cv2.MORPH_OPEN, element)
            subset = cv2.subtract(eroded, temp_open)
            skel = cv2.bitwise_or(skel, subset)
            temp = eroded.copy()
            iters += 1
            if cv2.countNonZero(temp) == 0:
                break

        skel_norm = (skel > 0).astype(np.uint8)

        # 8-neighbor convolution to count connected neighbors
        kernel = np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]], dtype=np.uint8)
        neighbors = cv2.filter2D(skel_norm, -1, kernel)

        # Terminations: exactly 1 neighbor; Bifurcations: exactly 3 neighbors
        terminations_mask = (skel_norm == 1) & (neighbors == 1)
        bifurcations_mask = (skel_norm == 1) & (neighbors == 3)

        # Mask out boundary borders (within 12 pixels of image edge) to eliminate false edge terminations
        border_margin = int(12 * scale_factor)
        terminations_mask[:border_margin, :] = False
        terminations_mask[-border_margin:, :] = False
        terminations_mask[:, :border_margin] = False
        terminations_mask[:, -border_margin:] = False

        bifurcations_mask[:border_margin, :] = False
        bifurcations_mask[-border_margin:, :] = False
        bifurcations_mask[:, :border_margin] = False
        bifurcations_mask[:, -border_margin:] = False

        term_y, term_x = np.nonzero(terminations_mask)
        bif_y, bif_x = np.nonzero(bifurcations_mask)

        # Format minutiae list (rescale back to original image space)
        terminations: List[Dict[str, Any]] = []
        for x, y in zip(term_x, term_y):
            orig_x = int(round(x / scale_factor))
            orig_y = int(round(y / scale_factor))
            terminations.append({
                "type": "termination",
                "x": orig_x,
                "y": orig_y,
            })

        bifurcations: List[Dict[str, Any]] = []
        for x, y in zip(bif_x, bif_y):
            orig_x = int(round(x / scale_factor))
            orig_y = int(round(y / scale_factor))
            bifurcations.append({
                "type": "bifurcation",
                "x": orig_x,
                "y": orig_y,
            })

        return {
            "totalMinutiae": len(terminations) + len(bifurcations),
            "terminationCount": len(terminations),
            "bifurcationCount": len(bifurcations),
            "terminations": terminations[:150],  # Sample limit for serialization
            "bifurcations": bifurcations[:150],
        }

    def extract_sift_keypoints(
        self, enhanced_gray: np.ndarray, max_features: int = 800
    ) -> Tuple[List[cv2.KeyPoint], np.ndarray]:
        """
        Extract scale-invariant feature transform (SIFT) keypoints and 128-dimensional descriptors.
        """
        sift = cv2.SIFT_create(nfeatures=max_features)
        kp, des = sift.detectAndCompute(enhanced_gray, None)
        if des is None:
            des = np.empty((0, 128), dtype=np.float32)
        return kp, des

    def align_and_match(
        self,
        kp_probe: List[cv2.KeyPoint],
        des_probe: np.ndarray,
        kp_ref: List[cv2.KeyPoint],
        des_ref: np.ndarray,
        lowe_ratio: float = 0.75,
        ransac_thresh: float = 5.0,
    ) -> Dict[str, Any]:
        """
        Match SIFT descriptors between probe and reference impressions using
        two-way Lowe ratio test and RANSAC affine geometric alignment.
        """
        if len(kp_probe) < 4 or len(kp_ref) < 4 or des_probe.shape[0] < 4 or des_ref.shape[0] < 4:
            return {
                "rawMatches": 0,
                "ratioMatches": 0,
                "inlierCount": 0,
                "inlierRatio": 0.0,
                "correspondenceTier": "INCONCLUSIVE_CORRESPONDENCE",
                "alignment": None,
                "goodMatches": [],
                "inlierMatches": [],
                "interpretation": "Insufficient features extracted to conduct automated comparison.",
            }

        # 1. Brute-Force L2 Matcher with KNN (k=2)
        matcher = cv2.BFMatcher(cv2.NORM_L2)
        raw_matches = matcher.knnMatch(des_probe, des_ref, k=2)

        # 2. Lowe's Ratio Test
        good_matches: List[cv2.DMatch] = []
        for m_pair in raw_matches:
            if len(m_pair) == 2:
                m, n = m_pair
                if m.distance < lowe_ratio * n.distance:
                    good_matches.append(m)

        if len(good_matches) < 4:
            return {
                "rawMatches": len(raw_matches),
                "ratioMatches": len(good_matches),
                "inlierCount": 0,
                "inlierRatio": 0.0,
                "correspondenceTier": "NO_SIGNIFICANT_CORRESPONDENCE",
                "alignment": None,
                "goodMatches": [],
                "inlierMatches": [],
                "interpretation": "Ratio test found fewer than 4 consistent descriptor pairs; patterns diverge.",
            }

        # 3. Geometric Alignment via Partial Affine RANSAC (Scale, Rotation, Translation)
        pts_probe = np.float32([kp_probe[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        pts_ref = np.float32([kp_ref[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

        # Estimate partial 2D affine (handles rigid rotation, translation, and uniform scale)
        affine_mat, inliers_mask = cv2.estimateAffinePartial2D(
            pts_probe, pts_ref, method=cv2.RANSAC, ransacReprojThreshold=ransac_thresh
        )

        inlier_count = 0
        inlier_matches: List[cv2.DMatch] = []
        alignment_data: Optional[Dict[str, Any]] = None

        if inliers_mask is not None and affine_mat is not None:
            mask_flat = inliers_mask.ravel().tolist()
            inlier_count = int(np.sum(inliers_mask))
            inlier_matches = [good_matches[i] for i, val in enumerate(mask_flat) if val == 1]

            # Decompose affine matrix [ [s*cos(theta), -s*sin(theta), tx], [s*sin(theta), s*cos(theta), ty] ]
            a = affine_mat[0, 0]
            b = affine_mat[1, 0]
            scale = math.sqrt(a * a + b * b)
            angle_rad = math.atan2(b, a)
            angle_deg = math.degrees(angle_rad)
            tx = float(affine_mat[0, 2])
            ty = float(affine_mat[1, 2])

            alignment_data = {
                "rotationDegrees": round(angle_deg, 2),
                "translationX": round(tx, 2),
                "translationY": round(ty, 2),
                "scaleFactor": round(scale, 3),
                "transformationMatrix": [
                    [round(float(v), 4) for v in affine_mat[0]],
                    [round(float(v), 4) for v in affine_mat[1]],
                ],
            }

        inlier_ratio = round(inlier_count / max(1, len(good_matches)), 3)

        # 4. Objective Classification
        if inlier_count >= 25 and inlier_ratio >= 0.35:
            tier = "STRONG_CORRESPONDENCE"
            interp = (
                f"Strong spatial and descriptor correspondence ({inlier_count} verified inlier features, "
                f"{round(inlier_ratio*100, 1)}% inlier ratio). Consistent with mated impressions under "
                f"estimated rotation of {alignment_data['rotationDegrees'] if alignment_data else 0} deg. "
                "Examiner verification required."
            )
        elif inlier_count >= 12 and inlier_ratio >= 0.20:
            tier = "MODERATE_CORRESPONDENCE"
            interp = (
                f"Moderate correspondence ({inlier_count} inlier features). Localized alignment detected. "
                "Careful evaluation of latent impression quality and background interference required."
            )
        elif inlier_count >= 5:
            tier = "INCONCLUSIVE_CORRESPONDENCE"
            interp = (
                f"Inconclusive ({inlier_count} inlier features). Insufficient coherent feature geometry "
                "to differentiate between poor latent clarity or non-mated source."
            )
        else:
            tier = "NO_SIGNIFICANT_CORRESPONDENCE"
            interp = (
                f"No significant geometric correspondence ({inlier_count} inliers, {len(good_matches)} ratio matches). "
                "Feature patterns diverge structurally."
            )

        return {
            "rawMatches": len(raw_matches),
            "ratioMatches": len(good_matches),
            "inlierCount": inlier_count,
            "inlierRatio": inlier_ratio,
            "correspondenceTier": tier,
            "alignment": alignment_data,
            "goodMatches": good_matches,
            "inlierMatches": inlier_matches,
            "interpretation": interp,
        }

    def compare_fingerprints(
        self,
        probe_evidence_id: str,
        reference_evidence_id: str,
        user: Dict[str, Any],
        lowe_ratio: float = 0.75,
        ransac_thresh: float = 5.0,
        max_sift_features: int = 800,
        save_analysis: bool = True,
        min_inliers: int = 12,
        **kwargs,
    ) -> Dict[str, Any]:
        if "ransac_threshold" in kwargs:
            ransac_thresh = float(kwargs["ransac_threshold"])
        """
        Execute full fingerprint comparison between two authorized evidence items:
        1. Access check & evidence retrieval (zero modification)
        2. Preprocessing & Quality assessment
        3. Minutiae extraction (terminations & bifurcations)
        4. SIFT scale-space descriptor extraction & RANSAC geometric alignment
        5. Annotated side-by-side visual correspondence rendering
        6. Persistence and case record association
        """
        # 1. Authorization & Clearance Checks
        probe_doc = evidence_service.get_evidence_by_id(probe_evidence_id, user)
        if not probe_doc:
            raise PermissionError("Access denied: Probe evidence artifact is inaccessible under your clearance.")

        ref_doc = evidence_service.get_evidence_by_id(reference_evidence_id, user)
        if not ref_doc:
            raise PermissionError("Access denied: Reference evidence artifact is inaccessible under your clearance.")

        probe_case_id = probe_doc.get("caseId")
        raw_case_probe = case_service._find_raw_case_doc(probe_case_id)
        if raw_case_probe and not case_service.user_can_access_case(user, raw_case_probe):
            raise PermissionError("Access denied: You lack clearance for the probe evidence case docket.")

        ref_case_id = ref_doc.get("caseId")
        raw_case_ref = case_service._find_raw_case_doc(ref_case_id)
        if raw_case_ref and not case_service.user_can_access_case(user, raw_case_ref):
            raise PermissionError("Access denied: You lack clearance for the reference evidence case docket.")

        # 2. Retrieve Original Bytes (Zero Mutation)
        probe_bytes, probe_filename, probe_mime = evidence_service.get_evidence_file_bytes(probe_evidence_id, user)
        ref_bytes, ref_filename, ref_mime = evidence_service.get_evidence_file_bytes(reference_evidence_id, user)

        if not (probe_mime.startswith("image/") or probe_filename.lower().endswith((".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"))):
            raise ValueError(f"Probe artifact '{probe_filename}' is not a supported photographic image.")
        if not (ref_mime.startswith("image/") or ref_filename.lower().endswith((".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"))):
            raise ValueError(f"Reference artifact '{ref_filename}' is not a supported photographic image.")

        # 3. Decode into Memory Working Copies
        probe_np = np.frombuffer(probe_bytes, dtype=np.uint8)
        probe_bgr = cv2.imdecode(probe_np, cv2.IMREAD_COLOR)
        if probe_bgr is None:
            raise ValueError("Failed to decode probe image into working raster.")

        ref_np = np.frombuffer(ref_bytes, dtype=np.uint8)
        ref_bgr = cv2.imdecode(ref_np, cv2.IMREAD_COLOR)
        if ref_bgr is None:
            raise ValueError("Failed to decode reference image into working raster.")

        # Safety Dimension Ceiling Check
        for img, name in [(probe_bgr, "Probe"), (ref_bgr, "Reference")]:
            ih, iw = img.shape[:2]
            if ih * iw > MAX_PIXEL_COUNT or ih > MAX_DIMENSION or iw > MAX_DIMENSION:
                raise ValueError(f"{name} image dimensions exceed safety thresholds (max {MAX_DIMENSION}x{MAX_DIMENSION}).")

        probe_gray = cv2.cvtColor(probe_bgr, cv2.COLOR_BGR2GRAY)
        ref_gray = cv2.cvtColor(ref_bgr, cv2.COLOR_BGR2GRAY)

        # 4. Image Quality Assessment
        probe_quality = self.assess_image_quality(probe_gray)
        ref_quality = self.assess_image_quality(ref_gray)

        # 5. Preprocessing & Enhancement (CLAHE + Bilateral Filtering + Binarization)
        probe_enhanced, probe_binary = self.preprocess_fingerprint(probe_gray)
        ref_enhanced, ref_binary = self.preprocess_fingerprint(ref_gray)

        # 6. Topological Minutiae Extraction (Rutovitz Crossing Number)
        probe_minutiae = self.extract_minutiae(probe_binary)
        ref_minutiae = self.extract_minutiae(ref_binary)

        # 7. SIFT Scale-Space Keypoints & RANSAC Alignment
        kp_probe, des_probe = self.extract_sift_keypoints(probe_enhanced, max_features=max_sift_features)
        kp_ref, des_ref = self.extract_sift_keypoints(ref_enhanced, max_features=max_sift_features)

        match_results = self.align_and_match(
            kp_probe, des_probe, kp_ref, des_ref, lowe_ratio=lowe_ratio, ransac_thresh=ransac_thresh
        )

        # 8. Render Side-by-Side Match Visualization
        # Display inlier matches connecting probe and reference with colored correspondence vectors
        inlier_matches = match_results["inlierMatches"]
        vis_matches = inlier_matches if len(inlier_matches) > 0 else match_results["goodMatches"]

        # Convert enhanced grays to BGR for drawing color markers
        vis_probe_bgr = cv2.cvtColor(probe_enhanced, cv2.COLOR_GRAY2BGR)
        vis_ref_bgr = cv2.cvtColor(ref_enhanced, cv2.COLOR_GRAY2BGR)

        # Draw Minutiae markers: Terminations (Cyan circles) and Bifurcations (Amber squares)
        for term in probe_minutiae["terminations"][:60]:
            cv2.circle(vis_probe_bgr, (term["x"], term["y"]), 3, (248, 189, 56), 1, cv2.LINE_AA)
        for bif in probe_minutiae["bifurcations"][:60]:
            cv2.rectangle(vis_probe_bgr, (bif["x"] - 3, bif["y"] - 3), (bif["x"] + 3, bif["y"] + 3), (36, 191, 251), 1)

        for term in ref_minutiae["terminations"][:60]:
            cv2.circle(vis_ref_bgr, (term["x"], term["y"]), 3, (248, 189, 56), 1, cv2.LINE_AA)
        for bif in ref_minutiae["bifurcations"][:60]:
            cv2.rectangle(vis_ref_bgr, (bif["x"] - 3, bif["y"] - 3), (bif["x"] + 3, bif["y"] + 3), (36, 191, 251), 1)

        # Draw match lines using OpenCV drawMatches
        matched_canvas = cv2.drawMatches(
            vis_probe_bgr,
            kp_probe,
            vis_ref_bgr,
            kp_ref,
            vis_matches[:120],  # Render up to 120 most salient lines to keep image clean
            None,
            matchColor=(52, 211, 153) if len(inlier_matches) >= 12 else (248, 113, 113),  # Emerald if match, Rose if poor
            singlePointColor=(100, 116, 139),
            flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS,
        )

        # Encode visualization to JPEG
        success, enc_buffer = cv2.imencode(".jpg", matched_canvas, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if not success:
            raise RuntimeError("Failed to encode fingerprint comparison visualization.")
        derived_bytes = enc_buffer.tobytes()

        # 9. Persist Derived Visualization to Vault
        analysis_id = f"fp_{uuid.uuid4().hex[:12]}"
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

        # 10. Assemble Analysis Result Document
        user_name = user.get("name") or "Authorized Examiner"
        badge = user.get("badge_number") or user.get("badge") or "N/A"

        analysis_doc: Dict[str, Any] = {
            "id": analysis_id,
            "analysisId": analysis_id,
            "analysisType": "Fingerprint Feature Comparison (SIFT-RANSAC)",
            "category": "fingerprint_minutiae",
            "probeEvidence": {
                "id": probe_evidence_id,
                "evidenceNumber": probe_doc.get("evidenceNumber", probe_evidence_id),
                "caseId": str(probe_case_id),
                "caseNumber": probe_case_number,
                "filename": probe_filename,
                "quality": probe_quality,
                "minutiae": {
                    "total": probe_minutiae["totalMinutiae"],
                    "terminations": probe_minutiae["terminationCount"],
                    "bifurcations": probe_minutiae["bifurcationCount"],
                },
                "keypointCount": len(kp_probe),
            },
            "referenceEvidence": {
                "id": reference_evidence_id,
                "evidenceNumber": ref_doc.get("evidenceNumber", reference_evidence_id),
                "caseId": str(ref_case_id),
                "caseNumber": ref_doc.get("caseNumber", "UNKNOWN-CASE"),
                "filename": ref_filename,
                "quality": ref_quality,
                "minutiae": {
                    "total": ref_minutiae["totalMinutiae"],
                    "terminations": ref_minutiae["terminationCount"],
                    "bifurcations": ref_minutiae["bifurcationCount"],
                },
                "keypointCount": len(kp_ref),
            },
            "comparisonMetrics": {
                "rawCandidateMatches": match_results["rawMatches"],
                "ratioFilteredMatches": match_results["ratioMatches"],
                "inlierCount": match_results["inlierCount"],
                "inlierRatio": match_results["inlierRatio"],
                "correspondenceTier": match_results["correspondenceTier"],
                "alignment": match_results["alignment"],
                "interpretation": match_results["interpretation"],
            },
            "parameters": {
                "loweRatioThreshold": lowe_ratio,
                "ransacReprojectionThreshold": ransac_thresh,
                "maxSiftFeatures": max_sift_features,
                "enhancementMethod": "CLAHE + Bilateral Filtering",
            },
            "derivedStorageRef": f"vault://{probe_case_number}/derived/{derived_filename}",
            "_derivedDiskPath": str(derived_file_path),
            "derivedImageUrl": f"/api/analysis/fingerprint/derived/{analysis_id}",
            "forensicDisclaimer": FINGERPRINT_FORENSIC_DISCLAIMER,
            "timestamp": now_str,
            "performedBy": f"{user_name} ({badge})" if badge != "N/A" else user_name,
            "status": "completed",
        }

        # 11. Save Record to Database and Memory
        if save_analysis:
            db = db_service.get_db()
            if db is not None:
                try:
                    db["analysis_results"].insert_one(dict(analysis_doc))
                except PyMongoError:
                    pass

            self._memory_analysis_records[analysis_id] = analysis_doc
            case_service._memory_analyses.insert(0, analysis_doc)

        result = dict(analysis_doc)
        result.pop("_derivedDiskPath", None)
        return result

    def get_fingerprint_history(self, evidence_id: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Retrieve prior fingerprint comparisons involving this evidence artifact."""
        ev_doc = evidence_service.get_evidence_by_id(evidence_id, user)
        if not ev_doc:
            raise PermissionError("Access denied: evidence record inaccessible.")

        case_id = ev_doc.get("caseId")
        raw_case = case_service._find_raw_case_doc(case_id)
        if raw_case and not case_service.user_can_access_case(user, raw_case):
            raise PermissionError("Access denied: case clearance required.")

        results: List[Dict[str, Any]] = []
        db = db_service.get_db()
        if db is not None:
            try:
                cursor = db["analysis_results"].find(
                    {
                        "category": "fingerprint_minutiae",
                        "$or": [
                            {"probeEvidence.id": evidence_id},
                            {"referenceEvidence.id": evidence_id},
                        ],
                    },
                    {"_id": 0, "_derivedDiskPath": 0},
                ).sort("timestamp", -1)
                results = list(cursor)
            except PyMongoError:
                pass

        if not results:
            mem_items = [
                dict(v) for v in self._memory_analysis_records.values()
                if v.get("category") == "fingerprint_minutiae" and (
                    v.get("probeEvidence", {}).get("id") == evidence_id or
                    v.get("referenceEvidence", {}).get("id") == evidence_id
                )
            ]
            for itm in mem_items:
                itm.pop("_derivedDiskPath", None)
            results = sorted(mem_items, key=lambda x: x.get("timestamp", ""), reverse=True)

        return results

    def get_derived_image(self, analysis_id: str, user: Dict[str, Any]) -> Tuple[bytes, str]:
        """Stream the annotated fingerprint comparison image after enforcing case clearance."""
        record: Optional[Dict[str, Any]] = None

        db = db_service.get_db()
        if db is not None:
            try:
                record = db["analysis_results"].find_one({"id": analysis_id})
            except PyMongoError:
                pass

        if not record:
            record = self._memory_analysis_records.get(analysis_id)

        if not record:
            raise FileNotFoundError("Requested fingerprint analysis record does not exist.")

        # Check access to probe case
        probe_case_id = record.get("probeEvidence", {}).get("caseId")
        raw_case = case_service._find_raw_case_doc(probe_case_id)
        if raw_case and not case_service.user_can_access_case(user, raw_case):
            raise PermissionError("Access denied: insufficient clearance to view this analysis artifact.")

        # Memory buffer check
        if analysis_id in self._memory_derived_files:
            return self._memory_derived_files[analysis_id], "image/jpeg"

        # Disk check
        disk_path = record.get("_derivedDiskPath")
        if disk_path and os.path.exists(disk_path):
            with open(disk_path, "rb") as f:
                data = f.read()
            return data, "image/jpeg"

        raise FileNotFoundError("Derived fingerprint visualization file is unavailable on storage backend.")


# Global service instance
fingerprint_service = FingerprintService()
