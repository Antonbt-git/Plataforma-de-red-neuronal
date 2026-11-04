from uuid import uuid4


def _payload(**overrides):
    payload = {
        "name": "Red de prueba",
        "family": "Feedforward",
        "input_units": 3,
        "output_units": 1,
        "output_activation": "sigmoid",
        "layers": [
            {"units": 8, "activation": "relu", "dropout": 0.0},
            {"units": 4, "activation": "tanh", "dropout": 0.1},
        ],
        "optimizer": "Adam",
        "loss": "binary_crossentropy",
        "epochs": 10,
        "batch_size": 16,
        "learning_rate": 0.01,
    }
    payload.update(overrides)
    return payload


def test_validate_architecture_returns_parameter_count(client, admin_headers):
    response = client.post(
        "/api/v1/architectures/validate", headers=admin_headers, json=_payload()
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["valid"] is True
    assert body["parameter_count"] > 0


def test_loss_and_output_activation_must_be_coherent(client, admin_headers):
    response = client.post(
        "/api/v1/architectures/validate",
        headers=admin_headers,
        json=_payload(loss="mse", output_activation="sigmoid"),
    )
    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert any("mse" in error for error in response.json()["errors"])


def test_family_specific_validation(client, admin_headers):
    rnn = client.post(
        "/api/v1/architectures/validate",
        headers=admin_headers,
        json=_payload(family="RNN"),
    ).json()
    assert rnn["valid"] is False
    assert any("sequence_length" in error for error in rnn["errors"])

    cnn = client.post(
        "/api/v1/architectures/validate",
        headers=admin_headers,
        json=_payload(family="CNN"),
    ).json()
    assert cnn["valid"] is False
    assert any("input_height" in error for error in cnn["errors"])

    gan = client.post(
        "/api/v1/architectures/validate",
        headers=admin_headers,
        json=_payload(family="GAN", output_units=2, output_activation="linear", loss="mse"),
    ).json()
    assert gan["valid"] is False
    assert any("latent_dim" in error for error in gan["errors"])


def test_create_architecture_versions_and_rejects_invalid(client, admin_headers):
    project = client.post(
        "/api/v1/projects",
        headers=admin_headers,
        json={"name": f"Arch project {uuid4().hex[:6]}", "family": "Feedforward"},
    ).json()
    first = client.post(
        f"/api/v1/projects/{project['id']}/architectures",
        headers=admin_headers,
        json=_payload(name="MLP versión"),
    )
    assert first.status_code == 201, first.text
    assert first.json()["version"] == 1

    second = client.post(
        f"/api/v1/projects/{project['id']}/architectures",
        headers=admin_headers,
        json=_payload(name="MLP versión", layers=[{"units": 16, "activation": "relu"}]),
    )
    assert second.status_code == 201
    assert second.json()["version"] == 2

    invalid = client.post(
        f"/api/v1/projects/{project['id']}/architectures",
        headers=admin_headers,
        json=_payload(name="Inválida", family="CNN", output_units=2, output_activation="linear", loss="mse"),
    )
    assert invalid.status_code == 422
    assert "errors" in invalid.json()["detail"]
