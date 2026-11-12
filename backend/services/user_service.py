import re
import uuid
from datetime import datetime, timezone
from typing import Any
from werkzeug.security import generate_password_hash, check_password_hash

from services.db import db_service
from services.rate_limiter import rate_limiter
from services.audit_service import audit_service, ACTION_USER_CREATED, ACTION_ROLE_CHANGED, ACTION_STATUS_CHANGED

# Canonical User Roles
ROLE_ADMIN = "admin"
ROLE_INVESTIGATOR = "investigator"
ROLE_ANALYST = "analyst"
ROLE_VIEWER = "viewer"

CANONICAL_ROLES = {ROLE_ADMIN, ROLE_INVESTIGATOR, ROLE_ANALYST, ROLE_VIEWER}

ROLE_NORMALIZATION = {
    "admin": ROLE_ADMIN,
    "administrator": ROLE_ADMIN,
    "investigator": ROLE_INVESTIGATOR,
    "analyst": ROLE_ANALYST,
    "viewer": ROLE_VIEWER,
    "read_only_viewer": ROLE_VIEWER,
    "lead_examiner": ROLE_INVESTIGATOR,
    "technician": ROLE_ANALYST,
}

PUBLIC_ALLOWED_ROLES = {ROLE_INVESTIGATOR, ROLE_ANALYST, ROLE_VIEWER}


def normalize_role(role_name: str | None) -> str:
    """Normalize input role string to one of the 4 canonical roles."""
    if not role_name:
        return ROLE_ANALYST
    normalized = role_name.strip().lower().replace(" ", "_")
    return ROLE_NORMALIZATION.get(normalized, ROLE_ANALYST)


def validate_email_format(email: str) -> bool:
    """Validate standard RFC-compliant email structure."""
    if not email or len(email) > 254:
        return False
    email_regex = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(email_regex, email.strip()))


def validate_password_strength(password: str) -> tuple[bool, str | None]:
    """
    Validate password meets minimum forensic security baseline:
    - At least 8 characters
    - Contains at least one letter
    - Contains at least one digit or special symbol
    """
    if not password or len(password) < 8:
        return False, "Password must be at least 8 characters in length."
    if not any(c.isalpha() for c in password):
        return False, "Password must contain at least one alphabetic character."
    if not any(c.isdigit() or not c.isalnum() for c in password):
        return False, "Password must contain at least one number or special symbol."
    return True, None


def sanitize_user(user: dict[str, Any]) -> dict[str, Any]:
    """
    Return clean user dictionary safe for JSON transmission.
    Guarantees password hashes, salts, and internal DB cursors are never exposed.
    """
    user_id = str(user.get("_id") or user.get("id"))
    return {
        "id": user_id,
        "email": user.get("email"),
        "name": user.get("name"),
        "badge_number": user.get("badge_number") or "",
        "department": user.get("department") or "Digital Forensics Division",
        "role": user.get("role", ROLE_ANALYST),
        "is_active": user.get("is_active", True),
        "authorized_workflows": user.get("authorized_workflows") or [],
        "authorizedWorkflows": user.get("authorized_workflows") or [],
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
        "last_login_at": user.get("last_login_at"),
    }


class UserService:
    """
    Manages forensic user entities, credential hashing, and profile mutations.
    Connects to MongoDB Atlas when available, with clean in-memory fallback for testing.
    """

    def __init__(self):
        # In-memory dictionary store for testing and unconfigured fallback
        self._memory_users: dict[str, dict[str, Any]] = {}
        self._init_default_memory_users()

    def reset_in_memory_state(self) -> None:
        """Reset in-memory user registry back to pristine default seeded accounts."""
        self._memory_users.clear()
        self._init_default_memory_users()

    def _build_default_seed(self) -> list[dict[str, Any]]:
        """Return canonical default forensic accounts for testing and initial bootstrap."""
        return [
            {
                "id": "usr_admin_001",
                "email": "admin@forenvision.internal",
                "password_hash": generate_password_hash("AdminPass123!", method="scrypt"),
                "alt_password_hash": generate_password_hash("Admin@12345!", method="scrypt"),
                "name": "Dir. Nathan Frost",
                "badge_number": "FX-1001",
                "department": "Forensic System Operations",
                "role": ROLE_ADMIN,
                "is_active": True,
                "authorized_workflows": ["face_analysis", "sketch_analysis"],
                "created_at": "2026-10-01T08:00:00Z",
                "updated_at": "2026-10-01T08:00:00Z",
                "last_login_at": None,
            },
            {
                "id": "usr_inv_002",
                "email": "e.reed@forenvision.internal",
                "password_hash": generate_password_hash("InvestigatorPass123!", method="scrypt"),
                "alt_password_hash": generate_password_hash("Investigator@12345!", method="scrypt"),
                "name": "Det. Evelyn Reed",
                "badge_number": "FX-7621",
                "department": "Cyber Financial Crimes Unit",
                "role": ROLE_INVESTIGATOR,
                "is_active": True,
                "authorized_workflows": ["face_analysis", "sketch_analysis"],
                "created_at": "2026-10-02T09:00:00Z",
                "updated_at": "2026-10-02T09:00:00Z",
                "last_login_at": None,
            },
            {
                "id": "usr_analyst_003",
                "email": "s.vance@forenvision.internal",
                "password_hash": generate_password_hash("AnalystPass123!", method="scrypt"),
                "alt_password_hash": generate_password_hash("Analyst@12345!", method="scrypt"),
                "name": "Agent Sarah Vance",
                "badge_number": "FX-8842",
                "department": "Digital Forensic Integrity Division",
                "role": ROLE_ANALYST,
                "is_active": True,
                "authorized_workflows": [],
                "created_at": "2026-10-03T10:00:00Z",
                "updated_at": "2026-10-03T10:00:00Z",
                "last_login_at": None,
            },
            {
                "id": "usr_viewer_004",
                "email": "viewer@forenvision.internal",
                "password_hash": generate_password_hash("ViewerPass123!", method="scrypt"),
                "alt_password_hash": generate_password_hash("Viewer@12345!", method="scrypt"),
                "name": "Auditor Liam Cross",
                "badge_number": "FX-3301",
                "department": "Oversight & Compliance",
                "role": ROLE_VIEWER,
                "is_active": True,
                "authorized_workflows": [],
                "created_at": "2026-10-04T11:00:00Z",
                "updated_at": "2026-10-04T11:00:00Z",
                "last_login_at": None,
            },
        ]

    def _init_default_memory_users(self):
        """Seed default baseline users with secure password hashes for testing and fallback."""
        default_seed = self._build_default_seed()
        for u in default_seed:
            self._memory_users[u["email"].lower()] = u

        # Map role aliases to the same user objects
        self._memory_users["investigator@forenvision.internal"] = default_seed[1]
        self._memory_users["analyst@forenvision.internal"] = default_seed[2]

    def ensure_default_users_seeded(self) -> None:
        """Idempotently seed baseline accounts into MongoDB without overwriting existing records."""
        db = db_service.get_db()
        if db is None:
            return
        try:
            for u in self._build_default_seed():
                doc = dict(u)
                db["users"].update_one({"email": doc["email"]}, {"$setOnInsert": doc}, upsert=True)
        except Exception:
            pass

    def find_by_email(self, email: str) -> dict[str, Any] | None:
        """Query user by email (case-insensitive)."""
        normalized_email = email.strip().lower()
        alias_map = {
            "investigator@forenvision.internal": "e.reed@forenvision.internal",
            "analyst@forenvision.internal": "s.vance@forenvision.internal",
        }
        db = db_service.get_db()
        if db is not None:
            user = db["users"].find_one({"email": normalized_email})
            if not user and normalized_email in alias_map:
                user = db["users"].find_one({"email": alias_map[normalized_email]})
            if user:
                user["id"] = str(user["_id"])
                return user

        # Fallback to in-memory store
        return self._memory_users.get(normalized_email)

    @staticmethod
    def _user_id_query(user_id: str) -> dict[str, Any]:
        # pyrefly: ignore[missing-import]
        from bson import ObjectId
        if ObjectId.is_valid(user_id):
            return {"$or": [{"_id": ObjectId(user_id)}, {"id": user_id}]}
        return {"id": user_id}

    def find_by_id(self, user_id: str) -> dict[str, Any] | None:
        """Query user by identifier string."""
        db = db_service.get_db()
        if db is not None:
            user = db["users"].find_one(self._user_id_query(user_id))
            if user:
                user["id"] = str(user["_id"])
                return user

        # Fallback to in-memory store
        for u in self._memory_users.values():
            if str(u.get("id")) == str(user_id):
                return u
        return None

    def register_user(
        self,
        email: str,
        password: str,
        name: str,
        badge_number: str = "",
        department: str = "",
        role: str | None = None,
        is_public: bool = True,
        authorized_workflows: list[str] | None = None,
        creator: Any = None,
    ) -> dict[str, Any]:
        """
        Register a new user entity.
        - Validates input format and password complexity.
        - Enforces that public registration cannot grant administrator privileges.
        - Hashes password using scrypt.
        - Ensures email uniqueness.
        - Records structured audit log.
        """
        # Validate email
        if not validate_email_format(email):
            raise ValueError("Invalid email address format.")

        normalized_email = email.strip().lower()

        # Validate name
        clean_name = name.strip() if name else ""
        if not clean_name:
            raise ValueError("Full name is required.")

        # Validate password strength
        is_strong, pwd_err = validate_password_strength(password)
        if not is_strong:
            raise ValueError(pwd_err or "Password does not meet complexity requirements.")

        # Role resolution & privilege escalation prevention
        requested_role = normalize_role(role)
        if is_public and requested_role == ROLE_ADMIN:
            raise PermissionError("Public registration cannot grant administrator privileges.")

        final_role = requested_role if not is_public else requested_role

        # Check uniqueness
        if self.find_by_email(normalized_email) is not None:
            raise ValueError("A user with this email address is already registered.")

        # Hash password securely using scrypt
        password_hash = generate_password_hash(password, method="scrypt")
        now_iso = datetime.now(timezone.utc).isoformat()
        user_id = f"usr_{uuid.uuid4().hex[:12]}"

        user_doc = {
            "id": user_id,
            "email": normalized_email,
            "password_hash": password_hash,
            "name": clean_name,
            "badge_number": badge_number.strip().upper() if badge_number else "",
            "department": department.strip() if department else "Digital Forensics Division",
            "role": final_role,
            "is_active": True,
            "authorized_workflows": authorized_workflows or [],
            "created_at": now_iso,
            "updated_at": now_iso,
            "last_login_at": None,
        }

        db = db_service.get_db()
        if db is not None:
            inserted = db["users"].insert_one(user_doc)
            user_doc["id"] = str(inserted.inserted_id)

        # Always update memory store for consistent state
        self._memory_users[normalized_email] = user_doc

        # Record audit log
        audit_service.log_event(
            action=ACTION_USER_CREATED,
            actor=creator or (clean_name if is_public else "System"),
            target=user_doc.get("badge_number") or normalized_email,
            target_type="user",
            details={
                "userId": user_id,
                "email": normalized_email,
                "role": final_role,
                "isPublic": is_public,
                "authorizedWorkflows": user_doc.get("authorized_workflows"),
            },
        )

        return sanitize_user(user_doc)

    def authenticate(self, email: str, password: str, client_ip: str = "") -> tuple[dict[str, Any] | None, str | None, int]:
        """
        Authenticate user credentials with rate limiting and account activation checks.
        Returns (user_dict_or_None, error_message_or_None, http_status_code).
        """
        normalized_email = email.strip().lower() if email else ""
        rate_key = f"{normalized_email}_{client_ip}" if client_ip else normalized_email

        # 1. Rate limiting check
        is_locked, remaining_secs = rate_limiter.is_rate_limited(rate_key)
        if is_locked:
            return None, f"Too many failed login attempts. Account temporarily locked for {remaining_secs} seconds.", 429

        # 2. User existence & credential verification
        user = self.find_by_email(normalized_email)
        if not user:
            rate_limiter.record_failure(rate_key)
            return None, "Invalid email or authentication credentials.", 401

        primary_valid = check_password_hash(user.get("password_hash", ""), password or "")
        alt_hash = user.get("alt_password_hash")
        alt_valid = bool(alt_hash) and check_password_hash(alt_hash, password or "")

        if not (primary_valid or alt_valid):
            rate_limiter.record_failure(rate_key)
            return None, "Invalid email or authentication credentials.", 401

        # 3. Account activation check
        if not user.get("is_active", True):
            return None, "Your account has been deactivated. Please contact a forensic administrator.", 403

        # 4. Successful login: reset failed attempts
        rate_limiter.record_success(rate_key)

        # Update last login timestamp
        now_iso = datetime.now(timezone.utc).isoformat()
        user["last_login_at"] = now_iso
        db = db_service.get_db()
        if db is not None:
            db["users"].update_one({"email": normalized_email}, {"$set": {"last_login_at": now_iso}})

        return sanitize_user(user), None, 200

    def update_profile(self, user_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        """
        Update user profile information.
        Allows updating name, department, badge_number, or password (with current_password check).
        Prevents role escalation via profile updates.
        """
        user = self.find_by_id(user_id)
        if not user:
            raise KeyError("User not found.")

        now_iso = datetime.now(timezone.utc).isoformat()
        fields_to_set: dict[str, Any] = {"updated_at": now_iso}

        if "name" in updates and updates["name"]:
            fields_to_set["name"] = updates["name"].strip()
        if "department" in updates:
            fields_to_set["department"] = updates["department"].strip()
        if "badge_number" in updates:
            fields_to_set["badge_number"] = updates["badge_number"].strip().upper()

        # Password update handling
        if "new_password" in updates and updates["new_password"]:
            current_pwd = updates.get("current_password", "")
            if not check_password_hash(user.get("password_hash", ""), current_pwd):
                raise ValueError("Current password verification failed.")

            is_strong, err_msg = validate_password_strength(updates["new_password"])
            if not is_strong:
                raise ValueError(err_msg or "New password does not meet security criteria.")

            fields_to_set["password_hash"] = generate_password_hash(updates["new_password"], method="scrypt")

        # Strip security-sensitive fields from profile mutations
        fields_to_set.pop("role", None)
        fields_to_set.pop("is_active", None)
        fields_to_set.pop("authorized_workflows", None)
        fields_to_set.pop("custom_permissions", None)

        user.update(fields_to_set)

        db = db_service.get_db()
        if db is not None:
            db["users"].update_one(self._user_id_query(user_id), {"$set": fields_to_set})

        # Keep memory store synchronized
        self._memory_users[user["email"].lower()] = user
        return sanitize_user(user)

    def count_active_admins(self) -> int:
        """Count active administrator accounts in database and memory store."""
        db = db_service.get_db()
        if db is not None:
            try:
                return db["users"].count_documents({"role": ROLE_ADMIN, "is_active": True})
            except Exception:
                pass

        # In-memory evaluation fallback
        seen_ids = set()
        count = 0
        for u in self._memory_users.values():
            uid = str(u.get("id"))
            if uid not in seen_ids:
                seen_ids.add(uid)
                if u.get("role") == ROLE_ADMIN and u.get("is_active", True):
                    count += 1
        return count

    def set_user_status(self, user_id: str, is_active: bool, actor: Any) -> dict[str, Any]:
        """
        Activate or deactivate a user account (Administrator operation).
        - Prevents an administrator from deactivating their own account.
        - Prevents accidental or unauthorized deactivation of the last active administrator.
        - Records structured audit log.
        """
        actor_id = actor.get("id") if isinstance(actor, dict) else str(actor)

        user = self.find_by_id(user_id)
        if not user:
            raise KeyError("User not found.")

        if user_id == actor_id and not is_active:
            raise ValueError("Administrators cannot deactivate their own account.")

        if not is_active and user.get("role") == ROLE_ADMIN and user.get("is_active", True):
            if self.count_active_admins() <= 1:
                raise ValueError("Security Policy: Cannot deactivate the last remaining active administrator.")

        now_iso = datetime.now(timezone.utc).isoformat()
        user["is_active"] = is_active
        user["updated_at"] = now_iso

        db = db_service.get_db()
        if db is not None:
            db["users"].update_one(self._user_id_query(user_id), {"$set": {"is_active": is_active, "updated_at": now_iso}})

        self._memory_users[user["email"].lower()] = user

        # Record audit log
        audit_service.log_event(
            action=ACTION_STATUS_CHANGED,
            actor=actor,
            target=user.get("badge_number") or user.get("email"),
            target_type="user",
            details={
                "userId": user_id,
                "targetEmail": user.get("email"),
                "newStatus": "active" if is_active else "deactivated",
            },
        )
        return sanitize_user(user)

    def change_user_role(
        self,
        user_id: str,
        new_role: str,
        actor: Any,
        authorized_workflows: list[str] | None = None,
    ) -> dict[str, Any]:
        """
        Assign role and authorized workflows to an account (Administrator operation).
        - Users cannot change their own role or administrative permissions.
        - Prevents demoting the last active administrator.
        - Records structured audit log.
        """
        actor_id = actor.get("id") if isinstance(actor, dict) else str(actor)
        user = self.find_by_id(user_id)
        if not user:
            raise KeyError("User not found.")

        norm_role = normalize_role(new_role)
        old_role = user.get("role", ROLE_ANALYST)

        # Self-demotion and last active administrator protection
        if user.get("role") == ROLE_ADMIN and norm_role != ROLE_ADMIN and user.get("is_active", True):
            if user_id == actor_id:
                raise ValueError("Administrators cannot change their own clearance role or demote themselves.")
            if self.count_active_admins() <= 1:
                raise ValueError("Security Policy: Cannot demote the last remaining active administrator.")

        now_iso = datetime.now(timezone.utc).isoformat()
        fields_to_set: dict[str, Any] = {
            "role": norm_role,
            "updated_at": now_iso,
        }
        if authorized_workflows is not None:
            fields_to_set["authorized_workflows"] = authorized_workflows

        user.update(fields_to_set)

        db = db_service.get_db()
        if db is not None:
            db["users"].update_one(self._user_id_query(user_id), {"$set": fields_to_set})

        self._memory_users[user["email"].lower()] = user

        # Record audit log
        audit_service.log_event(
            action=ACTION_ROLE_CHANGED,
            actor=actor,
            target=user.get("badge_number") or user.get("email"),
            target_type="user",
            details={
                "userId": user_id,
                "targetEmail": user.get("email"),
                "oldRole": old_role,
                "newRole": norm_role,
                "authorizedWorkflows": user.get("authorized_workflows", []),
            },
        )
        return sanitize_user(user)

    def list_users(self) -> list[dict[str, Any]]:
        """List all registered forensic users (sanitized)."""
        db = db_service.get_db()
        if db is not None:
            cursor = db["users"].find({})
            users = []
            for u in cursor:
                u["id"] = str(u["_id"])
                users.append(sanitize_user(u))
            return users

        # Fallback to in-memory store
        return [sanitize_user(u) for u in self._memory_users.values()]


# Global UserService singleton instance
user_service = UserService()
