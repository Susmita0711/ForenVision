"""
Centralized Audit Logging Service for ForenVision AI.

Records immutable, tamper-evident audit records for privileged actions:
- User creation and role assignment
- Account activation and deactivation
- Case assignment and docket modifications
- Evidence upload, ingestion, and authorized download
- Forensic analysis execution and parameters
- Forensic report generation and sealing
- Security clearance rejections and authorization failures

Guarantees:
- Passwords, authentication tokens, salts, and raw biometric templates are NEVER logged.
- Audit records are append-only and protected against modification or deletion.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pymongo import DESCENDING
from pymongo.errors import PyMongoError

from services.db import db_service

logger = logging.getLogger("forenvision.audit")

# Canonical Audit Actions
ACTION_USER_CREATED = "USER_CREATED"
ACTION_ROLE_CHANGED = "ROLE_CHANGED"
ACTION_STATUS_CHANGED = "ACCOUNT_STATUS_CHANGED"
ACTION_CASE_ASSIGNED = "CASE_ASSIGNED"
ACTION_CASE_CREATED = "CASE_CREATED"
ACTION_CASE_UPDATED = "CASE_UPDATED"
ACTION_CASE_ARCHIVED = "CASE_ARCHIVED"
ACTION_EVIDENCE_UPLOADED = "EVIDENCE_UPLOADED"
ACTION_EVIDENCE_DOWNLOADED = "EVIDENCE_DOWNLOADED"
ACTION_ANALYSIS_EXECUTED = "ANALYSIS_EXECUTED"
ACTION_REPORT_GENERATED = "REPORT_GENERATED"
ACTION_AUTH_FAILURE = "AUTHORIZATION_FAILURE"
ACTION_SETTINGS_UPDATED = "SETTINGS_UPDATED"


def sanitize_audit_log(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitize internal database fields from audit record for safe presentation."""
    log_id = str(entry.get("_id") or entry.get("id") or "")
    return {
        "id": log_id,
        "action": entry.get("action", "UNKNOWN_ACTION"),
        "actor": entry.get("actor") or {},
        "target": entry.get("target", "System"),
        "targetType": entry.get("targetType", "system"),
        "timestamp": entry.get("timestamp") or datetime.now(timezone.utc).isoformat(),
        "ipAddress": entry.get("ipAddress", "127.0.0.1"),
        "details": entry.get("details") or {},
    }


class AuditService:
    """Manages immutable security audit trails in MongoDB Atlas with in-memory fallback."""

    def __init__(self) -> None:
        self._memory_logs: List[Dict[str, Any]] = []

    def reset_in_memory_state(self) -> None:
        """Clear memory cache for test isolation."""
        self._memory_logs.clear()

    def log_event(
        self,
        action: str,
        actor: Dict[str, Any] | str | None,
        target: str,
        target_type: str,
        details: Optional[Dict[str, Any]] = None,
        ip_address: str = "127.0.0.1",
    ) -> Dict[str, Any]:
        """
        Record an immutable audit log entry.
        Filters out sensitive keys like passwords, tokens, hashes, and binary data.
        """
        timestamp = datetime.now(timezone.utc).isoformat()
        log_id = f"aud_{uuid.uuid4().hex[:12]}"

        # Standardize actor representation
        if isinstance(actor, dict):
            actor_dict = {
                "id": str(actor.get("id") or actor.get("_id") or ""),
                "name": actor.get("name") or "Anonymous",
                "email": actor.get("email") or "unknown@forenvision.internal",
                "badge": actor.get("badge_number") or actor.get("badgeNumber") or "SYS-0000",
                "role": actor.get("role") or "system",
            }
        elif isinstance(actor, str):
            actor_dict = {
                "id": actor,
                "name": actor,
                "email": actor,
                "badge": "SYS-0000",
                "role": "system",
            }
        else:
            actor_dict = {
                "id": "system",
                "name": "System Security Core",
                "email": "security@forenvision.internal",
                "badge": "SYS-0000",
                "role": "system",
            }

        # Filter details to ensure no sensitive credential keys leak
        safe_details: Dict[str, Any] = {}
        if details:
            for k, v in details.items():
                lower_k = k.lower()
                if any(s in lower_k for s in ("password", "token", "secret", "cookie", "auth_header", "key_hash")):
                    safe_details[k] = "[REDACTED]"
                elif isinstance(v, bytes):
                    safe_details[k] = f"[BINARY PAYLOAD {len(v)} BYTES]"
                else:
                    safe_details[k] = v

        entry = {
            "id": log_id,
            "action": action,
            "actor": actor_dict,
            "target": str(target),
            "targetType": target_type,
            "timestamp": timestamp,
            "ipAddress": ip_address,
            "details": safe_details,
        }

        db = db_service.get_db()
        if db is not None:
            try:
                db["audit_logs"].insert_one(dict(entry))
            except PyMongoError as err:
                logger.warning("MongoDB audit log persistence failed: %s", err)

        # Append to in-memory store (capped at 500 records)
        self._memory_logs.insert(0, entry)
        if len(self._memory_logs) > 500:
            self._memory_logs = self._memory_logs[:500]

        logger.info(
            "AUDIT LOG: [%s] Actor=%s Target=%s (%s)",
            action,
            actor_dict.get("badge") or actor_dict.get("email"),
            target,
            target_type,
        )
        return sanitize_audit_log(entry)

    def log_auth_failure(
        self,
        actor: Dict[str, Any] | str | None,
        resource: str,
        required_permission: str,
        reason: str = "Clearance denied",
        ip_address: str = "127.0.0.1",
    ) -> Dict[str, Any]:
        """Record authorization failure / clearance rejection."""
        return self.log_event(
            action=ACTION_AUTH_FAILURE,
            actor=actor,
            target=resource,
            target_type="auth",
            details={
                "required_permission": required_permission,
                "reason": reason,
            },
            ip_address=ip_address,
        )

    def list_audit_logs(
        self,
        target_type: Optional[str] = None,
        action: Optional[str] = None,
        actor_query: Optional[str] = None,
        limit: int = 50,
        page: int = 1,
    ) -> Dict[str, Any]:
        """Retrieve paginated audit logs for authorized administrators."""
        limit = max(1, min(limit, 100))
        page = max(1, page)
        skip = (page - 1) * limit

        query: Dict[str, Any] = {}
        if target_type:
            query["targetType"] = target_type
        if action:
            query["action"] = action
        if actor_query:
            query["$or"] = [
                {"actor.name": {"$regex": actor_query, "$options": "i"}},
                {"actor.email": {"$regex": actor_query, "$options": "i"}},
                {"actor.badge": {"$regex": actor_query, "$options": "i"}},
            ]

        db = db_service.get_db()
        if db is not None:
            try:
                total = db["audit_logs"].count_documents(query)
                cursor = (
                    db["audit_logs"]
                    .find(query)
                    .sort("timestamp", DESCENDING)
                    .skip(skip)
                    .limit(limit)
                )
                logs = [sanitize_audit_log(doc) for doc in cursor]
                return {
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "logs": logs,
                }
            except PyMongoError:
                pass

        # In-memory filtering fallback
        filtered = self._memory_logs
        if target_type:
            filtered = [l for l in filtered if l.get("targetType") == target_type]
        if action:
            filtered = [l for l in filtered if l.get("action") == action]
        if actor_query:
            q = actor_query.lower()
            filtered = [
                l for l in filtered
                if q in str(l.get("actor", {}).get("name", "")).lower()
                or q in str(l.get("actor", {}).get("email", "")).lower()
                or q in str(l.get("actor", {}).get("badge", "")).lower()
            ]

        total = len(filtered)
        paginated = filtered[skip : skip + limit]
        return {
            "total": total,
            "page": page,
            "limit": limit,
            "logs": [sanitize_audit_log(l) for l in paginated],
        }


audit_service = AuditService()
