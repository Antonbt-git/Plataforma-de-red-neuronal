from uuid import uuid4


def test_project_crud(client, admin_headers):
    name = f"Proyecto API {uuid4().hex[:6]}"
    created = client.post(
        "/api/v1/projects",
        headers=admin_headers,
        json={"name": name, "description": "Prueba de contrato", "family": "Feedforward"},
    )
    assert created.status_code == 201, created.text
    project = created.json()
    assert project["name"] == name
    assert project["counts"]["datasets"] == 0

    detail = client.get(f"/api/v1/projects/{project['id']}", headers=admin_headers)
    assert detail.status_code == 200

    updated = client.patch(
        f"/api/v1/projects/{project['id']}",
        headers=admin_headers,
        json={"status": "Inactivo", "description": "Actualizado"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "Inactivo"


def test_horizontal_isolation_between_projects(client, analyst_headers, reviewer_headers):
    created = client.post(
        "/api/v1/projects",
        headers=analyst_headers,
        json={"name": "Proyecto privado analista", "description": "", "family": "Feedforward"},
    )
    assert created.status_code == 201
    project_id = created.json()["id"]

    own = client.get(f"/api/v1/projects/{project_id}", headers=analyst_headers)
    assert own.status_code == 200

    foreign = client.get(f"/api/v1/projects/{project_id}", headers=reviewer_headers)
    assert foreign.status_code == 404

    reviewer_projects = client.get("/api/v1/projects", headers=reviewer_headers).json()["items"]
    assert all(item["id"] != project_id for item in reviewer_projects)


def test_members_can_be_added_by_manager(client, admin_headers, demo_project):
    users = client.get("/api/v1/users", headers=admin_headers).json()["items"]
    analyst = next(user for user in users if user["email"] == "analista@neurolab.local")
    response = client.post(
        f"/api/v1/projects/{demo_project['id']}/members",
        headers=admin_headers,
        json={"email": analyst["email"], "role": "Analista"},
    )
    assert response.status_code in {201, 409}
    members = client.get(
        f"/api/v1/projects/{demo_project['id']}/members", headers=admin_headers
    )
    assert members.status_code == 200
    assert any(item["email"] == analyst["email"] for item in members.json()["items"])
