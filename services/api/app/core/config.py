"""Configuración central de NeuroLab Enterprise.

Todos los valores sensibles se leen de variables de entorno. Nunca se
incluyen secretos en el bundle del frontend.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[2]


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on", "si", "sí"}


def _origins() -> tuple[str, ...]:
    raw = os.getenv(
        "NEUROLAB_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
    )
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def _database_url() -> str:
    """Normaliza la URL de base de datos para SQLAlchemy + psycopg.

    Supabase y otros proveedores entregan ``postgresql://`` o ``postgres://``.
    SQLAlchemy necesita el dialecto explícito ``postgresql+psycopg`` para usar
    psycopg 3. También se elimina el parámetro ``pgbouncer`` de Prisma, que
    psycopg no entiende.
    """
    raw = os.getenv(
        "NEUROLAB_DATABASE_URL", f"sqlite:///{API_ROOT / 'neurolab.db'}"
    ).strip()
    for prefix in ("postgres://", "postgresql://"):
        if raw.startswith(prefix):
            raw = "postgresql+psycopg://" + raw[len(prefix):]
            break
    raw = raw.replace("?pgbouncer=true", "").replace("&pgbouncer=true", "")
    return raw.rstrip("?&")


@dataclass(frozen=True)
class Settings:
    app_name: str = "NeuroLab Enterprise API"
    version: str = "2.0.0"
    environment: str = os.getenv("NEUROLAB_ENV", "development")

    secret: str = os.getenv("NEUROLAB_SECRET", "local-dev-secret-change-before-deploy")
    token_hours: int = _int_env("NEUROLAB_TOKEN_HOURS", 8)

    database_url: str = field(default_factory=_database_url)
    storage_dir: Path = Path(
        os.getenv("NEUROLAB_STORAGE_DIR", str(API_ROOT / "storage"))
    )

    cors_origins: tuple[str, ...] = field(default_factory=_origins)
    # Expresión regular opcional para orígenes dinámicos (previews de Vercel).
    # Ejemplo: https://.*\.vercel\.app
    cors_origin_regex: str = os.getenv("NEUROLAB_CORS_ORIGIN_REGEX", "").strip()
    max_upload_bytes: int = _int_env("NEUROLAB_MAX_UPLOAD_BYTES", 5_000_000)
    worker_count: int = _int_env("NEUROLAB_WORKERS", 2)
    # Pausa didáctica entre épocas para que el progreso sea observable por SSE.
    # No altera las métricas: el entrenamiento es real.
    epoch_delay_ms: int = _int_env("NEUROLAB_EPOCH_DELAY_MS", 120)
    seed_demo: bool = _bool_env("NEUROLAB_SEED_DEMO", True)
    # Contraseñas iniciales del seed. Cámbialas en producción.
    demo_password: str = os.getenv("NEUROLAB_DEMO_PASSWORD", "NeuroLab2026!")
    demo_analyst_password: str = os.getenv(
        "NEUROLAB_DEMO_ANALYST_PASSWORD", "Analista2026!"
    )
    demo_reviewer_password: str = os.getenv(
        "NEUROLAB_DEMO_REVIEWER_PASSWORD", "Revisor2026!"
    )
    login_rate_limit: int = _int_env("NEUROLAB_LOGIN_RATE_LIMIT", 10)
    write_rate_limit: int = _int_env("NEUROLAB_WRITE_RATE_LIMIT", 120)

    @property
    def datasets_dir(self) -> Path:
        return self.storage_dir / "datasets"

    @property
    def models_dir(self) -> Path:
        return self.storage_dir / "models"

    def ensure_dirs(self) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.datasets_dir.mkdir(parents=True, exist_ok=True)
        self.models_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
