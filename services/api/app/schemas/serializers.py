"""Serialización de entidades a JSON estable para el frontend."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import (
    Architecture,
    AuditEvent,
    Dataset,
    ModelVersion,
    Project,
    TrainingJob,
    User,
)
from app.repositories import jobs as jobs_repo

TERMINAL = {"COMPLETED", "FAILED", "CANCELLED"}


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "status": user.status,
        "created_at": iso(user.created_at),
    }


def project_out(db: Session, project: Project, owner: User | None = None) -> dict:
    dataset_count = db.query(func.count(Dataset.id)).filter(Dataset.project_id == project.id).scalar() or 0
    architecture_count = (
        db.query(func.count(Architecture.id)).filter(Architecture.project_id == project.id).scalar() or 0
    )
    job_count = (
        db.query(func.count(TrainingJob.id)).filter(TrainingJob.project_id == project.id).scalar() or 0
    )
    model_count = (
        db.query(func.count(ModelVersion.id)).filter(ModelVersion.project_id == project.id).scalar() or 0
    )
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "family": project.family,
        "status": project.status,
        "owner_id": project.owner_id,
        "owner_email": owner.email if owner else None,
        "created_at": iso(project.created_at),
        "updated_at": iso(project.updated_at),
        "counts": {
            "datasets": dataset_count,
            "architectures": architecture_count,
            "training_jobs": job_count,
            "models": model_count,
        },
    }


def dataset_out(dataset: Dataset) -> dict:
    meta = dataset.metadata_json or {}
    return {
        "id": dataset.id,
        "project_id": dataset.project_id,
        "name": dataset.name,
        "version": dataset.version,
        "target_column": dataset.target_column,
        "checksum": dataset.checksum,
        "size_bytes": dataset.size_bytes,
        "metadata": {
            "rows": meta.get("rows", 0),
            "columns": meta.get("columns", 0),
            "column_names": meta.get("column_names", []),
            "numeric_columns": meta.get("numeric_columns", []),
            "feature_columns": meta.get("feature_columns", []),
            "target_column": dataset.target_column,
            "classes": meta.get("classes", []),
            "task": meta.get("task"),
            "filename": meta.get("filename"),
            "preview": meta.get("preview", []),
        },
        "created_at": iso(dataset.created_at),
    }


def architecture_out(architecture: Architecture) -> dict:
    return {
        "id": architecture.id,
        "project_id": architecture.project_id,
        "name": architecture.name,
        "family": architecture.family,
        "version": architecture.version,
        "config": architecture.config_json,
        "parameter_count": architecture.parameter_count,
        "created_at": iso(architecture.created_at),
    }


def job_history(db: Session, job_id: str) -> list[dict]:
    rows = jobs_repo.metrics(db, job_id)
    grouped: dict[int, dict] = {}
    for row in rows:
        grouped.setdefault(row.epoch, {"epoch": row.epoch})[row.metric_name] = round(
            float(row.metric_value), 6
        )
    return [grouped[key] for key in sorted(grouped)]


def job_out(
    db: Session,
    job: TrainingJob,
    *,
    project_name: str | None = None,
    architecture_name: str | None = None,
    dataset_name: str | None = None,
    include_history: bool = True,
) -> dict:
    history = job_history(db, job.id) if include_history else []
    last = history[-1] if history else {}
    return {
        "id": job.id,
        "project_id": job.project_id,
        "project_name": project_name,
        "architecture_id": job.architecture_id,
        "architecture_name": architecture_name,
        "dataset_id": job.dataset_id,
        "dataset_name": dataset_name,
        "status": job.status,
        "progress": round(float(job.progress or 0), 2),
        "epochs": job.epochs,
        "current_epoch": job.current_epoch,
        "learning_rate": job.learning_rate,
        "batch_size": job.batch_size,
        "optimizer": job.optimizer,
        "loss_function": job.loss_function,
        "seed": job.seed,
        "engine": job.engine,
        "error_message": job.error_message,
        "cancel_requested": bool(job.cancel_requested),
        "created_at": iso(job.created_at),
        "started_at": iso(job.started_at),
        "ended_at": iso(job.ended_at),
        "last_metrics": last,
        "history": history,
        "terminal": job.status in TERMINAL,
    }


def model_out(model: ModelVersion, *, project_name: str | None = None) -> dict:
    return {
        "id": model.id,
        "project_id": model.project_id,
        "project_name": project_name,
        "job_id": model.job_id,
        "version": model.version,
        "status": model.status,
        "checksum": model.checksum,
        "metrics": model.metrics_json or {},
        "created_at": iso(model.created_at),
        "download_url": f"/api/v1/models/{model.id}/download",
    }


def audit_out(event: AuditEvent, *, actor_email: str | None = None) -> dict:
    return {
        "id": event.id,
        "actor_id": event.actor_id,
        "actor_email": actor_email,
        "project_id": event.project_id,
        "action": event.action,
        "metadata": event.metadata_json or {},
        "created_at": iso(event.created_at),
    }
