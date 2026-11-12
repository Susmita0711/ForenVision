# ForenVision AI API Specification & Endpoint Reference

Complete REST API reference for ForenVision AI. All endpoints require `Content-Type: application/json` (except `/api/evidence/upload` and `/api/analysis/sketch/upload` which accept `multipart/form-data`).

Protected endpoints require a valid JWT Bearer token in the `Authorization` HTTP header:
```http
Authorization: Bearer <JWT_ACCESS_TOKEN>
```

---

## 1. Authentication Endpoints (`/api/auth`)

| Method | Endpoint | Clearance Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register new user account. Defaults to `analyst` role. |
| `POST` | `/api/auth/login` | Public | Authenticate credentials; returns JWT token, expiry, and user profile. |
| `POST` | `/api/auth/logout` | Authenticated | Invalidate client session token and record audit logout event. |
| `GET` | `/api/auth/me` | Authenticated | Retrieve authenticated user profile and assigned role permissions. |
| `GET` | `/api/auth/profile` | Authenticated | Retrieve current user profile details. |
| `PATCH` | `/api/auth/profile` | Authenticated | Update user name, phone, agency, or notification preferences. |

---

## 2. User & RBAC Management (`/api/users`)

| Method | Endpoint | Clearance Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | `users.manage` (Admin) | List all registered user accounts with roles and status. |
| `POST` | `/api/users` | `users.manage` (Admin) | Administrative account provisioning with assigned role. |
| `GET` | `/api/users/<user_id>` | `users.manage` (Admin) | Retrieve single user record by ID. |
| `PATCH` | `/api/users/<user_id>/role` | `users.manage` (Admin) | Change user role (`administrator`, `investigator`, `analyst`, `viewer`). |
| `PATCH` | `/api/users/<user_id>/status` | `users.manage` (Admin) | Activate or deactivate account (`is_active: bool`). |
| `GET` | `/api/users/profile` | Authenticated | Get current user profile. |
| `PATCH` | `/api/users/profile` | Authenticated | Update current user profile. |

---

## 3. Case Management (`/api/cases`)

| Method | Endpoint | Clearance Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/cases` | `cases.read` | List cases accessible under current user clearance (paginated). |
| `POST` | `/api/cases` | `cases.create` | Open a new forensic case docket. |
| `GET` | `/api/cases/<case_id>` | `cases.read` | Retrieve case metadata and assigned examiners. |
| `PATCH` | `/api/cases/<case_id>` | `cases.update` | Update case title, description, priority, tags, or lead officer. |
| `PATCH` | `/api/cases/<case_id>/status` | `cases.update` | Transition case workflow state (`draft`, `active`, `closed`, etc.). |
| `POST` | `/api/cases/<case_id>/assign` | `cases.assign` (Admin/Inv) | Assign or reassign forensic examiners to the case. |
| `GET` | `/api/cases/<case_id>/evidence` | `evidence.read` | List all evidence artifacts attached to this case. |
| `POST` | `/api/cases/<case_id>/evidence` | `evidence.upload` | Attach evidence artifact to case. |
| `GET` | `/api/cases/<case_id>/analyses` | `analysis.read` | Retrieve all forensic analyses performed for this case. |
| `GET` | `/api/cases/<case_id>/audit` | `audit.read` | Retrieve chronological case activity log. |
| `POST` | `/api/cases/<case_id>/archive` | `cases.archive` (Admin) | Archive case docket to cold storage. |
| `DELETE` | `/api/cases/<case_id>` | `cases.archive` (Admin) | Soft-delete / archive case docket. |

---

## 4. Evidence Vault & Ingestion (`/api/evidence`)

| Method | Endpoint | Clearance Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/evidence/upload` | `evidence.upload` | Ingest evidence file (`multipart/form-data`), compute SHA-256, store in private vault. |
| `GET` | `/api/evidence` | `evidence.read` | List accessible evidence items (supports filters by case, type, status, query). |
| `GET` | `/api/evidence/<id>` | `evidence.read` | Retrieve sanitized evidence metadata and storage reference. |
| `GET` | `/api/evidence/<id>/download` | `evidence.download` | Stream original immutable evidence bytes (`attachment; filename=...`). |
| `GET` | `/api/evidence/<id>/preview` | `evidence.read` | Stream supported image or document for inline browser preview. |
| `POST` | `/api/evidence/<id>/verify` | `evidence.read` | Recalculate SHA-256 from disk bytes and verify against intake hash. |
| `GET` | `/api/evidence/<id>/analyses` | `analysis.read` | Retrieve all AI and image analyses associated with this artifact. |
| `POST` | `/api/evidence/<id>/analyses` | `analysis.run` | Associate analytical findings with evidence item. |
| `GET` | `/api/evidence/<id>/custody` | `custody.read` | Retrieve verified chain of custody records for this artifact. |
| `POST` | `/api/evidence/<id>/custody` | `custody.create` | Record custody transfer event for this artifact. |

---

## 5. Cryptographic Chain of Custody (`/api/custody`)

| Method | Endpoint | Clearance Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/custody` | `custody.read` | List custody transfer ledger events across authorized cases. |
| `POST` | `/api/custody` | `custody.create` | Append custody event block (computes SHA-256 block hash & links previous). |
| `GET` | `/api/custody/<id>` | `custody.read` | Retrieve single custody event block by ID. |
| `PATCH` | `/api/custody/<id>` | `custody.manage` (Admin) | Append formal administrative correction block to ledger. |
| `GET` | `/api/custody/verify/<evidence_id>` | `custody.read` | Cryptographically verify complete sequential hash chain for an artifact. |
| `GET` | `/api/custody/verify-chain` | `custody.read` | Verify chain of custody ledger integrity. |
| `GET` | `/api/custody/export` | `custody.read` | Export complete custody ledger records. |
| `GET` | `/api/custody/export/<evidence_id>` | `custody.read` | Export custody ledger for a specific evidence item. |

---

## 6. Image Forensics & ELA (`/api/analysis/image`)

| Method | Endpoint | Clearance Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/analysis/image/metadata` | `analysis.run` | Extract EXIF, camera, GPS, and timestamp metadata without altering image. |
| `POST` | `/api/analysis/image/ela` | `analysis.run` | Perform Error Level Analysis (JPEG recompression differential). |
| `GET` | `/api/analysis/image/history/<evidence_id>` | `analysis.read` | Retrieve past ELA and metadata analysis runs for this artifact. |
| `GET` | `/api/analysis/image/derived/<analysis_id>` | `analysis.read` | Stream derived ELA heatmap visualization. |

---

## 7. AI Object Detection (`/api/analysis/detection`)

| Method | Endpoint | Clearance Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/analysis/detection/run` | `analysis.run` | Execute object detection (`yolov4-tiny`, `forensic-gun-yolov8`, or `combined`) on evidence image. |
| `GET` | `/api/analysis/detection/history/<evidence_id>` | `analysis.read` | Retrieve past detection runs for an evidence item. |
| `GET` | `/api/analysis/detection/derived/<analysis_id>` | `analysis.read` | Stream derived image with localized bounding boxes and labels. |
| `GET` | `/api/analysis/detection/model-info` | `analysis.read` | Return model metadata, architectures, supported classes, and evaluation benchmarks. |

---

## 8. Biometric Fingerprint Analysis (`/api/analysis/fingerprint`)

| Method | Endpoint | Clearance Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/analysis/fingerprint/compare` | `analysis.run` | SIFT descriptor extraction + Lowe's ratio + RANSAC affine alignment. |
| `POST` | `/api/analysis/fingerprint/assess-quality` | `analysis.run` | Compute Laplacian spatial clarity, dynamic range, and minutiae density. |
| `GET` | `/api/analysis/fingerprint/history/<evidence_id>` | `analysis.read` | Retrieve past fingerprint comparison results. |
| `GET` | `/api/analysis/fingerprint/derived/<analysis_id>` | `analysis.read` | Stream side-by-side RANSAC match vector visualization. |
| `GET` | `/api/analysis/fingerprint/methodology` | `analysis.read` | Return mathematical principles, limitations, and ACE-V guidelines. |

---

## 9. Face & Sketch Analysis (`/api/analysis/face`, `/api/analysis/sketch`)

| Method | Endpoint | Clearance Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/analysis/face/detect` | `analysis.run` | Locate frontal faces, compute IPD, roll angle, and quality metrics. |
| `POST` | `/api/analysis/face/compare` | `analysis.run` | Pairwise 1:1 facial feature embedding comparison. |
| `GET` | `/api/analysis/face/history/<evidence_id>` | `analysis.read` | Retrieve past facial analysis records. |
| `GET` | `/api/analysis/face/derived/<analysis_id>` | `analysis.read` | Stream face landmark and alignment crop visualization. |
| `GET` | `/api/analysis/face/methodology` | `analysis.read` | Return NIST FRTE / OSAC limitations and demographic bias notice. |
| `POST` | `/api/analysis/sketch/upload` | `analysis.run` | Ingest forensic artist sketch (`multipart/form-data`). |
| `POST` | `/api/analysis/sketch/preprocess` | `analysis.run` | Apply edge-preserving bilateral filtering and pencil texture normalization. |
| `POST` | `/api/analysis/sketch/session` | `analysis.run` | Initialize sketch-to-photo morphological comparison session. |
| `POST` | `/api/analysis/sketch/compare-experimental` | `analysis.run` | Run experimental CUHK-trained cross-modality sketch-to-photo diagnostic probe. |
| `GET` | `/api/analysis/sketch/session/<id>` | `analysis.read` | Retrieve status and metrics of sketch comparison session. |
| `GET` | `/api/analysis/sketch/history/<evidence_id>` | `analysis.read` | Retrieve sketch comparison history for an evidence item. |
| `GET` | `/api/analysis/sketch/derived/<session_id>` | `analysis.read` | Stream visual sketch-photo overlay representation. |
| `GET` | `/api/analysis/sketch/methodology` | `analysis.read` | Return sketch matching scientific disclaimers and limitations. |

---

## 10. Forensic Reporting (`/api/reports`)

| Method | Endpoint | Clearance Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/reports` | `reports.read` | List published forensic reports with classification filters. |
| `POST` | `/api/reports/generate` | `reports.create` | Compile courtroom-ready PDF report using ReportLab. |
| `GET` | `/api/reports/<report_id>` | `reports.read` | Retrieve report summary, metadata, and evidence catalog. |
| `GET` | `/api/reports/<report_id>/pdf` | `reports.read` | Download generated PDF document with digital certification stamp. |
| `GET` | `/api/reports/<report_id>/preview` | `reports.read` | Retrieve printable HTML preview of report. |

---

## 11. Platform Management & System Diagnostics

| Method | Endpoint | Clearance Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Liveness probe: process status, timestamp, version, environment. |
| `GET` | `/api/health/db` | Public | Readiness probe: live MongoDB Atlas ping latency and index readiness. |
| `GET` | `/api/dashboard/stats` | Authenticated | High-level KPI counts tailored to user's role. |
| `GET` | `/api/dashboard/summary` | Authenticated | Case status distribution, recent activity, system health summary. |
| `GET` | `/api/analytics` | `analytics.read` | Comprehensive forensic throughput and evidence statistics. |
| `GET` | `/api/analytics/workload` | `analytics.read` | Investigator caseload and assignment balance metrics. |
| `GET` | `/api/analytics/definitions` | `analytics.read` | Methodology and calculation descriptions for all analytics metrics. |
| `GET` | `/api/audit/logs` | `audit.read` (Admin/Inv) | Searchable security audit log (user actions, IP, target, timestamp). |
| `GET` | `/api/audit/matrix` | Authenticated | Interactive RBAC permission reference matrix. |
| `GET` | `/api/settings` | `system.settings` (Admin) | Retrieve agency and security configuration settings. |
| `PATCH` | `/api/settings` | `system.settings` (Admin) | Update agency profile and operational parameters. |
