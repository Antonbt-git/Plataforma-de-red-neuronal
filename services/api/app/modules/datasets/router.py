"""Carga, inspección y descarga controlada de datasets."""
from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, project_for_read, project_for_write
from app.core.limits import rate_limit
from app.db.base import get_db
from app.db.models import Dataset, Project, TrainingJob, User, new_id
from app.modules.datasets.service import DatasetError, parse_csv
from app.repositories import audit, datasets as datasets_repo, projects as projects_repo
from app.schemas.serializers import dataset_out

router = APIRouter(tags=["Datasets"])


@router.get("/datasets")
def list_all_datasets(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    accessible = projects_repo.list_accessible(db, user)
    items = datasets_repo.list_accessible(db, [p.id for p in accessible])
    return {"items": [dataset_out(d) for d in items], "total": len(items)}


@router.get("/projects/{project_id}/datasets")
def list_project_datasets(
    project: Project = Depends(project_for_read),
    db: Session = Depends(get_db),
):
    items = datasets_repo.list_for_project(db, project.id)
    return {"items": [dataset_out(d) for d in items], "total": len(items)}


@router.post("/projects/{project_id}/datasets", status_code=201)
async def upload_dataset(
    request: Request,
    file: UploadFile = File(...),
    target_column: str | None = Form(default=None),
    name: str | None = Form(default=None),
    project: Project = Depends(project_for_write),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rate_limit(request, "write", settings.write_rate_limit, 60)
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="El archivo supera el límite permitido.")
    if not content:
        raise HTTPException(status_code=422, detail="El archivo está vacío.")
    try:
        parsed = parse_csv(
            content,
            filename=file.filename or "dataset.csv",
            target_column=target_column,
            max_bytes=settings.max_upload_bytes,
        )
    except DatasetError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    dataset_id = new_id()
    storage_key = f"datasets/{dataset_id}.csv"
    destination = settings.storage_dir / storage_key
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)

    metadata = parsed.metadata
    dataset = Dataset(
        id=dataset_id,
        project_id=project.id,
        name=(name or file.filename or "dataset.csv").strip()[:200],
        version=datasets_repo.next_version(
            db, project.id, (name or file.filename or "dataset.csv").strip()[:200]
        ),
        storage_key=storage_key,
        target_column=metadata["target_column"],
        checksum=hashlib.sha256(content).hexdigest(),
        size_bytes=len(content),
        metadata_json=metadata,
        created_by=user.id,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    audit.log(
        db,
        actor_id=user.id,
        project_id=project.id,
        action="dataset.uploaded",
        dataset_id=dataset.id,
        rows=metadata["rows"],
        target=metadata["target_column"],
    )
    return dataset_out(dataset)


@router.get("/datasets/{dataset_id}")
def get_dataset(
    dataset_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dataset = datasets_repo.get(db, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset no encontrado.")
    project = datasets_repo.project_of(db, dataset)
    if not project or not projects_repo.can_read(db, project, user):
        raise HTTPException(status_code=404, detail="Dataset no encontrado.")
    return dataset_out(dataset)


@router.get("/datasets/{dataset_id}/download")
def download_dataset(
    dataset_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dataset = datasets_repo.get(db, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset no encontrado.")
    project = datasets_repo.project_of(db, dataset)
    if not project or not projects_repo.can_read(db, project, user):
        raise HTTPException(status_code=404, detail="Dataset no encontrado.")
    path = settings.storage_dir / dataset.storage_key
    if not path.exists():
        raise HTTPException(status_code=410, detail="El archivo ya no está disponible.")
    return FileResponse(path, media_type="text/csv", filename=f"{dataset.name}")


@router.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(
    dataset_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dataset = datasets_repo.get(db, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset no encontrado.")
    project = datasets_repo.project_of(db, dataset)
    if not project or not projects_repo.can_write(db, project, user):
        raise HTTPException(status_code=403, detail="No tienes permisos para eliminar este dataset.")
    jobs = (
        db.query(func.count(TrainingJob.id))
        .filter(TrainingJob.dataset_id == dataset.id)
        .scalar()
        or 0
    )
    if jobs:
        raise HTTPException(
            status_code=409,
            detail="El dataset tiene entrenamientos asociados y no puede eliminarse por trazabilidad.",
        )
    path: Path = settings.storage_dir / dataset.storage_key
    path.unlink(missing_ok=True)
    datasets_repo.delete(db, dataset)
    audit.log(
        db,
        actor_id=user.id,
        project_id=project.id,
        action="dataset.deleted",
        dataset_id=dataset_id,
    )
