-- Esquema PostgreSQL de NeuroLab Enterprise v2.
-- Debe mantenerse alineado con services/api/app/db/models.py.
-- La API usa SQLAlchemy y también puede crear este esquema automáticamente
-- (init_db) para desarrollo. Este archivo se ejecuta en el primer arranque
-- del contenedor PostgreSQL (docker-entrypoint-initdb.d).

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id            VARCHAR(36)  PRIMARY KEY,
    email         VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(120) NOT NULL,
    role          VARCHAR(40)  NOT NULL DEFAULT 'Lector',
    status        VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_users_email ON users (email);

CREATE TABLE IF NOT EXISTS projects (
    id          VARCHAR(36)  PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    description TEXT         NOT NULL DEFAULT '',
    owner_id    VARCHAR(36)  NOT NULL REFERENCES users(id),
    family      VARCHAR(20)  NOT NULL DEFAULT 'Feedforward',
    status      VARCHAR(20)  NOT NULL DEFAULT 'Activo',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_members (
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       VARCHAR(20) NOT NULL DEFAULT 'reader',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_project_member UNIQUE (project_id, user_id),
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS datasets (
    id            VARCHAR(36)  PRIMARY KEY,
    project_id    VARCHAR(36)  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name          VARCHAR(200) NOT NULL,
    version       INTEGER      NOT NULL DEFAULT 1,
    storage_key   VARCHAR(500) NOT NULL,
    target_column VARCHAR(200) NOT NULL,
    checksum      VARCHAR(64)  NOT NULL,
    size_bytes    INTEGER      NOT NULL DEFAULT 0,
    metadata_json JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_by    VARCHAR(36)  NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_datasets_project_id ON datasets (project_id);

CREATE TABLE IF NOT EXISTS architectures (
    id              VARCHAR(36)  PRIMARY KEY,
    project_id      VARCHAR(36)  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(120) NOT NULL,
    family          VARCHAR(20)  NOT NULL,
    config_json     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    version         INTEGER      NOT NULL DEFAULT 1,
    parameter_count INTEGER      NOT NULL DEFAULT 0,
    created_by      VARCHAR(36)  NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_arch_version UNIQUE (project_id, name, version)
);

CREATE INDEX IF NOT EXISTS ix_architectures_project_id ON architectures (project_id);

CREATE TABLE IF NOT EXISTS training_jobs (
    id               VARCHAR(36)  PRIMARY KEY,
    project_id       VARCHAR(36)  NOT NULL REFERENCES projects(id),
    architecture_id  VARCHAR(36)  NOT NULL REFERENCES architectures(id),
    dataset_id       VARCHAR(36)  NOT NULL REFERENCES datasets(id),
    status           VARCHAR(20)  NOT NULL DEFAULT 'QUEUED',
    progress         DOUBLE PRECISION NOT NULL DEFAULT 0,
    epochs           INTEGER      NOT NULL DEFAULT 30,
    current_epoch    INTEGER      NOT NULL DEFAULT 0,
    learning_rate    DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    batch_size       INTEGER      NOT NULL DEFAULT 24,
    optimizer        VARCHAR(20)  NOT NULL DEFAULT 'Adam',
    loss_function    VARCHAR(60)  NOT NULL DEFAULT 'binary_crossentropy',
    seed             INTEGER      NOT NULL DEFAULT 42,
    engine           VARCHAR(120) NOT NULL DEFAULT 'NumPy MLP',
    error_message    TEXT,
    cancel_requested BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by       VARCHAR(36)  NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    started_at       TIMESTAMPTZ,
    ended_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_training_jobs_project_id ON training_jobs (project_id);
CREATE INDEX IF NOT EXISTS ix_training_jobs_status ON training_jobs (status);
CREATE INDEX IF NOT EXISTS ix_training_jobs_created_at ON training_jobs (created_at);

CREATE TABLE IF NOT EXISTS training_metrics (
    id           BIGSERIAL   PRIMARY KEY,
    job_id       VARCHAR(36) NOT NULL REFERENCES training_jobs(id) ON DELETE CASCADE,
    epoch        INTEGER     NOT NULL,
    metric_name  VARCHAR(40) NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_metric UNIQUE (job_id, epoch, metric_name)
);

CREATE INDEX IF NOT EXISTS ix_training_metrics_job_id ON training_metrics (job_id);

CREATE TABLE IF NOT EXISTS model_versions (
    id           VARCHAR(36)  PRIMARY KEY,
    project_id   VARCHAR(36)  NOT NULL REFERENCES projects(id),
    job_id       VARCHAR(36)  REFERENCES training_jobs(id),
    version      INTEGER      NOT NULL,
    storage_key  VARCHAR(500) NOT NULL,
    checksum     VARCHAR(64)  NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'draft',
    metrics_json JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_by   VARCHAR(36)  NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_model_version UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS ix_model_versions_project_id ON model_versions (project_id);

CREATE TABLE IF NOT EXISTS audit_events (
    id            BIGSERIAL   PRIMARY KEY,
    actor_id      VARCHAR(36) REFERENCES users(id),
    project_id    VARCHAR(36) REFERENCES projects(id),
    action        VARCHAR(80) NOT NULL,
    metadata_json JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_events_actor_id ON audit_events (actor_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_project_id ON audit_events (project_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_created_at ON audit_events (created_at);

COMMIT;
