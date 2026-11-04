"""Modelos de datos de NeuroLab Enterprise.

Compatible con SQLite (desarrollo/pruebas) y PostgreSQL (producción). Las
columnas JSON se traducen a JSONB en PostgreSQL desde el esquema SQL.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base

Base = declarative_base()

# JSON en SQLite, JSONB en PostgreSQL (ver infra/postgres/schema.sql).
JSONType = JSON().with_variant(JSONB, "postgresql")


def new_id() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=new_id)
    email = Column(String(254), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(120), nullable=False)
    role = Column(String(40), nullable=False, default="Lector")
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=new_id)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=False, default="")
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    family = Column(String(20), nullable=False, default="Feedforward")
    status = Column(String(20), nullable=False, default="Activo")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role = Column(String(20), nullable=False, default="reader")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_member"),)


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String(36), primary_key=True, default=new_id)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    storage_key = Column(String(500), nullable=False)
    target_column = Column(String(200), nullable=False)
    checksum = Column(String(64), nullable=False)
    size_bytes = Column(Integer, nullable=False, default=0)
    metadata_json = Column(JSONType, nullable=False, default=dict)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class Architecture(Base):
    __tablename__ = "architectures"

    id = Column(String(36), primary_key=True, default=new_id)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    family = Column(String(20), nullable=False)
    config_json = Column(JSONType, nullable=False, default=dict)
    version = Column(Integer, nullable=False, default=1)
    parameter_count = Column(Integer, nullable=False, default=0)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (UniqueConstraint("project_id", "name", "version", name="uq_arch_version"),)


class TrainingJob(Base):
    __tablename__ = "training_jobs"

    id = Column(String(36), primary_key=True, default=new_id)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    architecture_id = Column(String(36), ForeignKey("architectures.id"), nullable=False)
    dataset_id = Column(String(36), ForeignKey("datasets.id"), nullable=False)
    status = Column(String(20), nullable=False, default="QUEUED", index=True)
    progress = Column(Float, nullable=False, default=0.0)
    epochs = Column(Integer, nullable=False, default=30)
    current_epoch = Column(Integer, nullable=False, default=0)
    learning_rate = Column(Float, nullable=False, default=0.01)
    batch_size = Column(Integer, nullable=False, default=24)
    optimizer = Column(String(20), nullable=False, default="Adam")
    loss_function = Column(String(60), nullable=False, default="binary_crossentropy")
    seed = Column(Integer, nullable=False, default=42)
    engine = Column(String(120), nullable=False, default="NumPy MLP")
    error_message = Column(Text, nullable=True)
    cancel_requested = Column(Boolean, nullable=False, default=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)


class TrainingMetric(Base):
    __tablename__ = "training_metrics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(36), ForeignKey("training_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    epoch = Column(Integer, nullable=False)
    metric_name = Column(String(40), nullable=False)
    metric_value = Column(Float, nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (UniqueConstraint("job_id", "epoch", "metric_name", name="uq_metric"),)


class ModelVersion(Base):
    __tablename__ = "model_versions"

    id = Column(String(36), primary_key=True, default=new_id)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    job_id = Column(String(36), ForeignKey("training_jobs.id"), nullable=True)
    version = Column(Integer, nullable=False)
    storage_key = Column(String(500), nullable=False)
    checksum = Column(String(64), nullable=False)
    status = Column(String(20), nullable=False, default="draft")
    metrics_json = Column(JSONType, nullable=False, default=dict)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (UniqueConstraint("project_id", "version", name="uq_model_version"),)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    actor_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True, index=True)
    action = Column(String(80), nullable=False)
    metadata_json = Column(JSONType, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)
