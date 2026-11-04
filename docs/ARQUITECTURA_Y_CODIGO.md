# NeuroLab Enterprise — arquitectura y código

Documento técnico de la implementación real del MVP (Semana 11). Sustituye la
descripción del prototipo simulado anterior.

---

## 1. Visión general

```text
┌──────────────────────────────────────────────────────────────┐
│ apps/web · React 18 + TypeScript + Vite                      │
│ Login · Dashboard · Proyectos · Datasets · Diseñador          │
│ Entrenamientos (SSE) · Evaluación · Modelos · Reportes        │
│ Admin · Fundamentos                                          │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTPS / REST /api/v1 + SSE
┌───────────────────────────▼──────────────────────────────────┐
│ services/api · FastAPI + SQLAlchemy                          │
│                                                              │
│  core: config · security · deps · limits · logging           │
│  modules: auth · projects · datasets · architectures         │
│           training (router + worker + engine)                │
│           models · reports · admin                           │
│  repositories: acceso a datos por dominio                    │
│  schemas: validación Pydantic y serialización                │
│  db: modelos SQLAlchemy · sesión · seed demo                 │
└───────────────┬──────────────────────────────┬───────────────┘
                │                              │
      storage/datasets/*.csv          storage/models/*.npz
                │                              │
                └──────────┬───────────────────┘
                           ▼
             SQLite (dev/test) · PostgreSQL (prod)
```

Principio central: **el backend es la frontera de seguridad y el único lugar
donde se entrena**. El frontend administra la experiencia y consume estado
persistido.

---

## 2. Flujo end-to-end

```text
1. POST /auth/login
2. GET  /projects                     → proyecto accesible
3. POST /projects/{id}/datasets       → CSV validado + metadatos + checksum
4. POST /architectures/validate       → reglas por familia y tarea
5. POST /projects/{id}/architectures  → versión inmutable de arquitectura
6. POST /projects/{id}/training-jobs  → validación + estado QUEUED + worker
7. GET  /training-jobs/{id}/events    → SSE con progreso y métricas
8. GET  /training-jobs/{id}/metrics   → historial persistido (recuperable)
9. GET  /models                       → versión con checksum y estado
10. PATCH /models/{id}/status         → revisión / aprobación
11. GET  /projects/{id}/report        → reporte JSON
12. GET  /projects/{id}/report.csv    → exportación CSV
```

Estados del trabajo:

```text
QUEUED → PREPARING → RUNNING → COMPLETED
                           └→ FAILED
        └──────────────────→ CANCELLED
```

La cancelación es cooperativa: la API marca `cancel_requested` y el worker
confirma el estado final. No se matan hilos de forma insegura.

---

## 3. Módulos del backend

| Módulo | Responsabilidad |
| --- | --- |
| `core/config.py` | Configuración por variables de entorno y rutas de storage. |
| `core/security.py` | PBKDF2 para contraseñas, HMAC-SHA256 para tokens. |
| `core/deps.py` | Usuario actual y permisos por proyecto. |
| `core/limits.py` | Rate limiting en memoria por IP y acción. |
| `db/models.py` | Usuarios, proyectos, miembros, datasets, arquitecturas, jobs, métricas, modelos y auditoría. |
| `db/seed.py` | Usuarios demo, proyecto, dataset y arquitectura iniciales. |
| `modules/auth` | Login y perfil actual. |
| `modules/projects` | CRUD, estado, miembros y auditoría del proyecto. |
| `modules/datasets` | Subida CSV, validación, metadata, descarga y borrado. |
| `modules/architectures` | Validación por familia y versionado. |
| `modules/training/router.py` | Cola, consulta, métricas, cancelación y SSE. |
| `modules/training/worker.py` | Cola en memoria, hilos, máquina de estados y artefactos. |
| `modules/training/engine.py` | MLP NumPy, backpropagation, optimizadores y métricas. |
| `modules/models` | Registro, estados y descarga autenticada. |
| `modules/reports` | Dashboard, reporte JSON/CSV y auditoría. |
| `modules/admin` | Usuarios, salud del sistema y auditoría global. |

### Capas

- **Router**: valida entrada HTTP, aplica dependencias de permisos y delega.
- **Repository**: encapsula consultas SQLAlchemy.
- **Serializer**: produce un contrato JSON estable para el frontend.
- **Worker/Engine**: ejecuta entrenamiento fuera del ciclo HTTP.

---

## 4. Modelo de datos

```text
users ──< projects ──< project_members
  │           │
  │           ├──< datasets
  │           ├──< architectures
  │           └──< training_jobs ──< training_metrics
  │                    │
  │                    └──< model_versions
  └──< audit_events >── projects
```

Campos clave:

- `datasets`: `storage_key`, `target_column`, `checksum`, `size_bytes`,
  `metadata_json` (filas, columnas, features, clases, tarea, preview).
- `architectures`: `family`, `config_json`, `version`, `parameter_count`.
- `training_jobs`: estado, progreso, épocas, hiperparámetros, semilla, motor,
  error, bandera de cancelación y marcas de tiempo.
- `training_metrics`: una fila por `(job, época, métrica)`.
- `model_versions`: `storage_key`, `checksum`, `status`, `metrics_json`,
  unicidad `(project_id, version)`.
- `audit_events`: actor, proyecto, acción y metadatos acotados.

SQLite y PostgreSQL comparten los modelos. Las columnas JSON usan `JSON` con
variante `JSONB` en PostgreSQL. El esquema de `infra/postgres/schema.sql` debe
mantenerse sincronizado.

---

## 5. API v1

Prefijo: `/api/v1`. Autenticación: `Authorization: Bearer <token>`.

### Autenticación

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/auth/login` | Devuelve token y usuario. |
| GET | `/auth/me` | Usuario autenticado. |

### Proyectos

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/projects` | Proyectos accesibles. |
| POST | `/projects` | Crea proyecto. |
| GET | `/projects/{id}` | Detalle. |
| PATCH | `/projects/{id}` | Actualiza nombre, descripción, familia o estado. |
| GET | `/projects/{id}/members` | Miembros y roles. |
| POST | `/projects/{id}/members` | Agrega miembro. |
| DELETE | `/projects/{id}/members/{user_id}` | Quita miembro. |
| GET | `/projects/{id}/audit-events` | Auditoría del proyecto. |

### Datasets

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/datasets` | Datasets accesibles. |
| GET | `/projects/{id}/datasets` | Datasets del proyecto. |
| POST | `/projects/{id}/datasets` | Sube CSV (`multipart/form-data`). |
| GET | `/datasets/{id}` | Detalle y metadata. |
| GET | `/datasets/{id}/download` | Descarga el CSV original. |
| DELETE | `/datasets/{id}` | Elimina si no está referenciado. |

### Arquitecturas

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/architectures/validate` | Valida una configuración sin guardar. |
| GET | `/projects/{id}/architectures` | Versiones del proyecto. |
| POST | `/projects/{id}/architectures` | Guarda una nueva versión. |
| GET | `/architectures/{id}` | Detalle. |

### Entrenamientos

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/training-jobs` | Trabajos accesibles. |
| GET | `/projects/{id}/training-jobs` | Trabajos del proyecto. |
| POST | `/projects/{id}/training-jobs` | Crea y encola (`202`). |
| GET | `/training-jobs/{id}` | Estado + historial + última época. |
| GET | `/training-jobs/{id}/metrics` | Historial de métricas. |
| POST | `/training-jobs/{id}/cancel` | Cancelación cooperativa. |
| GET | `/training-jobs/{id}/events` | Stream SSE. |

El SSE acepta el token por query (`?token=...`) además de la cabecera, porque
`EventSource` no permite cabeceras personalizadas.

### Modelos

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/models` | Modelos accesibles. |
| GET | `/projects/{id}/models` | Modelos del proyecto. |
| GET | `/models/{id}` | Detalle. |
| PATCH | `/models/{id}/status` | `draft → reviewed → approved → retired`. |
| GET | `/models/{id}/download` | Descarga `.npz` autenticada. |

### Reportes y administración

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/dashboard` | Conteos, recientes y estado del motor. |
| GET | `/projects/{id}/report` | Reporte JSON. |
| GET | `/projects/{id}/report.csv` | Reporte CSV. |
| GET | `/users` | Usuarios (admin). |
| PATCH | `/users/{id}` | Rol/estado (admin). |
| GET | `/system/health` | Salud detallada (admin). |
| GET | `/audit-events` | Auditoría global (admin). |

---

## 6. Motor de entrenamiento

`engine.py` implementa un MLP denso:

1. Normaliza features numéricas.
2. Codifica la salida según tarea (sigmoide binaria, softmax multiclase, lineal).
3. Inicializa pesos con semilla determinista.
4. Divide entrenamiento/validación de forma reproducible.
5. Ejecuta forward/backward por mini-batch.
6. Actualiza pesos con Adam, SGD o RMSprop.
7. Calcula `loss`, `val_loss`, `accuracy`, `val_accuracy` o `mae`/`val_mae`.
8. Persiste una fila por métrica y época.
9. Al completar, serializa pesos y metadatos en `.npz` y calcula SHA-256.

El worker:

- Mantiene una cola FIFO y un pool de hilos (`NEUROLAB_WORKERS`).
- Toma trabajos `QUEUED`, los pasa a `PREPARING` y `RUNNING`.
- Actualiza progreso y métricas en la base.
- Respeta `cancel_requested` entre épocas.
- Registra `model_versions` y auditoría al completar.
- Convierte errores en `FAILED` con mensaje controlado.

### SSE

`GET /training-jobs/{id}/events` consulta la base cada ~700 ms, envía eventos
`snapshot` con el estado serializado y cierra al llegar a un estado terminal. El
frontend usa `EventSource` como canal principal y polling cada 4 s como respaldo.
El estado persistido permite reconectar sin perder épocas.

---

## 7. Seguridad y permisos

### Roles globales

| Rol | Capacidades |
| --- | --- |
| Administrador | Todo, gestión de usuarios y sistema. |
| Responsable | Gestión amplia de proyectos propios/asignados. |
| Analista | Crea datasets, arquitecturas y entrenamientos. |
| Revisor | Cambia estados de modelos. |
| Lector | Solo lectura. |

Los permisos por proyecto (`owner`, `manager`, `engineer`, `reviewer`, `reader`)
se suman a los globales. Cada endpoint vuelve a comprobar acceso: ocultar un
botón no es una medida de seguridad.

### Endurecimiento aplicado

- PBKDF2-SHA256 con salt por usuario.
- Token HMAC firmado con expiración y validación de usuario activo.
- Rate limiting por IP para login y escrituras.
- Validación estricta de CSV, límites de tamaño, columnas y filas.
- Nombres de archivo saneados y almacenamiento fuera del árbol público.
- Checksum SHA-256 de datasets y modelos.
- Descargas autenticadas.
- Cabeceras de seguridad y errores internos saneados.
- Auditoría de acciones relevantes.

---

## 8. Frontend

- `App.tsx`: sesión, navegación, proyectos, tema, polling y suscripción SSE.
- `lib/api.ts`: cliente tipado, manejo de errores y descargas con token.
- `features/*`: una vista por módulo.
- `components/ui.tsx`: métricas, badges, modales, toasts, progreso y utilidades.
- `types.ts`: contrato compartido con la API.
- `styles.css`: sistema visual, modo oscuro y estilos responsive.

El token y el tema son lo único que se conserva en `localStorage`. No hay datos
de negocio simulados ni entrenamiento en el navegador.

---

## 9. Pruebas

`services/api/tests` usa una base SQLite temporal y storage aislado por sesión:

- `test_auth.py`: login, token inválido, `/me`.
- `test_projects.py`: CRUD, permisos y miembros.
- `test_datasets.py`: subida, validación, metadata y descarga.
- `test_architectures.py`: validación por familia y versionado.
- `test_training_flow.py`: cola, worker, métricas, cancelación, modelo y SSE.
- `test_reports.py`: dashboard, reporte y CSV.
- `test_health.py`: salud y cabeceras.

Ejecución:

```bash
cd services/api
python3 -m pytest -q
```

Frontend:

```bash
cd apps/web
npm run build
```

---

## 10. Decisiones y compromisos

| Decisión | Motivo | Consecuencia |
| --- | --- | --- |
| Motor NumPy por defecto | Entorno reproducible sin TensorFlow pesado; backpropagation real. | TensorFlow queda como evolución opcional. |
| Workers con hilos + estado en DB | Simplicidad operativa y recuperación tras desconexión. | No hay cola distribuida todavía. |
| SSE con polling de DB | Evita broker externo y funciona con nginx. | Latencia de ~700 ms. |
| SQLite/PostgreSQL | Desarrollo rápido y despliegue enterprise. | Requiere mantener esquemas alineados. |
| Versiones inmutables | Trazabilidad y auditoría. | Más filas y artefactos, por diseño. |
| Solo Feedforward ejecutable | Alcance del MVP y validación progresiva. | RNN/CNN/GAN se registran, no entrenan aún. |

---

## 11. Evolución recomendada

1. Motor TensorFlow/Keras seleccionable por arquitectura.
2. Habilitar RNN, CNN y GAN con validación de formas y datasets específicos.
3. Cola distribuida (Redis/Celery o RQ) y workers en contenedores separados.
4. Alembic para migraciones versionadas.
5. WebSocket o SSE con PUB/SUB para menor latencia.
6. Almacenamiento de artefactos en S3/MinIO y antivirus de subidas.
7. Observabilidad con métricas Prometheus, trazas y logs estructurados.
8. CI/CD con pruebas, análisis estático y escaneo de dependencias.
