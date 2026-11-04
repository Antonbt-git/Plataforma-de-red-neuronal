"""Motor real de entrenamiento para redes Feedforward.

Implementa un MLP denso con backpropagation y optimizadores Adam, SGD y
RMSprop usando NumPy. Si TensorFlow/Keras está instalado, se registra como
motor alternativo disponible, pero la ejecución por defecto mantiene este
motor determinista y ligero para que el MVP funcione sin GPU ni dependencias
pesadas.
"""
from __future__ import annotations

import csv
import math
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np

from app.core.config import settings


class TrainingError(ValueError):
    """Error controlado que puede mostrarse al usuario."""


class TrainingCancelled(Exception):
    """Cancelación cooperativa solicitada por el usuario."""


@dataclass
class DatasetBundle:
    X_train: np.ndarray
    y_train: np.ndarray
    X_val: np.ndarray
    y_val: np.ndarray
    task: str
    classes: list[str]
    feature_names: list[str]
    target_name: str
    rows: int


@dataclass
class TrainOutcome:
    history: list[dict] = field(default_factory=list)
    final_metrics: dict = field(default_factory=dict)
    weights_path: str = ""
    engine: str = "NumPy MLP"


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -60, 60)))


def _softmax(z: np.ndarray) -> np.ndarray:
    shifted = z - np.max(z, axis=1, keepdims=True)
    exp = np.exp(shifted)
    return exp / np.sum(exp, axis=1, keepdims=True)


def _activate(name: str, z: np.ndarray) -> np.ndarray:
    if name == "relu":
        return np.maximum(z, 0.0)
    if name == "tanh":
        return np.tanh(z)
    if name == "sigmoid":
        return _sigmoid(z)
    if name == "linear":
        return z
    raise TrainingError(f"Función de activación no soportada: {name}")


def _activation_grad(name: str, activation: np.ndarray, z: np.ndarray) -> np.ndarray:
    if name == "relu":
        return (z > 0).astype(z.dtype)
    if name == "tanh":
        return 1.0 - activation**2
    if name == "sigmoid":
        return activation * (1.0 - activation)
    if name == "linear":
        return np.ones_like(z)
    raise TrainingError(f"Función de activación no soportada: {name}")


def _read_csv(path: Path, target: str, delimiter: str = ",") -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        headers = [str(h).strip() for h in (reader.fieldnames or []) if h]
        rows = []
        for raw in reader:
            row = {h: ("" if raw.get(h) is None else str(raw.get(h)).strip()) for h in headers}
            if any(row.values()):
                rows.append(row)
    return headers, rows


def load_dataset(
    path: Path,
    *,
    target_column: str,
    numeric_columns: list[str],
    feature_columns: list[str] | None = None,
    delimiter: str = ",",
    seed: int = 42,
    validation_fraction: float = 0.2,
) -> DatasetBundle:
    if not path.exists():
        raise TrainingError("El archivo del dataset no está disponible en el almacenamiento.")
    headers, rows = _read_csv(path, target_column, delimiter)
    if target_column not in headers:
        raise TrainingError("La columna objetivo ya no existe en el dataset.")

    features = [
        c
        for c in (feature_columns or numeric_columns)
        if c in headers and c != target_column
    ]
    if not features:
        raise TrainingError("No hay columnas numéricas de entrada utilizables.")

    clean_rows = [row for row in rows if row.get(target_column, "") != ""]
    if len(clean_rows) < 20:
        raise TrainingError("Se requieren al menos 20 filas con objetivo no vacío.")

    X = np.empty((len(clean_rows), len(features)), dtype=np.float64)
    for col_index, column in enumerate(features):
        present = [float(row[column]) for row in clean_rows if row[column] != ""]
        mean = float(np.mean(present)) if present else 0.0
        for row_index, row in enumerate(clean_rows):
            value = row.get(column, "")
            X[row_index, col_index] = float(value) if value != "" else mean

    raw_target = [row[target_column] for row in clean_rows]
    numeric_target = all(_is_finite_number(value) for value in raw_target)
    unique = sorted(set(raw_target))
    if len(unique) < 2:
        raise TrainingError("La columna objetivo necesita al menos dos valores distintos.")

    if numeric_target and len(unique) > 20:
        task = "regression"
        y = np.array([float(v) for v in raw_target], dtype=np.float64).reshape(-1, 1)
        classes: list[str] = []
    elif len(unique) == 2:
        task = "binary"
        mapping = {value: float(index) for index, value in enumerate(unique)}
        y = np.array([mapping[v] for v in raw_target], dtype=np.float64).reshape(-1, 1)
        classes = unique
    else:
        task = "multiclass"
        mapping = {value: index for index, value in enumerate(unique)}
        indices = np.array([mapping[v] for v in raw_target], dtype=np.int64)
        y = np.eye(len(unique), dtype=np.float64)[indices]
        classes = unique

    rng = np.random.default_rng(seed)
    order = rng.permutation(len(X))
    X, y = X[order], y[order]
    val_size = max(1, int(round(len(X) * validation_fraction)))
    if len(X) - val_size < 2:
        raise TrainingError("El dataset es demasiado pequeño para separar entrenamiento y validación.")

    X_train, X_val = X[:-val_size], X[-val_size:]
    y_train, y_val = y[:-val_size], y[-val_size:]

    mean = X_train.mean(axis=0)
    scale = X_train.std(axis=0)
    scale[scale < 1e-9] = 1.0
    X_train = (X_train - mean) / scale
    X_val = (X_val - mean) / scale

    return DatasetBundle(
        X_train=X_train.astype(np.float64),
        y_train=y_train.astype(np.float64),
        X_val=X_val.astype(np.float64),
        y_val=y_val.astype(np.float64),
        task=task,
        classes=classes,
        feature_names=features,
        target_name=target_column,
        rows=len(rows),
    )


def _is_finite_number(value: str) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


class _Optimizer:
    def __init__(self, name: str, learning_rate: float, rng: np.random.default_rng):
        self.name = name
        self.learning_rate = learning_rate
        self.rng = rng
        self.t = 0
        self.m: list[dict[str, np.ndarray]] = []
        self.v: list[dict[str, np.ndarray]] = []
        self.cache: list[dict[str, np.ndarray]] = []

    def _ensure(self, params: list[dict[str, np.ndarray]]) -> None:
        if not self.m:
            self.m = [{"W": np.zeros_like(p["W"]), "b": np.zeros_like(p["b"])} for p in params]
            self.v = [{"W": np.zeros_like(p["W"]), "b": np.zeros_like(p["b"])} for p in params]
            self.cache = [{"W": np.zeros_like(p["W"]), "b": np.zeros_like(p["b"])} for p in params]

    def step(self, params: list[dict[str, np.ndarray]], grads: list[dict[str, np.ndarray]]) -> None:
        self._ensure(params)
        self.t += 1
        lr = self.learning_rate
        for index, (param, grad) in enumerate(zip(params, grads)):
            for key in ("W", "b"):
                g = np.clip(grad[key], -5.0, 5.0)
                if self.name == "Adam":
                    self.m[index][key] = 0.9 * self.m[index][key] + 0.1 * g
                    self.v[index][key] = 0.999 * self.v[index][key] + 0.001 * (g * g)
                    m_hat = self.m[index][key] / (1 - 0.9**self.t)
                    v_hat = self.v[index][key] / (1 - 0.999**self.t)
                    param[key] -= lr * m_hat / (np.sqrt(v_hat) + 1e-8)
                elif self.name == "RMSprop":
                    self.cache[index][key] = (
                        0.9 * self.cache[index][key] + 0.1 * (g * g)
                    )
                    param[key] -= lr * g / (np.sqrt(self.cache[index][key]) + 1e-8)
                else:  # SGD con momento ligero
                    self.m[index][key] = 0.9 * self.m[index][key] + g
                    param[key] -= lr * self.m[index][key]


class MLP:
    def __init__(
        self,
        *,
        input_units: int,
        hidden_layers: list[dict],
        output_units: int,
        output_activation: str,
        task: str,
        seed: int,
    ):
        self.rng = np.random.default_rng(seed)
        self.task = task
        self.output_activation = "softmax" if task == "multiclass" else (
            "sigmoid" if task == "binary" else "linear"
        )
        self.hidden_activations = [layer["activation"] for layer in hidden_layers]
        self.dropouts = [float(layer.get("dropout", 0.0)) for layer in hidden_layers]
        self.shapes: list[tuple[int, int]] = []
        units = [input_units] + [int(layer["units"]) for layer in hidden_layers] + [output_units]
        for previous, current in zip(units[:-1], units[1:]):
            self.shapes.append((previous, current))
        self.params: list[dict[str, np.ndarray]] = []
        for index, (fan_in, fan_out) in enumerate(self.shapes):
            activation = (
                self.hidden_activations[index]
                if index < len(self.hidden_activations)
                else self.output_activation
            )
            if activation == "relu":
                scale = math.sqrt(2.0 / fan_in)
            else:
                scale = math.sqrt(6.0 / (fan_in + fan_out))
            self.params.append(
                {
                    "W": self.rng.normal(0.0, scale, (fan_in, fan_out)),
                    "b": np.zeros((1, fan_out)),
                }
            )
        self._masks: list[np.ndarray | None] = [None] * len(self.params)

    def _forward(self, X: np.ndarray, training: bool) -> tuple[np.ndarray, list[np.ndarray], list[np.ndarray]]:
        activations: list[np.ndarray] = [X]
        pre_activations: list[np.ndarray] = []
        current = X
        last = len(self.params) - 1
        for index, param in enumerate(self.params):
            z = current @ param["W"] + param["b"]
            pre_activations.append(z)
            if index == last:
                if self.output_activation == "softmax":
                    current = _softmax(z)
                elif self.output_activation == "sigmoid":
                    current = _sigmoid(z)
                else:
                    current = z
                self._masks[index] = None
            else:
                current = _activate(self.hidden_activations[index], z)
                dropout = self.dropouts[index]
                if training and dropout > 0:
                    mask = (self.rng.random(current.shape) >= dropout).astype(current.dtype)
                    mask /= 1.0 - dropout
                    current = current * mask
                    self._masks[index] = mask
                else:
                    self._masks[index] = None
            activations.append(current)
        return current, activations, pre_activations

    def _loss_and_grad(self, output: np.ndarray, target: np.ndarray) -> tuple[float, np.ndarray]:
        n = max(1, output.shape[0])
        if self.task == "binary":
            clipped = np.clip(output, 1e-9, 1 - 1e-9)
            loss = float(-np.mean(target * np.log(clipped) + (1 - target) * np.log(1 - clipped)))
            delta = (output - target) / n
        elif self.task == "multiclass":
            clipped = np.clip(output, 1e-9, 1.0)
            loss = float(-np.mean(np.sum(target * np.log(clipped), axis=1)))
            delta = (output - target) / n
        else:
            diff = output - target
            loss = float(np.mean(diff**2))
            delta = 2.0 * diff / n
        return loss, delta

    def _backward(
        self,
        activations: list[np.ndarray],
        pre_activations: list[np.ndarray],
        delta: np.ndarray,
    ) -> list[dict[str, np.ndarray]]:
        grads: list[dict[str, np.ndarray]] = [dict() for _ in self.params]  # type: ignore[list-item]
        last = len(self.params) - 1
        for index in range(last, -1, -1):
            if index < last:
                delta = delta @ self.params[index + 1]["W"].T
                delta = delta * _activation_grad(
                    self.hidden_activations[index], activations[index + 1], pre_activations[index]
                )
                mask = self._masks[index]
                if mask is not None:
                    delta = delta * mask
            grads[index] = {
                "W": activations[index].T @ delta,
                "b": delta.sum(axis=0, keepdims=True),
            }
        return grads

    def evaluate(self, X: np.ndarray, y: np.ndarray) -> tuple[float, dict[str, float]]:
        output, _, _ = self._forward(X, training=False)
        loss, _ = self._loss_and_grad(output, y)
        if self.task == "binary":
            accuracy = float(np.mean((output >= 0.5) == (y >= 0.5)))
            return loss, {"accuracy": accuracy}
        if self.task == "multiclass":
            accuracy = float(np.mean(np.argmax(output, axis=1) == np.argmax(y, axis=1)))
            return loss, {"accuracy": accuracy}
        mae = float(np.mean(np.abs(output - y)))
        return loss, {"mae": mae}

    def fit_batch(self, X: np.ndarray, y: np.ndarray, optimizer: _Optimizer) -> float:
        output, activations, pre_activations = self._forward(X, training=True)
        loss, delta = self._loss_and_grad(output, y)
        grads = self._backward(activations, pre_activations, delta)
        optimizer.step(self.params, grads)
        return loss


def train_model(
    *,
    dataset_path: Path,
    target_column: str,
    numeric_columns: list[str],
    feature_columns: list[str] | None,
    delimiter: str,
    config: dict,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    optimizer_name: str,
    seed: int,
    weights_path: Path | None = None,
    on_epoch: Callable[[int, dict[str, float]], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> TrainOutcome:
    bundle = load_dataset(
        dataset_path,
        target_column=target_column,
        numeric_columns=numeric_columns,
        feature_columns=feature_columns,
        delimiter=delimiter,
        seed=seed,
    )
    layers = config.get("layers", [])
    if not layers:
        raise TrainingError("La arquitectura no tiene capas ocultas.")
    output_units = int(config.get("output_units", 1))
    if bundle.task == "binary" and output_units != 1:
        raise TrainingError("Para clasificación binaria la salida debe tener una neurona.")
    if bundle.task == "regression" and output_units != 1:
        raise TrainingError("Para regresión la salida debe tener una neurona.")
    if bundle.task == "multiclass" and output_units != len(bundle.classes):
        raise TrainingError(
            f"El dataset tiene {len(bundle.classes)} clases, pero la arquitectura define "
            f"{output_units} neuronas de salida. Ajusta la capa de salida."
        )

    model = MLP(
        input_units=bundle.X_train.shape[1],
        hidden_layers=layers,
        output_units=output_units,
        output_activation=str(config.get("output_activation", "sigmoid")),
        task=bundle.task,
        seed=seed,
    )
    optimizer = _Optimizer(optimizer_name, learning_rate, np.random.default_rng(seed + 1))
    rng = np.random.default_rng(seed + 2)
    history: list[dict] = []
    best_loss = float("inf")
    best_weights = [{"W": p["W"].copy(), "b": p["b"].copy()} for p in model.params]
    final_metrics: dict[str, float] = {}

    for epoch in range(1, epochs + 1):
        if should_cancel and should_cancel():
            raise TrainingCancelled()
        order = rng.permutation(len(bundle.X_train))
        for start in range(0, len(order), batch_size):
            batch = order[start : start + batch_size]
            model.fit_batch(bundle.X_train[batch], bundle.y_train[batch], optimizer)
            if should_cancel and should_cancel():
                raise TrainingCancelled()

        train_loss, train_metrics = model.evaluate(bundle.X_train, bundle.y_train)
        val_loss, val_metrics = model.evaluate(bundle.X_val, bundle.y_val)
        point: dict[str, float] = {
            "loss": round(train_loss, 6),
            "val_loss": round(val_loss, 6),
        }
        for key, value in train_metrics.items():
            point[key] = round(value, 6)
        for key, value in val_metrics.items():
            point[f"val_{key}"] = round(value, 6)
        history.append({"epoch": epoch, **point})
        final_metrics = point
        if val_loss < best_loss:
            best_loss = val_loss
            best_weights = [{"W": p["W"].copy(), "b": p["b"].copy()} for p in model.params]
        if on_epoch:
            on_epoch(epoch, point)
        if settings.epoch_delay_ms > 0:
            time.sleep(settings.epoch_delay_ms / 1000.0)

    if best_weights:
        model.params = best_weights

    saved_path = ""
    if weights_path is not None:
        save_weights(weights_path, model=model, bundle=bundle, config=config)
        saved_path = str(weights_path)

    return TrainOutcome(
        history=history,
        final_metrics={
            **final_metrics,
            "best_val_loss": round(best_loss, 6),
            "task": bundle.task,  # type: ignore[dict-item]
            "classes": bundle.classes,  # type: ignore[dict-item]
            "rows": bundle.rows,  # type: ignore[dict-item]
            "features": bundle.feature_names,  # type: ignore[dict-item]
        },
        engine="NumPy MLP (backpropagation real)",
        weights_path=saved_path,
    )


def save_weights(model_path: Path, *, model: MLP, bundle: DatasetBundle, config: dict) -> None:
    arrays: dict[str, np.ndarray] = {}
    for index, param in enumerate(model.params):
        arrays[f"W{index}"] = param["W"]
        arrays[f"b{index}"] = param["b"]
    arrays["classes"] = np.array(bundle.classes, dtype=object)
    arrays["features"] = np.array(bundle.feature_names, dtype=object)
    arrays["task"] = np.array([bundle.task], dtype=object)
    arrays["target"] = np.array([bundle.target_name], dtype=object)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(model_path, **arrays)


def engine_status() -> dict:
    try:
        import tensorflow as tf  # noqa: F401

        tensorflow = tf.__version__
    except Exception:  # noqa: BLE001
        tensorflow = None
    return {
        "numpy_engine": "NumPy MLP (backpropagation real)",
        "tensorflow_available": tensorflow is not None,
        "tensorflow_version": tensorflow,
        "families_enabled": ["Feedforward"],
        "families_validated": ["Feedforward", "RNN", "CNN", "GAN"],
    }
