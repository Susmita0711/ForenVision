# ForenVision AI — Role-Based Access Control (RBAC) Specification & Permission Matrix

## 1. Executive Summary & Architectural Overview

ForenVision AI enforces a zero-trust, defense-in-depth Role-Based Access Control (RBAC) architecture designed for forensic investigations and judicial evidence processing. The security framework ensures strict separation of duties, verifiable chain-of-custody integrity, resource-level docket isolation, and tamper-evident audit logging.

Security decisions are enforced **server-side** on every API endpoint. The frontend reflects role clearances dynamically to enhance examiner user experience, but the backend never trusts client-supplied roles, claims, or parameters.

```
                      ┌────────────────────────────────────────┐
                      │          Incoming HTTP Request         │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │    JWT / Session Token Verification    │
                      │  - Validates cryptographic signature   │
                      │  - Verifies user exists & active=True  │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │      Permission / Workflow Guards      │
                      │  - @permission_required(*perms)        │
                      │  - @workflow_required(workflow)        │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │ Resource Clearance & Docket Boundaries │
                      │  - user_can_access_case(user, case)    │
                      │  - is_restricted docket isolation      │
                      │  - Immutability checks (custody, vault)│
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │   Append-Only Structured Audit Log     │
                      │  - Actor, Action, Target, IP Recorded  │
                      │  - Redacts passwords, tokens & bio     │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │       Route Handler Execution          │
                      └────────────────────────────────────────┘
```

---

## 2. User Roles & Clearance Scopes

| Role | Normalized Slug | Primary Operational Mandate |
| :--- | :--- | :--- |
| **Administrator** | `admin` | System governance, examiner credential provisioning, role assignment, account activation/deactivation, last-admin protection, organization-wide telemetry, full case assignment, security audit trail inspection, and system settings. |
| **Investigator** | `investigator` | Active case intake and docket management, assigning secondary examiners, evidence vault intake, recording verifiable chain-of-custody transactions, requesting forensic analyses, and compiling certified court reports. Strictly blocked from user/role administration. |
| **Forensic Analyst** | `analyst` | Laboratory diagnostics across assigned investigations. Authorized for digital forgery (Error Level Analysis), object detection, and fingerprint minutiae matching (AFIS). Restricted from face and sketch analysis pipelines unless granted explicit workflow authorization. Prohibited from mutating case dockets, user administration, or settings. |
| **Read-only Viewer** | `viewer` | Read-only inspection of authorized case records, evidence metadata, chain-of-custody history, and existing reports. Strictly prohibited from mutating cases, uploading/deleting evidence, downloading raw original evidence bytes, initiating AI analyses, recording custody transactions, or generating reports. |

---

## 3. Comprehensive Permission Matrix

The following table details the 21 granular permissions defined in `backend/services/permission_service.py` across all four roles:

| Domain | Permission Identifier | Description | Administrator | Investigator | Analyst | Read-only Viewer |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **User Management** | `users.view_any` | Query examiner accounts and directory | ✅ | ❌ | ❌ | ❌ |
| | `users.create` | Provision new forensic accounts | ✅ | ❌ | ❌ | ❌ |
| | `users.status` | Activate or suspend user accounts | ✅ | ❌ | ❌ | ❌ |
| | `users.role` | Reassign user roles & workflow clearances | ✅ | ❌ | ❌ | ❌ |
| **Case Dockets** | `cases.view` | Inspect authorized investigation files | ✅ | ✅ | ✅ | ✅ |
| | `cases.create` | Initialize new investigation dockets | ✅ | ✅ | ❌ | ❌ |
| | `cases.update` | Modify case details, status, or tags | ✅ | ✅ | ❌ | ❌ |
| | `cases.assign` | Assign examiners / investigators | ✅ | ✅ | ❌ | ❌ |
| | `cases.archive` | Archive closed or historical dockets | ✅ | ✅ | ❌ | ❌ |
| **Evidence Vault** | `evidence.view` | View evidence metadata and integrity status | ✅ | ✅ | ✅ | ✅ |
| | `evidence.upload` | Ingest and hash evidence artifacts | ✅ | ✅ | ❌ | ❌ |
| | `evidence.download` | Download raw original forensic evidence bytes | ✅ | ✅ | ✅ | ❌ |
| | `evidence.delete` | Purge or unregister evidence items | ✅ | ❌ | ❌ | ❌ |
| **Chain of Custody** | `custody.view` | Inspect cryptographic custody ledger | ✅ | ✅ | ✅ | ✅ |
| | `custody.create` | Record new transfer / custody events | ✅ | ✅ | ❌ | ❌ |
| **AI Diagnostics** | `analysis.image` | Run Error Level Analysis & forgery detection | ✅ | ✅ | ✅ | ❌ |
| | `analysis.fingerprint` | Run AFIS ridge & minutiae matching | ✅ | ✅ | ✅ | ❌ |
| | `analysis.face` | Execute facial verification / spoofing checks | ✅ | ✅ | 🔒 *(Requires workflow clearance)* | ❌ |
| | `analysis.sketch` | Execute forensic composite matching | ✅ | ✅ | 🔒 *(Requires workflow clearance)* | ❌ |
| **Forensic Reports** | `reports.view` | Read and inspect compiled case reports | ✅ | ✅ | ✅ | ✅ |
| | `reports.create` | Generate and seal court-admissible dossiers | ✅ | ✅ | ❌ | ❌ |
| **Auditing & Settings** | `audit.view` | Query system security audit logs & matrix | ✅ | ❌ | ❌ | ❌ |
| | `settings.manage` | Read and update system settings | ✅ | ❌ | ❌ | ❌ |

> 🔒 **Specialized Workflow Clearances**: Analysts must possess `"face_analysis"` or `"sketch_analysis"` in their user profile's `authorized_workflows` attribute to access those specific biometric and composite pipelines. Administrators can grant or revoke these clearances via `/api/users/<id>/role`.

---

## 4. Endpoint Protection Architecture

### 4.1 Route Middleware Decorators

All Flask routes use centralized middleware decorators from `backend/middleware/auth_middleware.py`:

```python
# Permission requirement decorator
@permission_required(PERM_CASES_CREATE)
def create_case():
    ...

# Workflow clearance decorator (supports specialized biometric authorization)
@workflow_required("sketch_analysis")
def run_sketch_analysis():
    ...
```

1. **Authentication Enforcement**: Rejects unauthenticated requests immediately with `401 Unauthorized` (`"Authentication token required or expired"`).
2. **Account Status Verification**: Active status is verified on every request (`user.get('is_active', True) is False` yields `403 Forbidden: "Account has been deactivated"`).
3. **Automated Audit on Authorization Failure**: Whenever an actor fails clearance, an `AUTHORIZATION_FAILURE` or `WORKFLOW_CLEARANCE_DENIED` security audit event is logged with actor details, required permission, IP address, and requested path.

### 4.2 Resource Clearance & Docket Boundaries

Beyond static role checks, object-level authorization protects case confidentiality:
- **`user_can_access_case(user, case)`**:
  - Administrators possess organization-wide clearance.
  - Standard (unrestricted) cases are accessible to authorized investigators, analysts, and viewers.
  - **Restricted Dockets (`is_restricted=True`)**: Accessible **only** to Administrators, the case creator, the Lead Investigator, or explicitly designated examiners listed in `assignedExaminers`. Unauthorized access attempts are rejected with `403 Forbidden`.

### 4.3 Self-Mutation & Last-Admin Protections

- **Self-Escalation Barrier**: The user profile update endpoint (`PUT /api/users/profile`) sanitizes all inputs and explicitly strips privileged keys (`role`, `is_active`, `status`, `authorized_workflows`, `permissions`). Users cannot promote themselves.
- **Last Active Administrator Defense**: In `backend/services/user_service.py`, `count_active_admins()` is checked before any deactivation or role demotion. Attempting to deactivate or demote the last active administrator returns `400 Bad Request: "Cannot demote/deactivate the sole remaining active administrator."`
- **Active Admin Self-Deactivation Prevention**: An administrator attempting to deactivate their own account returns `403 Forbidden: "Administrators cannot deactivate their own account."`

---

## 5. Forensic Integrity & Immutability Guarantees

1. **Chain of Custody Immutability**:
   - Chain-of-custody events are append-only.
   - There are **no** `PUT`, `PATCH`, or `DELETE` endpoints for custody records.
   - Historical entries cannot be altered; corrections must be recorded as separate, referenced audit events.
2. **Evidence Byte Preservation**:
   - Original evidence files registered in the vault are immutable.
   - Read-only Viewers are denied raw evidence file downloads (`GET /api/evidence/<id>/download` requires `PERM_EVIDENCE_DOWNLOAD`).
3. **Structured Audit Logging**:
   - Append-only audit logger (`backend/services/audit_service.py`).
   - Secure MongoDB collection `audit_logs` backed by memory store in test/development environments.
   - Passwords, authorization headers, biometric embeddings, and raw image bytes are strictly scrubbed before logging.

---

## 6. Frontend Role Awareness

The React frontend mirrors backend permissions to provide a clear, contextual user interface:

| Page / Component | Administrator Experience | Investigator Experience | Analyst Experience | Read-only Viewer Experience |
| :--- | :--- | :--- | :--- | :--- |
| **Sidebar Navigation** | Full administrative sections, User Directory, Security Audit Logs, Settings. | Case Management, Evidence Vault, Chain of Custody, Forensic Reports, AI Tools. | Assigned Cases, Evidence Metadata, Image Forgery, Fingerprints, (gated Face/Sketch). | Read-only Case Index, Evidence Metadata, Custody Trail, Existing Reports. |
| **Dashboard** | Org-wide telemetry, Quick Create Case, User Directory, Audit Logs shortcuts. | Case & Evidence shortcuts, Quick Create Case, Vault, Custody buttons. | Pipeline shortcuts (Run ELA, Object Detection, AFIS), Assigned Cases. | Prominent Read-Only banner, locked badges, read-only navigation buttons. |
| **Cases Console** | Full create, edit, status change, and archive controls. | Full create, edit, and status change controls. | Read-only case inspection, assigned case filtering. | Read-only view button; creation and modification buttons hidden. |
| **Evidence Vault** | Upload, inspect, download, and delete artifacts. | Upload, inspect, and download artifacts. | Inspect metadata, download raw bytes for analysis. | Inspect metadata only; intake button hidden; raw download locked. |
| **Reports Console** | Inspect, download PDF, and generate court dossiers. | Inspect, download PDF, and generate court dossiers. | Inspect and download existing PDF exhibits. | Inspect and download existing PDF exhibits; generation button hidden. |
| **Audit Logs Page** | Real-time security feed, event filters, interactive Permission Matrix table. | Route protected (`403` redirect). | Route protected (`403` redirect). | Route protected (`403` redirect). |
| **User Management** | Provision users, assign roles, toggle Face/Sketch workflow clearances. | Route protected (`403` redirect). | Route protected (`403` redirect). | Route protected (`403` redirect). |

---

## 7. Verification & Automated Test Coverage

The complete RBAC implementation is validated by automated backend tests in `backend/tests/`:
- `test_rbac_complete.py`: 11 targeted end-to-end RBAC verification tests covering administrator operations, last-admin defense, profile escalation blocks, non-admin boundaries, investigator operations, analyst workflow clearance, viewer read-only enforcement, restricted docket isolation, unauthenticated requests (401), and deactivated accounts (403).
- Full regression suite: `test_auth.py`, `test_roles.py`, `test_cases.py`, `test_evidence.py`, `test_custody.py`, `test_reports.py`, `test_health.py`, `test_dashboard.py`, and `test_analytics.py`.
- **Backend Test Result**: 124 of 124 tests passing (100% pass rate).
- **Frontend Build Result**: `npm run build` succeeds cleanly with 0 TypeScript errors.
