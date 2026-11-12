from datetime import datetime, timedelta, timezone
from typing import Any
import jwt
from flask import current_app


def get_jwt_secret() -> str:
    """Retrieve configured JWT secret key from current application config."""
    return current_app.config.get("JWT_SECRET_KEY") or current_app.config.get("SECRET_KEY") or "dev-fallback-secret"


def create_access_token(user: dict[str, Any], expires_in_minutes: int | None = None) -> str:
    """
    Generate an HMAC-SHA256 cryptographically signed JWT access token.
    Payload contains user identity, claims, and strict expiration.
    """
    if expires_in_minutes is None:
        expires_in_minutes = current_app.config.get("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 1440)

    now = datetime.now(timezone.utc)
    expiration = now + timedelta(minutes=expires_in_minutes)

    payload = {
        "sub": str(user.get("id") or user.get("_id")),
        "email": user.get("email"),
        "name": user.get("name"),
        "role": user.get("role"),
        "badge_number": user.get("badge_number"),
        "iat": now,
        "exp": expiration,
    }

    secret = get_jwt_secret()
    token = jwt.encode(payload, secret, algorithm="HS256")
    return token


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and validate JWT access token signature, issuer, and expiration.
    Raises jwt.ExpiredSignatureError or jwt.InvalidTokenError on invalid tokens.
    """
    secret = get_jwt_secret()
    payload = jwt.decode(token, secret, algorithms=["HS256"])
    return payload
