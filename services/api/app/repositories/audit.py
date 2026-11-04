"""Registro de auditoría."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import AuditEvent


def log(
    db: Session,
    *,
    actor_id: str | None,
    action: str,
    project_id: str | None = None,
    **metadata,
) -> AuditEvent:
    event = AuditEvent(
        actor_id=actor_id,
        project_id=project_id,
        action=action,
        metadata_json=metadata,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_events(
    db: Session,
    *,
    project_id: str | None = None,
    actor_id: str | None = None,
    limit: int = 100,
) -> list[AuditEvent]:
    query = db.query(AuditEvent)
    if project_id:
        query = query.filter(AuditEvent.project_id == project_id)
    if actor_id:
        query = query.filter(AuditEvent.actor_id == actor_id)
    return query.order_by(AuditEvent.created_at.desc()).limit(min(limit, 500)).all()
