import io
from uuid import uuid4


def _csv(rows: int = 40) -> bytes:
    buffer = io.StringIO()
    buffer.write("edad,ingresos,compras,segmento\n")
    for index in range(rows):
        buffer.write(f"{20 + index % 40},{1000 + index * 50},{index % 9},{'alto' if index % 2 else 'base'}\n")
    return buffer.getvalue().encode("utf-8")


def test_upload_dataset_creates_versioned_metadata(client, admin_headers):
    project = client.post(
        "/api/v1/projects",
        headers=admin_headers,
        json={"name": f"Dataset project {uuid4().hex[:6]}", "family": "Feedforward"},
    ).json()
    response = client.post(
        f"/api/v1/projects/{project['id']}/datasets",
        headers=admin_headers,
        files={"file": ("clientes.csv", _csv(), "text/csv")},
        data={"target_column": "segmento"},
    )
    assert response.status_code == 201, response.text
    dataset = response.json()
    assert dataset["metadata"]["rows"] == 40
    assert dataset["metadata"]["task"] == "binary"
    assert dataset["metadata"]["feature_columns"] == ["edad", "ingresos", "compras"]
    assert dataset["target_column"] == "segmento"
    assert dataset["version"] == 1

    second = client.post(
        f"/api/v1/projects/{project['id']}/datasets",
        headers=admin_headers,
        files={"file": ("clientes.csv", _csv(60), "text/csv")},
        data={"target_column": "segmento"},
    )
    assert second.status_code == 201
    assert second.json()["version"] == 2


def test_dataset_rejects_wrong_extension_and_unknown_target(client, admin_headers, demo_project):
    wrong = client.post(
        f"/api/v1/projects/{demo_project['id']}/datasets",
        headers=admin_headers,
        files={"file": ("datos.txt", b"a,b\n1,2\n", "text/plain")},
    )
    assert wrong.status_code == 422

    unknown = client.post(
        f"/api/v1/projects/{demo_project['id']}/datasets",
        headers=admin_headers,
        files={"file": ("datos.csv", _csv(), "text/csv")},
        data={"target_column": "no_existe"},
    )
    assert unknown.status_code == 422
    assert "no existe" in unknown.text


def test_reviewer_cannot_upload_dataset(client, reviewer_headers, demo_project):
    response = client.post(
        f"/api/v1/projects/{demo_project['id']}/datasets",
        headers=reviewer_headers,
        files={"file": ("datos.csv", _csv(), "text/csv")},
    )
    assert response.status_code == 403


def test_dataset_download_and_delete(client, admin_headers):
    project = client.post(
        "/api/v1/projects",
        headers=admin_headers,
        json={"name": f"Dataset delete {uuid4().hex[:6]}", "family": "Feedforward"},
    ).json()
    dataset = client.post(
        f"/api/v1/projects/{project['id']}/datasets",
        headers=admin_headers,
        files={"file": ("borrar.csv", _csv(), "text/csv")},
        data={"target_column": "segmento"},
    ).json()
    download = client.get(f"/api/v1/datasets/{dataset['id']}/download", headers=admin_headers)
    assert download.status_code == 200
    assert b"segmento" in download.content

    deleted = client.delete(f"/api/v1/datasets/{dataset['id']}", headers=admin_headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/datasets/{dataset['id']}", headers=admin_headers).status_code == 404
