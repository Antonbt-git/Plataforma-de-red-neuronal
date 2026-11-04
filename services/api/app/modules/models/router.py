"""Registro inmutable de versiones de modelos."""
from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, project_for_read, project_for_review
from app.db.base import get_db
from app.db.models import ModelVersion, Project, User
from app.repositories import audit, models as models_repo, projects as projects_repo
from app.schemas import ModelStatusUpdate
from app.schemas.serializers import model_out

router = APIRouter(tags=["Modelos"])

TRANSITIONS = {
    "draft": {"reviewed", "retired"},
    "reviewed": {"approved", "retired"},
    "approved": {"retired"},
    "retired": set(),
}


def _project_name(db: Session, model: ModelVersion) -> str | None:
    project = db.get(Project, model.project_id)
    return project.name if project else None


@router.get("/models")
def list_all_models(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    accessible = projects_repo.list_accessible(db, user)
    items = models_repo.list_accessible(db, [p.id for p in accessible])
    return {
        "items": [model_out(model, project_name=_project_name(db, model)) for model in items],
        "total": len(items),
    }


@router.get("/projects/{project_id}/models")
def list_project_models(
    project: Project = Depends(project_for_read),
    db: Session = Depends(get_db),
):
    items = models_repo.list_for_project(db, project.id)
    return {
        "items": [model_out(model, project_name=project.name) for model in items],
        "total": len(items),
    }


@router.get("/models/{model_id}")
def get_model(
    model_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    model = models_repo.get(db, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Modelo no encontrado.")
    project = db.get(Project, model.project_id)
    if not project or not projects_repo.can_read(db, project, user):
        raise HTTPException(status_code=404, detail="Modelo no encontrado.")
    return model_out(model, project_name=project.name)


@router.patch("/models/{model_id}/status")
def update_model_status(
    model_id: str,
    payload: ModelStatusUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    model = models_repo.get(db, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Modelo no encontrado.")
    project = db.get(Project, model.project_id)
    if not project or not projects_repo.can_review(db, project, user):
        raise HTTPException(status_code=403, detail="No tienes permisos para revisar modelos.")
    if payload.status not in TRANSITIONS.get(model.status, set()):
        raise HTTPException(
            status_code=409,
            detail=f"Transición no permitida: {model.status} → {payload.status}.",
        )
    previous = model.status
    model.status = payload.status
    db.commit()
    db.refresh(model)
    audit.log(
        db,
        actor_id=user.id,
        project_id=model.project_id,
        action="model.status_changed",
        model_id=model.id,
        from_status=previous,
        to_status=model.status,
    )
    return model_out(model, project_name=project.name)


@router.get("/models/{model_id}/download")
def download_model(
    model_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    model = models_repo.get(db, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Modelo no encontrado.")
    project = db.get(Project, model.project_id)
    if not project or not projects_repo.can_read(db, project, user):
        raise HTTPException(status_code=404, detail="Modelo no encontrado.")
    path = settings.storage_dir / model.storage_key
    if not path.exists():
        raise HTTPException(status_code=410, detail="El artefacto ya no está disponible.")
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    if digest.hexdigest() != model.checksum:
        raise HTTPException(status_code=409, detail="La verificación de integridad del modelo falló.")
    audit.log(
        db,
        actor_id=user.id,
        project_id=model.project_id,
        action="model.downloaded",
        model_id=model.id,
        version=model.version,
    )
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=f"neurolab_{project.name.replace(' ', '_')}_v{model.version}.npz",
    )
