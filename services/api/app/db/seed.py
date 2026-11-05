"""Datos demo no sensibles para que el MVP sea demostrable al primer arranque."""
from __future__ import annotations

import csv
import hashlib
import io
import random

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.core.security import hash_password
from app.db.models import Architecture, Dataset, Project, ProjectMember, User, new_id
from app.repositories import audit, projects as projects_repo, users as users_repo

logger = get_logger("neurolab.seed")

DEMO_EMAIL = "admin@neurolab.local"


def _ensure_user(db: Session, email: str, password: str, name: str, role: str) -> User:
    existing = users_repo.get_by_email(db, email)
    if existing:
        return existing
    return users_repo.create(
        db,
        email=email,
        password_hash=hash_password(password),
        display_name=name,
        role=role,
    )


def _generate_csv() -> bytes:
    rng = random.Random(42)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["edad", "ingresos", "antiguedad", "compras", "segmento"])
    for _ in range(600):
        age = rng.randint(18, 70)
        income = round(rng.uniform(800, 9000), 2)
        tenure = rng.randint(0, 15)
        purchases = rng.randint(0, 40)
        score = (
            (age - 40) * 0.02
            + (income - 4000) / 4000 * 0.8
            + tenure * 0.18
            + purchases * 0.09
            + rng.gauss(0, 0.35)
        )
        writer.writerow([age, income, tenure, purchases, "alto" if score > 1.35 else "base"])
    return buffer.getvalue().encode("utf-8")


def _dataset_metadata(content: bytes) -> tuple[dict, str]:
    rows = list(csv.DictReader(io.StringIO(content.decode("utf-8"))))
    preview = rows[:3]
    metadata = {
        "filename": "clientes_demo.csv",
        "rows": len(rows),
        "columns": 5,
        "column_names": ["edad", "ingresos", "antiguedad", "compras", "segmento"],
        "numeric_columns": ["edad", "ingresos", "antiguedad", "compras"],
        "target_column": "segmento",
        "feature_columns": ["edad", "ingresos", "antiguedad", "compras"],
        "task": "binary",
        "classes": ["alto", "base"],
        "missing_cells": 0,
        "preview": preview,
        "delimiter": ",",
    }
    return metadata, hashlib.sha256(content).hexdigest()


def seed_demo(db: Session) -> None:
    if not settings.seed_demo:
        return
    admin = _ensure_user(db, DEMO_EMAIL, settings.demo_password, "Administrador NeuroLab", "Administrador")
    analyst = _ensure_user(
        db,
        "analista@neurolab.local",
        settings.demo_analyst_password,
        "Analista de IA",
        "Analista",
    )
    reviewer = _ensure_user(
        db,
        "revisor@neurolab.local",
        settings.demo_reviewer_password,
        "Revisor de modelos",
        "Revisor",
    )

    project = (
        db.query(Project)
        .filter(Project.name == "Clasificación de clientes")
        .first()
    )
    if not project:
        project = projects_repo.create(
            db,
            name="Clasificación de clientes",
            description=(
                "Proyecto demo para clasificar clientes con probabilidad de compra "
                "a partir de variables tabulares."
            ),
            family="Feedforward",
            owner=admin,
        )
        audit.log(
            db,
            actor_id=admin.id,
            project_id=project.id,
            action="project.created",
            source="seed",
        )
    for user, role in ((analyst, "Analista"), (reviewer, "Revisor")):
        member = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project.id, ProjectMember.user_id == user.id)
            .first()
        )
        if not member:
            db.add(ProjectMember(project_id=project.id, user_id=user.id, role=role))
    db.commit()

    dataset = (
        db.query(Dataset)
        .filter(Dataset.project_id == project.id, Dataset.name == "clientes_demo.csv")
        .first()
    )
    if dataset and not (settings.storage_dir / dataset.storage_key).exists():
        # La fila existe en la base de datos pero el artefacto se perdió
        # (por ejemplo, un despliegue sin disco persistente). El CSV demo es
        # determinista, así que se regenera con el mismo checksum.
        destination = settings.storage_dir / dataset.storage_key
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(_generate_csv())
        logger.warning("seed.dataset_restored", extra={"dataset_id": dataset.id})
    if not dataset:
        content = _generate_csv()
        metadata, checksum = _dataset_metadata(content)
        destination = settings.datasets_dir / "demo_clientes.csv"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        dataset = Dataset(
            id=new_id(),
            project_id=project.id,
            name="clientes_demo.csv",
            version=1,
            storage_key="datasets/demo_clientes.csv",
            target_column="segmento",
            checksum=checksum,
            size_bytes=len(content),
            metadata_json=metadata,
            created_by=admin.id,
        )
        db.add(dataset)
        db.commit()
        audit.log(
            db,
            actor_id=admin.id,
            project_id=project.id,
            action="dataset.uploaded",
            dataset_id=dataset.id,
            source="seed",
        )

    architecture = (
        db.query(Architecture)
        .filter(Architecture.project_id == project.id, Architecture.name == "MLP base")
        .first()
    )
    if not architecture:
        config = {
            "name": "MLP base",
            "family": "Feedforward",
            "input_units": 4,
            "output_units": 1,
            "output_activation": "sigmoid",
            "layers": [
                {"units": 8, "activation": "relu", "dropout": 0.0},
                {"units": 8, "activation": "relu", "dropout": 0.0},
            ],
            "optimizer": "Adam",
            "loss": "binary_crossentropy",
            "epochs": 30,
            "batch_size": 24,
            "learning_rate": 0.01,
            "sequence_length": None,
            "input_height": None,
            "input_width": None,
            "input_channels": None,
            "latent_dim": None,
        }
        architecture = Architecture(
            project_id=project.id,
            name="MLP base",
            family="Feedforward",
            config_json=config,
            version=1,
            parameter_count=4 * 8 + 8 + 8 * 8 + 8 + 8 * 1 + 1,
            created_by=admin.id,
        )
        db.add(architecture)
        db.commit()
        audit.log(
            db,
            actor_id=admin.id,
            project_id=project.id,
            action="architecture.created",
            architecture_id=architecture.id,
            source="seed",
        )

    logger.info("seed.ready", extra={"project_id": project.id})
