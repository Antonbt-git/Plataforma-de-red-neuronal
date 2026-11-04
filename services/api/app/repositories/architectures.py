"""Acceso a arquitecturas versionadas."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import Architecture


def get(db: Session, architecture_id: str) -> Architecture | None:
    return db.get(Architecture, architecture_id)


def create(db: Session, **values) -> Architecture:
    architecture = Architecture(**values)
    db.add(architecture)
    db.commit()
    db.refresh(architecture)
    return architecture


def list_for_project(db: Session, project_id: str) -> list[Architecture]:
    return (
        db.query(Architecture)
        .filter(Architecture.project_id == project_id)
        .order_by(Architecture.created_at.desc())
        .all()
    )


def list_accessible(db: Session, project_ids: list[str]) -> list[Architecture]:
    if not project_ids:
        return []
    return (
        db.query(Architecture)
        .filter(Architecture.project_id.in_(project_ids))
        .order_by(Architecture.created_at.desc())
        .all()
    )


def next_version(db: Session, project_id: str, name: str) -> int:
    last = (
        db.query(Architecture)
        .filter(Architecture.project_id == project_id, Architecture.name == name)
        .order_by(Architecture.version.desc())
        .first()
    )
    return (last.version + 1) if last else 1
