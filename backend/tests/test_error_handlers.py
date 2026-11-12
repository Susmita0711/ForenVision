def test_404_not_found(client):
    """Test that requesting an unknown route returns JSON 404 response."""
    response = client.get("/api/non-existent-endpoint")
    assert response.status_code == 404

    data = response.get_json()
    assert data is not None
    assert data["success"] is False
    assert data["error"] == "Not Found"
