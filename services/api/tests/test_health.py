def test_health_reports_database(client):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["database"] is True


def test_root_points_to_docs(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["api"] == "/api/v1"
