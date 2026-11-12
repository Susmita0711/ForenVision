import os
from pathlib import Path
from dotenv import load_dotenv

# Base backend directory
BASE_DIR = Path(__file__).resolve().parent

# Load .env file if it exists
load_dotenv(BASE_DIR / ".env")


class Config:
    """Base application configuration."""
    SECRET_KEY = os.getenv("SECRET_KEY", "forenvision-dev-secret-key-replace-in-prod")
    DEBUG = False
    TESTING = False

    # JWT Authentication settings
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or SECRET_KEY
    JWT_ACCESS_TOKEN_EXPIRES_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 1440))  # 24 hours

    # Rate limiting for authentication brute-force protection
    LOGIN_MAX_FAILED_ATTEMPTS = int(os.getenv("LOGIN_MAX_FAILED_ATTEMPTS", 5))
    LOGIN_LOCKOUT_SECONDS = int(os.getenv("LOGIN_LOCKOUT_SECONDS", 300))

    # MongoDB Atlas connection parameters
    # Read MONGODB_URI (preferred) with backwards-compatible fallback to MONGO_URI
    MONGODB_URI = (os.getenv("MONGODB_URI") or os.getenv("MONGO_URI") or "").strip()
    MONGODB_DB_NAME = (os.getenv("MONGODB_DB_NAME") or os.getenv("MONGO_DB_NAME") or "forenvision_db").strip()

    # Timeouts and connection pooling for MongoDB operations
    DB_CONNECT_TIMEOUT_MS = int(os.getenv("DB_CONNECT_TIMEOUT_MS", 3000))
    DB_SERVER_SELECTION_TIMEOUT_MS = int(os.getenv("DB_SERVER_SELECTION_TIMEOUT_MS", 3000))
    DB_SOCKET_TIMEOUT_MS = int(os.getenv("DB_SOCKET_TIMEOUT_MS", 10000))
    DB_MAX_POOL_SIZE = int(os.getenv("DB_MAX_POOL_SIZE", 50))
    DB_MIN_POOL_SIZE = int(os.getenv("DB_MIN_POOL_SIZE", 5))

    # CORS configuration
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").strip()

    # File uploads & storage
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", str(BASE_DIR / "uploads"))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 20 * 1024 * 1024))  # 20 MB default

    # Application logging
    LOG_DIR = os.getenv("LOG_DIR", str(BASE_DIR / "logs"))
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

    # AI Compute & Safety Resource Limits
    OPENCV_NUM_THREADS = int(os.getenv("OPENCV_NUM_THREADS", 2))
    MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", 100_000_000))  # 100 Megapixel safety ceiling

    # AI Object Detection Model Configuration
    OBJECT_DETECTION_MODEL_DIR = os.getenv("OBJECT_DETECTION_MODEL_DIR", str(BASE_DIR / "models"))
    OBJECT_DETECTION_CFG_PATH = os.getenv("OBJECT_DETECTION_CFG_PATH", str(BASE_DIR / "models" / "yolov4-tiny.cfg"))
    OBJECT_DETECTION_WEIGHTS_PATH = os.getenv("OBJECT_DETECTION_WEIGHTS_PATH", str(BASE_DIR / "models" / "yolov4-tiny.weights"))
    OBJECT_DETECTION_CLASSES_PATH = os.getenv("OBJECT_DETECTION_CLASSES_PATH", str(BASE_DIR / "models" / "coco.names"))
    OBJECT_DETECTION_DEFAULT_CONFIDENCE = float(os.getenv("OBJECT_DETECTION_DEFAULT_CONFIDENCE", "0.30"))
    OBJECT_DETECTION_DEFAULT_NMS = float(os.getenv("OBJECT_DETECTION_DEFAULT_NMS", "0.40"))

    # Trained Forensic Gun & Person Detector (YOLOv8n ONNX)
    GUN_DETECTION_ONNX_PATH = os.getenv("GUN_DETECTION_ONNX_PATH", str(BASE_DIR / "models" / "forensic_gun_yolov8n.onnx"))
    GUN_DETECTION_CLASSES_PATH = os.getenv("GUN_DETECTION_CLASSES_PATH", str(BASE_DIR / "models" / "forensic_gun.names"))
    GUN_DETECTION_METADATA_PATH = os.getenv("GUN_DETECTION_METADATA_PATH", str(BASE_DIR / "models" / "forensic_gun_metadata.json"))

    # Trained CUHK Cross-Modality Sketch-to-Photo Feature Adapter
    CUHK_SKETCH_ONNX_PATH = os.getenv("CUHK_SKETCH_ONNX_PATH", str(BASE_DIR / "models" / "cuhk_sketch_matcher.onnx"))
    CUHK_SKETCH_NPZ_PATH = os.getenv("CUHK_SKETCH_NPZ_PATH", str(BASE_DIR / "models" / "cuhk_sketch_matcher.npz"))
    CUHK_SKETCH_METADATA_PATH = os.getenv("CUHK_SKETCH_METADATA_PATH", str(BASE_DIR / "models" / "cuhk_sketch_metadata.json"))

    # Fingerprint Feature Analysis Configuration
    FINGERPRINT_SIFT_MAX_FEATURES = int(os.getenv("FINGERPRINT_SIFT_MAX_FEATURES", 800))
    FINGERPRINT_LOWE_RATIO = float(os.getenv("FINGERPRINT_LOWE_RATIO", "0.75"))
    FINGERPRINT_RANSAC_REPROJ_THRESHOLD = float(os.getenv("FINGERPRINT_RANSAC_REPROJ_THRESHOLD", "5.0"))
    FINGERPRINT_MIN_INLIERS_FOR_MATCH = int(os.getenv("FINGERPRINT_MIN_INLIERS_FOR_MATCH", 12))

    # Backwards-compatibility aliases
    MONGO_URI = MONGODB_URI
    MONGO_DB_NAME = MONGODB_DB_NAME


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    DEBUG = True
    # Force unconfigured DB during unit testing unless explicitly overridden
    MONGODB_URI = ""
    MONGO_URI = ""
    MONGODB_DB_NAME = "forenvision_test_db"
    MONGO_DB_NAME = "forenvision_test_db"
    FRONTEND_ORIGIN = "http://localhost:5173"
    JWT_SECRET_KEY = "test-jwt-secret-key-do-not-use-in-production"
    LOGIN_MAX_FAILED_ATTEMPTS = 5
    LOGIN_LOCKOUT_SECONDS = 300


class ProductionConfig(Config):
    """Production configuration with hardened security defaults."""
    DEBUG = False
    TESTING = False

    # Production session / token expiration (default 120 minutes for security)
    JWT_ACCESS_TOKEN_EXPIRES_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 120))

    # Production brute-force defense (lockout after 5 failed attempts for 15 minutes)
    LOGIN_MAX_FAILED_ATTEMPTS = int(os.getenv("LOGIN_MAX_FAILED_ATTEMPTS", 5))
    LOGIN_LOCKOUT_SECONDS = int(os.getenv("LOGIN_LOCKOUT_SECONDS", 900))

    @classmethod
    def validate_production_security(cls) -> list[str]:
        """
        Validate production secrets and network isolation settings.
        Returns a list of warnings or issues discovered.
        """
        issues = []
        insecure_keys = {
            "forenvision-dev-secret-key-replace-in-prod",
            "forenvision-dev-secret-key-change-in-production",
            "dev",
            "secret",
        }
        if cls.SECRET_KEY in insecure_keys or len(cls.SECRET_KEY) < 32:
            issues.append("SECRET_KEY must be a cryptographically strong random string of at least 32 characters in production.")

        insecure_jwt = {
            "test-jwt-secret-key-do-not-use-in-production",
            "forenvision-jwt-secret-key-change-in-production",
        }
        if cls.JWT_SECRET_KEY in insecure_jwt or len(cls.JWT_SECRET_KEY) < 32:
            issues.append("JWT_SECRET_KEY must be a distinct high-entropy secret of at least 32 characters in production.")

        if cls.FRONTEND_ORIGIN == "*":
            issues.append("CORS FRONTEND_ORIGIN cannot be '*' in production; specify explicit authorized origin(s).")

        return issues


config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config(env_name=None):
    """Resolve configuration object by environment name."""
    if not env_name:
        env_name = os.getenv("FLASK_ENV", "development").lower()
    return config_by_name.get(env_name, DevelopmentConfig)
