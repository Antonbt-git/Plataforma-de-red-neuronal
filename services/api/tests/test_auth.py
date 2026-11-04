def test_login_success_and_me(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@neurolab.local", "password": "NeuroLab2026!"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["role"] == "Administrador"
    token = payload["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "admin@neurolab.local"


def test_login_rejects_bad_password(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@neurolab.local", "password": "incorrecta"},
    )
    assert response.status_code == 401


def test_protected_endpoint_requires_token(client):
    assert client.get("/api/v1/projects").status_code == 401
    assert client.get("/api/v1/dashboard").status_code == 401


def test_token_query_is_accepted_for_events_and_downloads(client, admin_headers, demo_project, demo_dataset):
    token = admin_headers["Authorization"].split(" ", 1)[1]
    response = client.get(f"/api/v1/datasets/{demo_dataset['id']}/download?token={token}")
    assert response.status_code == 200


def test_analyst_cannot_manage_users(client, analyst_headers):
    assert client.get("/api/v1/users", headers=analyst_headers).status_code == 403
