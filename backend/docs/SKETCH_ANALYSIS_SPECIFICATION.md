# Criminal Sketch Analysis & Morphological Review Specification

## 1. Executive Summary

The **Criminal Sketch Analysis & Morphological Review Module** in ForenVision AI provides a structured, forensically sound workflow for:
1. **Sketch Evidence Management**: Ingesting, hashing, and vaulting witness composite sketches (hand-drawn artist composites, Identi-KIT, FACES, EFIT-V) associated with authorized legal cases while preserving original bytes untouched.
2. **Documented Image Preprocessing**: Operating on working copies in memory with OpenCV filters (grayscale normalization, CLAHE contrast enhancement, Canny and Sobel pencil-stroke edge extractors, and line art inversion).
3. **Interactive Morphological Annotations**: Placing spatial pin reticles on sketches and reference photos across standardized anatomical feature categories (orbital eyes, eyebrows, nasal bridge, mouth/lips, jawline/chin, hairline, ears, scars/marks).
4. **Controlled 1-to-1 Comparison Sessions**: Displaying reference photographs explicitly selected by authorized investigators from the case docket (strictly rejecting mass web scraping or unrestricted surveillance search).
5. **Session Persistence & Derived Canvas Generation**: Recording all parameters, annotations, examiner findings, and composite side-by-side visualization into case audit records (`analysis_results` collection and derived vault).
6. **Strict Legal Standards Compliance**: Adhering to OSAC Facial Comparison Standards (ASTM E3115 / E3149) and ENFSI Best Practice Manual for Facial Image Comparison.

---

## 2. Model Evaluation & Scientific Status

### Assessment of Automated Sketch-to-Photo Models
Under international forensic benchmarks and legal admissibility requirements (Daubert / Frye standards):
- **Cognitive Distortions**: Composite drawings are cognitive approximations recalled from human memory under stress, weapon focus, post-event suggestion, and artist interpretation. They are **not** photographic optical records.
- **Cross-Modality Inadmissibility**: Research-grade sketch-to-photo GANs or deep cross-domain embeddings exhibit high false-match rates and lack empirical validation across diverse demographic populations.
- **Ethical Mandate**: In strict compliance with forensic science principles:
  - **No automated identification or accusation**: The system does NOT declare identity or generate automated suspect accusations.
  - **No fabricated similarity scores**: The system rejects invented match percentages.
  - **Advanced matching marked as UNAVAILABLE / UNVALIDATED**: Automated matching models are marked as experimental / unavailable for legal proceedings.
  - **Human-Centric Review**: Analysis is conducted as an objective morphological feature review by certified human examiners under the **ACE-V** (Analysis, Comparison, Evaluation, Verification) framework.

---

## 3. Supported Image Preprocessing Filters

All transformations operate exclusively on **working copies** in memory:

| Filter | Implementation | Forensic Purpose |
| :--- | :--- | :--- |
| **Grayscale Normalization** | Dynamic range Min-Max scaling $[0, 255]$ | Eliminates paper tint, scanner color casts, and optimizes line contrast |
| **CLAHE** | Contrast Limited Adaptive Histogram Equalization (`clipLimit=2.0`, `tileGrid=(8,8)`) | Enhances subtle pencil shading and graphite texture without noise blow-up |
| **Canny Stroke Isolator** | Multi-stage edge detector with configurable low/high hysteresis thresholds | Extracts structural pencil outlines and eliminates textured background paper grain |
| **Sobel Gradient Filter** | First-order directional derivative kernels ($k=3$) | Highlights directional shading and stroke pressure differentials |
| **Line Art Inversion** | Bitwise NOT transformation (`cv2.bitwise_not`) | Facilitates visual comparison between dark-line sketches and light-toned photographs |
| **Linear Scaling** | Alpha contrast ($0.2-3.0$) and beta brightness ($-100$ to $+100$) | Compensates for under-exposed or faded archival drawings |

---

## 4. Morphological Feature Annotation Framework

Aligned with OSAC / ASTM E3115 facial feature decomposition:

1. `orbital_eyes`: Palpebral fissure inclination, eye aperture, epicanthic folds, upper/lower eyelid fullness.
2. `eyebrows`: Arch height, glabella spacing, medial/lateral thickness, hair directionality.
3. `nasal_bridge_aperture`: Dorsum curvature, radix depth, tip shape, ala curvature, naris visibility.
4. `mouth_lips`: Vermilion height, philtrum depth, labial commissure tilt, oral fissure curvature.
5. `mandibular_jawline_chin`: Mentalis prominence, gonial angle, mandibular contour, chin clefting.
6. `hairline_cranial`: Frontal hairline shape, temporal recession, cranial vault proportions.
7. `auricular_ears`: Helix roll, antihelix prominence, concha depth, lobule attachment.
8. `scars_marks_tattoos`: Unique focal dermatological marks, traumatic scars, or tattooing.
9. `general_facial_proportions`: Facial thirds vertical ratio, cranial index, bilateral symmetry.

---

## 5. REST API Architecture

| Endpoint | Method | Auth | Description |
| :--- | :--- | :--- | :--- |
| `/api/analysis/sketch/methodology` | `GET` | `@jwt_required` | Transparent methodology, cognitive limitations, and legal disclaimers |
| `/api/analysis/sketch/upload` | `POST` | `@jwt_required` | Ingests sketch into vault (`type="sketch"`), computes SHA-256 |
| `/api/analysis/sketch/preprocess` | `POST` | `@jwt_required` | Applies documented filters to working copy, returns data URL |
| `/api/analysis/sketch/session` | `POST` | `@jwt_required` | Saves session with annotations, checklist, notes, and derived canvas |
| `/api/analysis/sketch/compare-experimental` | `POST` | `@jwt_required` | Executes experimental CUHK-trained cross-modality diagnostic probe (`NOT_VALIDATED_FOR_DAUBERT_FRYE_IDENTIFICATION`) |
| `/api/analysis/sketch/session/<id>` | `GET` | `@jwt_required` | Retrieves session record, enforcing case clearance |
| `/api/analysis/sketch/history/<id>` | `GET` | `@jwt_required` | Chronological session audit trail for an evidence item |
| `/api/analysis/sketch/derived/<id>` | `GET` | `@jwt_required` | Authenticated JPEG stream of the derived composite visualization |

---

## 6. Verification & Automated Test Suite

Verified by 6 dedicated tests in `backend/tests/test_sketch_analysis.py`:
- `test_get_sketch_methodology_documentation`: Validates transparent documentation, unvalidated model status, and Daubert/Frye disclaimers (**PASSED**).
- `test_upload_sketch_evidence`: Validates sketch upload, SHA-256 digest calculation, and case association (**PASSED**).
- `test_sketch_preprocessing_pipeline`: Validates CLAHE, Canny edge detection, and inversion working copy filters (**PASSED**).
- `test_create_and_retrieve_comparison_session`: Validates session recording, annotations, checklist, and derived visual generation (**PASSED**).
- `test_sketch_unauthorized_case_access_rejected`: Enforces strict 403 Forbidden rejection when users lack clearance (**PASSED**).
- `test_sketch_error_handling_and_validation`: Validates rejection of bad inputs, missing files, and non-existent records (**PASSED**).
