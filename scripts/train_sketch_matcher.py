#!/usr/bin/env python3
"""
ForenVision AI — Cross-Modality Sketch-to-Photo Alignment Training Pipeline
===========================================================================
Trains a lightweight residual contrastive projection network on the CUHK Face
Sketch dataset (`datasets/raw/cuhk_face_sketch/`, 188 paired photos & sketches)
using YuNet face detection and SFace 128-D facial embeddings.

FORENSIC ML INVARIANTS:
1. Strict Identity-Level Split: All 188 subjects are split deterministically
   (seed=42) into Train (132), Validation (28), and Held-Out Test (28) with
   zero subject overlap.
2. Honest Benchmarking: Evaluates both raw SFace baseline and the CUHK-trained
   adapter on the held-out test set (Rank-1, Rank-5, MRR, ROC-AUC, Genuine vs
   Impostor cosine separation).
3. Lightweight Deployment Export: Exports `cuhk_sketch_matcher.onnx` (opset=12)
   plus `cuhk_sketch_matcher.npz` for pure-OpenCV/NumPy runtime inference inside
   the Flask backend, alongside `cuhk_sketch_metadata.json`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_ARCHIVE_CUHK = BASE_DIR / "datasets" / "archive"
DEFAULT_RAW_CUHK = BASE_DIR / "datasets" / "raw" / "cuhk_face_sketch"
CUHK_DIR = DEFAULT_ARCHIVE_CUHK if (DEFAULT_ARCHIVE_CUHK / "photos").is_dir() else DEFAULT_RAW_CUHK
BACKEND_MODELS_DIR = BASE_DIR / "backend" / "models"
TRAINED_ARTIFACT_DIR = BASE_DIR / "datasets" / "trained" / "sketch_matcher"

YUNET_PATH = BACKEND_MODELS_DIR / "face_detection_yunet_2023mar.onnx"
SFACE_PATH = BACKEND_MODELS_DIR / "face_recognition_sface_2021dec.onnx"

SEED = 42


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


def normalize_subject_id(stem: str) -> str:
    s = stem.lower().replace("-sz1", "")
    if s.startswith("f2-"):
        s = "f-" + s[3:]
    elif s.startswith("m2-"):
        s = "m-" + s[3:]
    return s


def preprocess_sketch_for_sface(bgr_img: np.ndarray, clip_limit: float = 2.0) -> np.ndarray:
    """Apply gentle CLAHE luminance normalization for cross-modality feature stability."""
    gray = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)


def extract_sface_embedding(
    detector: cv2.FaceDetectorYN,
    recognizer: cv2.FaceRecognizerSF,
    img_path: Path,
    is_sketch: bool = False,
    hflip: bool = False,
    clahe_clip: float = 2.0,
) -> np.ndarray | None:
    bgr = cv2.imread(str(img_path))
    if bgr is None:
        return None
    if hflip:
        bgr = cv2.flip(bgr, 1)
    if is_sketch:
        bgr = preprocess_sketch_for_sface(bgr, clip_limit=clahe_clip)

    # Replicate-border padding ensures YuNet detects tight mugshot/sketch crops reliably
    padded = cv2.copyMakeBorder(bgr, 48, 48, 48, 48, cv2.BORDER_REPLICATE)
    ph, pw = padded.shape[:2]
    detector.setInputSize((pw, ph))
    _, faces = detector.detect(padded)
    if faces is None or len(faces) == 0:
        return None

    best_face = faces[int(np.argmax(faces[:, 14]))]
    aligned = recognizer.alignCrop(padded, best_face)
    feat = recognizer.feature(aligned).flatten().astype(np.float32)
    norm = float(np.linalg.norm(feat))
    if norm > 1e-9:
        feat = feat / norm
    return feat


class ResidualProjectionHead(nn.Module):
    """Residual MLP adapter mapping SFace modality vectors into an aligned unit sphere."""

    def __init__(self, dim: int = 128, hidden_dim: int = 256, dropout: float = 0.25) -> None:
        super().__init__()
        self.fc1 = nn.Linear(dim, hidden_dim)
        self.bn1 = nn.BatchNorm1d(hidden_dim)
        self.act = nn.ReLU()
        self.drop = nn.Dropout(dropout)
        self.fc2 = nn.Linear(hidden_dim, dim)
        self.res_weight = nn.Parameter(torch.full((1, dim), 0.35))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.drop(self.act(self.bn1(self.fc1(x))))
        out = x + self.res_weight * self.fc2(h)
        return F.normalize(out, p=2, dim=-1)


class CrossModalitySketchMatcher(nn.Module):
    """Dual-branch residual adapter aligning sketch and photo SFace embeddings."""

    def __init__(self, dim: int = 128) -> None:
        super().__init__()
        self.sketch_proj = ResidualProjectionHead(dim=dim, hidden_dim=256, dropout=0.25)
        self.photo_proj = ResidualProjectionHead(dim=dim, hidden_dim=256, dropout=0.25)
        self.logit_scale = nn.Parameter(torch.tensor(np.log(12.0), dtype=torch.float32))

    def forward(self, sketch_emb: torch.Tensor, photo_emb: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        s_out = self.sketch_proj(sketch_emb)
        p_out = self.photo_proj(photo_emb)
        return s_out, p_out


def compute_roc_auc(y_true: np.ndarray, y_scores: np.ndarray) -> float:
    """Compute exact Mann-Whitney U ROC-AUC without external runtime dependencies."""
    pos = y_scores[y_true == 1]
    neg = y_scores[y_true == 0]
    if len(pos) == 0 or len(neg) == 0:
        return 0.5
    diff = pos[:, None] - neg[None, :]
    wins = np.sum(diff > 0) + 0.5 * np.sum(diff == 0)
    return float(wins / (len(pos) * len(neg)))


def evaluate_retrieval(sketch_vecs: np.ndarray, photo_vecs: np.ndarray) -> Dict[str, Any]:
    """Compute Rank-1, Rank-5, MRR, ROC-AUC, and genuine/impostor separation."""
    n = len(sketch_vecs)
    sim = sketch_vecs @ photo_vecs.T
    ranks: List[int] = []
    for i in range(n):
        order = np.argsort(-sim[i])
        rank_pos = int(np.where(order == i)[0][0]) + 1
        ranks.append(rank_pos)

    rank1 = float(np.mean([r == 1 for r in ranks]))
    rank5 = float(np.mean([r <= 5 for r in ranks]))
    mrr = float(np.mean([1.0 / r for r in ranks]))

    genuine = np.diag(sim)
    mask = ~np.eye(n, dtype=bool)
    impostor = sim[mask]

    y_true = np.concatenate([np.ones(len(genuine)), np.zeros(len(impostor))])
    y_scores = np.concatenate([genuine, impostor])
    roc_auc = compute_roc_auc(y_true, y_scores)

    return {
        "gallerySize": n,
        "rank1Accuracy": round(rank1, 4),
        "rank5Accuracy": round(rank5, 4),
        "meanReciprocalRank": round(mrr, 4),
        "rocAuc": round(roc_auc, 4),
        "meanGenuineSimilarity": round(float(np.mean(genuine)), 4),
        "meanImpostorSimilarity": round(float(np.mean(impostor)), 4),
        "separationMargin": round(float(np.mean(genuine) - np.mean(impostor)), 4),
    }


def train_and_export(data_dir: Path | None = None) -> Dict[str, Any]:
    set_deterministic(SEED)
    TRAINED_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    BACKEND_MODELS_DIR.mkdir(parents=True, exist_ok=True)

    dataset_dir = (data_dir or CUHK_DIR).resolve()
    assert YUNET_PATH.is_file(), f"Missing YuNet model at {YUNET_PATH}"
    assert SFACE_PATH.is_file(), f"Missing SFace model at {SFACE_PATH}"
    assert (dataset_dir / "photos").is_dir() and (dataset_dir / "sketches").is_dir(), (
        f"Expected photos/ and sketches/ inside {dataset_dir}"
    )

    try:
        rel_dataset_path = str(dataset_dir.relative_to(BASE_DIR.resolve()))
    except ValueError:
        rel_dataset_path = str(dataset_dir)

    print(f"[Dataset] Reading CUHK Face Sketch pairs from: {rel_dataset_path}")
    detector = cv2.FaceDetectorYN.create(str(YUNET_PATH), "", (256, 256), 0.3, 0.3, 50)
    recognizer = cv2.FaceRecognizerSF.create(str(SFACE_PATH), "")

    photos = {normalize_subject_id(p.stem): p for p in sorted((dataset_dir / "photos").glob("*.jpg"))}
    sketches = {normalize_subject_id(p.stem): p for p in sorted((dataset_dir / "sketches").glob("*.jpg"))}
    subject_ids = sorted(set(photos) & set(sketches))
    assert len(subject_ids) == 188, f"Expected 188 aligned CUHK pairs, found {len(subject_ids)}"

    # Deterministic subject split: 132 train, 28 val, 28 test
    shuffled_ids = list(subject_ids)
    random.Random(SEED).shuffle(shuffled_ids)
    train_ids = shuffled_ids[:132]
    val_ids = shuffled_ids[132:160]
    test_ids = shuffled_ids[160:]

    def build_embeddings(ids: List[str], augment_train: bool = False) -> Tuple[np.ndarray, np.ndarray]:
        s_list, p_list = [], []
        for sid in ids:
            sf = extract_sface_embedding(detector, recognizer, sketches[sid], is_sketch=True, hflip=False, clahe_clip=2.0)
            pf = extract_sface_embedding(detector, recognizer, photos[sid], is_sketch=False, hflip=False)
            if sf is not None and pf is not None:
                s_list.append(sf)
                p_list.append(pf)
            if augment_train:
                sf_f = extract_sface_embedding(detector, recognizer, sketches[sid], is_sketch=True, hflip=True, clahe_clip=2.0)
                pf_f = extract_sface_embedding(detector, recognizer, photos[sid], is_sketch=False, hflip=True)
                if sf_f is not None and pf_f is not None:
                    s_list.append(sf_f)
                    p_list.append(pf_f)
                for clip in (1.3, 2.8):
                    sf_c = extract_sface_embedding(detector, recognizer, sketches[sid], is_sketch=True, hflip=False, clahe_clip=clip)
                    if sf_c is not None and pf is not None:
                        s_list.append(sf_c)
                        p_list.append(pf)
        return np.stack(s_list), np.stack(p_list)

    print(f"[Dataset] Extracting SFace embeddings across {len(subject_ids)} CUHK subjects...")
    s_train, p_train = build_embeddings(train_ids, augment_train=True)
    s_val, p_val = build_embeddings(val_ids, augment_train=False)
    s_test, p_test = build_embeddings(test_ids, augment_train=False)

    baseline_val = evaluate_retrieval(s_val, p_val)
    baseline_test = evaluate_retrieval(s_test, p_test)
    print(f"[Baseline Raw SFace] Test Rank-1={baseline_test['rank1Accuracy']}, Rank-5={baseline_test['rank5Accuracy']}, AUC={baseline_test['rocAuc']}")

    # Train Cross-Modality Contrastive Residual Adapter
    device = torch.device("cpu")
    model = CrossModalitySketchMatcher(dim=128).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1.5e-3, weight_decay=2e-2)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=180, eta_min=1e-5)

    s_tr_t = torch.from_numpy(s_train).to(device)
    p_tr_t = torch.from_numpy(p_train).to(device)
    s_val_t = torch.from_numpy(s_val).to(device)
    p_val_t = torch.from_numpy(p_val).to(device)
    s_te_t = torch.from_numpy(s_test).to(device)
    p_te_t = torch.from_numpy(p_test).to(device)

    best_score = -1.0
    best_state = None
    best_epoch = 0

    for epoch in range(1, 181):
        model.train()
        # Mini-batch contrastive training over deterministic permutation
        perm = torch.randperm(len(s_tr_t))
        batch_size = 44
        for start in range(0, len(s_tr_t), batch_size):
            idx = perm[start:start + batch_size]
            sb = s_tr_t[idx]
            pb = p_tr_t[idx]

            # Add slight Gaussian feature noise for generalization across witness variations
            sb_noisy = F.normalize(sb + 0.02 * torch.randn_like(sb), p=2, dim=-1)
            pb_noisy = F.normalize(pb + 0.02 * torch.randn_like(pb), p=2, dim=-1)

            s_proj, p_proj = model(sb_noisy, pb_noisy)
            scale = model.logit_scale.exp().clamp(max=50.0)
            logits = scale * (s_proj @ p_proj.T)
            targets = torch.arange(len(idx), device=device)

            loss_infonce = 0.5 * (F.cross_entropy(logits, targets) + F.cross_entropy(logits.T, targets))
            loss_cos = (1.0 - torch.sum(s_proj * p_proj, dim=-1)).mean()
            loss = loss_infonce + 0.5 * loss_cos

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        scheduler.step()

        # Validation evaluation
        model.eval()
        with torch.no_grad():
            vs, vp = model(s_val_t, p_val_t)
            val_metrics = evaluate_retrieval(vs.numpy(), vp.numpy())
            # Composite model selection metric prioritizing Rank-1 + ROC-AUC + margin
            val_score = (
                val_metrics["rank1Accuracy"] * 0.50
                + val_metrics["rocAuc"] * 0.35
                + val_metrics["separationMargin"] * 0.15
            )
            if val_score >= best_score:
                best_score = val_score
                best_epoch = epoch
                best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}

    assert best_state is not None
    model.load_state_dict(best_state)
    model.eval()

    with torch.no_grad():
        vs_best, vp_best = model(s_val_t, p_val_t)
        ts_best, tp_best = model(s_te_t, p_te_t)
        trained_val = evaluate_retrieval(vs_best.numpy(), vp_best.numpy())
        trained_test = evaluate_retrieval(ts_best.numpy(), tp_best.numpy())

    # Export ONNX model (dual input -> dual aligned 128-D embeddings)
    # Note: export sketch and photo branches cleanly, and verify NumPy equivalence
    onnx_path = BACKEND_MODELS_DIR / "cuhk_sketch_matcher.onnx"
    dummy_s = torch.randn(1, 128, dtype=torch.float32)
    dummy_p = torch.randn(1, 128, dtype=torch.float32)
    torch.onnx.export(
        model,
        (dummy_s, dummy_p),
        str(onnx_path),
        opset_version=12,
        dynamo=False,
        input_names=["sketch_embedding", "photo_embedding"],
        output_names=["aligned_sketch", "aligned_photo"],
    )

    # Also save PyTorch checkpoint and portable NumPy weights for zero-dependency inference
    pt_path = TRAINED_ARTIFACT_DIR / "cuhk_sketch_matcher.pt"
    torch.save(best_state, pt_path)

    npz_path = BACKEND_MODELS_DIR / "cuhk_sketch_matcher.npz"
    np_weights = {k.replace(".", "_"): v.cpu().numpy() for k, v in best_state.items()}
    np.savez(npz_path, **np_weights)

    # Verify portable NumPy inference matches PyTorch output exactly
    def numpy_project(x: np.ndarray, prefix: str) -> np.ndarray:
        w1 = np_weights[f"{prefix}_fc1_weight"]
        b1 = np_weights[f"{prefix}_fc1_bias"]
        mean = np_weights[f"{prefix}_bn1_running_mean"]
        var = np_weights[f"{prefix}_bn1_running_var"]
        gamma = np_weights[f"{prefix}_bn1_weight"]
        beta = np_weights[f"{prefix}_bn1_bias"]
        w2 = np_weights[f"{prefix}_fc2_weight"]
        b2 = np_weights[f"{prefix}_fc2_bias"]
        rw = np_weights[f"{prefix}_res_weight"]

        h = x @ w1.T + b1
        h = gamma * (h - mean) / np.sqrt(var + 1e-5) + beta
        h = np.maximum(0.0, h)
        delta = h @ w2.T + b2
        out = x + rw * delta
        return out / (np.linalg.norm(out, axis=-1, keepdims=True) + 1e-12)

    np_s = numpy_project(s_test[:1].astype(np.float32), "sketch_proj")
    np_p = numpy_project(p_test[:1].astype(np.float32), "photo_proj")
    assert np.allclose(np_s, ts_best[:1].numpy(), atol=1e-4)
    assert np.allclose(np_p, tp_best[:1].numpy(), atol=1e-4)

    onnx_sha256 = compute_sha256(onnx_path)
    npz_sha256 = compute_sha256(npz_path)

    metadata: Dict[str, Any] = {
        "modelId": "cuhk-sketch-cross-modality-v1",
        "modelName": "CUHK Cross-Modality Sketch-to-Photo Feature Adapter",
        "version": "1.0.0-cuhk-sface",
        "architecture": "Dual-Branch Residual Contrastive Projection Network over 128-D SFace Embeddings",
        "source": "Trained on CUHK Face Sketch Database (188 paired artist sketches and mugshot photographs)",
        "forensicClassification": "EXPERIMENTAL_INVESTIGATIVE_ONLY (NOT DAUBERT/FRYE ADMISSIBLE FOR IDENTIFICATION)",
        "trainingDataset": {
            "datasetPath": rel_dataset_path,
            "totalSubjects": len(subject_ids),
            "split": {"trainSubjects": len(train_ids), "valSubjects": len(val_ids), "testSubjects": len(test_ids)},
            "augmentedTrainPairs": len(s_train),
            "seed": SEED,
            "bestEpoch": best_epoch,
        },
        "artifacts": {
            "onnxFile": onnx_path.name,
            "onnxSha256": onnx_sha256,
            "npzFile": npz_path.name,
            "npzSha256": npz_sha256,
        },
        "evaluationMetrics": {
            "validation": {"baselineRawSFace": baseline_val, "cuhkTrainedAdapter": trained_val},
            "heldOutTest": {"baselineRawSFace": baseline_test, "cuhkTrainedAdapter": trained_test},
        },
        "trainedAt": datetime.now(timezone.utc).isoformat(),
    }

    meta_backend = BACKEND_MODELS_DIR / "cuhk_sketch_metadata.json"
    meta_trained = TRAINED_ARTIFACT_DIR / "evaluation_report.json"
    meta_backend.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    meta_trained.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print("\n=== CUHK SKETCH MATCHER TRAINING COMPLETE ===")
    print(json.dumps(metadata["evaluationMetrics"], indent=2))
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train ForenVision CUHK Sketch-to-Photo Cross-Modality Adapter")
    parser.add_argument("--data-dir", type=Path, default=None, help="Path to CUHK photos/sketches folder (defaults to datasets/archive)")
    args = parser.parse_args()
    train_and_export(data_dir=args.data_dir)
