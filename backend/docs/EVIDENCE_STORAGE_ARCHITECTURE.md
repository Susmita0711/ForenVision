# ForenVision AI Evidence Storage Architecture & Forensic Integrity Specification

## 1. Architectural Overview

The ForenVision AI Evidence Management System provides a zero-trust, forensically sound lifecycle for ingesting, preserving, indexing, and analyzing digital evidence artifacts. The design separates metadata management (MongoDB) from raw binary byte storage (private isolated filesystem vault), guaranteeing that evidentiary records are immutable, auditable, and protected against tampering.

```
                           +---------------------------+
                           |  Frontend (Vite + React)  |
                           |  - Client SHA-256 Digest  |
                           |  - Multipart Chunk Stream |
                           +-------------+-------------+
                                         |
                       POST /api/evidence/upload (JWT Auth)
                                         v
               +-----------------------------------------------+
               |           Flask Authentication & CSRF         |
               | - Clearance Verification (user_can_mutate_case)
               +-----------------------+-----------------------+
                                       |
                       Raw Byte Content & Magic Bytes Check
                                       v
               +-----------------------------------------------+
               |           Evidence Service Pipeline           |
               | 1. Magic byte & MIME signature inspection     |
               | 2. File size enforcement (< 25 MB default)    |
               | 3. SHA-256 digest from original raw bytes     |
               | 4. Filename sanitization (secure_filename)    |
               +-----------+-----------------------+-----------+
                           |                       |
            Raw File Bytes |                       | Metadata Document
                           v                       v
            +-------------------------+  +-------------------------+
            |  Private Vault Storage  |  |     MongoDB Cluster     |
            |  uploads/vault/<case>/  |  |  - evidence             |
            |  <evd_id>_<clean_name>  |  |  - cases (counts & CoC) |
            |  Permissions: 0o640     |  |  - analysis_results     |
            |  No execution bits      |  |  Indexes on hashes/IDs  |
            +-------------------------+  +-------------------------+
```

---

## 2. Storage Topology & Design Decisions

### 2.1 Private Filesystem Vault vs. Database Document Storage
* **Decision**: Binary payload bytes are **never** stored directly in ordinary MongoDB BSON documents.
* **Rationale**:
  1. **MongoDB BSON 16MB Document Limit**: Embedding high-resolution camera captures, 1000 DPI fingerprint lifts, and multipage documents inside documents risks exceeding document limits and fragments memory cache pools.
  2. **I/O Isolation**: Database engines are optimized for indexed query execution, whereas forensic file vaults require streaming I/O, OS page caching, and kernel-level non-executable permissions.
  3. **Data Protection**: Sensitive evidentiary assets can be backed up or snapshot-isolated on encrypted storage volumes (e.g. AWS EBS encrypted volumes, dm-crypt/LUKS, or air-gapped NAS) independently from application metadata.

### 2.2 Directory Layout & Naming Conventions
* Local storage directory: `backend/uploads/vault/<sanitized_case_number>/`
* Internal filename: `<evidence_id>_<sanitized_original_filename>`
* Internal reference: `vault://<case_number>/<evidence_number>/<filename>`
* **Information Hiding**: The backend **never** exposes the real internal host filesystem path (e.g., `/Users/...` or `/var/app/...`) to clients in JSON responses. Clients only receive the safe virtual identifier `storageReference`.

### 2.3 Non-Executable Permissions & Traversal Prevention
* Files written to the vault are created with mode `0o640` (read/write for owner, read for group, no execution flags `chmod 0o640`).
* All path resolutions strictly verify `target_path.resolve().is_relative_to(vault_dir.resolve())` to prevent directory traversal (`../`) attacks.

---

## 3. Forensic Integrity & Cryptographic Auditing

### 3.1 SHA-256 Ingestion Baseline
1. **Raw Byte Hashing**: The cryptographic SHA-256 hash is computed immediately from the raw received byte stream before any transformations or image decodings take place.
2. **Preservation of Original Artifact**: The original uploaded bytes remain immutable. If downstream AI diagnostics (e.g., Error Level Analysis, Super-Resolution, Edge Filters) generate derived images or visualizations, those derived artifacts are stored under separate analysis identifiers and linked via foreign keys.
3. **No Overwrites**: Storage identifiers are globally unique (`evd_<uuid>`), preventing existing evidence from ever being overwritten by identical filenames.

### 3.2 On-Demand Cryptographic Hash Verification
* Endpoint: `POST /api/evidence/<id>/verify`
* **Workflow**:
  1. The service reads the binary file directly from the private disk vault.
  2. A new SHA-256 digest is calculated over the stored bytes using `hashlib.sha256()`.
  3. The re-calculated digest is compared against the initial ingestion ledger `sha256Hash`.
  4. If the digests match, `integrityStatus` remains `"verified"`.
  5. If any divergence is detected (e.g. disk corruption, offline tampering), the record is immediately flagged as `"tampered"`, logging an integrity alert with the exact computed divergence.

---

## 4. Media Type & Content Security

### 4.1 Magic Byte Signatures
File extensions alone are considered untrusted user input. The service inspects header bytes:
* **JPEG**: Magic signature `\xFF\xD8\xFF`
* **PNG**: Magic signature `\x89PNG\r\n\x1a\n`
* **TIFF**: Magic signature `II*\0` (little-endian) or `MM\0*` (big-endian)
* **PDF**: Magic signature `%PDF`
* **Prohibited Executables & Scripts**:
  - `MZ` (Windows PE Executable / DLL)
  - `\x7fELF` (Linux / Unix Executables)
  - `\xfe\xed\xfa\xce` / `\xca\xfe\xba\xbe` (Mach-O Binaries)
  - `#!/bin/` (Shell scripts)
  - `<?php` / `<script` (Script payloads)

---

## 5. Case Authorization & Access Control

Access to evidence items is bound to case-level access permissions:
* **Creation / Intake**: User must hold `admin`, `investigator`, or `analyst` role, and must have write clearance on the associated case (`user_can_mutate_case`).
* **Listing**: Evidence items belonging to cases for which the user lacks clearance (e.g., restricted cases where the investigator is not assigned) are excluded from search results.
* **Download & Preview**: Both `GET /api/evidence/<id>/download` and `GET /api/evidence/<id>/preview` require valid authentication and case access clearance. Unauthorized requests return `401 Unauthorized` (missing auth) or `403 Forbidden` (clearance restriction).

---

## 6. Architecture Limitations & Production Recommendations

| Limitation | Current Local Implementation | Recommended Production Architecture |
|---|---|---|
| **Storage Scalability** | Local server filesystem (`uploads/vault/`) | S3-compatible Object Storage (AWS S3, MinIO, GCS) with Object Lock (WORM - Write Once, Read Many). |
| **Air-Gap Redundancy** | Single disk mount point | Geo-replicated immutable storage buckets with cross-region replication and hardware security module (HSM) signing. |
| **Max Upload Size** | 25 MB per artifact | Chunked multipart direct-to-S3 uploads with presigned S3 URLs and AWS KMS envelope encryption. |
| **Hardware Fingerprinting** | SHA-256 software hash | Cryptographic timestamping (RFC 3161 TSP) + hardware security token / PKCS#11 hardware signing. |
| **Cold Storage Archival** | Active disk storage directory | Automated tiering to AWS S3 Glacier Vault Lock with compliance hold policies. |
