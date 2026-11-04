"""Acceso a proyectos y miembros."""
from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.models import Project, ProjectMember, User
from app.db.models import utcnow

ROLE_ADMIN = "Administrador"
ROLE_MANAGER = "Responsable"
ROLE_ENGINEER = "Analista"
ROLE_REVIEWER = "Revisor"
ROLE_READER = "Lector"

WRITE_ROLES = {ROLE_ADMIN, ROLE_MANAGER, ROLE_ENGINEER}
REVIEW_ROLES = {ROLE_ADMIN, ROLE_REVIEWER, ROLE_MANAGER}
ALL_ROLES = {ROLE_ADMIN, ROLE_MANAGER, ROLE_ENGINEER, ROLE_REVIEWER, ROLE_READER}


def get(db: Session, project_id: str) -> Project | None:
    return db.get(Project, project_id)


def accessible_query(db: Session, user: User):
    if user.role == ROLE_ADMIN:
        return db.query(Project)
    return (
        db.query(Project)
        .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(or_(Project.owner_id == user.id, ProjectMember.user_id == user.id))
        .distinct()
    )


def list_accessible(db: Session, user: User) -> list[Project]:
    return accessible_query(db, user).order_by(Project.created_at.desc()).all()


def membership(db: Session, project_id: str, user_id: str) -> ProjectMember | None:
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )


def role_for(db: Session, project: Project, user: User) -> str | None:
    if user.role == ROLE_ADMIN:
        return ROLE_ADMIN
    if project.owner_id == user.id:
        return ROLE_MANAGER
    member = membership(db, project.id, user.id)
    if member:
        return member.role
    return None


def can_read(db: Session, project: Project, user: User) -> bool:
    return role_for(db, project, user) is not None


def can_write(db: Session, project: Project, user: User) -> bool:
    role = role_for(db, project, user)
    return role in WRITE_ROLES or user.id == project.owner_id


def can_review(db: Session, project: Project, user: User) -> bool:
    return role_for(db, project, user) in REVIEW_ROLES


def create(
    db: Session,
    *,
    name: str,
    description: str,
    family: str,
    owner: User,
    status: str = "Activo",
) -> Project:
    project = Project(
        name=name.strip(),
        description=description.strip(),
        family=family,
        owner_id=owner.id,
        status=status,
    )
    db.add(project)
    db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=owner.id, role=ROLE_MANAGER))
    db.commit()
    db.refresh(project)
    return project


def update(db: Session, project: Project, **values) -> Project:
    for key, value in values.items():
        if value is not None:
            setattr(project, key, value)
    project.updated_at = utcnow()
    db.commit()
    db.refresh(project)
    return project


def add_member(db: Session, project_id: str, user_id: str, role: str) -> ProjectMember:
    existing = membership(db, project_id, user_id)
    if existing:
        existing.role = role
        db.commit()
        db.refresh(existing)
        return existing
    member = ProjectMember(project_id=project_id, user_id=user_id, role=role)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def remove_member(db: Session, project_id: str, user_id: str) -> bool:
    member = membership(db, project_id, user_id)
    if not member:
        return False
    db.delete(member)
    db.commit()
    return True


def members(db: Session, project_id: str) -> list[tuple[ProjectMember, User]]:
    return (
        db.query(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .filter(ProjectMember.project_id == project_id)
        .all()
    )
