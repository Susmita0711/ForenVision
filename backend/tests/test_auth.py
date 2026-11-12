import pytest
from services.rate_limiter import rate_limiter


@pytest.fixture(autouse=True)
def reset_limiter():
    """Ensure rate limiter state is reset before each test."""
    rate_limiter.reset_all()
    yield
    rate_limiter.reset_all()


def test_valid_registration(client):
    """Verify successful public examiner registration."""
    payload = {
        "email": "agent.morris@forenvision.internal",
        "password": "SecurePassword99!",
        "name": "Agent Marcus Morris",
        "badge_number": "FX-5502",
        "department": "Digital Forensics",
        "role": "analyst",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201

    data = response.get_json()
    assert data["success"] is True
    assert "token" in data
    assert "user" in data
    assert data["user"]["email"] == "agent.morris@forenvision.internal"
    assert data["user"]["role"] == "analyst"
    assert "password_hash" not in data["user"]


def test_duplicate_registration_rejected(client):
    """Verify that attempting to register an existing email is rejected with 400."""
    payload = {
        "email": "duplicate.agent@forenvision.internal",
        "password": "Password123!",
        "name": "Agent Initial",
        "badge_number": "FX-1111",
    }
    # First registration
    resp1 = client.post("/api/auth/register", json=payload)
    assert resp1.status_code == 201

    # Second registration with same email
    resp2 = client.post("/api/auth/register", json=payload)
    assert resp2.status_code == 400

    data = resp2.get_json()
    assert data["success"] is False
    assert "already registered" in data["message"].lower()


def test_public_registration_cannot_grant_admin_privileges(client):
    """Verify that public registration requesting admin privileges is strictly forbidden (403)."""
    payload = {
        "email": "hacker@forenvision.internal",
        "password": "MaliciousPassword1!",
        "name": "Rogue Examiner",
        "role": "admin",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 403

    data = response.get_json()
    assert data["success"] is False
    assert "administrator" in data["message"].lower()


def test_valid_login(client):
    """Verify valid login issues JWT and user details."""
    payload = {
        "email": "s.vance@forenvision.internal",
        "password": "AnalystPass123!",
    }
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == 200

    data = response.get_json()
    assert data["success"] is True
    assert "token" in data
    assert data["user"]["email"] == "s.vance@forenvision.internal"
    assert data["user"]["role"] == "analyst"
    # Verify secure cookie is set
    assert "forenvision_token" in response.headers.get("Set-Cookie", "")


def test_invalid_password_rejected(client):
    """Verify invalid password returns 401 Unauthorized."""
    payload = {
        "email": "s.vance@forenvision.internal",
        "password": "WrongPassword999!",
    }
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == 401

    data = response.get_json()
    assert data["success"] is False
    assert "invalid" in data["message"].lower()


def test_login_rate_limiting(client):
    """Verify that repeated failed logins trigger 429 Too Many Requests."""
    payload = {
        "email": "target.bruteforce@forenvision.internal",
        "password": "WrongGuess123!",
    }

    # Attempt 5 consecutive failed logins (configured limit)
    for _ in range(5):
        resp = client.post("/api/auth/login", json=payload)
        assert resp.status_code == 401

    # 6th attempt should be blocked by rate limiter with 429
    blocked_resp = client.post("/api/auth/login", json=payload)
    assert blocked_resp.status_code == 429

    data = blocked_resp.get_json()
    assert data["success"] is False
    assert "too many" in data["message"].lower() or "locked" in data["message"].lower()


def test_logout(client):
    """Verify logout clears the authentication cookie."""
    response = client.post("/api/auth/logout")
    assert response.status_code == 200

    data = response.get_json()
    assert data["success"] is True
    # Verify cookie clearance in Set-Cookie header
    set_cookie = response.headers.get("Set-Cookie", "")
    assert "forenvision_token=" in set_cookie
    assert "Max-Age=0" in set_cookie or "expires=" in set_cookie.lower()


def test_protected_endpoint_me(client):
    """Verify GET /api/auth/me returns current user when valid JWT is supplied."""
    # 1. Login to obtain token
    login_resp = client.post("/api/auth/login", json={
        "email": "s.vance@forenvision.internal",
        "password": "AnalystPass123!",
    })
    token = login_resp.get_json()["token"]

    # 2. Access /api/auth/me with Bearer token
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200

    me_data = me_resp.get_json()
    assert me_data["success"] is True
    assert me_data["user"]["email"] == "s.vance@forenvision.internal"
    assert me_data["user"]["name"] == "Agent Sarah Vance"


def test_protected_endpoint_without_token_rejected(client):
    """Verify accessing protected endpoint without token returns 401."""
    response = client.get("/api/auth/me")
    assert response.status_code == 401

    data = response.get_json()
    assert data["success"] is False
    assert "missing" in data["message"].lower() or "required" in data["message"].lower()


def test_invalid_or_expired_credentials(client):
    """Verify invalid token format or bad signature returns 401."""
    # Bad token
    bad_resp = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.valid.jwt.token"})
    assert bad_resp.status_code == 401

    # Fake signature with different secret
    import jwt
    from datetime import datetime, timedelta, timezone
    fake_token = jwt.encode(
        {"sub": "usr_123", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        "wrong-secret-key-at-least-32-bytes-long!",
        algorithm="HS256"
    )
    fake_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {fake_token}"})
    assert fake_resp.status_code == 401


def test_update_profile(client):
    """Verify authenticated user can update profile details."""
    login_resp = client.post("/api/auth/login", json={
        "email": "s.vance@forenvision.internal",
        "password": "AnalystPass123!",
    })
    token = login_resp.get_json()["token"]

    update_payload = {
        "name": "Special Agent Sarah Vance",
        "department": "Advanced Cyber Forensics Unit",
    }
    update_resp = client.put(
        "/api/auth/profile",
        json=update_payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert update_resp.status_code == 200

    data = update_resp.get_json()
    assert data["success"] is True
    assert data["user"]["name"] == "Special Agent Sarah Vance"
    assert data["user"]["department"] == "Advanced Cyber Forensics Unit"
