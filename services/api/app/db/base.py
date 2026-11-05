"""Motor y sesiones de base de datos."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.models import Base

connect_args: dict = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    db_url = make_url(settings.database_url)
    if db_url.get_backend_name() == "postgresql":
        # Supavisor/PgBouncer en modo transacción (puerto 6543) no soporta
        # sentencias preparadas. psycopg 3 las desactiva con prepare_threshold.
        # En el pooler de sesión (5432) o conexión directa no es necesario.
        is_transaction_pooler = db_url.port == 6543
        if is_transaction_pooler:
            connect_args["prepare_threshold"] = None
        connect_args["connect_timeout"] = 10

engine: Engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    future=True,
)

if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _record):  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    settings.ensure_dirs()
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
