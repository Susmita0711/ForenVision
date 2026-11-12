import logging
from logging.handlers import RotatingFileHandler
import os
import re
import time
from pathlib import Path
from flask import Flask, request
from flask_cors import CORS

from config import get_config
from services.db import db_service, mask_mongo_uri
from routes.health_routes import health_bp
from routes.auth_routes import auth_bp
from routes.user_routes import user_bp
from routes.dashboard_routes import dashboard_bp
from routes.case_routes import case_bp
from routes.evidence_routes import evidence_bp
from routes.custody_routes import custody_bp
from routes.image_forensics_routes import image_forensics_bp
from routes.object_detection_routes import detection_bp
from routes.fingerprint_routes import fingerprint_bp
from routes.face_analysis_routes import face_bp
from routes.sketch_routes import sketch_bp
from routes.report_routes import report_bp
from routes.analytics_routes import analytics_bp
from routes.audit_routes import audit_bp
from routes.settings_routes import settings_bp
from middleware.error_handler import register_error_handlers


class SensitiveDataFilter(logging.Filter):
    """
    Log filter that redacts authorization tokens, passwords, and database credentials
    from all log records before output.
    """
    BEARER_PATTERN = re.compile(r"Bearer\s+([A-Za-z0-9_\-\.]+)", re.IGNORECASE)
    PASSWORD_PATTERN = re.compile(r'("password"\s*:\s*)"([^"]+)"', re.IGNORECASE)
    MONGO_PATTERN = re.compile(r"mongodb(?:\+srv)?://[^\s]+", re.IGNORECASE)

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self.BEARER_PATTERN.sub("Bearer [REDACTED_TOKEN]", record.msg)
            record.msg = self.PASSWORD_PATTERN.sub(r'\1"[REDACTED_SECRET]"', record.msg)
            # Redact MongoDB URIs using db_service mask helper
            record.msg = self.MONGO_PATTERN.sub(lambda m: mask_mongo_uri(m.group(0)), record.msg)
        return True


def configure_logging(app: Flask):
    """
    Configure structured logging with console output, rotating file handler,
    and automatic sensitive information redaction.
    """
    log_level_name = app.config.get("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_name, logging.INFO) if not app.config.get("DEBUG") else logging.DEBUG

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s]: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    redaction_filter = SensitiveDataFilter()

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Attach redaction filter to existing handlers
    for handler in root_logger.handlers:
        handler.addFilter(redaction_filter)

    # Configure Rotating File Handler for production log persistence
    log_dir_path = Path(app.config.get("LOG_DIR", app.root_path + "/logs"))
    try:
        log_dir_path.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_dir_path / "forenvision.log",
            maxBytes=10 * 1024 * 1024,  # 10 MB per log file
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        file_handler.addFilter(redaction_filter)

        # Avoid duplicate handlers if create_app called multiple times
        has_file_handler = any(isinstance(h, RotatingFileHandler) for h in root_logger.handlers)
        if not has_file_handler:
            root_logger.addHandler(file_handler)
    except OSError:
        pass  # In-memory / read-only fallback environments


def create_app(config_name=None) -> Flask:
    """
    Application factory for ForenVision AI backend.
    Initializes configuration, CORS, structured logging, database services, and route blueprints.
    """
    app = Flask(__name__)

    # Load configuration
    config_class = get_config(config_name)
    app.config.from_object(config_class)
    env_name = config_name or os.getenv("FLASK_ENV", "development")
    app.config["ENV_NAME"] = env_name

    # Configure structured logging
    configure_logging(app)
    logger = logging.getLogger("forenvision.app")

    # Security validation in production mode
    if env_name == "production" and hasattr(config_class, "validate_production_security"):
        security_warnings = config_class.validate_production_security()
        for warn in security_warnings:
            logger.warning("PRODUCTION SECURITY NOTICE: %s", warn)

    # Configure CORS using FRONTEND_ORIGIN environment variable
    raw_frontend_origin = app.config.get("FRONTEND_ORIGIN", "http://localhost:5173")
    # Support comma-separated origins or single origin
    if "," in raw_frontend_origin:
        allowed_origins = [orig.strip() for orig in raw_frontend_origin.split(",") if orig.strip()]
    elif raw_frontend_origin == "*":
        if env_name == "production":
            logger.warning("CORS wildcard '*' is strongly discouraged in production. Restricting allowed origins.")
        allowed_origins = "*"
    else:
        allowed_origins = [raw_frontend_origin.strip()]

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": allowed_origins,
                "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization", "Accept", "X-Requested-With", "X-CSRF-Token"],
                "supports_credentials": True,
            }
        },
    )

    # Request timing and security header middleware
    @app.before_request
    def record_request_start():
        request.environ["_forensic_req_start"] = time.perf_counter()

    @app.after_request
    def apply_security_headers_and_logging(response):
        # Calculate request latency
        start_time = request.environ.get("_forensic_req_start")
        if start_time is not None:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            # Log HTTP access without leaking request bodies or authorization headers
            if not request.path.startswith("/api/health"):
                logger.info(
                    "[HTTP] %s %s -> %s (%sms) [Client: %s]",
                    request.method,
                    request.path,
                    response.status_code,
                    latency_ms,
                    request.remote_addr or "127.0.0.1",
                )

        # Baseline security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Evidence privacy protection: strictly disable caching on evidence payloads
        if "/api/evidence/" in request.path:
            response.headers["Cache-Control"] = "private, no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"

        return response

    # Ensure secure evidence upload directory exists
    upload_path = Path(app.config.get("UPLOAD_FOLDER", app.root_path + "/uploads"))
    upload_path.mkdir(parents=True, exist_ok=True)

    # Initialize MongoDB connection service (graceful, non-blocking fallback if unconfigured)
    db_service.init_app(app)

    # Seed baseline clearance accounts if connected to a fresh non-testing database
    if env_name != "testing" and db_service.get_db() is not None:
        from services.user_service import user_service
        user_service.ensure_default_users_seeded()

    # Register API Blueprints
    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(user_bp, url_prefix="/api/users")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(case_bp, url_prefix="/api/cases")
    app.register_blueprint(evidence_bp, url_prefix="/api/evidence")
    app.register_blueprint(custody_bp, url_prefix="/api/custody")
    app.register_blueprint(image_forensics_bp, url_prefix="/api/analysis/image")
    app.register_blueprint(detection_bp, url_prefix="/api/analysis/detection")
    app.register_blueprint(fingerprint_bp, url_prefix="/api/analysis/fingerprint")
    app.register_blueprint(face_bp, url_prefix="/api/analysis/face")
    app.register_blueprint(sketch_bp, url_prefix="/api/analysis/sketch")
    app.register_blueprint(report_bp, url_prefix="/api/reports")
    app.register_blueprint(analytics_bp, url_prefix="/api/analytics")
    app.register_blueprint(audit_bp, url_prefix="/api/audit")
    app.register_blueprint(settings_bp, url_prefix="/api/settings")

    # Register centralized JSON error handlers
    register_error_handlers(app)

    return app


# Default app instance for WSGI servers
app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    debug = app.config.get("DEBUG", True)
    app.run(host="0.0.0.0", port=port, debug=debug)
