"""Dependencias comunes: sesión, usuario autenticado y autorización por proyecto."""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.base import get_db
from app.db.models import Project, User
from app.repositories import projects as projects_repo
from app.repositories import users as users_repo


def get_current_user(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None, description="Token para SSE/descargas"),
    db: Session = Depends(get_db),
) -> User:
    raw = None
    if authorization and authorization.lower().startswith("bearer "):
        raw = authorization.split(" ", 1)[1].strip()
    elif token:
        raw = token.strip()
    if not raw:
        raise HTTPException(
            status_code=401, detail="Debes iniciar sesión para acceder a este recurso."
        )
    payload = decode_access_token(raw)
    user = users_repo.get(db, str(payload["sub"]))
    if not user or user.status != "active":
        raise HTTPException(status_code=401, detail="La cuenta no está activa.")
    return user


def require_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if roles and user.role not in roles:
            raise HTTPException(status_code=403, detail="No tienes permisos para esta acción.")
        return user

    return dependency


def project_for_read(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    project = projects_repo.get(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if not projects_repo.can_read(db, project, user):
        # 404 para no revelar la existencia de proyectos ajenos.
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return project


def project_for_write(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    project = projects_repo.get(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if not projects_repo.can_write(db, project, user):
        raise HTTPException(status_code=403, detail="No tienes permisos de edición en este proyecto.")
    return project


def project_for_review(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    project = projects_repo.get(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if not projects_repo.can_review(db, project, user):
        raise HTTPException(status_code=403, detail="No tienes permisos de revisión en este proyecto.")
    return project
