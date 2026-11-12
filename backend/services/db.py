"""
Database service module for ForenVision AI.
Provides MongoDB Atlas connection management and index initialization.
"""

from __future__ import annotations

import logging
import re
import time
from urllib.parse import urlsplit, urlunsplit
from typing import Any
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.database import Database
from pymongo.errors import (
    PyMongoError,
    ServerSelectionTimeoutError,
    ConnectionFailure,
)

logger = logging.getLogger("forenvision.db")


def mask_mongo_uri(uri: str) -> str:
    """
    Mask sensitive credentials in a MongoDB connection string.
    Never exposes passwords or usernames in logs or diagnostic outputs.
    """
    if not uri:
        return ""

    try:
        parts = urlsplit(uri)
        if "@" in parts.netloc:
            # Mask userinfo while preserving host, replica sets, and ports
            _, host = parts.netloc.rsplit("@", 1)
            masked_netloc = f"***:***@{host}"
            return urlunsplit((
                parts.scheme,
                masked_netloc,
                parts.path,
                parts.query,
                parts.fragment,
            ))
        return uri
    except (ValueError, AttributeError):
        # Fallback regex masking without invalid escape characters
        return re.sub(r"://[^@]+@", r"://***:***@", uri)


class DatabaseService:  # pylint: disable=too-many-instance-attributes
    """Manages MongoDB Atlas connection with graceful fallback."""

    def __init__(self) -> None:
        self.client: MongoClient | None = None
        self.db: Database | None = None
        # Status options: "connected" | "disconnected" | "unconfigured"
        self.status: str = "unconfigured"
        self.status_message: str = (
            "Database unconfigured: MONGODB_URI is not set."
        )
        self.db_name: str | None = None
        self.masked_uri: str = ""
        self.last_ping_latency_ms: float | None = None
        self.indexes_initialized: bool = False

    def init_app(self, app: Any) -> None:
        """
        Initialize database client from Flask app config.
        Does not block startup if MongoDB is unconfigured or unreachable.
        """
        mongo_uri = (
            app.config.get("MONGODB_URI")
            or app.config.get("MONGO_URI")
            or ""
        ).strip()

        self.db_name = (
            app.config.get("MONGODB_DB_NAME")
            or app.config.get("MONGO_DB_NAME")
            or "forenvision_db"
        ).strip()

        try:
            connect_timeout_ms = int(
                app.config.get("DB_CONNECT_TIMEOUT_MS", 3000)
            )
        except (ValueError, TypeError):
            connect_timeout_ms = 3000

        try:
            server_selection_timeout_ms = int(
                app.config.get("DB_SERVER_SELECTION_TIMEOUT_MS", 3000)
            )
        except (ValueError, TypeError):
            server_selection_timeout_ms = 3000

        try:
            socket_timeout_ms = int(app.config.get("DB_SOCKET_TIMEOUT_MS", 10000))
        except (ValueError, TypeError):
            socket_timeout_ms = 10000

        try:
            max_pool_size = int(app.config.get("DB_MAX_POOL_SIZE", 50))
        except (ValueError, TypeError):
            max_pool_size = 50

        try:
            min_pool_size = int(app.config.get("DB_MIN_POOL_SIZE", 5))
        except (ValueError, TypeError):
            min_pool_size = 5

        if not mongo_uri:
            self.status = "unconfigured"
            self.status_message = (
                "Database unconfigured: MONGODB_URI not provided."
            )
            self.masked_uri = ""
            logger.info("MongoDB status: %s", self.status_message)
            return

        self.masked_uri = mask_mongo_uri(mongo_uri)

        try:
            # Configure PyMongo with explicit connection timeouts and connection pooling
            self.client = MongoClient(
                mongo_uri,
                serverSelectionTimeoutMS=server_selection_timeout_ms,
                connectTimeoutMS=connect_timeout_ms,
                socketTimeoutMS=socket_timeout_ms,
                maxPoolSize=max_pool_size,
                minPoolSize=min_pool_size,
            )

            self.db = self.client[self.db_name]

            # Test connection with a fast ping command and measure latency
            start_time = time.perf_counter()
            self.db.command("ping")
            elapsed = time.perf_counter() - start_time
            self.last_ping_latency_ms = round(elapsed * 1000, 2)

            self.status = "connected"
            self.status_message = (
                f"Successfully connected to MongoDB database: {self.db_name} "
                f"(ping latency: {self.last_ping_latency_ms}ms)"
            )
            logger.info("MongoDB status: connected to %s", self.db_name)

            # Initialize collection indexes
            self.init_indexes()

        except (ServerSelectionTimeoutError, ConnectionFailure):
            self.status = "disconnected"
            self.status_message = (
                "MongoDB Atlas cluster unreachable (connection timeout)."
            )
            logger.warning(
                "MongoDB connection failure: %s (cluster: %s)",
                self.status_message,
                self.masked_uri,
            )
        except PyMongoError as exc:
            self.status = "disconnected"
            self.status_message = (
                f"MongoDB operational exception: {exc.__class__.__name__}"
            )
            logger.warning("MongoDB error: %s", self.status_message)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            self.status = "disconnected"
            self.status_message = (
                f"Database configuration error: {exc.__class__.__name__}"
            )
            logger.warning("MongoDB unexpected error: %s", self.status_message)

    def init_indexes(self) -> None:
        """
        Create foundational indexes for forensic data integrity.
        Safely executes only when connected.
        """
        if self.status != "connected" or self.db is None:
            return

        try:
            # Cases collection indexes
            cases_col = self.db["cases"]
            cases_col.create_index(
                [("caseNumber", ASCENDING)], unique=True, sparse=True
            )
            cases_col.create_index([("status", ASCENDING)])
            cases_col.create_index([("createdAt", DESCENDING)])
            cases_col.create_index([("priority", ASCENDING)])
            cases_col.create_index([("assignedExaminers", ASCENDING)])
            cases_col.create_index([("created_by", ASCENDING)])
            cases_col.create_index([("is_archived", ASCENDING)])
            cases_col.create_index([("is_restricted", ASCENDING)])
            cases_col.create_index([("leadInvestigator", ASCENDING)])
            cases_col.create_index([("status", ASCENDING), ("createdAt", DESCENDING)])

            # Evidence collection indexes
            evidence_col = self.db["evidence"]
            evidence_col.create_index(
                [("evidenceNumber", ASCENDING)], unique=True, sparse=True
            )
            evidence_col.create_index([("caseId", ASCENDING)])
            evidence_col.create_index([("caseNumber", ASCENDING)])
            evidence_col.create_index([("sha256Hash", ASCENDING)])
            evidence_col.create_index([("integrityStatus", ASCENDING)])
            evidence_col.create_index([("type", ASCENDING)])
            evidence_col.create_index([("uploadedAt", DESCENDING)])
            evidence_col.create_index([("type", ASCENDING), ("uploadedAt", DESCENDING)])

            # Analysis results collection indexes
            analysis_col = self.db["analysis_results"]
            analysis_col.create_index([("caseId", ASCENDING)])
            analysis_col.create_index([("caseNumber", ASCENDING)])
            analysis_col.create_index([("timestamp", DESCENDING)])
            analysis_col.create_index([("createdAt", DESCENDING)])
            analysis_col.create_index([("status", ASCENDING)])
            analysis_col.create_index([("category", ASCENDING)])
            analysis_col.create_index([("processingTimeMs", ASCENDING)])

            # Forensic reports collection indexes
            reports_col = self.db["forensic_reports"]
            reports_col.create_index([("reportNumber", ASCENDING)], unique=True, sparse=True)
            reports_col.create_index([("caseId", ASCENDING)])
            reports_col.create_index([("createdAt", DESCENDING)])
            reports_col.create_index([("classification", ASCENDING)])
            reports_col.create_index([("author.id", ASCENDING)])

            # Cryptographic Chain of Custody collection indexes
            custody_col = self.db["chain_of_custody"]
            custody_col.create_index(
                [("blockHash", ASCENDING)], unique=True, sparse=True
            )
            custody_col.create_index([("evidenceId", ASCENDING)])
            custody_col.create_index([("caseNumber", ASCENDING)])
            custody_col.create_index([("timestamp", DESCENDING)])

            # Users and authentication collection indexes
            users_col = self.db["users"]
            users_col.create_index([("email", ASCENDING)], unique=True)
            users_col.create_index([("badge_number", ASCENDING)], sparse=True)
            users_col.create_index([("role", ASCENDING)])
            users_col.create_index([("is_active", ASCENDING)])

            # Audit logs indexes
            audit_col = self.db["audit_logs"]
            audit_col.create_index([("timestamp", DESCENDING)])
            audit_col.create_index([("actor", ASCENDING)])
            audit_col.create_index([("targetType", ASCENDING)])
            audit_col.create_index([("target", ASCENDING)])

            self.indexes_initialized = True
            logger.info("MongoDB: Collection indexes initialized.")
        except PyMongoError as err:
            logger.warning(
                "MongoDB: Index initialization skipped: %s",
                err.__class__.__name__,
            )

    def ping(self) -> dict[str, Any]:
        """
        Execute an active ping check to verify live connectivity.
        """
        if self.status != "connected" or not self.client:
            return {
                "connected": False,
                "status": self.status,
                "message": self.status_message,
                "latency_ms": None,
            }

        try:
            start_time = time.perf_counter()
            target = self.db if self.db is not None else self.client.admin
            target.command("ping")
            latency = round((time.perf_counter() - start_time) * 1000, 2)
            self.last_ping_latency_ms = latency
            return {
                "connected": True,
                "status": "connected",
                "message": f"Database responds within {latency}ms",
                "latency_ms": latency,
            }
        except PyMongoError as exc:
            self.status = "disconnected"
            self.status_message = f"Ping failed: {exc.__class__.__name__}"
            return {
                "connected": False,
                "status": "disconnected",
                "message": self.status_message,
                "latency_ms": None,
            }

    def get_db(self) -> Database | None:
        """Retrieve database instance or None if not connected."""
        return self.db if self.status == "connected" else None

    def is_connected(self) -> bool:
        """Check if database is currently in connected state."""
        return self.status == "connected"

    def get_status(self) -> dict[str, Any]:
        """Return structured database status dictionary for health check."""
        return {
            "status": self.status,
            "name": self.db_name if self.status == "connected" else None,
            "message": self.status_message,
            "masked_uri": self.masked_uri if self.masked_uri else None,
            "latency_ms": (
                self.last_ping_latency_ms
                if self.status == "connected"
                else None
            ),
            "indexes_ready": (
                self.indexes_initialized
                if self.status == "connected"
                else False
            ),
        }

    def close(self) -> None:
        """Close MongoDB connection client."""
        if self.client:
            try:
                self.client.close()
            except (PyMongoError, OSError):
                pass
            self.client = None
            self.db = None
        self.status = "disconnected"
        self.indexes_initialized = False


# Singleton instance across application
db_service = DatabaseService()
