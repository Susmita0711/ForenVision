def test_cors_headers_on_api_route(client):
    """Verify that requests with configured FRONTEND_ORIGIN receive appropriate CORS headers."""
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 200
    assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"


def test_cors_preflight_options_request(client):
    """Verify that preflight OPTIONS request to API routes returns permitted methods and headers."""
    response = client.open(
        "/api/health",
        method="OPTIONS",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Content-Type,Authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"
    allowed_methods = response.headers.get("Access-Control-Allow-Methods", "")
    assert "GET" in allowed_methods or "OPTIONS" in allowed_methods
