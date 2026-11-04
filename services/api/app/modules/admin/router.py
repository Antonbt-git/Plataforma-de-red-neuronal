"""Administración de usuarios, salud del sistema y auditoría global."""
from __future__ import annotations

import os
import shutil

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_roles
from app.db.base import get_db
from app.db.models import User
from app.modules.training.worker import worker
from app.modules.training import engine
from app.repositories import audit, users as users_repo
from app.schemas import UserUpdate
from app.schemas.serializers import audit_out, user_out

router = APIRouter(tags=["Administración"])
ADMIN = "Administrador"


@router.get("/users")
def list_users(
    _: User = Depends(require_roles(ADMIN)), db: Session = Depends(get_db)
):
    items = users_repo.list_all(db)
    return {"items": [user_out(user) for user in items], "total": len(items)}


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    payload: UserUpdate,
    actor: User = Depends(require_roles(ADMIN)),
    db: Session = Depends(get_db),
):
    target = users_repo.get(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if target.id == actor.id and payload.status == "disabled":
        raise HTTPException(status_code=409, detail="No puedes deshabilitar tu propia cuenta.")
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(target, key, value)
    db.commit()
    db.refresh(target)
    audit.log(
        db,
        actor_id=actor.id,
        action="admin.user_updated",
        target_user=target.email,
        changes=changes,
    )
    return user_out(target)


@router.get("/system/health")
def system_health(
    _: User = Depends(require_roles(ADMIN)), db: Session = Depends(get_db)
):
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_ok = False
    storage_ok = True
    try:
        probe = settings.storage_dir / ".health"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
    except OSError:
        storage_ok = False
    total, used, free = shutil.disk_usage(settings.storage_dir)
    return {
        "status": "ok" if db_ok and storage_ok else "degraded",
        "version": settings.version,
        "environment": settings.environment,
        "database": {
            "ok": db_ok,
            "url_engine": settings.database_url.split(":", 1)[0],
        },
        "storage": {
            "ok": storage_ok,
            "path": str(settings.storage_dir),
            "free_gb": round(free / 1024**3, 2),
            "used_percent": round(used / total * 100, 2) if total else 0,
        },
        "worker": {"queue_size": worker.queue_size(), "configured_workers": worker.worker_count},
        "engine": engine.engine_status(),
        "pid": os.getpid(),
    }


@router.get("/audit-events")
def list_audit_events(
    limit: int = 150,
    _: User = Depends(require_roles(ADMIN)), db: Session = Depends(get_db)
):
    events = audit.list_events(db, limit=min(max(limit, 1), 500))
    users = {u.id: u for u in users_repo.list_all(db)}
    return {
        "items": [
            audit_out(
                event,
                actor_email=users[event.actor_id].email if event.actor_id in users else None,
            )
            for event in events
        ],
        "total": len(events),
    }
