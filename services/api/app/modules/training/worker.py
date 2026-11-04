"""Cola de trabajos y worker de entrenamiento.

Los trabajos se ejecutan fuera de la petición HTTP, en hilos con sesiones de
base de datos propias. El estado se persiste por época para que la UI pueda
recuperarse tras una desconexión o un reinicio.
"""
from __future__ import annotations

import hashlib
import queue
import threading
from datetime import datetime, timezone

from app.core.config import settings
from app.core.logging import get_logger
from app.db.base import SessionLocal
from app.db.models import Architecture, Dataset, ModelVersion, Project, TrainingJob
from app.modules.training import engine
from app.repositories import audit, jobs as jobs_repo, models as models_repo

logger = get_logger("neurolab.worker")
TERMINAL = {"COMPLETED", "FAILED", "CANCELLED"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _checksum(path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class TrainingWorker:
    def __init__(self, worker_count: int | None = None) -> None:
        self._queue: queue.Queue[str] = queue.Queue()
        self._workers: list[threading.Thread] = []
        self._stopping = threading.Event()
        self.worker_count = worker_count or settings.worker_count

    def start(self) -> None:
        if self._workers:
            return
        self._recover()
        self._stopping.clear()
        for index in range(self.worker_count):
            thread = threading.Thread(
                target=self._loop, name=f"neurolab-worker-{index + 1}", daemon=True
            )
            thread.start()
            self._workers.append(thread)
        logger.info(
            "worker.started",
            extra={"engine": f"{self.worker_count} hilos"},
        )

    def stop(self) -> None:
        self._stopping.set()
        for _ in self._workers:
            self._queue.put("")
        for thread in self._workers:
            thread.join(timeout=2)
        self._workers.clear()

    def submit(self, job_id: str) -> None:
        self._queue.put(job_id)

    def queue_size(self) -> int:
        return self._queue.qsize()

    def _recover(self) -> None:
        db = SessionLocal()
        try:
            interrupted = jobs_repo.interrupted_jobs(db)
            for job in interrupted:
                job.status = "FAILED"
                job.error_message = (
                    "El servicio se reinició durante la ejecución. El estado quedó "
                    "persistido; vuelve a lanzar el entrenamiento."
                )
                job.ended_at = _utcnow()
            if interrupted:
                db.commit()
                logger.warning("worker.recovered_interrupted", extra={"job_id": str(len(interrupted))})
            pending = jobs_repo.pending_jobs(db)
            for job in pending:
                self._queue.put(job.id)
        finally:
            db.close()

    def _loop(self) -> None:
        while not self._stopping.is_set():
            job_id = self._queue.get()
            if not job_id:
                self._queue.task_done()
                continue
            try:
                self.process(job_id)
            except Exception:  # noqa: BLE001
                logger.exception("worker.unhandled")
            finally:
                self._queue.task_done()

    def process(self, job_id: str) -> None:
        db = SessionLocal()
        job: TrainingJob | None = None
        try:
            job = db.get(TrainingJob, job_id)
            if not job or job.status != "QUEUED":
                return
            architecture = db.get(Architecture, job.architecture_id)
            dataset = db.get(Dataset, job.dataset_id)
            project = db.get(Project, job.project_id)
            if not architecture or not dataset or not project:
                self._fail(db, job, "El proyecto, la arquitectura o el dataset ya no existen.")
                return

            job.status = "PREPARING"
            job.started_at = _utcnow()
            db.commit()

            config = dict(architecture.config_json or {})
            metadata = dict(dataset.metadata_json or {})
            dataset_path = settings.storage_dir / dataset.storage_key
            weights_path = settings.models_dir / f"{job.id}.npz"

            job.status = "RUNNING"
            job.progress = 0.0
            db.commit()

            def on_epoch(epoch: int, point: dict[str, float]) -> None:
                job.current_epoch = epoch
                job.progress = round(epoch / max(1, job.epochs) * 100, 2)
                jobs_repo.add_metrics(db, job.id, epoch, point)
                db.commit()

            def should_cancel() -> bool:
                value = (
                    db.query(TrainingJob.cancel_requested)
                    .filter(TrainingJob.id == job.id)
                    .scalar()
                )
                return bool(value)

            outcome = engine.train_model(
                dataset_path=dataset_path,
                target_column=dataset.target_column,
                numeric_columns=metadata.get("numeric_columns", []),
                feature_columns=metadata.get("feature_columns"),
                delimiter=metadata.get("delimiter", ","),
                config=config,
                epochs=job.epochs,
                batch_size=job.batch_size,
                learning_rate=job.learning_rate,
                optimizer_name=job.optimizer,
                seed=job.seed,
                weights_path=weights_path,
                on_epoch=on_epoch,
                should_cancel=should_cancel,
            )

            if should_cancel():
                weights_path.unlink(missing_ok=True)
                job.status = "CANCELLED"
                job.error_message = "Cancelado por el usuario."
                job.ended_at = _utcnow()
                db.commit()
                audit.log(
                    db,
                    actor_id=job.created_by,
                    project_id=job.project_id,
                    action="training.cancelled",
                    job_id=job.id,
                )
                return

            checksum = _checksum(weights_path)
            version = models_repo.next_version(db, job.project_id)
            storage_key = str(weights_path.relative_to(settings.storage_dir))
            model = ModelVersion(
                project_id=job.project_id,
                job_id=job.id,
                version=version,
                storage_key=storage_key,
                checksum=checksum,
                status="draft",
                metrics_json={
                    **outcome.final_metrics,
                    "epochs": job.epochs,
                    "architecture_id": job.architecture_id,
                    "dataset_id": job.dataset_id,
                    "backend": outcome.engine,
                },
                created_by=job.created_by,
            )
            db.add(model)

            job.status = "COMPLETED"
            job.progress = 100.0
            job.current_epoch = job.epochs
            job.engine = outcome.engine
            job.ended_at = _utcnow()
            db.commit()
            db.refresh(model)
            audit.log(
                db,
                actor_id=job.created_by,
                project_id=job.project_id,
                action="training.completed",
                job_id=job.id,
                model_id=model.id,
                version=version,
                checksum=checksum,
            )
            logger.info(
                "worker.completed",
                extra={"job_id": job.id, "engine": outcome.engine},
            )
        except engine.TrainingCancelled:
            if job:
                weights = settings.models_dir / f"{job.id}.npz"
                weights.unlink(missing_ok=True)
                job.status = "CANCELLED"
                job.error_message = "Cancelado por el usuario."
                job.ended_at = _utcnow()
                db.commit()
                audit.log(
                    db,
                    actor_id=job.created_by,
                    project_id=job.project_id,
                    action="training.cancelled",
                    job_id=job.id,
                )
        except engine.TrainingError as exc:
            if job:
                self._fail(db, job, str(exc))
        except Exception:  # noqa: BLE001
            logger.exception("worker.failed", extra={"job_id": job_id})
            if job:
                self._fail(
                    db,
                    job,
                    "Error técnico durante el entrenamiento. Revisa los logs protegidos "
                    "del servidor e inténtalo de nuevo.",
                )
        finally:
            db.close()

    def _fail(self, db, job: TrainingJob, message: str) -> None:
        job.status = "FAILED"
        job.error_message = message
        job.ended_at = _utcnow()
        db.commit()
        audit.log(
            db,
            actor_id=job.created_by,
            project_id=job.project_id,
            action="training.failed",
            job_id=job.id,
            error=message,
        )
        logger.error("worker.failed", extra={"job_id": job.id})


worker = TrainingWorker()
