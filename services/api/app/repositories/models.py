"""Acceso al registro inmutable de modelos."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import ModelVersion


def get(db: Session, model_id: str) -> ModelVersion | None:
    return db.get(ModelVersion, model_id)


def create(db: Session, **values) -> ModelVersion:
    model = ModelVersion(**values)
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


def list_for_project(db: Session, project_id: str) -> list[ModelVersion]:
    return (
        db.query(ModelVersion)
        .filter(ModelVersion.project_id == project_id)
        .order_by(ModelVersion.version.desc())
        .all()
    )


def list_accessible(db: Session, project_ids: list[str]) -> list[ModelVersion]:
    if not project_ids:
        return []
    return (
        db.query(ModelVersion)
        .filter(ModelVersion.project_id.in_(project_ids))
        .order_by(ModelVersion.created_at.desc())
        .all()
    )


def next_version(db: Session, project_id: str) -> int:
    last = (
        db.query(ModelVersion)
        .filter(ModelVersion.project_id == project_id)
        .order_by(ModelVersion.version.desc())
        .first()
    )
    return (last.version + 1) if last else 1
