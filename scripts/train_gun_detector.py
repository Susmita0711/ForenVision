#!/usr/bin/env python3
"""
ForenVision AI — Forensic Firearm & Person Detector Training Pipeline
======================================================================
Trains a custom YOLOv8n object detector on the prepared `people_with_guns`
dataset (`datasets/prepared/gun_detection/`), evaluates strictly on the held-out
validation and test splits, exports an OpenCV DNN-compatible ONNX model into
`backend/models/`, and writes verifiable training/evaluation metadata.

FORENSIC ML INVARIANTS:
1. Strict Split Isolation: Deterministic train-only augmentations never touch
   validation or test images. Zero data leakage.
2. Honest Metrics: All reported mAP, precision, recall, and latency figures are
   measured directly on the validation/test splits and stored verbatim.
3. Self-Contained Production Export: Exports `opset=12` ONNX weights so the
   Flask backend runs inference via `cv2.dnn.readNetFromONNX` with zero PyTorch
   runtime dependency.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Ensure PyTorch 2.6+ compatibility when loading Ultralytics YOLOv8 checkpoints
os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")

import cv2
import numpy as np
import torch
from PIL import Image, ImageEnhance, ImageFilter

# Compatibility shim: PyTorch 2.9+ defaults dynamo=True, which requires onnxscript;
# OpenCV DNN requires opset=12 exported with legacy TorchScript exporter (dynamo=False).
_orig_onnx_export = torch.onnx.export


def _compat_onnx_export(*args: Any, **kwargs: Any) -> Any:
    kwargs.setdefault("dynamo", False)
    return _orig_onnx_export(*args, **kwargs)


torch.onnx.export = _compat_onnx_export

from ultralytics import YOLO, settings as ultra_settings  # noqa: E402


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_ARCHIVE_GUN_DIR = BASE_DIR / "datasets" / "archive (1)"
DEFAULT_RAW_GUN_DIR = BASE_DIR / "datasets" / "raw" / "people_with_guns"
PREPARED_DIR = BASE_DIR / "datasets" / "prepared" / "gun_detection"
AUG_DIR = BASE_DIR / "datasets" / "prepared" / "gun_detection_aug"
PRETRAINED_DIR = BASE_DIR / "datasets" / "pretrained"
TRAINED_ARTIFACT_DIR = BASE_DIR / "datasets" / "trained" / "gun_detector"
BACKEND_MODELS_DIR = BASE_DIR / "backend" / "models"

SEED = 42
CLASS_NAMES = ["person", "gun"]


def set_deterministic(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def compute_sha256(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def load_yolo_labels(label_path: Path) -> List[Tuple[int, float, float, float, float]]:
    boxes: List[Tuple[int, float, float, float, float]] = []
    if not label_path.is_file():
        return boxes
    for line in label_path.read_text(encoding="utf-8").splitlines():
        parts = line.strip().split()
        if len(parts) == 5:
            cid = int(parts[0])
            xc, yc, bw, bh = map(float, parts[1:])
            boxes.append((cid, xc, yc, bw, bh))
    return boxes


def save_yolo_labels(label_path: Path, boxes: List[Tuple[int, float, float, float, float]]) -> None:
    lines = [f"{cid} {xc:.6f} {yc:.6f} {bw:.6f} {bh:.6f}" for cid, xc, yc, bw, bh in boxes]
    label_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def resize_cap(img: Image.Image, max_edge: int = 1280) -> Image.Image:
    w, h = img.size
    if max(w, h) <= max_edge:
        return img.copy()
    scale = max_edge / float(max(w, h))
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    return img.resize((new_w, new_h), Image.Resampling.LANCZOS)


def apply_clahe_rgb(pil_img: Image.Image, clip_limit: float = 2.4) -> Image.Image:
    bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    l2 = clahe.apply(l)
    merged = cv2.merge((l2, a, b))
    rgb = cv2.cvtColor(cv2.cvtColor(merged, cv2.COLOR_LAB2BGR), cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)


def crop_focus_around_guns(
    img: Image.Image,
    boxes: List[Tuple[int, float, float, float, float]],
    rng: random.Random,
) -> Tuple[Image.Image, List[Tuple[int, float, float, float, float]]]:
    """
    Generate a deterministic zoomed crop focusing on gun/person evidence regions
    while preserving valid clipped bounding boxes (min visibility >= 40%).
    """
    w, h = img.size
    gun_boxes = [b for b in boxes if b[0] == 1]
    anchor = rng.choice(gun_boxes) if gun_boxes else rng.choice(boxes)
    _, ax, ay, aw, ah = anchor

    crop_scale = rng.uniform(0.62, 0.80)
    cw = max(int(round(w * crop_scale)), int(round(aw * w * 1.4)), 128)
    ch = max(int(round(h * crop_scale)), int(round(ah * h * 1.4)), 128)
    cw = min(w, cw)
    ch = min(h, ch)

    acx = ax * w
    acy = ay * h
    x1 = int(round(max(0.0, min(float(w - cw), acx - cw * rng.uniform(0.35, 0.65)))))
    y1 = int(round(max(0.0, min(float(h - ch), acy - ch * rng.uniform(0.35, 0.65)))))
    x2 = x1 + cw
    y2 = y1 + ch

    cropped_img = img.crop((x1, y1, x2, y2))
    new_boxes: List[Tuple[int, float, float, float, float]] = []

    for cid, xc, yc, bw, bh in boxes:
        bx1 = (xc - bw / 2.0) * w
        by1 = (yc - bh / 2.0) * h
        bx2 = (xc + bw / 2.0) * w
        by2 = (yc + bh / 2.0) * h
        orig_area = max(1.0, (bx2 - bx1) * (by2 - by1))

        nx1 = max(float(x1), bx1) - x1
        ny1 = max(float(y1), by1) - y1
        nx2 = min(float(x2), bx2) - x1
        ny2 = min(float(y2), by2) - y1

        if nx2 <= nx1 or ny2 <= ny1:
            continue
        vis_ratio = ((nx2 - nx1) * (ny2 - ny1)) / orig_area
        if vis_ratio < 0.35:
            continue

        nxc = ((nx1 + nx2) / 2.0) / cw
        nyc = ((ny1 + ny2) / 2.0) / ch
        nbw = (nx2 - nx1) / cw
        nbh = (ny2 - ny1) / ch
        if nbw > 0.01 and nbh > 0.01:
            new_boxes.append((cid, nxc, nyc, nbw, nbh))

    if not new_boxes:
        return img.copy(), list(boxes)
    return cropped_img, new_boxes


def resolve_gun_source_dir(source_dir: Path | None = None) -> Path:
    if source_dir is not None:
        return source_dir.resolve()
    if (DEFAULT_ARCHIVE_GUN_DIR / "annotations.xml").is_file():
        return DEFAULT_ARCHIVE_GUN_DIR.resolve()
    return DEFAULT_RAW_GUN_DIR.resolve()


def build_augmented_training_dataset(
    seed: int = SEED,
    source_dir: Path | None = None,
) -> Tuple[Path, Dict[str, Any]]:
    """
    Prepare the raw/archive annotated dataset cleanly and create a deterministic
    training-split-only augmented YOLO dataset.
    `val` and `test` splits are copied verbatim from `PREPARED_DIR` with zero augmentation.
    """
    resolved_src = resolve_gun_source_dir(source_dir)
    if PREPARED_DIR.exists():
        shutil.rmtree(PREPARED_DIR)
    sys.path.insert(0, str(BASE_DIR / "scripts"))
    from prepare_gun_dataset import convert_dataset
    prep_summary = convert_dataset(resolved_src, PREPARED_DIR, seed=seed)

    if AUG_DIR.exists():
        shutil.rmtree(AUG_DIR)

    for split in ("train", "val", "test"):
        (AUG_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (AUG_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)

    # Copy val and test verbatim (strict isolation)
    val_count = 0
    test_count = 0
    for img_path in sorted((PREPARED_DIR / "images" / "val").glob("*")):
        shutil.copy2(img_path, AUG_DIR / "images" / "val" / img_path.name)
        val_count += 1
    for lbl_path in sorted((PREPARED_DIR / "labels" / "val").glob("*.txt")):
        shutil.copy2(lbl_path, AUG_DIR / "labels" / "val" / lbl_path.name)
    for img_path in sorted((PREPARED_DIR / "images" / "test").glob("*")):
        shutil.copy2(img_path, AUG_DIR / "images" / "test" / img_path.name)
        test_count += 1
    for lbl_path in sorted((PREPARED_DIR / "labels" / "test").glob("*.txt")):
        shutil.copy2(lbl_path, AUG_DIR / "labels" / "test" / lbl_path.name)

    rng = random.Random(seed)
    train_images = sorted((PREPARED_DIR / "images" / "train").glob("*"))
    train_count = 0

    for img_path in train_images:
        lbl_path = PREPARED_DIR / "labels" / "train" / f"{img_path.stem}.txt"
        boxes = load_yolo_labels(lbl_path)
        with Image.open(img_path) as raw_img:
            base_img = resize_cap(raw_img.convert("RGB"), max_edge=1280)

        stem = img_path.stem

        # 1. Original resized
        base_img.save(AUG_DIR / "images" / "train" / f"{stem}_orig.jpg", quality=95)
        save_yolo_labels(AUG_DIR / "labels" / "train" / f"{stem}_orig.txt", boxes)
        train_count += 1

        # 2. Horizontal flip
        hflip_img = base_img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        hflip_boxes = [(cid, 1.0 - xc, yc, bw, bh) for cid, xc, yc, bw, bh in boxes]
        hflip_img.save(AUG_DIR / "images" / "train" / f"{stem}_hflip.jpg", quality=95)
        save_yolo_labels(AUG_DIR / "labels" / "train" / f"{stem}_hflip.txt", hflip_boxes)
        train_count += 1

        # 3. Low-light surveillance + CLAHE contrast enhancement
        dark_img = ImageEnhance.Brightness(base_img).enhance(0.75)
        dark_img = apply_clahe_rgb(dark_img, clip_limit=2.2)
        dark_img.save(AUG_DIR / "images" / "train" / f"{stem}_lowlight.jpg", quality=92)
        save_yolo_labels(AUG_DIR / "labels" / "train" / f"{stem}_lowlight.txt", boxes)
        train_count += 1

        # 4. Mild motion/CCTV blur + warm exposure shift
        cctv_img = base_img.filter(ImageFilter.GaussianBlur(radius=0.8))
        cctv_img = ImageEnhance.Brightness(cctv_img).enhance(1.15)
        cctv_img = ImageEnhance.Contrast(cctv_img).enhance(1.18)
        cctv_img.save(AUG_DIR / "images" / "train" / f"{stem}_cctv.jpg", quality=90)
        save_yolo_labels(AUG_DIR / "labels" / "train" / f"{stem}_cctv.txt", boxes)
        train_count += 1

        # 5. Focused zoom crop around gun/person regions
        crop_img, crop_boxes = crop_focus_around_guns(base_img, boxes, rng)
        crop_img.save(AUG_DIR / "images" / "train" / f"{stem}_crop.jpg", quality=95)
        save_yolo_labels(AUG_DIR / "labels" / "train" / f"{stem}_crop.txt", crop_boxes)
        train_count += 1

        # 6. Flipped focused zoom crop
        crop_flip_img = crop_img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        crop_flip_boxes = [(cid, 1.0 - xc, yc, bw, bh) for cid, xc, yc, bw, bh in crop_boxes]
        crop_flip_img.save(AUG_DIR / "images" / "train" / f"{stem}_cropflip.jpg", quality=95)
        save_yolo_labels(AUG_DIR / "labels" / "train" / f"{stem}_cropflip.txt", crop_flip_boxes)
        train_count += 1

    yaml_path = AUG_DIR / "data.yaml"
    yaml_content = f"""# ForenVision AI — Augmented Training Dataset (Strict Val/Test Isolation)
path: {AUG_DIR.resolve()}
train: images/train
val: images/val
test: images/test

names:
  0: person
  1: gun
"""
    yaml_path.write_text(yaml_content, encoding="utf-8")
    print(f"[Dataset] Prepared from {resolved_src.name}: {train_count} aug train images, {val_count} val images, {test_count} test image.")
    try:
        rel_src = str(resolved_src.relative_to(BASE_DIR.resolve()))
    except ValueError:
        rel_src = str(resolved_src)
    dataset_info = {
        "sourceDataset": rel_src,
        "preparedDataset": "datasets/prepared/gun_detection",
        "sourceTotalImages": prep_summary.get("total_images", len(train_images) + val_count + test_count),
        "sourceSplit": prep_summary.get("split_counts", {"train": len(train_images), "val": val_count, "test": test_count}),
        "augmentedTrainImages": train_count,
    }
    return yaml_path, dataset_info


def extract_metrics_dict(val_res: Any) -> Dict[str, Any]:
    """Extract genuine detection metrics from Ultralytics ValResults."""
    box = getattr(val_res, "box", None)
    if box is None:
        return {}

    per_class = {}
    names = getattr(val_res, "names", {0: "person", 1: "gun"})
    ap50_per_cls = getattr(box, "ap50", [])
    ap_per_cls = getattr(box, "ap", [])
    for idx, cid in enumerate(getattr(box, "ap_class_index", [])):
        cname = names.get(int(cid), f"class_{cid}")
        per_class[cname] = {
            "ap50": round(float(ap50_per_cls[idx]), 4) if idx < len(ap50_per_cls) else None,
            "ap50_95": round(float(ap_per_cls[idx]), 4) if idx < len(ap_per_cls) else None,
        }

    return {
        "precision": round(float(box.mp), 4),
        "recall": round(float(box.mr), 4),
        "mAP50": round(float(box.map50), 4),
        "mAP50_95": round(float(box.map), 4),
        "perClass": per_class,
    }


def verify_onnx_with_opencv(onnx_path: Path, sample_image_path: Path, imgsz: int = 640) -> Dict[str, Any]:
    """Verify the exported ONNX model runs cleanly under OpenCV DNN and detects real targets."""
    net = cv2.dnn.readNetFromONNX(str(onnx_path))
    img = cv2.imread(str(sample_image_path))
    assert img is not None, f"Failed to read test image {sample_image_path}"
    ih, iw = img.shape[:2]

    # Letterbox to square imgsz x imgsz for accurate coordinate mapping
    scale = min(imgsz / iw, imgsz / ih)
    nw, nh = int(round(iw * scale)), int(round(ih * scale))
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    pad_w = (imgsz - nw) // 2
    pad_h = (imgsz - nh) // 2
    canvas = np.full((imgsz, imgsz, 3), 114, dtype=np.uint8)
    canvas[pad_h:pad_h + nh, pad_w:pad_w + nw] = resized

    blob = cv2.dnn.blobFromImage(canvas, scalefactor=1.0 / 255.0, size=(imgsz, imgsz), swapRB=True, crop=False)
    net.setInput(blob)
    raw_out = net.forward()  # (1, 4 + num_classes, 8400)
    preds = np.squeeze(raw_out, axis=0).T  # (8400, 6)

    boxes = []
    scores = []
    class_ids = []
    for row in preds:
        cls_scores = row[4:]
        cid = int(np.argmax(cls_scores))
        conf = float(cls_scores[cid])
        if conf >= 0.25:
            cx, cy, bw, bh = row[:4]
            x1 = max(0, int((cx - bw / 2.0 - pad_w) / scale))
            y1 = max(0, int((cy - bh / 2.0 - pad_h) / scale))
            w_orig = min(iw - x1, int(bw / scale))
            h_orig = min(ih - y1, int(bh / scale))
            if w_orig > 0 and h_orig > 0:
                boxes.append([x1, y1, w_orig, h_orig])
                scores.append(conf)
                class_ids.append(cid)

    indices = cv2.dnn.NMSBoxes(boxes, scores, 0.25, 0.45)
    detections = []
    if len(indices) > 0:
        for i in indices:
            idx = int(i) if np.isscalar(i) else int(i[0])
            detections.append({
                "class": CLASS_NAMES[class_ids[idx]],
                "confidence": round(scores[idx], 4),
                "box": boxes[idx],
            })

    return {
        "outputShape": list(raw_out.shape),
        "testImage": sample_image_path.name,
        "detectionsCount": len(detections),
        "detections": detections,
    }


def _resolve_device(requested: str) -> str:
    req = (requested or "auto").strip().lower()
    if req == "auto":
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"
    return req


def train_and_export(
    source_dir: Path | None = None,
    device: str = "auto",
    resume: bool = False,
) -> Dict[str, Any]:
    set_deterministic(SEED)
    resolved_device = _resolve_device(device)
    PRETRAINED_DIR.mkdir(parents=True, exist_ok=True)
    TRAINED_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    BACKEND_MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # Move yolov8n.pt into datasets/pretrained if present in root, else download there
    root_pt = BASE_DIR / "yolov8n.pt"
    pretrained_pt = PRETRAINED_DIR / "yolov8n.pt"
    if root_pt.is_file() and not pretrained_pt.is_file():
        shutil.move(str(root_pt), str(pretrained_pt))
    elif root_pt.is_file():
        root_pt.unlink()

    ultra_settings.update({"datasets_dir": str((BASE_DIR / "datasets").resolve())})

    data_yaml, dataset_info = build_augmented_training_dataset(seed=SEED, source_dir=source_dir)

    run_name = "gun_yolov8n"
    last_ckpt = TRAINED_ARTIFACT_DIR / run_name / "weights" / "last.pt"
    if resume and last_ckpt.is_file():
        print(f"[Resume] Resuming training from {last_ckpt} on device={resolved_device}")
        model = YOLO(str(last_ckpt))
    else:
        resume = False
        model = YOLO(str(pretrained_pt if pretrained_pt.is_file() else "yolov8n.pt"))
        if (BASE_DIR / "yolov8n.pt").is_file() and not pretrained_pt.is_file():
            shutil.move(str(BASE_DIR / "yolov8n.pt"), str(pretrained_pt))

    print(f"[Train] Starting YOLOv8n training on device={resolved_device} (source={dataset_info['sourceDataset']})")
    model.train(
        data=str(data_yaml.resolve()),
        epochs=100,
        patience=0,
        imgsz=640,
        batch=8,
        cache="ram",
        resume=resume,
        seed=SEED,
        deterministic=True,
        device=resolved_device,
        optimizer="AdamW",
        lr0=0.004,
        lrf=0.01,
        cos_lr=True,
        warmup_epochs=5,
        cls=1.2,
        box=7.5,
        weight_decay=0.0005,
        mosaic=0.8,
        close_mosaic=15,
        mixup=0.1,
        degrees=8.0,
        scale=0.35,
        fliplr=0.5,
        hsv_h=0.015,
        hsv_s=0.5,
        hsv_v=0.35,
        project=str(TRAINED_ARTIFACT_DIR),
        name=run_name,
        exist_ok=True,
        verbose=True,
    )

    weights_dir = TRAINED_ARTIFACT_DIR / run_name / "weights"
    candidates = [p for p in (weights_dir / "best.pt", weights_dir / "last.pt") if p.is_file()]
    assert candidates, f"No trained weights found in {weights_dir}"

    # Select checkpoint with strongest validation mAP50 (with gun AP50 tie-breaker)
    selected_pt = candidates[-1]
    selected_score = -1.0
    for cand_pt in candidates:
        cand_model = YOLO(str(cand_pt))
        cand_val = extract_metrics_dict(
            cand_model.val(data=str(data_yaml.resolve()), split="val", imgsz=640, device="cpu", verbose=False)
        )
        gun_ap50 = (cand_val.get("perClass", {}).get("gun", {}).get("ap50") or 0.0)
        score = cand_val.get("mAP50", 0.0) * 0.6 + gun_ap50 * 0.4
        print(f"[Checkpoint Eval] {cand_pt.name}: val mAP50={cand_val.get('mAP50')}, gun_ap50={gun_ap50}, score={score:.4f}")
        if score >= selected_score:
            selected_score = score
            selected_pt = cand_pt

    print(f"[Selected Checkpoint] {selected_pt.name}")
    best_model = YOLO(str(selected_pt))

    # Strict Evaluation on Validation and Held-Out Test Splits
    val_res = best_model.val(data=str(data_yaml.resolve()), split="val", imgsz=640, device="cpu", verbose=False)
    test_res = best_model.val(data=str(data_yaml.resolve()), split="test", imgsz=640, device="cpu", verbose=False)

    val_metrics = extract_metrics_dict(val_res)
    test_metrics = extract_metrics_dict(test_res)

    # Export ONNX compatible with OpenCV DNN
    exported_path_str = best_model.export(format="onnx", opset=12, imgsz=640, simplify=False)
    exported_onnx = Path(exported_path_str)

    target_onnx = BACKEND_MODELS_DIR / "forensic_gun_yolov8n.onnx"
    shutil.copy2(exported_onnx, target_onnx)

    names_file = BACKEND_MODELS_DIR / "forensic_gun.names"
    names_file.write_text("\n".join(CLASS_NAMES) + "\n", encoding="utf-8")

    # Verify ONNX execution via OpenCV DNN on the held-out test image
    test_images = sorted((PREPARED_DIR / "images" / "test").glob("*"))
    assert test_images, f"No held-out test images found in {PREPARED_DIR / 'images' / 'test'}"
    test_img_path = test_images[0]
    cv_check = verify_onnx_with_opencv(target_onnx, test_img_path, imgsz=640)

    onnx_sha256 = compute_sha256(target_onnx)
    onnx_size_mb = round(target_onnx.stat().st_size / (1024 * 1024), 2)

    metadata: Dict[str, Any] = {
        "modelId": "forensic-gun-yolov8",
        "modelName": "ForenVision Gun & Person Detector (YOLOv8n)",
        "version": "1.0.0-yolov8n",
        "architecture": "YOLOv8n (CSPDarknet Backbone + PAN-FPN + Decoupled Anchor-Free Head)",
        "source": f"Fine-tuned on ForenVision People with Guns Dataset ({dataset_info['sourceDataset']}, CVAT XML)",
        "license": "AGPL-3.0 (Ultralytics YOLOv8 Architecture) / Custom Fine-Tuned Weights",
        "classes": CLASS_NAMES,
        "inputResolution": "640x640 (letterbox RGB)",
        "onnxFile": target_onnx.name,
        "onnxSha256": onnx_sha256,
        "modelSizeMB": onnx_size_mb,
        "trainingDataset": {
            **dataset_info,
            "seed": SEED,
            "epochsMax": 100,
            "imgsz": 640,
            "trainingDevice": resolved_device,
            "selectedCheckpoint": selected_pt.name,
        },
        "evaluationMetrics": {
            "validation": val_metrics,
            "heldOutTest": test_metrics,
            "openCvDnnSmokeTest": cv_check,
        },
        "trainedAt": datetime.now(timezone.utc).isoformat(),
    }

    meta_backend = BACKEND_MODELS_DIR / "forensic_gun_metadata.json"
    meta_trained = TRAINED_ARTIFACT_DIR / "evaluation_report.json"
    meta_backend.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    meta_trained.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print("\n=== GUN DETECTOR TRAINING COMPLETE ===")
    print(json.dumps(metadata["evaluationMetrics"], indent=2))
    print(f"Saved ONNX model: {target_onnx} ({onnx_size_mb} MB, SHA-256: {onnx_sha256[:16]}...)")
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train ForenVision YOLOv8n Gun & Person Detector")
    parser.add_argument("--source-dir", type=Path, default=None, help="Source folder containing annotations.xml and images/ (defaults to datasets/archive (1))")
    parser.add_argument("--device", type=str, default="auto", help="Training device: auto, mps, cuda, or cpu")
    parser.add_argument("--resume", action="store_true", help="Resume from datasets/trained/gun_detector/gun_yolov8n/weights/last.pt")
    args = parser.parse_args()
    train_and_export(source_dir=args.source_dir, device=args.device, resume=args.resume)
