import time
from uuid import uuid4


def _wait_for_job(client, headers, job_id, timeout=20.0):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        response = client.get(f"/api/v1/training-jobs/{job_id}", headers=headers)
        assert response.status_code == 200, response.text
        last = response.json()
        if last["terminal"]:
            return last
        time.sleep(0.1)
    raise AssertionError(f"El trabajo no terminó a tiempo: {last}")


def test_feedforward_training_end_to_end(client, admin_headers, demo_project, demo_dataset, demo_architecture):
    response = client.post(
        f"/api/v1/projects/{demo_project['id']}/training-jobs",
        headers=admin_headers,
        json={
            "architecture_id": demo_architecture["id"],
            "dataset_id": demo_dataset["id"],
            "epochs": 8,
            "seed": 123,
        },
    )
    assert response.status_code == 202, response.text
    job = response.json()
    assert job["status"] == "QUEUED"

    final = _wait_for_job(client, admin_headers, job["id"])
    assert final["status"] == "COMPLETED", final
    assert final["progress"] == 100.0
    assert final["current_epoch"] == 8
    assert len(final["history"]) == 8
    assert "loss" in final["last_metrics"]
    assert "val_loss" in final["last_metrics"]
    assert "accuracy" in final["last_metrics"]
    assert final["last_metrics"]["accuracy"] > 0.6
    assert final["engine"].startswith("NumPy MLP")

    metrics = client.get(
        f"/api/v1/training-jobs/{job['id']}/metrics", headers=admin_headers
    )
    assert metrics.status_code == 200
    assert len(metrics.json()["history"]) == 8

    models = client.get(
        f"/api/v1/projects/{demo_project['id']}/models", headers=admin_headers
    ).json()["items"]
    model = next(item for item in models if item["job_id"] == job["id"])
    assert model["status"] == "draft"
    assert model["checksum"]

    download = client.get(model["download_url"], headers=admin_headers)
    assert download.status_code == 200
    assert len(download.content) > 100

    report = client.get(
        f"/api/v1/projects/{demo_project['id']}/report", headers=admin_headers
    ).json()
    report_job = next(item for item in report["jobs"] if item["id"] == job["id"])
    assert report_job["architecture_name"] == demo_architecture["name"]
    assert report_job["dataset_name"] == demo_dataset["name"]

    dashboard = client.get("/api/v1/dashboard", headers=admin_headers).json()
    dashboard_job = next(item for item in dashboard["recent_jobs"] if item["id"] == job["id"])
    assert dashboard_job["architecture_name"] == demo_architecture["name"]
    assert dashboard_job["dataset_name"] == demo_dataset["name"]


def test_model_review_workflow(client, admin_headers, reviewer_headers, demo_project):
    models = client.get(
        f"/api/v1/projects/{demo_project['id']}/models", headers=admin_headers
    ).json()["items"]
    model = models[0]
    reviewed = client.patch(
        f"/api/v1/models/{model['id']}/status",
        headers=reviewer_headers,
        json={"status": "reviewed"},
    )
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["status"] == "reviewed"

    approved = client.patch(
        f"/api/v1/models/{model['id']}/status",
        headers=reviewer_headers,
        json={"status": "approved"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    invalid = client.patch(
        f"/api/v1/models/{model['id']}/status",
        headers=reviewer_headers,
        json={"status": "draft"},
    )
    assert invalid.status_code == 409


def test_analyst_cannot_review_model(client, analyst_headers, demo_project):
    models = client.get(
        f"/api/v1/projects/{demo_project['id']}/models", headers=analyst_headers
    ).json()["items"]
    if not models:
        return
    response = client.patch(
        f"/api/v1/models/{models[0]['id']}/status",
        headers=analyst_headers,
        json={"status": "reviewed"},
    )
    assert response.status_code == 403


def test_architecture_input_must_match_dataset(client, admin_headers, demo_project, demo_dataset):
    architecture = client.post(
        f"/api/v1/projects/{demo_project['id']}/architectures",
        headers=admin_headers,
        json={
            "name": "Entrada incorrecta",
            "family": "Feedforward",
            "input_units": 2,
            "output_units": 1,
            "output_activation": "sigmoid",
            "layers": [{"units": 4, "activation": "relu"}],
            "optimizer": "Adam",
            "loss": "binary_crossentropy",
            "epochs": 5,
            "batch_size": 8,
            "learning_rate": 0.01,
        },
    )
    assert architecture.status_code == 201
    response = client.post(
        f"/api/v1/projects/{demo_project['id']}/training-jobs",
        headers=admin_headers,
        json={
            "architecture_id": architecture.json()["id"],
            "dataset_id": demo_dataset["id"],
            "epochs": 2,
        },
    )
    assert response.status_code == 422
    assert "entradas" in response.text


def test_cannot_cancel_finished_job(client, admin_headers, demo_project):
    jobs = client.get(
        f"/api/v1/projects/{demo_project['id']}/training-jobs", headers=admin_headers
    ).json()["items"]
    completed = next(job for job in jobs if job["status"] == "COMPLETED")
    response = client.post(
        f"/api/v1/training-jobs/{completed['id']}/cancel", headers=admin_headers
    )
    assert response.status_code == 409


def test_sse_sends_terminal_state(client, admin_headers, demo_project):
    jobs = client.get(
        f"/api/v1/projects/{demo_project['id']}/training-jobs", headers=admin_headers
    ).json()["items"]
    completed = next(job for job in jobs if job["status"] == "COMPLETED")
    token = admin_headers["Authorization"].split(" ", 1)[1]
    with client.stream(
        "GET", f"/api/v1/training-jobs/{completed['id']}/events?token={token}"
    ) as response:
        assert response.status_code == 200
        body = "\n".join(response.iter_lines())
    assert "event: state" in body
    assert "event: done" in body
    assert "COMPLETED" in body
