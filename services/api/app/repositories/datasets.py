"""Acceso a datasets."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import Dataset, Project


def get(db: Session, dataset_id: str) -> Dataset | None:
    return db.get(Dataset, dataset_id)


def create(db: Session, **values) -> Dataset:
    dataset = Dataset(**values)
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


def list_for_project(db: Session, project_id: str) -> list[Dataset]:
    return (
        db.query(Dataset)
        .filter(Dataset.project_id == project_id)
        .order_by(Dataset.created_at.desc())
        .all()
    )


def list_accessible(db: Session, project_ids: list[str]) -> list[Dataset]:
    if not project_ids:
        return []
    return (
        db.query(Dataset)
        .filter(Dataset.project_id.in_(project_ids))
        .order_by(Dataset.created_at.desc())
        .all()
    )


def next_version(db: Session, project_id: str, name: str) -> int:
    last = (
        db.query(Dataset)
        .filter(Dataset.project_id == project_id, Dataset.name == name)
        .order_by(Dataset.version.desc())
        .first()
    )
    return (last.version + 1) if last else 1


def delete(db: Session, dataset: Dataset) -> None:
    db.delete(dataset)
    db.commit()


def project_of(db: Session, dataset: Dataset) -> Project | None:
    return db.get(Project, dataset.project_id)
