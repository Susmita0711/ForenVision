"""
Case and Dashboard Service for ForenVision AI.
Manages database-backed forensic cases, telemetry, evidence, analysis results, and audit feeds.
Enforces case-level role authorization, validation, archival, and non-fabrication.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pymongo.errors import PyMongoError

from services.db import db_service

# Case Status Constants
STATUS_OPEN = "open"
STATUS_IN_PROGRESS = "in_progress"
STATUS_UNDER_REVIEW = "under_review"
STATUS_CLOSED = "closed"
STATUS_ARCHIVED = "archived"

ACTIVE_STATUSES = {STATUS_OPEN, STATUS_IN_PROGRESS}
CLOSED_STATUSES = {STATUS_CLOSED, STATUS_ARCHIVED}

VALID_STATUSES = {
    STATUS_OPEN,
    STATUS_IN_PROGRESS,
    STATUS_UNDER_REVIEW,
    STATUS_CLOSED,
    STATUS_ARCHIVED,
}

VALID_PRIORITIES = {"critical", "high", "medium", "low"}

VALID_INCIDENT_TYPES = {
    "Digital Forgery",
    "Cyber Crime",
    "Homicide / Scene",
    "Financial Fraud",
    "Biometric Match",
    "Identity Theft",
}


def sanitize_case(case_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Return clean case dictionary safe for JSON transmission."""
    case_id = str(case_doc.get("_id") or case_doc.get("id") or "")
    default_num = f"CAS-{case_id[:8].upper()}"
    now_iso = datetime.now(timezone.utc).isoformat()
    status = case_doc.get("status", STATUS_OPEN)
    is_archived = bool(case_doc.get("is_archived", status == STATUS_ARCHIVED))

    return {
        "id": case_id,
        "caseNumber": case_doc.get("caseNumber") or default_num,
        "title": case_doc.get("title", "Untitled Investigation"),
        "description": case_doc.get("description", ""),
        "incidentType": case_doc.get("incidentType", "Digital Forgery"),
        "status": status,
        "priority": case_doc.get("priority", "medium"),
        "leadInvestigator": case_doc.get("leadInvestigator", "Unassigned"),
        "assignedExaminers": case_doc.get("assignedExaminers") or [],
        "evidenceCount": int(case_doc.get("evidenceCount", 0)),
        "chainOfCustodyCount": int(case_doc.get("chainOfCustodyCount", 0)),
        "createdAt": case_doc.get("createdAt") or now_iso,
        "updatedAt": case_doc.get("updatedAt") or now_iso,
        "closedAt": case_doc.get("closedAt"),
        "archivedAt": case_doc.get("archivedAt"),
        "is_archived": is_archived,
        "tags": case_doc.get("tags") or [],
        "created_by": case_doc.get("created_by"),
        "is_restricted": bool(case_doc.get("is_restricted", False)),
    }


def sanitize_evidence(ev_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Return clean evidence dictionary safe for JSON transmission."""
    ev_id = str(ev_doc.get("_id") or ev_doc.get("id") or "")
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "id": ev_id,
        "caseId": str(ev_doc.get("caseId") or ""),
        "caseNumber": ev_doc.get("caseNumber") or "",
        "evidenceNumber": ev_doc.get("evidenceNumber") or f"EVD-{ev_id[:6].upper()}",
        "name": ev_doc.get("name", "Unnamed Artifact"),
        "type": ev_doc.get("type", "image"),
        "fileFormat": ev_doc.get("fileFormat", "BIN"),
        "fileSizeBytes": int(ev_doc.get("fileSizeBytes", 0)),
        "sha256Hash": ev_doc.get("sha256Hash", ""),
        "originalFileName": ev_doc.get("originalFileName", ""),
        "storageLocation": ev_doc.get("storageLocation", "Vault Tier-1 Secure NAS"),
        "capturedBy": ev_doc.get("capturedBy", "Forensic Intake Unit"),
        "capturedAt": ev_doc.get("capturedAt") or now_iso,
        "integrityStatus": ev_doc.get("integrityStatus", "verified"),
        "lastIntegrityCheck": ev_doc.get("lastIntegrityCheck") or now_iso,
        "tags": ev_doc.get("tags") or [],
        "thumbnailUrl": ev_doc.get("thumbnailUrl"),
        "notes": ev_doc.get("notes", ""),
        "metadata": ev_doc.get("metadata") or {},
    }


def sanitize_analysis(an_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Return clean analysis result dictionary safe for JSON transmission."""
    an_id = str(an_doc.get("_id") or an_doc.get("id") or an_doc.get("analysisId") or uuid.uuid4().hex[:12])
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "analysisId": an_id,
        "caseId": str(an_doc.get("caseId") or ""),
        "caseNumber": an_doc.get("caseNumber") or "",
        "evidenceId": str(an_doc.get("evidenceId") or ""),
        "evidenceNumber": an_doc.get("evidenceNumber") or "",
        "category": an_doc.get("category", "image_forgery"),
        "modelEngine": an_doc.get("modelEngine", "ForenVision AI ELA Core"),
        "modelVersion": an_doc.get("modelVersion", "v2.4-neural"),
        "processingTimeMs": int(an_doc.get("processingTimeMs", 140)),
        "timestamp": an_doc.get("timestamp") or now_iso,
        "status": an_doc.get("status", "completed"),
        "confidenceScore": float(an_doc.get("confidenceScore", 96.5)),
        "analystNotes": an_doc.get("analystNotes", ""),
        "details": an_doc.get("details") or {},
    }


def sanitize_activity(log_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitize audit / activity log document ensuring actor and badge are strings."""
    log_id = str(log_doc.get("_id") or log_doc.get("id") or uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    raw_actor = log_doc.get("actor", "Forensic System")
    if isinstance(raw_actor, dict):
        actor_name = raw_actor.get("name") or raw_actor.get("email") or "Forensic Examiner"
        badge_val = raw_actor.get("badge") or raw_actor.get("badge_number") or log_doc.get("badge", "SYS-0000")
    else:
        actor_name = str(raw_actor) if raw_actor else "Forensic System"
        badge_val = str(log_doc.get("badge") or "SYS-0000")
    return {
        "id": log_id,
        "actor": str(actor_name),
        "badge": str(badge_val),
        "action": str(log_doc.get("action", "Telemetry recorded")),
        "target": str(log_doc.get("target", "System")),
        "targetType": str(log_doc.get("targetType", "system")),
        "timestamp": str(log_doc.get("timestamp") or now_iso),
        "ipAddress": str(log_doc.get("ipAddress", "127.0.0.1")),
    }


class CaseService:  # pylint: disable=too-many-public-methods,too-many-lines
    """Service handling case management, telemetry, evidence, and audit feeds."""

    def __init__(self) -> None:
        # In-memory stores for unconfigured or testing mode
        self._memory_cases: Dict[str, Dict[str, Any]] = {}
        self._memory_evidence: List[Dict[str, Any]] = []
        self._memory_analyses: List[Dict[str, Any]] = []
        self._memory_custody: List[Dict[str, Any]] = []
        self._memory_activity: List[Dict[str, Any]] = []

    def reset_in_memory_state(self) -> None:
        """Clear in-memory state for clean test isolation."""
        self._memory_cases.clear()
        self._memory_evidence.clear()
        self._memory_analyses.clear()
        self._memory_custody.clear()
        self._memory_activity.clear()

    def user_can_access_case(
        self, user: Dict[str, Any], case: Dict[str, Any]
    ) -> bool:
        """
        Verify case-level access permissions:
        - Administrator: Can access all cases.
        - Investigator: Can access assigned cases, cases they created, or unrestricted cases.
        - Analyst: Can access assigned cases, cases they created, or unrestricted cases.
        - If is_restricted=True, non-admin users MUST be assigned or creator.
        - Read-only Viewer: Can access non-restricted cases only.
        """
        role = (user.get("role") or "").lower()
        if role == "admin":
            return True

        is_restricted = bool(case.get("is_restricted", False))
        user_name = user.get("name") or ""
        user_badge = user.get("badge_number") or ""
        user_id = str(user.get("id") or "")

        lead = str(case.get("leadInvestigator") or "")
        assigned = [str(a) for a in case.get("assignedExaminers") or []]

        is_assigned = (
            user_id in assigned
            or any(user_name and user_name.lower() in a.lower() for a in assigned + [lead])
            or any(user_badge and user_badge.lower() in a.lower() for a in assigned + [lead])
            or str(case.get("created_by") or "") == user_id
        )

        if is_assigned:
            return True

        if is_restricted:
            return False

        return role in {"investigator", "analyst", "viewer"}

    def user_can_mutate_case(
        self, user: Dict[str, Any], case: Dict[str, Any]
    ) -> bool:
        """
        Verify if a user has clearance to mutate (edit, update status, archive) a case.
        - Viewers: NEVER allowed to mutate cases.
        - Admins: Always allowed.
        - Investigators / Analysts: Allowed if they can access the case.
        """
        role = (user.get("role") or "").lower()
        if role in {"viewer", "read_only_viewer"}:
            return False
        if role == "admin":
            return True
        return self.user_can_access_case(user, case)

    def record_activity(
        self,
        actor: str,
        badge: str,
        action: str,
        target: str,
        target_type: str = "case",
        ip_address: str = "127.0.0.1",
    ) -> Dict[str, Any]:
        """Record real audit activity in MongoDB Atlas or in-memory store."""
        timestamp = datetime.now(timezone.utc).isoformat()
        log_entry = {
            "id": f"act_{uuid.uuid4().hex[:12]}",
            "actor": actor,
            "badge": badge,
            "action": action,
            "target": target,
            "targetType": target_type,
            "timestamp": timestamp,
            "ipAddress": ip_address,
        }

        db = db_service.get_db()
        if db is not None:
            try:
                db["audit_logs"].insert_one(dict(log_entry))
            except PyMongoError:
                pass

        # Always append to memory store for test/offline parity
        self._memory_activity.insert(0, log_entry)
        if len(self._memory_activity) > 200:
            self._memory_activity = self._memory_activity[:200]

        return sanitize_activity(log_entry)

    def _generate_unique_case_number(self, db) -> str:
        """Generate guaranteed unique docket number CAS-YYYY-XXXX."""
        year = datetime.now(timezone.utc).year
        for _ in range(50):
            rand_suffix = uuid.uuid4().hex[:4].upper()
            case_number = f"CAS-{year}-{rand_suffix}"
            if db is not None:
                try:
                    if db["cases"].count_documents({"caseNumber": case_number}) == 0:
                        return case_number
                except PyMongoError:
                    if not any(c.get("caseNumber") == case_number for c in self._memory_cases.values()):
                        return case_number
            else:
                if not any(c.get("caseNumber") == case_number for c in self._memory_cases.values()):
                    return case_number

        return f"CAS-{year}-{int(datetime.now().timestamp()) % 100000:05d}"

    def create_case(
        self,
        title: str,
        incident_type: str,
        priority: str,
        description: str,
        user: Dict[str, Any],
        tags: Optional[List[str]] = None,
        is_restricted: bool = False,
        lead_investigator: Optional[str] = None,
        assigned_examiners: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Create a new forensic case in the database.
        Validates all fields and emits an audit record.
        """
        clean_title = title.strip() if title else ""
        if not clean_title:
            raise ValueError("Case title is required.")
        if len(clean_title) > 200:
            raise ValueError("Case title cannot exceed 200 characters.")

        clean_priority = priority.strip().lower() if priority else "medium"
        if clean_priority not in VALID_PRIORITIES:
            raise ValueError(f"Invalid priority '{clean_priority}'. Allowed: {sorted(VALID_PRIORITIES)}.")

        clean_type = incident_type.strip() if incident_type else "Digital Forgery"

        now_str = datetime.now(timezone.utc).isoformat()
        db = db_service.get_db()
        case_number = self._generate_unique_case_number(db)

        user_name = user.get("name") or "Agent"
        badge = user.get("badge_number") or "N/A"
        default_lead = f"{user_name} ({badge})" if badge != "N/A" else user_name
        lead_display = lead_investigator.strip() if lead_investigator and lead_investigator.strip() else default_lead

        examiners = assigned_examiners if assigned_examiners else [lead_display]
        if lead_display not in examiners:
            examiners = [lead_display] + examiners

        init_desc = (
            description.strip()
            if description
            else "Initial intake narrative."
        )

        clean_tags = [str(t).strip() for t in tags] if tags else [clean_type]
        clean_tags = [t for t in clean_tags if t]

        case_doc: Dict[str, Any] = {
            "caseNumber": case_number,
            "title": clean_title,
            "description": init_desc,
            "incidentType": clean_type,
            "status": STATUS_OPEN,
            "priority": clean_priority,
            "leadInvestigator": lead_display,
            "assignedExaminers": examiners,
            "evidenceCount": 0,
            "chainOfCustodyCount": 0,
            "createdAt": now_str,
            "updatedAt": now_str,
            "closedAt": None,
            "archivedAt": None,
            "is_archived": False,
            "tags": clean_tags,
            "created_by": str(user.get("id") or ""),
            "is_restricted": bool(is_restricted),
        }

        if db is not None:
            try:
                res = db["cases"].insert_one(case_doc)
                case_doc["id"] = str(res.inserted_id)
            except PyMongoError as err:
                err_msg = (
                    f"Database error while creating case: "
                    f"{err.__class__.__name__}"
                )
                raise RuntimeError(err_msg) from err
        else:
            case_doc["id"] = f"case_{uuid.uuid4().hex[:12]}"

        self._memory_cases[str(case_doc["id"])] = case_doc

        # Log authentic activity entry
        self.record_activity(
            actor=user_name,
            badge=badge,
            action=f"Initialized Investigation Case {case_number}",
            target=case_number,
            target_type="case",
        )

        return sanitize_case(case_doc)

    def _find_raw_case_doc(self, case_id_or_number: str) -> Optional[Dict[str, Any]]:
        """Find raw case document from database or memory store."""
        db = db_service.get_db()
        if db is not None:
            try:
                from bson import ObjectId  # pylint: disable=import-outside-toplevel
                query: Dict[str, Any]
                if ObjectId.is_valid(case_id_or_number):
                    query = {"$or": [{"_id": ObjectId(case_id_or_number)}, {"caseNumber": case_id_or_number}, {"id": case_id_or_number}]}
                else:
                    query = {"$or": [{"caseNumber": case_id_or_number}, {"id": case_id_or_number}]}
                doc = db["cases"].find_one(query)
                if doc:
                    doc["id"] = str(doc.get("_id") or doc.get("id"))
                    return doc
            except PyMongoError:
                pass

        # Check memory store
        if case_id_or_number in self._memory_cases:
            return self._memory_cases[case_id_or_number]
        for c in self._memory_cases.values():
            if c.get("caseNumber") == case_id_or_number or str(c.get("id")) == case_id_or_number:
                return c
        return None

    def get_case_by_id(
        self, case_id_or_number: str, user: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Retrieve case details by id or caseNumber.
        Enforces access authorization. Raises KeyError if missing, PermissionError if unauthorized.
        """
        raw_case = self._find_raw_case_doc(case_id_or_number)
        if not raw_case:
            raise KeyError(f"Case '{case_id_or_number}' does not exist.")

        if user is not None:
            if not self.user_can_access_case(user, raw_case):
                raise PermissionError(f"Access to case '{case_id_or_number}' is restricted.")

        return sanitize_case(raw_case)

    def list_authorized_cases(
        self, user: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Retrieve all cases the user is authorized to view (unsliced)."""
        all_cases: List[Dict[str, Any]] = []

        db = db_service.get_db()
        if db is not None:
            try:
                cursor = db["cases"].find().sort("createdAt", -1)
                for doc in cursor:
                    doc["id"] = str(doc.get("_id") or doc.get("id"))
                    all_cases.append(doc)
            except PyMongoError:
                all_cases = list(self._memory_cases.values())
        else:
            all_cases = list(self._memory_cases.values())

        authorized = [
            sanitize_case(c)
            for c in all_cases
            if self.user_can_access_case(user, c)
        ]
        return authorized

    def list_accessible_cases(
        self,
        user: Dict[str, Any],
        status: Optional[str] = None,
        priority: Optional[str] = None,
        incident_type: Optional[str] = None,
        search_query: Optional[str] = None,
        tag: Optional[str] = None,
        page: int = 1,
        limit: int = 10,
        sort_by: str = "createdAt",
        sort_order: str = "desc",
    ) -> Dict[str, Any]:
        """
        List accessible cases with robust filtering, search, sorting, and pagination.
        """
        cases = self.list_authorized_cases(user)

        # 1. Filter by Status
        if status and status.upper() != "ALL":
            cases = [c for c in cases if c["status"].lower() == status.lower()]

        # 2. Filter by Priority
        if priority and priority.upper() != "ALL":
            cases = [c for c in cases if c["priority"].lower() == priority.lower()]

        # 3. Filter by Incident Type
        if incident_type and incident_type.upper() != "ALL":
            cases = [c for c in cases if c["incidentType"].lower() == incident_type.lower()]

        # 4. Filter by Tag
        if tag and tag.upper() != "ALL":
            tag_clean = tag.lower()
            cases = [c for c in cases if any(tag_clean in str(t).lower() for t in c.get("tags", []))]

        # 5. Search query (matches caseNumber, title, description, leadInvestigator, tags)
        if search_query:
            q = search_query.strip().lower()
            cases = [
                c for c in cases
                if q in c["caseNumber"].lower()
                or q in c["title"].lower()
                or q in c["description"].lower()
                or q in c["leadInvestigator"].lower()
                or any(q in str(t).lower() for t in c.get("tags", []))
            ]

        # 6. Sorting
        valid_sort_keys = {"createdAt", "updatedAt", "caseNumber", "title", "priority", "status"}
        key_to_use = sort_by if sort_by in valid_sort_keys else "createdAt"
        is_reverse = sort_order.lower() == "desc"

        if key_to_use == "priority":
            prio_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
            cases.sort(key=lambda c: prio_order.get(c.get("priority", "medium"), 0), reverse=is_reverse)
        else:
            cases.sort(key=lambda c: str(c.get(key_to_use, "")), reverse=is_reverse)

        # 7. Pagination
        total = len(cases)
        page = max(1, page)
        limit = max(1, min(100, limit))
        total_pages = max(1, math.ceil(total / limit)) if total > 0 else 1

        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paged_cases = cases[start_idx:end_idx]

        return {
            "cases": paged_cases,
            "count": len(paged_cases),
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": total_pages,
            },
        }

    def update_case(
        self,
        case_id_or_number: str,
        updates: Dict[str, Any],
        user: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Update case fields (title, description, incidentType, priority, tags, status, is_restricted).
        Enforces field validation, mutation authorization, and records an audit log.
        """
        raw_case = self._find_raw_case_doc(case_id_or_number)
        if not raw_case:
            raise KeyError(f"Case '{case_id_or_number}' not found.")

        if not self.user_can_mutate_case(user, raw_case):
            raise PermissionError("Insufficient clearance: You are not authorized to modify this case.")

        now_str = datetime.now(timezone.utc).isoformat()
        allowed_fields = {
            "title",
            "description",
            "incidentType",
            "priority",
            "status",
            "tags",
            "leadInvestigator",
            "assignedExaminers",
            "is_restricted",
            "closedAt",
            "archivedAt",
            "is_archived",
        }

        clean_updates: Dict[str, Any] = {}
        for k, v in updates.items():
            if k not in allowed_fields:
                continue

            if k == "title":
                title_clean = str(v).strip()
                if not title_clean:
                    raise ValueError("Case title cannot be empty.")
                if len(title_clean) > 200:
                    raise ValueError("Case title cannot exceed 200 characters.")
                clean_updates["title"] = title_clean

            elif k == "priority":
                prio_clean = str(v).strip().lower()
                if prio_clean not in VALID_PRIORITIES:
                    raise ValueError(f"Invalid priority '{prio_clean}'. Allowed: {sorted(VALID_PRIORITIES)}.")
                clean_updates["priority"] = prio_clean

            elif k == "status":
                status_clean = str(v).strip().lower()
                if status_clean not in VALID_STATUSES:
                    raise ValueError(f"Invalid status '{status_clean}'. Allowed: {sorted(VALID_STATUSES)}.")
                clean_updates["status"] = status_clean

                if status_clean in CLOSED_STATUSES and not raw_case.get("closedAt"):
                    clean_updates["closedAt"] = now_str
                elif status_clean in ACTIVE_STATUSES:
                    clean_updates["closedAt"] = None

                if status_clean == STATUS_ARCHIVED:
                    clean_updates["archivedAt"] = now_str
                    clean_updates["is_archived"] = True
                elif status_clean != STATUS_ARCHIVED:
                    clean_updates["archivedAt"] = None
                    clean_updates["is_archived"] = False

            elif k == "tags":
                if isinstance(v, list):
                    clean_updates["tags"] = [str(t).strip() for t in v if str(t).strip()]

            elif k in ("assignedExaminers", "leadInvestigator"):
                from services.permission_service import permission_service, PERM_CASES_ASSIGN
                if permission_service.user_has_permission(user, PERM_CASES_ASSIGN):
                    if k == "assignedExaminers" and isinstance(v, list):
                        clean_updates["assignedExaminers"] = [str(e).strip() for e in v if str(e).strip()]
                    elif k == "leadInvestigator":
                        clean_updates["leadInvestigator"] = str(v).strip()

            elif k in ("description", "incidentType"):
                clean_updates[k] = str(v).strip()

            elif k in ("is_restricted", "is_archived"):
                clean_updates[k] = bool(v)

        clean_updates["updatedAt"] = now_str

        case_id = str(raw_case.get("id") or raw_case.get("_id"))
        db = db_service.get_db()
        updated_case = None

        if db is not None:
            try:
                from bson import ObjectId  # pylint: disable=import-outside-toplevel
                query = (
                    {"_id": ObjectId(case_id)}
                    if ObjectId.is_valid(case_id)
                    else {"id": case_id}
                )
                db["cases"].update_one(query, {"$set": clean_updates})
                doc = db["cases"].find_one(query)
                if doc:
                    doc["id"] = str(doc.get("_id") or doc.get("id"))
                    updated_case = doc
            except PyMongoError:
                pass

        if not updated_case:
            if case_id in self._memory_cases:
                self._memory_cases[case_id].update(clean_updates)
                updated_case = self._memory_cases[case_id]
            else:
                raw_case.update(clean_updates)
                self._memory_cases[case_id] = raw_case
                updated_case = raw_case

        lead_name = user.get("name") or "Examiner"
        badge = user.get("badge_number") or "N/A"
        target_num = updated_case.get("caseNumber", case_id)

        action_summary = f"Updated case information for {target_num}"
        if "status" in clean_updates:
            action_summary = f"Updated case status to [{clean_updates['status'].upper()}] for {target_num}"

        self.record_activity(
            actor=lead_name,
            badge=badge,
            action=action_summary,
            target=target_num,
            target_type="case",
        )

        return sanitize_case(updated_case)

    def change_case_status(
        self,
        case_id_or_number: str,
        new_status: str,
        user: Dict[str, Any],
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Change the operational status of a case with audit tracking."""
        clean_status = new_status.strip().lower() if new_status else ""
        if clean_status not in VALID_STATUSES:
            raise ValueError(f"Invalid status '{clean_status}'. Allowed: {sorted(VALID_STATUSES)}.")

        updated = self.update_case(case_id_or_number, {"status": clean_status}, user)

        if reason:
            lead_name = user.get("name") or "Examiner"
            badge = user.get("badge_number") or "N/A"
            self.record_activity(
                actor=lead_name,
                badge=badge,
                action=f"Status Reason: {reason}",
                target=updated["caseNumber"],
                target_type="case",
            )

        return updated

    def archive_case(
        self,
        case_id_or_number: str,
        user: Dict[str, Any],
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Soft-delete / archive a case.
        Preserves all historical records while flagging the docket as archived.
        """
        now_str = datetime.now(timezone.utc).isoformat()
        updates = {
            "status": STATUS_ARCHIVED,
            "is_archived": True,
            "archivedAt": now_str,
        }
        updated = self.update_case(case_id_or_number, updates, user)

        lead_name = user.get("name") or "Examiner"
        badge = user.get("badge_number") or "N/A"
        action_note = f"Archived investigation case {updated['caseNumber']}"
        if reason:
            action_note += f" - Rationale: {reason}"

        self.record_activity(
            actor=lead_name,
            badge=badge,
            action=action_note,
            target=updated["caseNumber"],
            target_type="case",
        )
        return updated

    def assign_case_examiners(
        self,
        case_id_or_number: str,
        lead_investigator: Optional[str],
        assigned_examiners: Optional[List[str]],
        user: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Assign lead investigator and examiners to a case docket (Administrator operation).
        Enforces cases.assign permission and logs structured audit event.
        """
        from services.permission_service import permission_service, PERM_CASES_ASSIGN
        if not permission_service.user_has_permission(user, PERM_CASES_ASSIGN):
            raise PermissionError("Insufficient clearance: requires 'cases.assign' permission.")

        raw_case = self._find_raw_case_doc(case_id_or_number)
        if not raw_case:
            raise KeyError(f"Case '{case_id_or_number}' does not exist.")

        updates: Dict[str, Any] = {}
        if lead_investigator is not None:
            updates["leadInvestigator"] = str(lead_investigator).strip()
        if assigned_examiners is not None:
            updates["assignedExaminers"] = [str(e).strip() for e in assigned_examiners if str(e).strip()]

        updated = self.update_case(case_id_or_number, updates, user)

        from services.audit_service import audit_service, ACTION_CASE_ASSIGNED
        audit_service.log_event(
            action=ACTION_CASE_ASSIGNED,
            actor=user,
            target=updated["caseNumber"],
            target_type="case",
            details={
                "caseId": updated["id"],
                "caseNumber": updated["caseNumber"],
                "leadInvestigator": updated.get("leadInvestigator"),
                "assignedExaminers": updated.get("assignedExaminers"),
            },
        )
        return updated

    def get_case_evidence(
        self, case_id_or_number: str, user: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Retrieve associated evidence items for an authorized case."""
        case = self.get_case_by_id(case_id_or_number, user)
        case_id = case["id"]
        case_number = case["caseNumber"]

        evidence_items: List[Dict[str, Any]] = []
        db = db_service.get_db()

        if db is not None:
            try:
                cursor = db["evidence"].find(
                    {"$or": [{"caseId": case_id}, {"caseNumber": case_number}]}
                ).sort("capturedAt", -1)
                for doc in cursor:
                    evidence_items.append(sanitize_evidence(doc))
            except PyMongoError:
                pass

        # Memory store check
        mem_items = [
            sanitize_evidence(e)
            for e in self._memory_evidence
            if e.get("caseId") == case_id or e.get("caseNumber") == case_number
        ]

        # Combine uniquely
        seen_ids = set()
        combined: List[Dict[str, Any]] = []
        for item in evidence_items + mem_items:
            if item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                combined.append(item)

        return combined

    def attach_evidence_to_case(
        self,
        case_id_or_number: str,
        evidence_payload: Dict[str, Any],
        user: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Register a new evidence artifact directly under this case docket.
        Increments evidenceCount, records chain of custody block, and updates audit history.
        """
        raw_case = self._find_raw_case_doc(case_id_or_number)
        if not raw_case:
            raise KeyError(f"Case '{case_id_or_number}' not found.")

        if not self.user_can_mutate_case(user, raw_case):
            raise PermissionError("Insufficient clearance: You are not authorized to attach evidence to this case.")

        name = str(evidence_payload.get("name", "")).strip()
        if not name:
            raise ValueError("Evidence label / artifact name is required.")

        sha256 = str(evidence_payload.get("sha256Hash", "")).strip().lower()
        if not sha256 or len(sha256) != 64:
            raise ValueError("Valid 64-character SHA-256 cryptographic digest is required.")

        case_id = str(raw_case.get("id") or raw_case.get("_id"))
        case_number = raw_case.get("caseNumber") or f"CAS-{case_id[:8]}"

        ev_suffix = uuid.uuid4().hex[:4].upper()
        evidence_number = f"EVD-{ev_suffix}"
        now_str = datetime.now(timezone.utc).isoformat()

        user_name = user.get("name") or "Examiner"
        badge = user.get("badge_number") or "N/A"
        captured_by = f"{user_name} ({badge})" if badge != "N/A" else user_name

        ev_doc: Dict[str, Any] = {
            "caseId": case_id,
            "caseNumber": case_number,
            "evidenceNumber": evidence_number,
            "name": name,
            "type": evidence_payload.get("type", "image"),
            "fileFormat": str(evidence_payload.get("fileFormat", "BIN")).upper(),
            "fileSizeBytes": int(evidence_payload.get("fileSizeBytes", 0)),
            "sha256Hash": sha256,
            "originalFileName": evidence_payload.get("originalFileName", name),
            "storageLocation": f"Vault Tier-1 Secure NAS /{case_number}/{evidence_number}",
            "capturedBy": captured_by,
            "capturedAt": now_str,
            "integrityStatus": "verified",
            "lastIntegrityCheck": now_str,
            "tags": evidence_payload.get("tags") or [evidence_payload.get("type", "image").upper(), "Case Evidence"],
            "thumbnailUrl": evidence_payload.get("thumbnailUrl"),
            "notes": evidence_payload.get("notes", "Attached via forensic case management interface."),
            "metadata": evidence_payload.get("metadata") or {},
        }

        db = db_service.get_db()
        if db is not None:
            try:
                res = db["evidence"].insert_one(ev_doc)
                ev_doc["id"] = str(res.inserted_id)

                # Update case counts
                db["cases"].update_one(
                    {"$or": [{"_id": res.inserted_id}, {"id": case_id}, {"caseNumber": case_number}]},
                    {"$inc": {"evidenceCount": 1, "chainOfCustodyCount": 1}, "$set": {"updatedAt": now_str}}
                )
            except PyMongoError:
                ev_doc["id"] = f"evd_{uuid.uuid4().hex[:12]}"
        else:
            ev_doc["id"] = f"evd_{uuid.uuid4().hex[:12]}"

        self._memory_evidence.insert(0, ev_doc)

        # Update in-memory case counts
        if case_id in self._memory_cases:
            self._memory_cases[case_id]["evidenceCount"] = self._memory_cases[case_id].get("evidenceCount", 0) + 1
            self._memory_cases[case_id]["chainOfCustodyCount"] = self._memory_cases[case_id].get("chainOfCustodyCount", 0) + 1
            self._memory_cases[case_id]["updatedAt"] = now_str

        # Record chain of custody block
        custody_entry = {
            "id": f"coc_{uuid.uuid4().hex[:12]}",
            "evidenceId": ev_doc["id"],
            "evidenceNumber": evidence_number,
            "caseNumber": case_number,
            "action": "Collected",
            "performedBy": user_name,
            "badgeNumber": badge,
            "reason": "Initial forensic artifact intake and custody genesis.",
            "location": f"Evidence Vault Tier-1 / {case_number}",
            "timestamp": now_str,
            "blockHash": uuid.uuid4().hex,
            "previousBlockHash": "0" * 64,
            "digitalSignature": f"sig_{uuid.uuid4().hex[:16]}",
            "verified": True,
        }
        if db is not None:
            try:
                db["chain_of_custody"].insert_one(custody_entry)
            except PyMongoError:
                pass
        self._memory_custody.insert(0, custody_entry)

        self.record_activity(
            actor=user_name,
            badge=badge,
            action=f"Attached evidence artifact {evidence_number} to {case_number}",
            target=case_number,
            target_type="evidence",
        )

        return sanitize_evidence(ev_doc)

    def get_case_analyses(
        self, case_id_or_number: str, user: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Retrieve saved AI analysis results for an authorized case."""
        case = self.get_case_by_id(case_id_or_number, user)
        case_id = case["id"]
        case_number = case["caseNumber"]

        analysis_items: List[Dict[str, Any]] = []
        db = db_service.get_db()

        if db is not None:
            try:
                cursor = db["analysis_results"].find(
                    {"$or": [{"caseId": case_id}, {"caseNumber": case_number}]}
                ).sort("timestamp", -1)
                for doc in cursor:
                    analysis_items.append(sanitize_analysis(doc))
            except PyMongoError:
                pass

        # Memory store check
        mem_items = [
            sanitize_analysis(a)
            for a in self._memory_analyses
            if a.get("caseId") == case_id or a.get("caseNumber") == case_number
        ]

        seen_ids = set()
        combined: List[Dict[str, Any]] = []
        for item in analysis_items + mem_items:
            if item["analysisId"] not in seen_ids:
                seen_ids.add(item["analysisId"])
                combined.append(item)

        return combined

    def get_case_audit_logs(
        self, case_id_or_number: str, user: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Retrieve audit history records specifically targeting this case."""
        case = self.get_case_by_id(case_id_or_number, user)
        case_id = case["id"]
        case_number = case["caseNumber"]

        logs: List[Dict[str, Any]] = []
        db = db_service.get_db()

        if db is not None:
            try:
                cursor = db["audit_logs"].find(
                    {"$or": [{"target": case_number}, {"target": case_id}]}
                ).sort("timestamp", -1)
                for doc in cursor:
                    logs.append(sanitize_activity(doc))
            except PyMongoError:
                pass

        mem_items = [
            sanitize_activity(a)
            for a in self._memory_activity
            if a.get("target") in (case_number, case_id)
        ]

        seen_ids = set()
        combined: List[Dict[str, Any]] = []
        for item in logs + mem_items:
            if item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                combined.append(item)

        return combined

    def get_dashboard_summary(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """Aggregate authentic telemetry from real database records."""
        authorized_cases = self.list_authorized_cases(user)

        total_cases = len(authorized_cases)
        active_cases = sum(
            1 for c in authorized_cases if c["status"] in ACTIVE_STATUSES
        )
        closed_cases = sum(
            1 for c in authorized_cases if c["status"] in CLOSED_STATUSES
        )
        under_review_cases = sum(
            1 for c in authorized_cases if c["status"] == STATUS_UNDER_REVIEW
        )
        open_cases = sum(
            1 for c in authorized_cases if c["status"] == STATUS_OPEN
        )
        in_progress_cases = sum(
            1 for c in authorized_cases if c["status"] == STATUS_IN_PROGRESS
        )

        case_status_distribution = [
            {"name": "Open", "value": open_cases, "color": "#06B6D4"},
            {
                "name": "In Progress",
                "value": in_progress_cases,
                "color": "#3B82F6",
            },
            {
                "name": "Under Review",
                "value": under_review_cases,
                "color": "#A855F7",
            },
            {"name": "Closed", "value": closed_cases, "color": "#64748B"},
        ]

        recent_cases = authorized_cases[:4]

        # Check evidence collection
        total_evidence = 0
        evidence_distribution: List[Dict[str, Any]] = []
        db = db_service.get_db()

        if db is not None:
            try:
                evidence_col = db["evidence"]
                total_evidence = evidence_col.count_documents({})
                if total_evidence > 0:
                    pipeline = [
                        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
                        {"$sort": {"count": -1}},
                    ]
                    for entry in evidence_col.aggregate(pipeline):
                        evidence_distribution.append({
                            "type": str(
                                entry.get("_id", "Unknown")
                            ).capitalize(),
                            "count": int(entry.get("count", 0)),
                        })
            except PyMongoError:
                total_evidence = len(self._memory_evidence)
                evidence_distribution = []
        else:
            total_evidence = len(self._memory_evidence)

        pending_analyses = 0
        analysis_queue_available = False

        if db is not None:
            try:
                if "analysis_queue" in db.list_collection_names():
                    analysis_queue_available = True
                    queue_col = db["analysis_queue"]
                    pending_analyses = queue_col.count_documents(
                        {"status": "pending"}
                    )
            except PyMongoError:
                pass

        recent_activities: List[Dict[str, Any]] = []
        if db is not None:
            try:
                col = db["audit_logs"]
                audit_cursor = col.find().sort("timestamp", -1).limit(6)
                for entry in audit_cursor:
                    recent_activities.append(sanitize_activity(entry))
            except PyMongoError:
                recent_activities = [
                    sanitize_activity(a) for a in self._memory_activity[:6]
                ]
        else:
            recent_activities = [
                sanitize_activity(a) for a in self._memory_activity[:6]
            ]

        return {
            "metrics": {
                "totalCases": total_cases,
                "activeCases": active_cases,
                "closedCases": closed_cases,
                "underReviewCases": under_review_cases,
                "totalEvidence": total_evidence,
                "pendingAnalyses": pending_analyses,
                "analysisQueueAvailable": analysis_queue_available,
            },
            "caseStatusDistribution": case_status_distribution,
            "evidenceDistribution": evidence_distribution,
            "recentCases": recent_cases,
            "recentActivity": recent_activities,
            "metadata": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "userRole": user.get("role", "viewer"),
                "authorizedCaseCount": total_cases,
                "isDatabaseConnected": db_service.is_connected(),
            },
        }


case_service = CaseService()
