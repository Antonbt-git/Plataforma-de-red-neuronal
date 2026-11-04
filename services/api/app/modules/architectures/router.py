"""Arquitecturas neuronales validadas y versionadas."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, project_for_read, project_for_write
from app.core.limits import rate_limit
from app.db.base import get_db
from app.db.models import Architecture, Project, User
from app.modules.architectures.validation import validate_architecture
from app.repositories import architectures as architectures_repo, audit, projects as projects_repo
from app.schemas import ArchitectureCreate
from app.schemas.serializers import architecture_out

router = APIRouter(tags=["Arquitecturas"])


@router.post("/architectures/validate")
def validate_only(
    payload: ArchitectureCreate,
    request: Request,
    user: User = Depends(get_current_user),
):
    rate_limit(request, "write", settings.write_rate_limit, 60)
    errors, parameters = validate_architecture(payload)
    return {
        "valid": not errors,
        "errors": errors,
        "parameter_count": parameters,
        "family": payload.family,
        "message": (
            "Configuración validada por el servidor."
            if not errors
            else "La configuración contiene errores."
        ),
    }


@router.get("/projects/{project_id}/architectures")
def list_architectures(
    project: Project = Depends(project_for_read),
    db: Session = Depends(get_db),
):
    items = architectures_repo.list_for_project(db, project.id)
    return {"items": [architecture_out(a) for a in items], "total": len(items)}


@router.post("/projects/{project_id}/architectures", status_code=201)
def create_architecture(
    payload: ArchitectureCreate,
    request: Request,
    project: Project = Depends(project_for_write),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rate_limit(request, "write", settings.write_rate_limit, 60)
    errors, parameters = validate_architecture(payload)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})
    version = architectures_repo.next_version(db, project.id, payload.name)
    architecture = architectures_repo.create(
        db,
        project_id=project.id,
        name=payload.name.strip(),
        family=payload.family,
        config_json=payload.model_dump(),
        version=version,
        parameter_count=parameters,
        created_by=user.id,
    )
    audit.log(
        db,
        actor_id=user.id,
        project_id=project.id,
        action="architecture.created",
        architecture_id=architecture.id,
        version=version,
        family=payload.family,
        parameters=parameters,
    )
    return architecture_out(architecture)


@router.get("/architectures/{architecture_id}")
def get_architecture(
    architecture_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    architecture = architectures_repo.get(db, architecture_id)
    if not architecture:
        raise HTTPException(status_code=404, detail="Arquitectura no encontrada.")
    project = projects_repo.get(db, architecture.project_id)
    if not project or not projects_repo.can_read(db, project, user):
        raise HTTPException(status_code=404, detail="Arquitectura no encontrada.")
    return architecture_out(architecture)
