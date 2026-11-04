"""Dashboard, reportes y exportaciones."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, project_for_read
from app.db.base import get_db
from app.db.models import Project, User
from app.repositories import (
    architectures as architectures_repo,
    datasets as datasets_repo,
    jobs as jobs_repo,
    models as models_repo,
    projects as projects_repo,
    users as users_repo,
)
from app.schemas.serializers import (
    architecture_out,
    dataset_out,
    job_out,
    model_out,
    project_out,
)
from app.modules.training.engine import engine_status

router = APIRouter(tags=["Reportes"])


@router.get("/dashboard")
def dashboard(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    projects = projects_repo.list_accessible(db, user)
    project_ids = [p.id for p in projects]
    datasets = datasets_repo.list_accessible(db, project_ids)
    architectures = architectures_repo.list_accessible(db, project_ids)
    jobs = jobs_repo.list_accessible(db, project_ids, limit=200)
    models = models_repo.list_accessible(db, project_ids)
    active = [j for j in jobs if j.status in {"QUEUED", "PREPARING", "RUNNING"}]
    completed = [j for j in jobs if j.status == "COMPLETED"]
    failed = [j for j in jobs if j.status == "FAILED"]
    project_map = {p.id: p for p in projects}
    dataset_map = {d.id: d.name for d in datasets}
    architecture_map = {a.id: a.name for a in architectures}
    recent_jobs = [
        job_out(
            db,
            job,
            project_name=project_map[job.project_id].name if job.project_id in project_map else None,
            architecture_name=architecture_map.get(job.architecture_id),
            dataset_name=dataset_map.get(job.dataset_id),
        )
        for job in jobs[:8]
    ]
    return {
        "counts": {
            "projects": len(projects),
            "active_projects": len([p for p in projects if p.status == "Activo"]),
            "datasets": len(datasets),
            "jobs": len(jobs),
            "active_jobs": len(active),
            "completed_jobs": len(completed),
            "failed_jobs": len(failed),
            "models": len(models),
            "approved_models": len([m for m in models if m.status == "approved"]),
        },
        "recent_jobs": recent_jobs,
        "recent_models": [
            model_out(model, project_name=project_map.get(model.project_id).name if project_map.get(model.project_id) else None)
            for model in models[:6]
        ],
        "engine": engine_status(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/projects/{project_id}/report")
def project_report(
    project: Project = Depends(project_for_read),
    db: Session = Depends(get_db),
):
    datasets = datasets_repo.list_for_project(db, project.id)
    architectures = architectures_repo.list_for_project(db, project.id)
    jobs = jobs_repo.list_for_project(db, project.id)
    models = models_repo.list_for_project(db, project.id)
    owner = users_repo.get(db, project.owner_id)
    dataset_map = {d.id: d.name for d in datasets}
    architecture_map = {a.id: a.name for a in architectures}
    return {
        "project": project_out(db, project, owner),
        "datasets": [dataset_out(d) for d in datasets],
        "architectures": [architecture_out(a) for a in architectures],
        "jobs": [
            job_out(
                db,
                job,
                project_name=project.name,
                architecture_name=architecture_map.get(job.architecture_id),
                dataset_name=dataset_map.get(job.dataset_id),
            )
            for job in jobs
        ],
        "models": [model_out(model, project_name=project.name) for model in models],
        "summary": {
            "datasets": len(datasets),
            "architectures": len(architectures),
            "jobs": len(jobs),
            "completed_jobs": len([j for j in jobs if j.status == "COMPLETED"]),
            "failed_jobs": len([j for j in jobs if j.status == "FAILED"]),
            "models": len(models),
            "approved_models": len([m for m in models if m.status == "approved"]),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/projects/{project_id}/report.csv")
def project_report_csv(
    project: Project = Depends(project_for_read),
    db: Session = Depends(get_db),
):
    datasets = datasets_repo.list_for_project(db, project.id)
    architectures = architectures_repo.list_for_project(db, project.id)
    jobs = jobs_repo.list_for_project(db, project.id)
    models = models_repo.list_for_project(db, project.id)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["seccion", "id", "nombre", "estado", "metrica", "valor", "fecha"])
    writer.writerow(["proyecto", project.id, project.name, project.status, "familia", project.family, project.created_at.isoformat()])
    for dataset in datasets:
        writer.writerow(["dataset", dataset.id, dataset.name, "disponible", "filas", dataset.metadata_json.get("rows", 0), dataset.created_at.isoformat()])
    for architecture in architectures:
        writer.writerow(["arquitectura", architecture.id, architecture.name, architecture.family, "parametros", architecture.parameter_count, architecture.created_at.isoformat()])
    for job in jobs:
        writer.writerow(["entrenamiento", job.id, job.architecture_id, job.status, "epocas", job.epochs, job.created_at.isoformat()])
    for model in models:
        writer.writerow(["modelo", model.id, f"v{model.version}", model.status, "checksum", model.checksum, model.created_at.isoformat()])
    content = "\ufeff" + buffer.getvalue()
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="neurolab_{project.id}_report.csv"'
        },
    )
