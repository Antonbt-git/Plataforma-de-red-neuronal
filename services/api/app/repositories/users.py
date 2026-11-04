"""Acceso a usuarios."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import User


def get_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email.strip().lower()).first()


def get(db: Session, user_id: str) -> User | None:
    return db.get(User, user_id)


def list_all(db: Session) -> list[User]:
    return db.query(User).order_by(User.created_at.asc()).all()


def create(
    db: Session,
    *,
    email: str,
    password_hash: str,
    display_name: str,
    role: str,
    status: str = "active",
) -> User:
    user = User(
        email=email.strip().lower(),
        password_hash=password_hash,
        display_name=display_name,
        role=role,
        status=status,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
