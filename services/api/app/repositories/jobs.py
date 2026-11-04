"""Acceso a trabajos de entrenamiento y métricas."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import TrainingJob, TrainingMetric


def get(db: Session, job_id: str) -> TrainingJob | None:
    return db.get(TrainingJob, job_id)


def create(db: Session, **values) -> TrainingJob:
    job = TrainingJob(**values)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def list_for_project(db: Session, project_id: str, limit: int = 100) -> list[TrainingJob]:
    return (
        db.query(TrainingJob)
        .filter(TrainingJob.project_id == project_id)
        .order_by(TrainingJob.created_at.desc())
        .limit(limit)
        .all()
    )


def list_accessible(db: Session, project_ids: list[str], limit: int = 100) -> list[TrainingJob]:
    if not project_ids:
        return []
    return (
        db.query(TrainingJob)
        .filter(TrainingJob.project_id.in_(project_ids))
        .order_by(TrainingJob.created_at.desc())
        .limit(limit)
        .all()
    )


def metrics(db: Session, job_id: str) -> list[TrainingMetric]:
    return (
        db.query(TrainingMetric)
        .filter(TrainingMetric.job_id == job_id)
        .order_by(TrainingMetric.epoch.asc(), TrainingMetric.metric_name.asc())
        .all()
    )


def add_metrics(db: Session, job_id: str, epoch: int, values: dict[str, float]) -> None:
    for name, value in values.items():
        exists = (
            db.query(TrainingMetric)
            .filter(
                TrainingMetric.job_id == job_id,
                TrainingMetric.epoch == epoch,
                TrainingMetric.metric_name == name,
            )
            .first()
        )
        if not exists:
            db.add(
                TrainingMetric(
                    job_id=job_id,
                    epoch=epoch,
                    metric_name=name,
                    metric_value=float(value),
                )
            )


def pending_jobs(db: Session) -> list[TrainingJob]:
    return db.query(TrainingJob).filter(TrainingJob.status == "QUEUED").all()


def interrupted_jobs(db: Session) -> list[TrainingJob]:
    return (
        db.query(TrainingJob)
        .filter(TrainingJob.status.in_(["PREPARING", "RUNNING"]))
        .all()
    )
