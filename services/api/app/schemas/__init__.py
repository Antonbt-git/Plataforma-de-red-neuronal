"""Contratos de entrada de la API (Pydantic v2)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

Family = Literal["Feedforward", "RNN", "CNN", "GAN"]
Activation = Literal["relu", "sigmoid", "softmax", "tanh", "linear"]
Optimizer = Literal["Adam", "SGD", "RMSprop"]
LossName = Literal["binary_crossentropy", "categorical_crossentropy", "mse"]
RoleName = Literal["Administrador", "Responsable", "Analista", "Revisor", "Lector"]
ModelStatus = Literal["draft", "reviewed", "approved", "retired"]


class LoginInput(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("Correo electrónico inválido")
        return value


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    family: Family = "Feedforward"


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    family: Family | None = None
    status: Literal["Activo", "Borrador", "Inactivo"] | None = None


class MemberCreate(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    role: Literal["Responsable", "Analista", "Revisor", "Lector"]

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class LayerSpec(BaseModel):
    units: int = Field(ge=1, le=4096)
    activation: Activation = "relu"
    dropout: float = Field(default=0.0, ge=0.0, le=0.9)


class ArchitectureCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    family: Family
    input_units: int = Field(ge=1, le=100_000)
    output_units: int = Field(ge=1, le=10_000)
    output_activation: Activation = "sigmoid"
    layers: list[LayerSpec] = Field(min_length=1, max_length=24)
    optimizer: Optimizer = "Adam"
    loss: LossName = "binary_crossentropy"
    epochs: int = Field(default=30, ge=1, le=500)
    batch_size: int = Field(default=24, ge=1, le=1024)
    learning_rate: float = Field(default=0.01, gt=0, le=1)
    sequence_length: int | None = Field(default=None, ge=2, le=10_000)
    input_height: int | None = Field(default=None, ge=8, le=2048)
    input_width: int | None = Field(default=None, ge=8, le=2048)
    input_channels: int | None = Field(default=None, ge=1, le=4)
    latent_dim: int | None = Field(default=None, ge=2, le=2048)


class TrainingCreate(BaseModel):
    architecture_id: str = Field(min_length=10, max_length=64)
    dataset_id: str = Field(min_length=10, max_length=64)
    epochs: int | None = Field(default=None, ge=1, le=500)
    batch_size: int | None = Field(default=None, ge=1, le=1024)
    learning_rate: float | None = Field(default=None, gt=0, le=1)
    seed: int = Field(default=42, ge=0, le=1_000_000)


class ModelStatusUpdate(BaseModel):
    status: ModelStatus


class UserUpdate(BaseModel):
    role: RoleName | None = None
    status: Literal["active", "disabled"] | None = None


class ReportFormat(BaseModel):
    format: Literal["json", "csv"] = "json"
