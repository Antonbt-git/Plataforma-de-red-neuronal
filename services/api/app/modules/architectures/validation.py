"""Validación de arquitecturas por familia.

El frontend nunca es la frontera de seguridad: toda configuración se valida
aquí antes de persistirse o enviarse a un worker.
"""
from __future__ import annotations

from app.schemas import ArchitectureCreate

ALLOWED_ACTIVATIONS = {"relu", "sigmoid", "tanh", "linear", "softmax"}
HIDDEN_ACTIVATIONS = {"relu", "sigmoid", "tanh", "linear"}


def _dense_parameters(input_units: int, layers: list, output_units: int) -> int:
    total = 0
    previous = input_units
    for layer in layers:
        total += previous * layer.units + layer.units
        previous = layer.units
    total += previous * output_units + output_units
    return int(total)


def validate_architecture(config: ArchitectureCreate) -> tuple[list[str], int]:
    errors: list[str] = []

    if config.input_units < 1:
        errors.append("La entrada debe tener al menos una unidad.")
    if config.output_units < 1:
        errors.append("La salida debe tener al menos una neurona.")
    if len(config.layers) < 1:
        errors.append("Debes definir al menos una capa oculta.")
    if len(config.layers) > 12:
        errors.append("El máximo permitido es de 12 capas ocultas.")
    for index, layer in enumerate(config.layers, start=1):
        if layer.activation == "softmax":
            errors.append(f"La capa oculta {index} no puede usar Softmax; resérvalo para la salida.")
        if layer.activation not in HIDDEN_ACTIVATIONS:
            errors.append(f"Activación no válida en la capa {index}.")
        if layer.dropout > 0.9:
            errors.append(f"El dropout de la capa {index} no puede superar 0.9.")

    # Coherencia salida / pérdida.
    if config.loss == "binary_crossentropy":
        if config.output_units != 1:
            errors.append("binary_crossentropy requiere exactamente una neurona de salida.")
        if config.output_activation != "sigmoid":
            errors.append("binary_crossentropy requiere activación Sigmoid en la salida.")
    elif config.loss == "categorical_crossentropy":
        if config.output_units < 2:
            errors.append("categorical_crossentropy requiere al menos dos neuronas de salida.")
        if config.output_activation != "softmax":
            errors.append("categorical_crossentropy requiere activación Softmax en la salida.")
    elif config.loss == "mse":
        if config.output_activation != "linear":
            errors.append("mse requiere activación Linear en la salida.")

    if config.family == "Feedforward":
        if config.input_units > 10_000:
            errors.append("La entrada supera el máximo de 10.000 unidades para Feedforward.")
        if len(config.layers) > 12:
            errors.append("Feedforward admite como máximo 12 capas ocultas.")
    elif config.family == "RNN":
        if not config.sequence_length or config.sequence_length < 2:
            errors.append("Una red RNN requiere sequence_length >= 2.")
        if len(config.layers) > 6:
            errors.append("RNN admite como máximo 6 capas recurrentes en esta versión.")
        if any(layer.units > 1024 for layer in config.layers):
            errors.append("Las capas RNN admiten como máximo 1024 unidades.")
    elif config.family == "CNN":
        if not (config.input_height and config.input_width and config.input_channels):
            errors.append("Una CNN requiere input_height, input_width e input_channels.")
        if len(config.layers) > 10:
            errors.append("CNN admite como máximo 10 capas convolucionales/densas.")
        if any(layer.units > 2048 for layer in config.layers):
            errors.append("Las capas CNN admiten como máximo 2048 filtros/unidades.")
    elif config.family == "GAN":
        if not config.latent_dim or config.latent_dim < 2:
            errors.append("Una GAN requiere latent_dim >= 2.")
        if config.output_units != config.input_units:
            errors.append("En esta versión la salida GAN debe coincidir con la dimensión de entrada.")
        if any(layer.units > 2048 for layer in config.layers):
            errors.append("Las capas GAN admiten como máximo 2048 unidades.")

    parameters = _dense_parameters(config.input_units, config.layers, config.output_units)
    if parameters > 50_000_000:
        errors.append("La arquitectura supera el límite de 50 millones de parámetros.")

    return errors, parameters


def validate_for_training(config: dict) -> list[str]:
    """Reglas adicionales al iniciar un entrenamiento real."""
    errors: list[str] = []
    family = config.get("family")
    if family != "Feedforward":
        errors.append(
            f"La familia {family} está registrada y validada, pero el motor de "
            "entrenamiento de esta versión solo ejecuta Feedforward. "
            "Se habilitará progresivamente según el plan del documento maestro."
        )
    if not config.get("layers"):
        errors.append("La arquitectura no contiene capas ocultas.")
    return errors
