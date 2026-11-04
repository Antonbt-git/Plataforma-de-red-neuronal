"""Agregador de la versión 1 de la API."""
from __future__ import annotations

from fastapi import APIRouter

from app.modules.admin.router import router as admin_router
from app.modules.architectures.router import router as architectures_router
from app.modules.auth.router import router as auth_router
from app.modules.datasets.router import router as datasets_router
from app.modules.models.router import router as models_router
from app.modules.projects.router import router as projects_router
from app.modules.reports.router import router as reports_router
from app.modules.training.router import router as training_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(projects_router)
api_router.include_router(datasets_router)
api_router.include_router(architectures_router)
api_router.include_router(training_router)
api_router.include_router(models_router)
api_router.include_router(reports_router)
api_router.include_router(admin_router)
