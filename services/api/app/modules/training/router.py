"""Cola de entrenamientos, estado persistido y canal SSE."""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, project_for_read, project_for_write
from app.core.limits import rate_limit
from app.db.base import SessionLocal, get_db
from app.db.models import (
    Architecture,
    Dataset,
    Project,
    TrainingJob,
    User,
)
from app.modules.architectures.validation import validate_for_training
from app.modules.training.worker import worker
from app.repositories import (
    architectures as architectures_repo,
    audit,
    datasets as datasets_repo,
    jobs as jobs_repo,
    projects as projects_repo,
)
from app.schemas import TrainingCreate
from app.schemas.serializers import job_out

router = APIRouter(tags=["Entrenamientos"])
TERMINAL = {"COMPLETED", "FAILED", "CANCELLED"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _job_payload(db: Session, job: TrainingJob, include_history: bool = True) -> dict:
    project = db.get(Project, job.project_id)
    architecture = db.get(Architecture, job.architecture_id)
    dataset = db.get(Dataset, job.dataset_id)
    return job_out(
        db,
        job,
        project_name=project.name if project else None,
        architecture_name=architecture.name if architecture else None,
        dataset_name=dataset.name if dataset else None,
        include_history=include_history,
    )


def _accessible_jobs(db: Session, user: User, limit: int = 100) -> list[TrainingJob]:
    project_ids = [p.id for p in projects_repo.list_accessible(db, user)]
    return jobs_repo.list_accessible(db, project_ids, limit=limit)


@router.get("/training-jobs")
def list_all_jobs(
    limit: int = 100,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = _accessible_jobs(db, user, limit=min(max(limit, 1), 200))
    return {"items": [_job_payload(db, job) for job in items], "total": len(items)}


@router.get("/projects/{project_id}/training-jobs")
def list_project_jobs(
    project: Project = Depends(project_for_read),
    db: Session = Depends(get_db),
):
    items = jobs_repo.list_for_project(db, project.id)
    return {"items": [_job_payload(db, job) for job in items], "total": len(items)}


@router.post("/projects/{project_id}/training-jobs", status_code=202)
def create_job(
    payload: TrainingCreate,
    request: Request,
    project: Project = Depends(project_for_write),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rate_limit(request, "write", settings.write_rate_limit, 60)
    architecture = architectures_repo.get(db, payload.architecture_id)
    dataset = datasets_repo.get(db, payload.dataset_id)
    if not architecture or architecture.project_id != project.id:
        raise HTTPException(status_code=404, detail="Arquitectura no encontrada en este proyecto.")
    if not dataset or dataset.project_id != project.id:
        raise HTTPException(status_code=404, detail="Dataset no encontrado en este proyecto.")

    config = dict(architecture.config_json or {})
    errors = validate_for_training(config)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})

    metadata = dict(dataset.metadata_json or {})
    features = metadata.get("feature_columns") or [
        c for c in metadata.get("numeric_columns", []) if c != dataset.target_column
    ]
    if not features:
        raise HTTPException(status_code=422, detail="El dataset no tiene variables numéricas de entrada.")
    if int(config.get("input_units", 0)) != len(features):
        raise HTTPException(
            status_code=422,
            detail={
                "errors": [
                    f"La arquitectura espera {config.get('input_units')} entradas, pero el "
                    f"dataset '{dataset.name}' tiene {len(features)} variables numéricas "
                    f"({', '.join(features)}). Ajusta la capa de entrada."
                ]
            },
        )

    task = metadata.get("task")
    classes = metadata.get("classes") or []
    output_units = int(config.get("output_units", 1))
    loss = config.get("loss")
    expected_loss = {
        "binary": "binary_crossentropy",
        "multiclass": "categorical_crossentropy",
        "regression": "mse",
    }.get(str(task))
    if expected_loss and loss != expected_loss:
        raise HTTPException(
            status_code=422,
            detail={
                "errors": [
                    f"El dataset es de tipo {task}; la función de pérdida debe ser "
                    f"{expected_loss}, no {loss}."
                ]
            },
        )
    if task == "binary" and output_units != 1:
        raise HTTPException(status_code=422, detail={"errors": ["La salida binaria debe tener una neurona."]})
    if task == "multiclass" and output_units != len(classes):
        raise HTTPException(
            status_code=422,
            detail={
                "errors": [
                    f"El dataset tiene {len(classes)} clases; la capa de salida debe tener "
                    f"{len(classes)} neuronas con activación Softmax."
                ]
            },
        )
    if task == "regression" and output_units != 1:
        raise HTTPException(status_code=422, detail={"errors": ["La salida de regresión debe tener una neurona."]})

    job = jobs_repo.create(
        db,
        project_id=project.id,
        architecture_id=architecture.id,
        dataset_id=dataset.id,
        status="QUEUED",
        progress=0.0,
        epochs=payload.epochs or int(config.get("epochs", 30)),
        current_epoch=0,
        learning_rate=payload.learning_rate or float(config.get("learning_rate", 0.01)),
        batch_size=payload.batch_size or int(config.get("batch_size", 24)),
        optimizer=str(config.get("optimizer", "Adam")),
        loss_function=str(loss),
        seed=payload.seed,
        created_by=user.id,
    )
    audit.log(
        db,
        actor_id=user.id,
        project_id=project.id,
        action="training.queued",
        job_id=job.id,
        architecture_id=architecture.id,
        dataset_id=dataset.id,
        epochs=job.epochs,
    )
    worker.submit(job.id)
    return _job_payload(db, job)


@router.get("/training-jobs/{job_id}")
def get_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = jobs_repo.get(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Entrenamiento no encontrado.")
    project = projects_repo.get(db, job.project_id)
    if not project or not projects_repo.can_read(db, project, user):
        raise HTTPException(status_code=404, detail="Entrenamiento no encontrado.")
    return _job_payload(db, job)


@router.get("/training-jobs/{job_id}/metrics")
def get_metrics(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = jobs_repo.get(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Entrenamiento no encontrado.")
    project = projects_repo.get(db, job.project_id)
    if not project or not projects_repo.can_read(db, project, user):
        raise HTTPException(status_code=404, detail="Entrenamiento no encontrado.")
    return {"job_id": job.id, "history": _job_payload(db, job)["history"]}


@router.post("/training-jobs/{job_id}/cancel")
def cancel_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = jobs_repo.get(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Entrenamiento no encontrado.")
    project = projects_repo.get(db, job.project_id)
    if not project or not projects_repo.can_write(db, project, user):
        raise HTTPException(status_code=403, detail="No tienes permisos para cancelar este trabajo.")
    if job.status in TERMINAL:
        raise HTTPException(status_code=409, detail="El trabajo ya finalizó y no puede cancelarse.")
    job.cancel_requested = True
    message = "Solicitud de cancelación registrada; el worker confirmará el estado final."
    if job.status == "QUEUED":
        job.status = "CANCELLED"
        job.ended_at = _utcnow()
        job.error_message = "Cancelado antes de iniciar."
        message = "El trabajo se canceló antes de iniciar."
    db.commit()
    db.refresh(job)
    audit.log(
        db,
        actor_id=user.id,
        project_id=project.id,
        action="training.cancel_requested",
        job_id=job.id,
        status=job.status,
    )
    return {"message": message, "job": _job_payload(db, job)}


@router.get("/training-jobs/{job_id}/events")
def stream_events(job_id: str, user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        job = jobs_repo.get(db, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Entrenamiento no encontrado.")
        project = projects_repo.get(db, job.project_id)
        if not project or not projects_repo.can_read(db, project, user):
            raise HTTPException(status_code=404, detail="Entrenamiento no encontrado.")
    finally:
        db.close()

    def event_stream():
        last_state = None
        heartbeat = 0
        while True:
            session = SessionLocal()
            try:
                current = jobs_repo.get(session, job_id)
                if not current:
                    yield "event: error\ndata: {\"detail\":\"Entrenamiento no encontrado\"}\n\n"
                    return
                payload = _job_payload(session, current)
                state_key = (
                    payload["status"],
                    payload["current_epoch"],
                    len(payload["history"]),
                )
                if state_key != last_state:
                    yield f"event: state\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                    last_state = state_key
                    heartbeat = 0
                else:
                    heartbeat += 1
                    if heartbeat >= 30:
                        yield ": keep-alive\n\n"
                        heartbeat = 0
                if payload["status"] in TERMINAL:
                    yield f"event: done\ndata: {json.dumps({'status': payload['status']})}\n\n"
                    return
            finally:
                session.close()
            time.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
