# Controlled Face Analysis & Forensic Comparison Specification

## 1. Executive Summary

The **Controlled Face Analysis Module** in ForenVision AI provides a scientifically calibrated, forensically sound pipeline for:
1. **Face Detection & Localization**: Anchor-free Convolutional Neural Network (**YuNet**, 2023mar ONNX) with OpenCV Haar cascade fallback.
2. **Facial Landmark Localization**: 5-point primary anatomical landmarks (right eye, left eye, nose tip, right mouth corner, left mouth corner).
3. **Forensic Image Quality Assessment**: Multi-dimensional quality metrics including Inter-Pupillary Distance (**IPD** in pixels), spatial sharpness via Laplacian variance, hemispheric illumination asymmetry, highlight saturation, shadow clipping, and pose roll angle.
4. **Controlled 1-to-1 Exploratory Facial Comparison**: SphereFace2-based deep representation model (**SFace**, 2021dec ONNX) mapping canonical $112 \times 112$ aligned facial crops into 128-dimensional hyperspherical embeddings for pairwise Cosine similarity and $L_2$ Euclidean distance evaluation.
5. **Biometric Data Safeguards & Legal Guardrails**: Strict compliance with international forensic standards (**NIST FRTE**, **OSAC Forensic Facial Comparison**, and **ENFSI Best Practice Manual for Facial Image Comparison**).

---

## 2. Models, Versions, and Licensing

| Component | Model Name | Version / Checkpoint | Architecture | License | Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Face Detector** | YuNet | `2023mar ONNX` (232 KB) | Lightweight Anchor-Free CNN | **Apache 2.0** | OpenCV Model Zoo / Shiqi Yu |
| **Face Recognizer** | SFace | `2021dec ONNX` (38.6 MB) | ResNet-style SphereFace2 (128-d) | **Apache 2.0** | OpenCV Model Zoo / Zhongdao Wang |
| **Fallback Detector** | Haar Cascade | OpenCV built-in XML | Boosted Haar Wavelet Cascade | **BSD 3-Clause** | OpenCV / Intel |

### License Suitability Assessment
- **Commercial & Government Use**: Both **Apache 2.0** and **BSD 3-Clause** are highly permissive open-source licenses permitting inclusion, modification, and execution without restrictive copyleft requirements.
- **Model Checkpoint Integrity**: Weights are stored in `backend/models/` and loaded in read-only inference mode with zero external cloud dependencies.

---

## 3. Scientific Limitations & Demographics Bias Assessment

In accordance with National Institute of Standards and Technology (**NIST**) Face Recognition Technology Evaluation (FRTE) findings and OSAC forensic guidelines:

1. **Latent Space Mathematical Similarity vs. Physical Identity**:
   - Algorithmic comparison calculates the Cosine similarity and Euclidean distance between two vectors in a 128-dimensional latent space.
   - Vector proximity **does NOT prove physical identity** or unique anatomical individualization. Under no circumstances can a similarity score be presented in court as proof of identity or presence.
2. **Demographic Differentials**:
   - Deep neural representations demonstrate empirically documented variance across demographic cohorts (differing false match and false non-match rates across age, biological sex, and ethnicity).
   - The algorithm must never be used as an autonomous gatekeeper.
3. **Environmental Degradation & Resolution Collapse**:
   - **Inter-Pupillary Distance (IPD)**: NIST forensic guidelines recommend a minimum IPD of $\ge 60$ pixels for reliable examination. Surveillance stills with $\text{IPD} < 40$ px suffer severe feature ambiguity.
   - **Pose & Perspective**: Head yaw or pitch exceeding $15^\circ$ non-linearly compresses contralateral facial planes.
   - **Illumination Asymmetry**: Harsh lateral lighting or cast shadows generate pseudo-gradients in deep feature maps.
4. **Mandatory ACE-V Human Examination**:
   - Automated scores are exploratory investigative leads. Conclusive forensic identification requires manual morphological feature examination (ears, scars, mole distributions, vermilion borders) by a certified forensic facial examiner under the **ACE-V** (Analysis, Comparison, Evaluation, Verification) framework.

---

## 4. Legal Invariants & Ethical Guardrails

| Invariant / Requirement | System Implementation |
| :--- | :--- |
| **No Automated Identification** | The system does NOT output automated identity declarations. Output tiers classify mathematical correspondence only (`STRONG_CORRESPONDENCE`, `MODERATE_CORRESPONDENCE`, `LOW_CORRESPONDENCE`, `INCONCLUSIVE_DIVERGENT`). |
| **No Unrestricted Identity Sweeps** | 1-to-many ($1:N$) mass surveillance sweeps and scraping of regional registries are **strictly blocked**. The API only accepts explicit pairwise 1:1 inputs (`probeEvidenceId` and `referenceEvidenceId`). |
| **No Suspect Tagging** | The system under NO circumstances labels an individual a "suspect" or assigns culpability. |
| **Evidence Immutability** | Original uploaded files in the vault (`uploads/vault/`) are opened in read-only binary mode. All annotations and crops occur on working copies in memory. |
| **Derived Storage Separation** | Annotated visualizations are generated into case-isolated derived directories (`uploads/vault/<case>/derived/`) with non-executable permissions (`0o640`). |
| **Case-Level Access Control** | Enforced via JWT authentication and `case_service.user_can_access_case`. Unauthorized investigators receive `403 Forbidden`. |
| **Biometric Privacy Protection** | 128-dimensional floating-point embedding vectors are held transiently in memory during pairwise inference. They are **never logged**, returned over public APIs, or shared across cases. |
| **Retention Policy** | Facial analysis records follow the retention lifecycle of the associated legal case docket. Biometric templates are not pooled into central cross-case galleries. |

---

## 5. REST API Architecture

### 1. `GET /api/analysis/face/methodology`
- **Auth**: `@jwt_required`
- **Output**: Detailed engine specs, model versions, licenses, scientific limitations, evaluation guidelines, and mandatory legal disclaimers.

### 2. `POST /api/analysis/face/detect`
- **Auth**: `@jwt_required`
- **Payload**: `{ "evidenceId": "evd_...", "scoreThreshold": 0.40, "saveAnalysis": true }`
- **Output**: Bounding boxes, 5 landmarks, forensic quality metrics (IPD, sharpness, lighting asymmetry, warnings), and derived visualization filename.

### 3. `POST /api/analysis/face/compare`
- **Auth**: `@jwt_required`
- **Payload**: `{ "probeEvidenceId": "evd_...", "referenceEvidenceId": "evd_...", "scoreThreshold": 0.40, "saveAnalysis": true }`
- **Output**: Dual evidence bounding boxes, individual quality reports, Cosine similarity, $L_2$ distance, correspondence index ($0-100\%$), correspondence tier, diagnostic interpretation, and legal notice.

### 4. `GET /api/analysis/face/history/<evidence_id>`
- **Auth**: `@jwt_required`
- **Output**: Chronological list of saved facial analysis runs for the evidence item.

### 5. `GET /api/analysis/face/derived/<analysis_id>`
- **Auth**: `@jwt_required`
- **Output**: Authenticated JPEG stream of the derived composite visualization.

---

## 6. Test Suite Parity

The module is verified with 6 dedicated unit and integration tests in `backend/tests/test_face_analysis.py`:
- `test_get_face_methodology_documentation`: Validates transparent reporting of Apache 2.0 licenses, NIST limitations, and ACE-V caveats.
- `test_single_face_detection_and_quality_audit`: Validates YuNet localization, 5 landmarks, and quality metrics on evidence imagery.
- `test_controlled_one_to_one_facial_comparison`: Validates 1:1 pairwise matching, Cosine & $L_2$ metric computation, and absence of raw vector leakage.
- `test_face_comparison_unauthorized_case_access_rejected`: Enforces strict 403 Forbidden rejection when users lack clearance to a case docket.
- `test_face_detection_rejects_image_without_faces`: Verifies diagnostic 400 Bad Request rejection on non-facial imagery without fabricating results.
- `test_face_analysis_history_and_derived_streaming`: Verifies persistence and authenticated streaming of derived visualization canvases.
