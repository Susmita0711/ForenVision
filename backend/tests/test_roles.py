import pytest


def get_token_for(client, email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.get_json()["token"]


def test_admin_can_provision_examiner(client):
    """Verify administrator can provision an examiner with any role."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")

    payload = {
        "email": "dr.marcus@forenvision.internal",
        "password": "DoctorMarcus123!",
        "name": "Dr. Marcus Sterling",
        "badge_number": "FX-9104",
        "department": "Computer Vision Lab",
        "role": "investigator",
    }
    response = client.post(
        "/api/users",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 201

    data = response.get_json()
    assert data["success"] is True
    assert data["user"]["role"] == "investigator"
    assert data["user"]["email"] == "dr.marcus@forenvision.internal"


def test_non_admin_cannot_provision_examiner(client):
    """Verify non-admin (investigator/analyst) receives 403 when trying to provision users."""
    analyst_token = get_token_for(client, "s.vance@forenvision.internal", "AnalystPass123!")

    payload = {
        "email": "unauthorized.user@forenvision.internal",
        "password": "Password123!",
        "name": "Test User",
        "role": "analyst",
    }
    response = client.post(
        "/api/users",
        json=payload,
        headers={"Authorization": f"Bearer {analyst_token}"}
    )
    assert response.status_code == 403

    data = response.get_json()
    assert data["success"] is False
    assert "insufficient clearance" in data["message"].lower() or "forbidden" in data["error"].lower()


def test_admin_can_deactivate_and_activate_user(client):
    """Verify administrator can deactivate and reactivate an examiner account."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")

    # Deactivate analyst account
    deactivate_resp = client.patch(
        "/api/users/usr_analyst_003/status",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert deactivate_resp.status_code == 200
    assert deactivate_resp.get_json()["user"]["is_active"] is False

    # Verify deactivated user cannot log in
    login_resp = client.post("/api/auth/login", json={
        "email": "s.vance@forenvision.internal",
        "password": "AnalystPass123!",
    })
    assert login_resp.status_code == 403
    assert "deactivated" in login_resp.get_json()["message"].lower()

    # Reactivate analyst account
    reactivate_resp = client.patch(
        "/api/users/usr_analyst_003/status",
        json={"is_active": True},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert reactivate_resp.status_code == 200
    assert reactivate_resp.get_json()["user"]["is_active"] is True

    # Verify user can log in again
    login_again = client.post("/api/auth/login", json={
        "email": "s.vance@forenvision.internal",
        "password": "AnalystPass123!",
    })
    assert login_again.status_code == 200


def test_non_admin_cannot_change_user_status(client):
    """Verify non-admin receives 403 when attempting to change user status."""
    analyst_token = get_token_for(client, "s.vance@forenvision.internal", "AnalystPass123!")

    response = client.patch(
        "/api/users/usr_inv_002/status",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {analyst_token}"}
    )
    assert response.status_code == 403


def test_admin_cannot_deactivate_self(client):
    """Verify administrator cannot deactivate their own account."""
    admin_token = get_token_for(client, "admin@forenvision.internal", "AdminPass123!")

    response = client.patch(
        "/api/users/usr_admin_001/status",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 403
    assert "cannot deactivate their own account" in response.get_json()["message"].lower()


def test_list_users_accessible_by_authenticated_examiner(client):
    """Verify authenticated examiners can view directory."""
    analyst_token = get_token_for(client, "s.vance@forenvision.internal", "AnalystPass123!")

    response = client.get("/api/users", headers={"Authorization": f"Bearer {analyst_token}"})
    assert response.status_code == 200

    data = response.get_json()
    assert data["success"] is True
    assert isinstance(data["users"], list)
    assert len(data["users"]) >= 4
