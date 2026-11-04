def test_dashboard_returns_user_scoped_counts(client, admin_headers):
    response = client.get("/api/v1/dashboard", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["counts"]["projects"] >= 1
    assert body["counts"]["datasets"] >= 1
    assert "engine" in body
    assert body["engine"]["families_enabled"] == ["Feedforward"]


def test_project_report_and_csv(client, admin_headers, demo_project):
    report = client.get(f"/api/v1/projects/{demo_project['id']}/report", headers=admin_headers)
    assert report.status_code == 200
    body = report.json()
    assert body["project"]["id"] == demo_project["id"]
    assert "jobs" in body
    assert body["summary"]["datasets"] >= 1

    csv_response = client.get(
        f"/api/v1/projects/{demo_project['id']}/report.csv", headers=admin_headers
    )
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    content = csv_response.content.decode("utf-8-sig")
    assert "proyecto" in content
    assert "dataset" in content


def test_audit_events_are_written(client, admin_headers, demo_project):
    response = client.get(
        f"/api/v1/projects/{demo_project['id']}/audit-events", headers=admin_headers
    )
    assert response.status_code == 200
    actions = {event["action"] for event in response.json()["items"]}
    assert "project.created" in actions or "project.updated" in actions


def test_admin_system_health_and_users(client, admin_headers):
    health = client.get("/api/v1/system/health", headers=admin_headers)
    assert health.status_code == 200
    assert health.json()["database"]["ok"] is True
    assert health.json()["storage"]["ok"] is True
    users = client.get("/api/v1/users", headers=admin_headers)
    assert users.status_code == 200
    assert users.json()["total"] >= 3
    assert any(user["email"] == "revisor@neurolab.local" for user in users.json()["items"])
