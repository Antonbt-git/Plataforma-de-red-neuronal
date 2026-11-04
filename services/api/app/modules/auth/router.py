"""Autenticación de usuarios."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.limits import rate_limit
from app.core.security import create_access_token, verify_password
from app.db.base import get_db
from app.db.models import User
from app.repositories import audit, users as users_repo
from app.schemas import LoginInput
from app.schemas.serializers import user_out

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login")
def login(payload: LoginInput, request: Request, db: Session = Depends(get_db)):
    rate_limit(request, "login", settings.login_rate_limit, 60)
    user = users_repo.get_by_email(db, payload.email)
    if not user or user.status != "active" or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")
    token, expires_in = create_access_token(user.id, user.email, user.role)
    audit.log(db, actor_id=user.id, action="auth.login", email=user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": user_out(user),
    }


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)
