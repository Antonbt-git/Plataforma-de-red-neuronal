"""Configuración de pruebas: base SQLite aislada y storage temporal."""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import pytest

TEMP_ROOT = Path(tempfile.mkdtemp(prefix="neurolab-tests-"))
os.environ["NEUROLAB_DATABASE_URL"] = f"sqlite:///{TEMP_ROOT / 'test.db'}"
os.environ["NEUROLAB_STORAGE_DIR"] = str(TEMP_ROOT / "storage")
os.environ["NEUROLAB_EPOCH_DELAY_MS"] = "0"
os.environ["NEUROLAB_SEED_DEMO"] = "true"
os.environ["NEUROLAB_SECRET"] = "test-secret-only-for-pytest"
os.environ["NEUROLAB_LOGIN_RATE_LIMIT"] = "1000"
os.environ["NEUROLAB_WRITE_RATE_LIMIT"] = "1000"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client
    shutil.rmtree(TEMP_ROOT, ignore_errors=True)


@pytest.fixture(scope="session")
def admin_headers(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@neurolab.local", "password": "NeuroLab2026!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def analyst_headers(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "analista@neurolab.local", "password": "Analista2026!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def reviewer_headers(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "revisor@neurolab.local", "password": "Revisor2026!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def demo_project(client, admin_headers):
    response = client.get("/api/v1/projects", headers=admin_headers)
    assert response.status_code == 200, response.text
    project = next(
        item for item in response.json()["items"] if item["name"] == "Clasificación de clientes"
    )
    return project


@pytest.fixture(scope="session")
def demo_dataset(client, admin_headers, demo_project):
    response = client.get(
        f"/api/v1/projects/{demo_project['id']}/datasets", headers=admin_headers
    )
    assert response.status_code == 200, response.text
    return response.json()["items"][0]


@pytest.fixture(scope="session")
def demo_architecture(client, admin_headers, demo_project):
    response = client.get(
        f"/api/v1/projects/{demo_project['id']}/architectures", headers=admin_headers
    )
    assert response.status_code == 200, response.text
    return response.json()["items"][0]
