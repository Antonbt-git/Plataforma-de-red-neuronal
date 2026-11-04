"""Punto de entrada de NeuroLab Enterprise API.

Arranque local:
    uvicorn app.main:app --reload --port 8000

Documentación interactiva: http://127.0.0.1:8000/docs
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1 import api_router
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.db.base import SessionLocal, init_db
from app.db.seed import seed_demo
from app.modules.training.worker import worker

configure_logging()
logger = get_logger("neurolab.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_demo(db)
    finally:
        db.close()
    worker.start()
    logger.info("api.started", extra={"engine": settings.environment})
    yield
    worker.stop()
    logger.info("api.stopped")


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description=(
        "API de la plataforma enterprise de redes neuronales: autenticación, "
        "proyectos, datasets, arquitecturas validadas, entrenamientos reales, "
        "métricas en tiempo real, registro de modelos y auditoría."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def security_and_timing(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration = (time.perf_counter() - started) * 1000
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-Process-Time-Ms"] = f"{duration:.1f}"
    if request.url.path.startswith("/api/"):
        logger.info(
            "http.request",
            extra={"duration_ms": round(duration, 1)},
        )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("http.unhandled")
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno controlado. Revisa los logs del servidor."},
    )


app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["Sistema"])
def health():
    database_ok = True
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
    except Exception:  # noqa: BLE001
        database_ok = False
    return {
        "status": "ok" if database_ok else "degraded",
        "service": "neurolab-api",
        "version": settings.version,
        "database": database_ok,
        "worker_queue": worker.queue_size(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/", tags=["Sistema"])
def root():
    return {
        "name": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
        "api": "/api/v1",
    }
