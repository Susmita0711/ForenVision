"""
AI-Assisted Object Detection Service for ForenVision AI.
Provides real, reproducible, deep-learning based visual object localization using:
1. YOLOv4-tiny (Darknet) — 80 general MS COCO classes via OpenCV DNN
2. ForenVision Gun & Person Detector (YOLOv8n ONNX) — fine-tuned on the
   People with Guns forensic dataset (classes: person, gun) via OpenCV DNN
3. Dual Forensic Scan (Combined) — executes both models concurrently on a working
   copy to locate both general scene inventory and specialized firearm targets.

FORENSIC PRINCIPLES:
1. Zero Modification: Original evidence bytes are immutable and never modified.
2. Isolated Working Copies: Decoded raster buffers operate exclusively in memory.
3. No Fabricated Detections or Scores: Detections represent real network activations;
   we never fabricate bounding boxes or mock probabilities.
4. Non-Culpability Standard: Detected objects do NOT prove criminal activity, intent,
   ownership, or legal guilt.
"""

from __future__ import annotations

import io
import json
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


# Maximum allowed image pixel count (100 Megapixels) and dimensions to prevent decompression bombs
MAX_PIXEL_COUNT = 100_000_000
MAX_DIMENSION = 10_000
Image.MAX_IMAGE_PIXELS = MAX_PIXEL_COUNT

# Restrict OpenCV internal thread pool to prevent thread contention under multi-worker WSGI
cv2.setNumThreads(int(os.getenv("OPENCV_NUM_THREADS", 2)))

MODEL_YOLOV4_TINY = "yolov4-tiny"
MODEL_GUN_YOLOV8 = "forensic-gun-yolov8"
MODEL_COMBINED = "combined"
SUPPORTED_MODEL_IDS = {MODEL_YOLOV4_TINY, MODEL_GUN_YOLOV8, MODEL_COMBINED}

# High-contrast color palette for visual distinction across classes
PALETTE = [
    (56, 189, 248),   # Sky Blue
    (52, 211, 153),   # Emerald
    (251, 191, 36),   # Amber
    (248, 113, 113),  # Rose
    (167, 139, 250),  # Purple
    (244, 114, 182),  # Pink
    (45, 212, 191),   # Teal
    (251, 146, 60),   # Orange
    (129, 140, 248),  # Indigo
    (163, 230, 53),   # Lime
]

OBJECT_DETECTION_FORENSIC_DISCLAIMER = (
    "OBJECT DETECTION FORENSIC DISCLAIMER: Automated object detection performs statistical visual "
    "pattern localization based on neural network weights (MS COCO YOLOv4-tiny and ForenVision "
    "YOLOv8n trained on the People with Guns dataset). Detected objects, classifications, and "
    "confidence scores reflect computational pattern matching and under NO circumstances establish "
    "criminal intent, ownership, contraband possession, or legal guilt. Results must be corroborated "
    "by a qualified forensic examiner."
)


class ObjectDetectionService:
    """Thread-safe service for AI-assisted object detection (YOLOv4-tiny & trained YOLOv8n Gun Detector)."""

    def __init__(self, base_upload_dir: Optional[str] = None) -> None:
        if base_upload_dir:
            self._vault_dir = Path(base_upload_dir) / "vault"
        else:
            self._vault_dir = Path(Config.UPLOAD_FOLDER) / "vault"
        self._derived_dir = self._vault_dir / "derived"

        # Thread-safe model caching
        self._model_lock = threading.Lock()
        self._net: Optional[cv2.dnn.Net] = None
        self._out_layers: Optional[List[str]] = None
        self._classes: Optional[List[str]] = None

        self._gun_net: Optional[cv2.dnn.Net] = None
        self._gun_classes: Optional[List[str]] = None
        self._gun_metadata: Optional[Dict[str, Any]] = None

        # Model configuration paths
        self._cfg_path = Path(Config.OBJECT_DETECTION_CFG_PATH)
        self._weights_path = Path(Config.OBJECT_DETECTION_WEIGHTS_PATH)
        self._classes_path = Path(Config.OBJECT_DETECTION_CLASSES_PATH)

        self._gun_onnx_path = Path(Config.GUN_DETECTION_ONNX_PATH)
        self._gun_classes_path = Path(Config.GUN_DETECTION_CLASSES_PATH)
        self._gun_metadata_path = Path(Config.GUN_DETECTION_METADATA_PATH)

        # In-memory storage for test fallbacks and unconfigured databases
        self._memory_analysis_records: Dict[str, Dict[str, Any]] = {}
        self._memory_derived_files: Dict[str, bytes] = {}

    def reset_in_memory_state(self) -> None:
        """Clear memory cache for test isolation."""
        self._memory_analysis_records.clear()
        self._memory_derived_files.clear()

    def _load_gun_metadata(self) -> Optional[Dict[str, Any]]:
        if self._gun_metadata is not None:
            return self._gun_metadata
        if self._gun_metadata_path.is_file():
            try:
                self._gun_metadata = json.loads(self._gun_metadata_path.read_text(encoding="utf-8"))
                return self._gun_metadata
            except Exception:
                return None
        return None

    def _is_gun_model_available(self) -> bool:
        return self._gun_onnx_path.is_file()

    def get_available_models(self) -> List[Dict[str, Any]]:
        """Describe all detection models available in the forensic engine."""
        self._ensure_model_loaded()
        coco_classes = self._classes or []
        gun_meta = self._load_gun_metadata() or {}
        gun_available = self._is_gun_model_available()

        models: List[Dict[str, Any]] = [
            {
                "modelId": MODEL_YOLOV4_TINY,
                "modelName": "YOLOv4-tiny",
                "version": "4-tiny (Darknet release)",
                "available": True,
                "supportedClassesCount": len(coco_classes),
                "supportedClasses": coco_classes,
                "description": "General scene inventory across 80 MS COCO categories (vehicles, persons, household items).",
            },
            {
                "modelId": MODEL_GUN_YOLOV8,
                "modelName": gun_meta.get("modelName", "ForenVision Gun & Person Detector (YOLOv8n)"),
                "version": gun_meta.get("version", "1.0.0-yolov8n"),
                "available": gun_available,
                "supportedClassesCount": 2,
                "supportedClasses": gun_meta.get("classes", ["person", "gun"]),
                "description": "Custom fine-tuned YOLOv8n detector trained on ForenVision People with Guns CVAT dataset.",
                "trainingDataset": gun_meta.get("trainingDataset"),
                "evaluationMetrics": gun_meta.get("evaluationMetrics"),
                "onnxSha256": gun_meta.get("onnxSha256"),
                "modelSizeMB": gun_meta.get("modelSizeMB"),
            },
            {
                "modelId": MODEL_COMBINED,
                "modelName": "Dual Forensic Scan (Gun YOLOv8n + COCO YOLOv4-tiny)",
                "version": "1.0-ensemble",
                "available": gun_available,
                "supportedClassesCount": len(set(coco_classes) | {"gun", "person"}),
                "supportedClasses": sorted(set(coco_classes) | {"gun", "person"}),
                "description": "Runs both specialized firearm/person YOLOv8n and 80-class COCO YOLOv4-tiny in a single pass.",
                "trainingDataset": gun_meta.get("trainingDataset"),
                "evaluationMetrics": gun_meta.get("evaluationMetrics"),
                "onnxSha256": gun_meta.get("onnxSha256"),
            },
        ]
        return models

    @staticmethod
    def _compute_confidence_stats(detected_objects: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Compute aggregate real network confidence statistics from detections."""
        if not detected_objects:
            return {
                "meanPercent": None,
                "maxPercent": None,
                "minPercent": None,
                "perClassMeanPercent": {},
            }
        pcts = [float(d["confidencePercent"]) for d in detected_objects]
        per_class_buckets: Dict[str, List[float]] = {}
        for d in detected_objects:
            per_class_buckets.setdefault(d["className"], []).append(float(d["confidencePercent"]))
        return {
            "meanPercent": round(sum(pcts) / len(pcts), 1),
            "maxPercent": round(max(pcts), 1),
            "minPercent": round(min(pcts), 1),
            "perClassMeanPercent": {
                cls: round(sum(vals) / len(vals), 1)
                for cls, vals in per_class_buckets.items()
            },
        }

    def get_model_info(self, model_id: Optional[str] = None) -> Dict[str, Any]:
        """Return comprehensive metadata, source, licensing, and limitations of the detection model."""
        self._ensure_model_loaded()
        classes = self._classes or []
        available_models = self.get_available_models()

        if model_id == MODEL_GUN_YOLOV8 and self._is_gun_model_available():
            gun_meta = self._load_gun_metadata() or {}
            gun_classes = gun_meta.get("classes", ["person", "gun"])
            return {
                "modelId": MODEL_GUN_YOLOV8,
                "modelName": gun_meta.get("modelName", "ForenVision Gun & Person Detector (YOLOv8n)"),
                "version": gun_meta.get("version", "1.0.0-yolov8n"),
                "source": gun_meta.get("source", "Fine-tuned on ForenVision People with Guns Dataset"),
                "license": gun_meta.get("license", "AGPL-3.0 (Ultralytics YOLOv8 Architecture)"),
                "architecture": gun_meta.get("architecture", "YOLOv8n Anchor-Free Decoupled Detection Network"),
                "supportedClassesCount": len(gun_classes),
                "supportedClasses": gun_classes,
                "inferenceRequirements": {
                    "engine": "OpenCV DNN ONNX module (cv2.dnn.readNetFromONNX)",
                    "computeTarget": "CPU (Apple Silicon / x86_64)",
                    "inputResolution": gun_meta.get("inputResolution", "640x640 letterbox RGB"),
                    "normalization": "1/255.0 scaling, swapRB=True",
                    "memoryFootprintMB": gun_meta.get("modelSizeMB", 12.0),
                    "typicalLatencyMs": "20 - 50 ms",
                },
                "trainingDataset": gun_meta.get("trainingDataset"),
                "evaluationMetrics": gun_meta.get("evaluationMetrics"),
                "onnxSha256": gun_meta.get("onnxSha256"),
                "knownLimitations": [
                    "Trained on 11 source images (expanded to 48 train-only augmented frames); requires human forensic verification on novel scenes.",
                    "Specialized strictly to 'person' and 'gun' classes; use Dual Forensic Scan or YOLOv4-tiny for general COCO scene objects.",
                    "Sensitive to extreme occlusion, severe motion blur, and low-contrast surveillance compression.",
                ],
                "forensicDisclaimer": OBJECT_DETECTION_FORENSIC_DISCLAIMER,
                "availableModels": available_models,
            }

        return {
            "modelId": MODEL_YOLOV4_TINY,
            "modelName": "YOLOv4-tiny",
            "version": "4-tiny (Darknet release)",
            "source": "Official Darknet (AlexeyAB / pjreddie) MS COCO Pretrained Architecture",
            "license": "Open Source / Public Domain (Permissive Unlicense/MIT compatible)",
            "architecture": "Tiny Darknet Convolutional Neural Network with 2 YOLO heads (yolo_30, yolo_37)",
            "supportedClassesCount": len(classes),
            "supportedClasses": classes,
            "inferenceRequirements": {
                "engine": "OpenCV DNN module (cv2.dnn)",
                "computeTarget": "CPU / Metal / CUDA (Auto-configured to CPU target)",
                "inputResolution": "416x416 pixels",
                "normalization": "1/255.0 scaling, swapRB=True",
                "memoryFootprintMB": 23.5,
                "typicalLatencyMs": "15 - 35 ms",
            },
            "knownLimitations": [
                "YOLOv4-tiny is restricted to 80 standard MS COCO classes; select 'ForenVision Gun & Person Detector (YOLOv8n)' or 'Dual Forensic Scan' for firearm detection.",
                "Reduced accuracy and recall on small or heavily occluded background objects compared to multi-gigabyte ensemble models.",
                "Sensitive to extreme lighting degradation, sensor noise, severe compression, or motion blur.",
                "Surveillance cameras with wide fisheye perspective distortion may alter bounding box precision.",
            ],
            "forensicDisclaimer": OBJECT_DETECTION_FORENSIC_DISCLAIMER,
            "availableModels": available_models,
        }

    def _ensure_model_loaded(self) -> None:
        """Thread-safe lazy initialization of the YOLOv4-tiny neural network."""
        if self._net is not None and self._out_layers is not None and self._classes is not None:
            return

        with self._model_lock:
            if self._net is not None and self._out_layers is not None and self._classes is not None:
                return

            if not self._cfg_path.is_file():
                raise FileNotFoundError(f"YOLO configuration file missing at: {self._cfg_path}")
            if not self._weights_path.is_file():
                raise FileNotFoundError(f"YOLO weights file missing at: {self._weights_path}")
            if not self._classes_path.is_file():
                raise FileNotFoundError(f"COCO classes file missing at: {self._classes_path}")

            with open(self._classes_path, "r", encoding="utf-8") as f:
                classes = [line.strip() for line in f if line.strip()]

            net = cv2.dnn.readNetFromDarknet(str(self._cfg_path), str(self._weights_path))
            net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)

            layer_names = net.getLayerNames()
            out_layer_indices = net.getUnconnectedOutLayers()
            out_layers = [layer_names[int(i) - 1] for i in out_layer_indices]

            self._classes = classes
            self._net = net
            self._out_layers = out_layers

    def _ensure_gun_model_loaded(self) -> None:
        """Thread-safe lazy initialization of the trained YOLOv8n Gun & Person ONNX network."""
        if self._gun_net is not None and self._gun_classes is not None:
            return

        with self._model_lock:
            if self._gun_net is not None and self._gun_classes is not None:
                return

            if not self._gun_onnx_path.is_file():
                raise FileNotFoundError(
                    f"Trained gun detection ONNX model missing at: {self._gun_onnx_path}. "
                    "Run scripts/train_gun_detector.py to generate it."
                )

            if self._gun_classes_path.is_file():
                gun_classes = [line.strip() for line in self._gun_classes_path.read_text(encoding="utf-8").splitlines() if line.strip()]
            else:
                gun_classes = ["person", "gun"]

            gun_net = cv2.dnn.readNetFromONNX(str(self._gun_onnx_path))
            gun_net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            gun_net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)

            self._gun_classes = gun_classes
            self._gun_net = gun_net

    def _run_yolov4_tiny(
        self,
        working_img: np.ndarray,
        confidence_threshold: float,
        nms_threshold: float,
    ) -> Tuple[List[Dict[str, Any]], float]:
        """Run Darknet YOLOv4-tiny inference on an in-memory BGR image."""
        self._ensure_model_loaded()
        assert self._net is not None and self._out_layers is not None and self._classes is not None
        img_h, img_w = working_img.shape[:2]

        blob = cv2.dnn.blobFromImage(
            working_img,
            scalefactor=1.0 / 255.0,
            size=(416, 416),
            mean=(0, 0, 0),
            swapRB=True,
            crop=False,
        )

        with self._model_lock:
            self._net.setInput(blob)
            start_time = datetime.now(timezone.utc)
            outputs = self._net.forward(self._out_layers)
            latency_ms = round((datetime.now(timezone.utc) - start_time).total_seconds() * 1000, 1)

        boxes: List[List[int]] = []
        confidences: List[float] = []
        class_ids: List[int] = []

        for out in outputs:
            for detection in out:
                scores = detection[5:]
                class_id = int(np.argmax(scores))
                confidence = float(scores[class_id])

                if confidence >= confidence_threshold:
                    center_x = int(detection[0] * img_w)
                    center_y = int(detection[1] * img_h)
                    box_w = int(detection[2] * img_w)
                    box_h = int(detection[3] * img_h)

                    top_left_x = max(0, int(center_x - (box_w / 2)))
                    top_left_y = max(0, int(center_y - (box_h / 2)))
                    box_w = min(img_w - top_left_x, box_w)
                    box_h = min(img_h - top_left_y, box_h)

                    if box_w > 0 and box_h > 0:
                        boxes.append([top_left_x, top_left_y, box_w, box_h])
                        confidences.append(confidence)
                        class_ids.append(class_id)

        indices = cv2.dnn.NMSBoxes(boxes, confidences, confidence_threshold, nms_threshold)
        detected: List[Dict[str, Any]] = []

        if len(indices) > 0:
            for i in indices:
                idx = int(i) if np.isscalar(i) else int(i[0])
                cid = class_ids[idx]
                cname = self._classes[cid] if cid < len(self._classes) else f"class_{cid}"
                conf = confidences[idx]
                bx, by, bw, bh = boxes[idx]
                detected.append(self._format_detection(cid, cname, conf, bx, by, bw, bh, img_w, img_h, MODEL_YOLOV4_TINY))

        return detected, latency_ms

    def _run_gun_yolov8(
        self,
        working_img: np.ndarray,
        confidence_threshold: float,
        nms_threshold: float,
        imgsz: int = 640,
    ) -> Tuple[List[Dict[str, Any]], float]:
        """Run fine-tuned YOLOv8n ONNX firearm & person inference with letterbox resizing."""
        self._ensure_gun_model_loaded()
        assert self._gun_net is not None and self._gun_classes is not None
        img_h, img_w = working_img.shape[:2]

        scale = min(imgsz / img_w, imgsz / img_h)
        nw, nh = max(1, int(round(img_w * scale))), max(1, int(round(img_h * scale)))
        resized = cv2.resize(working_img, (nw, nh), interpolation=cv2.INTER_LINEAR)
        pad_w = (imgsz - nw) // 2
        pad_h = (imgsz - nh) // 2
        canvas = np.full((imgsz, imgsz, 3), 114, dtype=np.uint8)
        canvas[pad_h:pad_h + nh, pad_w:pad_w + nw] = resized

        blob = cv2.dnn.blobFromImage(
            canvas,
            scalefactor=1.0 / 255.0,
            size=(imgsz, imgsz),
            mean=(0, 0, 0),
            swapRB=True,
            crop=False,
        )

        with self._model_lock:
            self._gun_net.setInput(blob)
            start_time = datetime.now(timezone.utc)
            raw_out = self._gun_net.forward()
            latency_ms = round((datetime.now(timezone.utc) - start_time).total_seconds() * 1000, 1)

        preds = np.squeeze(raw_out, axis=0).T  # (8400, 4 + nc)
        boxes: List[List[int]] = []
        confidences: List[float] = []
        class_ids: List[int] = []

        for row in preds:
            cls_scores = row[4:]
            cid = int(np.argmax(cls_scores))
            conf = float(cls_scores[cid])
            if conf >= confidence_threshold:
                cx, cy, bw, bh = float(row[0]), float(row[1]), float(row[2]), float(row[3])
                x1 = max(0, int(round((cx - bw / 2.0 - pad_w) / scale)))
                y1 = max(0, int(round((cy - bh / 2.0 - pad_h) / scale)))
                w_orig = min(img_w - x1, int(round(bw / scale)))
                h_orig = min(img_h - y1, int(round(bh / scale)))
                if w_orig > 0 and h_orig > 0:
                    boxes.append([x1, y1, w_orig, h_orig])
                    confidences.append(conf)
                    class_ids.append(cid)

        indices = cv2.dnn.NMSBoxes(boxes, confidences, confidence_threshold, nms_threshold)
        detected: List[Dict[str, Any]] = []

        if len(indices) > 0:
            for i in indices:
                idx = int(i) if np.isscalar(i) else int(i[0])
                cid = class_ids[idx]
                cname = self._gun_classes[cid] if cid < len(self._gun_classes) else f"class_{cid}"
                conf = confidences[idx]
                bx, by, bw, bh = boxes[idx]
                detected.append(self._format_detection(cid, cname, conf, bx, by, bw, bh, img_w, img_h, MODEL_GUN_YOLOV8))

        return detected, latency_ms

    @staticmethod
    def _format_detection(
        cid: int,
        cname: str,
        conf: float,
        bx: int,
        by: int,
        bw: int,
        bh: int,
        img_w: int,
        img_h: int,
        source_model: str,
    ) -> Dict[str, Any]:
        return {
            "detectionId": f"obj_{uuid.uuid4().hex[:8]}",
            "classId": cid,
            "className": cname,
            "confidence": round(conf, 4),
            "confidencePercent": round(conf * 100, 1),
            "sourceModel": source_model,
            "box": {
                "x": bx,
                "y": by,
                "width": bw,
                "height": bh,
            },
            "normalizedBox": {
                "x": round(bx / max(1, img_w), 4),
                "y": round(by / max(1, img_h), 4),
                "width": round(bw / max(1, img_w), 4),
                "height": round(bh / max(1, img_h), 4),
            },
        }

    @staticmethod
    def _box_iou(b1: Dict[str, int], b2: Dict[str, int]) -> float:
        x1 = max(b1["x"], b2["x"])
        y1 = max(b1["y"], b2["y"])
        x2 = min(b1["x"] + b1["width"], b2["x"] + b2["width"])
        y2 = min(b1["y"] + b1["height"], b2["y"] + b2["height"])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        if inter <= 0:
            return 0.0
        area1 = b1["width"] * b1["height"]
        area2 = b2["width"] * b2["height"]
        return inter / max(1e-9, float(area1 + area2 - inter))

    def run_detection(
        self,
        evidence_id: str,
        user: Dict[str, Any],
        confidence_threshold: float = 0.30,
        nms_threshold: float = 0.40,
        save_analysis: bool = True,
        model_id: str = MODEL_YOLOV4_TINY,
    ) -> Dict[str, Any]:
        """
        Execute real neural object detection inference on authorized photographic evidence.
        Supports `yolov4-tiny` (default), `forensic-gun-yolov8`, and `combined`.
        """
        requested_model = (model_id or MODEL_YOLOV4_TINY).strip().lower()
        if requested_model not in SUPPORTED_MODEL_IDS:
            raise ValueError(
                f"Unsupported modelId '{model_id}'. Valid options: {sorted(SUPPORTED_MODEL_IDS)}."
            )

        # 1. Parameter Bounds Enforcement
        confidence_threshold = max(0.05, min(0.95, float(confidence_threshold)))
        nms_threshold = max(0.10, min(0.90, float(nms_threshold)))

        # 2. Authorization & Case Clearance Check
        evidence_doc = evidence_service.get_evidence_by_id(evidence_id, user)
        if not evidence_doc:
            raise PermissionError("Access denied: evidence record not found or inaccessible under your clearance.")

        case_id = evidence_doc.get("caseId")
        case_number = evidence_doc.get("caseNumber", "UNKNOWN-CASE")
        evidence_number = evidence_doc.get("evidenceNumber", evidence_id)

        raw_case = case_service._find_raw_case_doc(case_id)
        if raw_case and not case_service.user_can_access_case(user, raw_case):
            raise PermissionError("Access denied: you do not have authorized clearance for this case.")

        # 3. Retrieve and Validate Original Evidence Bytes (Zero Mutation)
        file_bytes, original_filename, mime_type = evidence_service.get_evidence_file_bytes(evidence_id, user)

        if not (mime_type.startswith("image/") or original_filename.lower().endswith((".jpg", ".jpeg", ".png", ".tiff", ".bmp"))):
            raise ValueError(f"Inference requires photographic image evidence; received media type '{mime_type}'.")

        # 4. Dimension & Decompression Bomb Protection
        try:
            pil_header = Image.open(io.BytesIO(file_bytes))
            orig_w, orig_h = pil_header.size
            if orig_w * orig_h > MAX_PIXEL_COUNT or orig_w > MAX_DIMENSION or orig_h > MAX_DIMENSION:
                raise ValueError(
                    f"Image dimensions ({orig_w}x{orig_h}) exceed forensic safety thresholds "
                    f"(max {MAX_DIMENSION}x{MAX_DIMENSION} / {MAX_PIXEL_COUNT:,} pixels)."
                )
        except (UnidentifiedImageError, OSError) as e:
            raise ValueError(f"Corrupted or unsupported image file container: {e}")

        # 5. Decode to In-Memory Working Copy (Decoded BGR Raster)
        np_arr = np.frombuffer(file_bytes, dtype=np.uint8)
        working_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if working_img is None:
            raise ValueError("Failed to decode image buffer into working pixel raster.")

        img_h, img_w = working_img.shape[:2]

        # 6. Execute Selected Model Inference
        if requested_model == MODEL_YOLOV4_TINY:
            detected_objects, inference_duration_ms = self._run_yolov4_tiny(
                working_img, confidence_threshold, nms_threshold
            )
            analysis_type = "AI Object Detection (YOLOv4-tiny)"
            model_meta = {
                "id": MODEL_YOLOV4_TINY,
                "name": "YOLOv4-tiny",
                "version": "4-tiny (Darknet)",
                "source": "AlexeyAB/darknet (MS COCO)",
                "license": "Open Source / Public Domain (Permissive)",
                "benchmarkMetrics": None,
                "benchmarkNote": "Pretrained MS COCO 80-class baseline (no local ground-truth accuracy split; reports live per-box confidence %).",
            }
            input_res = "416x416"
        elif requested_model == MODEL_GUN_YOLOV8:
            detected_objects, inference_duration_ms = self._run_gun_yolov8(
                working_img, confidence_threshold, nms_threshold
            )
            gun_meta = self._load_gun_metadata() or {}
            analysis_type = "AI Firearm & Person Detection (Trained YOLOv8n)"
            model_meta = {
                "id": MODEL_GUN_YOLOV8,
                "name": gun_meta.get("modelName", "ForenVision Gun & Person Detector (YOLOv8n)"),
                "version": gun_meta.get("version", "1.0.0-yolov8n"),
                "source": gun_meta.get("source", "People with Guns CVAT Dataset"),
                "license": gun_meta.get("license", "AGPL-3.0 / Custom Fine-Tuned"),
                "benchmarkMetrics": gun_meta.get("evaluationMetrics"),
                "trainingDataset": gun_meta.get("trainingDataset"),
            }
            input_res = "640x640"
        else:
            gun_dets, lat_gun = self._run_gun_yolov8(working_img, confidence_threshold, nms_threshold)
            coco_dets, lat_coco = self._run_yolov4_tiny(working_img, confidence_threshold, nms_threshold)
            inference_duration_ms = round(lat_gun + lat_coco, 1)

            # Merge detections: prioritize gun_dets for 'gun'/'person', deduplicate overlapping 'person'
            merged: List[Dict[str, Any]] = list(gun_dets)
            for det in coco_dets:
                if det["className"].lower() == "person":
                    if any(
                        m["className"].lower() == "person" and self._box_iou(m["box"], det["box"]) > 0.45
                        for m in merged
                    ):
                        continue
                merged.append(det)

            gun_meta = self._load_gun_metadata() or {}
            detected_objects = merged
            analysis_type = "Dual Forensic Scan (YOLOv8n Gun + YOLOv4-tiny COCO)"
            model_meta = {
                "id": MODEL_COMBINED,
                "name": "Dual Forensic Scan (YOLOv8n + YOLOv4-tiny)",
                "version": "1.0-ensemble",
                "source": "People with Guns YOLOv8n + AlexeyAB MS COCO YOLOv4-tiny",
                "license": "Permissive / AGPL-3.0 Composite",
                "benchmarkMetrics": gun_meta.get("evaluationMetrics"),
                "trainingDataset": gun_meta.get("trainingDataset"),
            }
            input_res = "640x640 + 416x416"

        # Sort detected objects descending by confidence and compute class counts + confidence stats
        detected_objects.sort(key=lambda d: d["confidence"], reverse=True)
        class_distribution: Dict[str, int] = {}
        for d in detected_objects:
            cname = d["className"]
            class_distribution[cname] = class_distribution.get(cname, 0) + 1
        confidence_stats = self._compute_confidence_stats(detected_objects)

        # 7. Create Annotated Visualization on a Separate Working Copy
        annotated_bgr = working_img.copy()
        for obj in detected_objects:
            b = obj["box"]
            x, y, w, h = b["x"], b["y"], b["width"], b["height"]
            cid = obj["classId"]
            cname_lower = obj["className"].lower()

            if cname_lower == "gun":
                # High-contrast crimson highlight for firearm detections
                bgr_color = (68, 68, 239)
            else:
                color = PALETTE[cid % len(PALETTE)]
                bgr_color = (int(color[2]), int(color[1]), int(color[0]))

            cv2.rectangle(annotated_bgr, (x, y), (x + w, y + h), bgr_color, 2)

            label = f"{obj['className']} {obj['confidencePercent']}%"
            font_scale = 0.55
            thickness = 1
            (label_w, label_h), baseline = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness
            )

            banner_y1 = max(0, y - label_h - baseline - 6)
            banner_y2 = y
            banner_x1 = x
            banner_x2 = min(img_w, x + label_w + 10)

            cv2.rectangle(
                annotated_bgr,
                (banner_x1, banner_y1),
                (banner_x2, banner_y2),
                bgr_color,
                -1,
            )

            text_color = (255, 255, 255) if cname_lower == "gun" else (15, 23, 42)
            cv2.putText(
                annotated_bgr,
                label,
                (banner_x1 + 4, banner_y2 - baseline - 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                font_scale,
                text_color,
                thickness,
                cv2.LINE_AA,
            )

        success, enc_buffer = cv2.imencode(".jpg", annotated_bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if not success:
            raise RuntimeError("Failed to encode annotated detection visualization.")
        derived_bytes = enc_buffer.tobytes()

        # 8. Persist Derived Visualization to Private Vault
        analysis_id = f"det_{uuid.uuid4().hex[:12]}"
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

        # 9. Prepare Analysis Result Document
        user_name = user.get("name") or "Authorized Examiner"
        badge = user.get("badge_number") or user.get("badge") or "N/A"

        evidence_filename = (
            evidence_doc.get("name")
            or evidence_doc.get("filename")
            or evidence_doc.get("originalFilename")
            or evidence_number
        )
        analysis_doc: Dict[str, Any] = {
            "id": analysis_id,
            "analysisId": analysis_id,
            "evidenceId": evidence_id,
            "evidenceNumber": evidence_number,
            "evidenceFilename": evidence_filename,
            "caseId": str(case_id),
            "caseNumber": case_number,
            "analysisType": analysis_type,
            "category": "object_detection",
            "modelId": requested_model,
            "modelInfo": model_meta,
            "processingTimeMs": inference_duration_ms,
            "parameters": {
                "confidenceThreshold": confidence_threshold,
                "nmsThreshold": nms_threshold,
                "inputResolution": input_res,
                "engine": "OpenCV DNN",
                "modelId": requested_model,
            },
            "summary": {
                "totalObjects": len(detected_objects),
                "uniqueClasses": len(class_distribution),
                "classCounts": class_distribution,
                "inferenceLatencyMs": inference_duration_ms,
                "imageResolution": f"{img_w}x{img_h}",
                "firearmDetections": class_distribution.get("gun", 0),
                "confidenceStats": confidence_stats,
            },
            "detectedObjects": detected_objects,
            "derivedStorageRef": f"vault://{case_number}/derived/{derived_filename}",
            "_derivedDiskPath": str(derived_file_path),
            "derivedImageUrl": f"/api/analysis/detection/derived/{analysis_id}",
            "forensicDisclaimer": OBJECT_DETECTION_FORENSIC_DISCLAIMER,
            "timestamp": now_str,
            "performedBy": f"{user_name} ({badge})" if badge != "N/A" else user_name,
            "status": "completed",
        }

        # 10. Save to Database & In-Memory Fallbacks
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

    def get_detection_history(self, evidence_id: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Retrieve prior object detection analyses for an authorized evidence artifact."""
        evidence_doc = evidence_service.get_evidence_by_id(evidence_id, user)
        if not evidence_doc:
            raise PermissionError("Access denied: evidence record not found or inaccessible.")

        case_id = evidence_doc.get("caseId")
        raw_case = case_service._find_raw_case_doc(case_id)
        if raw_case and not case_service.user_can_access_case(user, raw_case):
            raise PermissionError("Access denied: case clearance required.")

        results: List[Dict[str, Any]] = []
        db = db_service.get_db()
        if db is not None:
            try:
                cursor = db["analysis_results"].find(
                    {"evidenceId": evidence_id, "category": "object_detection"},
                    {"_id": 0, "_derivedDiskPath": 0},
                ).sort("timestamp", -1)
                results = list(cursor)
            except PyMongoError:
                pass

        if not results:
            mem_items = [
                dict(v) for v in self._memory_analysis_records.values()
                if v.get("evidenceId") == evidence_id and v.get("category") == "object_detection"
            ]
            for itm in mem_items:
                itm.pop("_derivedDiskPath", None)
            results = sorted(mem_items, key=lambda x: x.get("timestamp", ""), reverse=True)

        return results

    def get_derived_image(self, analysis_id: str, user: Dict[str, Any]) -> Tuple[bytes, str]:
        """Stream the annotated detection visualization image after enforcing access clearances."""
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
            raise FileNotFoundError("Requested analysis visualization record does not exist.")

        case_id = record.get("caseId")
        raw_case = case_service._find_raw_case_doc(case_id)
        if raw_case and not case_service.user_can_access_case(user, raw_case):
            raise PermissionError("Access denied: insufficient clearance to view this analysis artifact.")

        if analysis_id in self._memory_derived_files:
            return self._memory_derived_files[analysis_id], "image/jpeg"

        disk_path = record.get("_derivedDiskPath")
        if disk_path and os.path.exists(disk_path):
            with open(disk_path, "rb") as f:
                data = f.read()
            return data, "image/jpeg"

        raise FileNotFoundError("Visualization image file is unavailable on the storage backend.")


# Global service instance
object_detection_service = ObjectDetectionService()
