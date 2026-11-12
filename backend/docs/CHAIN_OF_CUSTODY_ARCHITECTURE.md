# ForenVision AI Chain of Custody Tracking Specification

## 1. Architectural Overview & Forensic Principles

The ForenVision AI Chain of Custody (CoC) system provides a tamper-evident, append-only provenance ledger compliant with **ISO/IEC 27037:2012** (*Guidelines for identification, collection, acquisition and preservation of digital evidence*).

Every interaction with an evidence artifact—from initial collection to lab diagnostics, transfers, checkouts, and vault returns—is recorded as an immutable cryptographic block linked sequentially to its predecessors.

```
+-----------------------------------------------------------------------------------------+
|                                    CHAIN OF CUSTODY                                     |
+-----------------------------------------------------------------------------------------+
| Genesis Block (Seq #1)              Block #2                           Block #3 (Present)|
| [Action: Collected]                 [Action: Transferred]              [Action: Checked Out]
| - PrevHash: 0000...0000             - PrevHash: [Genesis BlockHash]    - PrevHash: [Block #2 Hash]
| - EventId: coc_01                   - EventId: coc_02                  - EventId: coc_03
| - Actor: Det. Vance (FX-8842)       - Custodian: Dr. Thorne (LAB-771)  - Location: Profilometry
| - Evidence SHA-256: e3b0...         - Evidence SHA-256: e3b0...        - Evidence SHA-256: e3b0...
| - BlockHash: 8a4f...                - BlockHash: c7d2...               - BlockHash: f1e9...
+-----------------------------------------------------------------------------------------+
```

---

## 2. Event Model & Data Attributes

Each custody event stores a comprehensive forensic record:
* **Event Identifier**: Globally unique identifier (`coc_<uuid>`).
* **Evidence Identifier**: `evidenceId` (foreign key) and `evidenceNumber` (e.g. `EVD-4091`).
* **Case Docket**: `caseId` and `caseNumber` (e.g. `CAS-2026-8812`).
* **Event Type & Action**: Canonical category (`collected`, `received`, `assigned`, `transferred`, `checked_out`, `returned`, `stored`, `sealed`, `accessed`, `analysed`, `correction`).
* **Acting Officer**: User object `{ id, name, badge, email, role }`.
* **Custodian Handover**:
  - `previousCustodian`: Relinquishing party `{ name, badge, role, organization }`.
  - `newCustodian`: Receiving party `{ name, badge, role, organization }`.
* **Physical / Virtual Location**: Secure facility, locker, or lab station (e.g. `Ballistics Chamber 4`).
* **Operational Justification**: Legally admissible reason for artifact movement.
* **Timestamp**: High-precision UTC timestamp (`YYYY-MM-DDTHH:MM:SS.mmmmmmZ`).
* **Cryptographic Integrity**:
  - `evidenceSha256`: Digest of raw evidence bytes at intake.
  - `sequenceNumber`: Monotonically increasing sequence index (1, 2, 3...).
  - `previousBlockHash`: Digest of preceding event block (64 zeros for genesis block).
  - `blockHash`: Deterministic SHA-256 digest of block attributes and previous hash.
  - `digitalSignature`: Cryptographic proof placeholder (`sig_rsa4096_<hash>`).
  - `isCorrection` & `correctedEventId`: Explicit reference if amending a historical block.

---

## 3. Cryptographic Hash-Chaining

### 3.1 Hash Computation Formula
The block hash links the current event to the previous block and the underlying evidence byte digest:

$$\text{BlockHash} = \text{SHA-256}\Big(\text{PrevHash} \mid \text{EventId} \mid \text{EvidenceId} \mid \text{CaseNumber} \mid \text{EventType} \mid \text{Timestamp} \mid \text{UserId} \mid \text{Location} \mid \text{Reason} \mid \text{EvidenceSHA-256}\Big)$$

### 3.2 Genesis Block Initialization
When evidence is initially ingested into the vault, a Genesis Custody Block is automatically minted:
* `previousBlockHash` = `0000000000000000000000000000000000000000000000000000000000000000` (64 zeros)
* `sequenceNumber` = 1
* `action` = `Collected`

### 3.3 On-Demand Chain Verification
Endpoint: `GET /api/custody/verify/<evidence_id>`
* Iterates through all recorded events in ascending chronological order.
* Verifies that each block incorporates the exact `blockHash` of the preceding block.
* Re-computes each block's SHA-256 from its data fields and verifies against the recorded hash.
* Detects any dropped blocks, reordering, or byte tampering.

---

## 4. Immutability & Documented Corrections

### 4.1 Strict Append-Only Guarantee
* **No In-Place Modifications**: Normal database update and deletion workflows are prohibited.
* `PUT /api/custody/<event_id>` and `PATCH /api/custody/<event_id>` return `405 Method Not Allowed`.
* `DELETE /api/custody/<event_id>` returns `405 Method Not Allowed`.

### 4.2 Documented Corrections Workflow
If an investigator makes a typographical error (e.g., incorrect locker number), the original event **cannot** be altered. Instead, the user must issue a follow-up correction event:
1. `eventType` = `"correction"`
2. `correctedEventId` = Target historical event ID (e.g. `coc_8f9a21b34c0e`)
3. `correctionReason` = Detailed explanation of the correction and updated facts.
4. The correction event is appended as the newest block in the hash chain, maintaining a complete, auditable history of both the original mistake and its subsequent rectification.

---

## 5. Security & Immutability Limitations

> [!IMPORTANT]
> **Forensic Reality Check on Hash-Chaining**:
> Hash linking guarantees **tamper-evidence within the application context**—any modification to a block in MongoDB or storage will be detected upon verification because the hash sequence will fail.
> However, hash linking alone **does not guarantee physical immutability** if an attacker has direct access to the database or storage layer (an attacker with database root access could theoretically rewrite the entire table and recompute all hashes).

### Production Mitigations:
1. **Database-Level WORM / Append-Only Roles**: Configure MongoDB service accounts with `insert` and `find` privileges only (denying `update` and `delete` on `chain_of_custody`).
2. **External Immutable Audit Logging**: Mirror custody blocks to an external WORM (Write Once, Read Many) store (e.g., AWS S3 Object Lock in Compliance Mode or AWS CloudTrail).
3. **RFC 3161 Trusted Timestamps**: Supplement server timestamps with cryptographically signed timestamp tokens from an external TSA (Time Stamping Authority).
