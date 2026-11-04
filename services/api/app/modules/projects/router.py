"""Proyectos, miembros y auditoría del proyecto."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, project_for_read, project_for_write
from app.core.limits import rate_limit
from app.db.base import get_db
from app.db.models import Project, User
from app.repositories import audit, projects as projects_repo, users as users_repo
from app.schemas import MemberCreate, ProjectCreate, ProjectUpdate
from app.schemas.serializers import audit_out, project_out, user_out

router = APIRouter(prefix="/projects", tags=["Proyectos"])


def _owner(db: Session, project: Project) -> User | None:
    return users_repo.get(db, project.owner_id)


@router.get("")
def list_projects(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    items = projects_repo.list_accessible(db, user)
    return {"items": [project_out(db, p, _owner(db, p)) for p in items], "total": len(items)}


@router.post("", status_code=201)
def create_project(
    payload: ProjectCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rate_limit(request, "write", settings.write_rate_limit, 60)
    project = projects_repo.create(
        db,
        name=payload.name,
        description=payload.description,
        family=payload.family,
        owner=user,
    )
    audit.log(
        db,
        actor_id=user.id,
        project_id=project.id,
        action="project.created",
        name=project.name,
        family=project.family,
    )
    return project_out(db, project, user)


@router.get("/{project_id}")
def get_project(
    project: Project = Depends(project_for_read),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return project_out(db, project, _owner(db, project))


@router.patch("/{project_id}")
def update_project(
    payload: ProjectUpdate,
    project: Project = Depends(project_for_write),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updated = projects_repo.update(db, project, **payload.model_dump(exclude_unset=True))
    audit.log(
        db,
        actor_id=user.id,
        project_id=project.id,
        action="project.updated",
        changes=payload.model_dump(exclude_unset=True),
    )
    return project_out(db, updated, _owner(db, updated))


@router.get("/{project_id}/members")
def list_members(
    project: Project = Depends(project_for_read),
    db: Session = Depends(get_db),
):
    members = []
    for member, member_user in projects_repo.members(db, project.id):
        members.append({**user_out(member_user), "project_role": member.role})
    return {"items": members, "total": len(members)}


@router.post("/{project_id}/members", status_code=201)
def add_member(
    payload: MemberCreate,
    project: Project = Depends(project_for_write),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member_user = users_repo.get_by_email(db, payload.email)
    if not member_user:
        raise HTTPException(status_code=404, detail="No existe un usuario con ese correo.")
    if member_user.id == project.owner_id:
        raise HTTPException(status_code=409, detail="El propietario ya pertenece al proyecto.")
    member = projects_repo.add_member(db, project.id, member_user.id, payload.role)
    audit.log(
        db,
        actor_id=user.id,
        project_id=project.id,
        action="project.member_added",
        member_email=member_user.email,
        role=payload.role,
    )
    return {**user_out(member_user), "project_role": member.role}


@router.delete("/{project_id}/members/{user_id}", status_code=204)
def remove_member(
    user_id: str,
    project: Project = Depends(project_for_write),
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user_id == project.owner_id:
        raise HTTPException(status_code=409, detail="No se puede retirar al propietario del proyecto.")
    if not projects_repo.remove_member(db, project.id, user_id):
        raise HTTPException(status_code=404, detail="Miembro no encontrado.")
    audit.log(
        db,
        actor_id=actor.id,
        project_id=project.id,
        action="project.member_removed",
        member_id=user_id,
    )


@router.get("/{project_id}/audit-events")
def project_audit(
    project: Project = Depends(project_for_read),
    db: Session = Depends(get_db),
):
    events = audit.list_events(db, project_id=project.id, limit=100)
    users = {u.id: u for u in users_repo.list_all(db)}
    return {
        "items": [
            audit_out(event, actor_email=users[event.actor_id].email if event.actor_id in users else None)
            for event in events
        ],
        "total": len(events),
    }
