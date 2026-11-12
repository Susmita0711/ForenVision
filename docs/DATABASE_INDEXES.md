# ForenVision AI Database Index Specification & Optimization Guide

This document defines the complete database index architecture for ForenVision AI across all 7 operational MongoDB collections. All indexes are automatically registered upon connection via [`db_service.init_indexes()`](file:///Users/abir/Coding/Forenvision/backend/services/db.py#L159-L244).

---

## 1. Architectural Principles

1. **Deterministic Fast Lookups**: Case numbers, evidence numbers, report numbers, and cryptographic block hashes have unique, sparse indexes providing $O(\log N)$ point lookups.
2. **Access Clearance Optimization**: Compound and single-field indexes on `assignedExaminers`, `leadInvestigator`, and `caseId` prevent collection scans when evaluating user clearance across thousands of case files.
3. **Forensic Integrity Verification**: Dedicated hash indexes on `sha256Hash` and `blockHash` enable instantaneous duplicate detection and tamper verification.
4. **Time-Series Pagination**: Descending timestamp indexes (`uploadedAt: -1`, `createdAt: -1`, `timestamp: -1`) support efficient cursor-based and offset pagination for dashboards, audit logs, and chain-of-custody history.

---

## 2. Collection Index Specifications

### 2.1. `cases` Collection

Stores forensic case dockets, classifications, access controls, and investigator assignments.

| Index Key | Type | Properties | Query Rationale |
| :--- | :--- | :--- | :--- |
| `caseNumber: 1` | B-tree | `unique: true`, `sparse: true` | Primary business key for case retrieval (`GET /api/cases/:caseNumber`). |
| `status: 1` | B-tree | Standard | Filter cases by state (`active`, `closed`, `cold`, `archived`). |
| `priority: 1` | B-tree | Standard | Filter by urgency (`critical`, `high`, `medium`, `low`). |
| `createdAt: -1` | B-tree | Standard | Default chronological sort order for case registries. |
| `leadInvestigator: 1` | B-tree | Standard | Case officer portfolio queries and role access filtering. |
| `assignedExaminers: 1`| Multikey | Standard | Multikey array index for checking investigator assignment access. |
| `created_by: 1` | B-tree | Standard | User case ownership resolution. |
| `is_archived: 1` | B-tree | Standard | Archive filter exclusion in active investigator views. |
| `is_restricted: 1` | B-tree | Standard | High-security sensitivity filtering (Special Access Programs). |
| `status: 1, createdAt: -1` | Compound | Standard | Optimizes common dashboard filter `status='active'` sorted by recency. |

---

### 2.2. `evidence` Collection

Stores cryptographic manifests, metadata, and vault storage pointers for all ingested forensic media.

| Index Key | Type | Properties | Query Rationale |
| :--- | :--- | :--- | :--- |
| `evidenceNumber: 1` | B-tree | `unique: true`, `sparse: true` | Unique docket-scoped evidence artifact identifier (`EVD-YYYY-XXXX`). |
| `caseId: 1` | B-tree | Standard | Filter all evidence belonging to a specific case docket. |
| `caseNumber: 1` | B-tree | Standard | Alternative docket filter for human-readable case searches. |
| `sha256Hash: 1` | B-tree | Standard | Ingestion deduplication check and cross-case artifact correlation. |
| `integrityStatus: 1` | B-tree | Standard | Filter by verification status (`verified`, `tampered`, `unverified`). |
| `type: 1` | B-tree | Standard | Filter by evidence modality (`image`, `fingerprint`, `face`, `document`). |
| `uploadedAt: -1` | B-tree | Standard | Chronological listing of evidence artifacts. |
| `type: 1, uploadedAt: -1` | Compound | Standard | Modality-specific chronological queries (e.g., latest fingerprint cards). |

---

### 2.3. `analysis_results` Collection

Stores analytical outputs from Error Level Analysis (ELA), YOLOv4-tiny object localization, and SIFT/RANSAC fingerprint matching.

| Index Key | Type | Properties | Query Rationale |
| :--- | :--- | :--- | :--- |
| `evidenceId: 1` | B-tree | Standard | Fast retrieval of all analytical passes performed on a specific artifact. |
| `caseId: 1` | B-tree | Standard | Case-level analytical rollup for comprehensive reports. |
| `caseNumber: 1` | B-tree | Standard | Human-readable case correlation. |
| `category: 1` | B-tree | Standard | Filter by analysis discipline (`image_forgery`, `object_detection`, `fingerprint`). |
| `status: 1` | B-tree | Standard | Status filtering (`completed`, `processing`, `failed`). |
| `timestamp: -1` | B-tree | Standard | Chronological analysis history. |
| `createdAt: -1` | B-tree | Standard | Fallback timestamp sorting. |
| `processingTimeMs: 1`| B-tree | Standard | System performance monitoring and compute anomaly detection. |

---

### 2.4. `chain_of_custody` Collection

Stores the immutable, digitally signed cryptographic ledger tracking physical and digital evidence custody transfers.

| Index Key | Type | Properties | Query Rationale |
| :--- | :--- | :--- | :--- |
| `blockHash: 1` | B-tree | `unique: true`, `sparse: true` | Cryptographic SHA-256 block hash ensuring ledger immutability. |
| `evidenceId: 1` | B-tree | Standard | Full sequential custody history retrieval for a given artifact. |
| `caseNumber: 1` | B-tree | Standard | Case-wide chain of custody audits for trial exhibits. |
| `timestamp: -1` | B-tree | Standard | Reverse chronological verification of transfer events. |

---

### 2.5. `forensic_reports` Collection

Stores compiled investigative reports, PDF generation manifests, and examiner certifications.

| Index Key | Type | Properties | Query Rationale |
| :--- | :--- | :--- | :--- |
| `reportNumber: 1` | B-tree | `unique: true`, `sparse: true` | Unique courtroom report identifier (`REP-YYYY-XXXX`). |
| `caseId: 1` | B-tree | Standard | Retrieve all reports published for a case. |
| `classification: 1`| B-tree | Standard | Security classification filtering (`RESTRICTED`, `CONFIDENTIAL`, etc.). |
| `author.id: 1` | B-tree | Standard | Examiner portfolio and workload audits. |
| `createdAt: -1` | B-tree | Standard | Chronological sorting of generated reports. |

---

### 2.6. `users` Collection

Stores credential hashes (scrypt), roles, active states, and login failure tracking.

| Index Key | Type | Properties | Query Rationale |
| :--- | :--- | :--- | :--- |
| `email: 1` | B-tree | `unique: true` | Fast user authentication lookup during login (`POST /api/auth/login`). |
| `badge_number: 1`| B-tree | `sparse: true` | Law enforcement badge/credential identification. |
| `role: 1` | B-tree | Standard | Administrative user management and RBAC authorization filtering. |
| `is_active: 1` | B-tree | Standard | Immediate exclusion of deactivated accounts. |

---

### 2.7. `audit_logs` Collection

Stores security events, user activity, access grants, and download records.

| Index Key | Type | Properties | Query Rationale |
| :--- | :--- | :--- | :--- |
| `timestamp: -1` | B-tree | Standard | Primary sort index for security audit inspection. |
| `actor: 1` | B-tree | Standard | Investigate actions performed by a specific user. |
| `targetType: 1` | B-tree | Standard | Filter events by resource class (`evidence`, `case`, `user`, `system`). |
| `target: 1` | B-tree | Standard | Track lifecycle actions on a specific artifact or docket. |

---

## 3. Query Plan Verification (`explain("executionStats")`)

To verify that an index is utilized rather than a collection scan (`COLLSCAN`), execute the MongoDB query plan analyzer:

```javascript
// Example: Verify evidence query by case and uploadedAt sort
db.evidence.find({
    caseId: "651234abcd5678ef01234567"
}).sort({
    uploadedAt: -1
}).explain("executionStats");
```

### Verification Criteria:
- `stage`: Must be `IXSCAN` (Index Scan) followed by `FETCH`.
- `stage: "COLLSCAN"` is strictly unacceptable on production collections.
- `totalDocsExamined`: Should equal `nReturned` (Index Selectivity ratio approaching 1.0).

---

## 4. Production Index Maintenance & Compaction

1. **Background Indexing**: Automatic index creation in `db_service.init_indexes()` runs during server initialization. In production clusters with large datasets, indexes should be created via background commands or rolling index builds on Atlas replica set secondaries.
2. **Index Storage Monitoring**: Monitor RAM usage in MongoDB Atlas Metrics. The total index working set (`indexSize`) should always fit within available wiredTiger cache memory.
3. **Re-indexing Command**:
   ```javascript
   // Verify all active indexes on a collection
   db.evidence.getIndexes();

   // Inspect index sizes across database
   db.stats().indexSizes;
   ```
