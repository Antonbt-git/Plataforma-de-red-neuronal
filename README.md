# NeuroLab Enterprise

Plataforma enterprise para diseñar, entrenar y gobernar redes neuronales. El
usuario autenticado crea un proyecto, carga un dataset CSV, configura una
arquitectura, lanza un entrenamiento real con backpropagation y sigue las
métricas por SSE sin recargar la página. Cada ejecución completada genera una
versión de modelo inmutable con checksum, métricas y flujo de revisión.

> 📖 **Empieza por aquí:** [`docs/COMO_FUNCIONA.md`](docs/COMO_FUNCIONA.md)
> explica **qué hace el proyecto y cómo funciona por dentro**, con el recorrido
> completo de un entrenamiento y sin necesidad de leer código.

> **Estado de la entrega (Semana 11).** El MVP es funcional y ejecuta
> entrenamientos reales en el servidor. El motor por defecto es un MLP en
> NumPy con backpropagation, Adam/SGD/RMSprop y entrenamiento/validación. TensorFlow/Keras
> queda documentado como motor opcional. RNN, CNN y GAN se validan y registran,
> pero solo Feedforward ejecuta en esta versión; su habilitación es progresiva.

---

## 1. Funcionalidades

- Autenticación con token HMAC firmado, contraseñas PBKDF2 y rate limiting.
- Roles globales: Administrador, Responsable, Analista, Revisor y Lector.
- Proyectos con miembros, roles por proyecto y control de acceso en el backend.
- Carga de CSV con validación de tamaño, extensión, codificación, columnas, encabezados duplicados, filas y tipo de tarea.
- Detección automática de tarea binaria, multiclase o regresión.
- Diseñador visual de arquitecturas con validación de rangos y parámetros.
- Versionado de arquitecturas y datasets: no se sobrescribe el historial.
- Cola de trabajos con workers en hilos y estados persistidos:
  `QUEUED → PREPARING → RUNNING → COMPLETED | FAILED | CANCELLED`.
- Entrenamiento real fuera de la petición HTTP, con métricas por época.
- Progreso en vivo por Server-Sent Events (SSE) y respaldo por polling.
- Registro de modelos `.npz` con SHA-256 y descarga autenticada.
- Flujo de revisión: `draft → reviewed → approved → retired`.
- Evaluación con curvas de pérdida y precisión, comparación de ejecuciones.
- Reportes JSON/CSV y auditoría de acciones relevantes.
- Dashboard con estado del motor, base de datos, storage y workers.
- Interfaz responsive en español con modo claro/oscuro.

---

## 2. Arquitectura

```text
apps/web (React 18 + TypeScript + Vite)
        │  REST /api/v1 + SSE
        ▼
services/api (FastAPI + SQLAlchemy)
        ├── auth, projects, datasets, architectures
        ├── training (router + worker + motor NumPy)
        ├── models, reports, admin
        ├── storage/datasets/*.csv
        └── storage/models/*.npz
        │
        ▼
SQLite (desarrollo/pruebas)  ó  PostgreSQL 16 (producción)
```

El navegador **nunca entrena**. La API valida permisos, configuración, dataset y
arquitectura; el worker ejecuta el aprendizaje y persiste cada época. Si el
navegador se desconecta, el trabajo continúa y el historial se recupera al
reconectar.

### Estructura del repositorio

```text
apps/web/                    Frontend React + TypeScript
  src/features/              Vistas por módulo
  src/components/ui.tsx      Componentes y estados compartidos
  src/lib/api.ts             Cliente HTTP tipado y descargas
services/api/                Backend FastAPI
  app/core/                  Configuración, seguridad, dependencias, límites
  app/db/                    Modelos SQLAlchemy, sesión y datos demo
  app/modules/               Routers por dominio
  app/modules/training/      Motor NumPy, worker y SSE
  app/repositories/          Acceso a datos
  app/schemas/               Validación y serialización
  tests/                     Pruebas con SQLite aislado
infra/docker/                Dockerfiles y nginx con soporte SSE
infra/postgres/schema.sql    Esquema PostgreSQL alineado con SQLAlchemy
infra/supabase/hardening.sql RLS y revocación de permisos para Supabase
render.yaml                  Blueprint de despliegue de la API en Render
docs/                        Arquitectura, despliegue, implementación y documento maestro
```

---

## 3. Requisitos

- Python 3.11 o superior.
- Node.js 18 o superior y npm.
- PostgreSQL 16 solo si despliegas en producción.
- Docker + Docker Compose (opcional, recomendado para una demo completa).

---

## 4. Arranque local

### Linux / macOS

```bash
./INICIAR_NEUROLAB.sh
```

### Windows

```bat
INICIAR_NEUROLAB.bat
```

### Manual

Terminal 1 — API:

```bash
cd services/api
python3 -m pip install -r requirements.txt
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — frontend:

```bash
cd apps/web
npm install
npm run dev
```

- Interfaz: <http://localhost:5173>
- API: <http://127.0.0.1:8000>
- Swagger: <http://127.0.0.1:8000/docs>
- Health: <http://127.0.0.1:8000/health>

Al primer arranque se crean la base SQLite, el storage y los datos de
demostración.

### Credenciales demo

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Administrador | `admin@neurolab.local` | `NeuroLab2026!` |
| Analista | `analista@neurolab.local` | `Analista2026!` |
| Revisor | `revisor@neurolab.local` | `Revisor2026!` |

El proyecto demo **Clasificación de clientes** incluye el dataset
`clientes_demo.csv` (600 filas, variables `edad, ingresos, antiguedad, compras`,
objetivo `segmento`) y la arquitectura **MLP base v1**.

---

## 5. Flujo de uso

1. Inicia sesión con una cuenta demo.
2. Revisa el **Dashboard** y el estado del sistema.
3. En **Datasets**, carga un CSV o usa el dataset demo. El backend valida y
   detecta la tarea.
4. En **Proyectos de IA**, crea un proyecto y administra sus miembros.
5. En **Diseñador de redes**, configura entrada, capas ocultas, salida,
   activación, pérdida, optimizador, épocas y batch. Valida y guarda.
6. En **Entrenamientos**, selecciona arquitectura y dataset, ajusta épocas y
   lanza la ejecución. El progreso llega por SSE.
7. En **Evaluación y métricas**, compara ejecuciones y revisa las curvas.
8. En **Registro de modelos**, descarga el `.npz` y avanza el estado de revisión.
9. En **Reportes**, exporta JSON/CSV y consulta la auditoría del proyecto.
10. En **Administración**, gestiona usuarios y revisa salud y auditoría global.

### Reglas de negocio relevantes

- La arquitectura debe esperar tantas entradas como variables numéricas tenga el dataset.
- Tarea binaria → 1 neurona de salida y `binary_crossentropy`.
- Tarea multiclase → N neuronas (N clases), `softmax` y `categorical_crossentropy`.
- Regresión → 1 neurona y `mse`.
- Solo Feedforward se ejecuta; RNN/CNN/GAN devuelven un error controlado `422`.
- Las versiones de modelo no se sobrescriben: cada ejecución crea una nueva.
- La descarga de artefactos exige autenticación y permisos sobre el proyecto.

---

## 6. Docker Compose

```bash
cp .env.example .env
# Edita NEUROLAB_SECRET y POSTGRES_PASSWORD
docker compose up --build
```

- Web: <http://localhost:8080>
- API: `http://localhost:8080/api/v1` (proxy nginx)
- PostgreSQL queda en la red interna del compose y usa el esquema de
  `infra/postgres/schema.sql`.

El proxy nginx desactiva el buffering para SSE. Los volúmenes `postgres_data` y
`api_storage` conservan base y artefactos al recrear contenedores.

---

## 7. Despliegue en la nube (Supabase + Render + Vercel)

La guía paso a paso está en **[`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)**.

Resumen:

1. **Supabase** → crea el proyecto PostgreSQL y copia la URI del *session
   pooler* (puerto 5432) con `?sslmode=require`.
2. **Render** → `New → Blueprint`, conecta el repositorio y aplica
   [`render.yaml`](render.yaml). Introduce la URI de Supabase, el dominio de
   Vercel y las contraseñas demo. El blueprint incluye disco persistente en
   `/var/data`, health check en `/health` y secreto generado.
3. **Vercel** → importa el repositorio con **Root Directory** `apps/web`,
   define `VITE_API_URL=https://TU-API.onrender.com` y despliega.
4. Vuelve a Render y añade el dominio de Vercel a
   `NEUROLAB_CORS_ORIGINS`.
5. Ejecuta `infra/supabase/hardening.sql` en el SQL Editor de Supabase para
   activar RLS y revocar el acceso de `anon`/`authenticated`.

Comprobación rápida:

```bash
curl https://TU-API.onrender.com/health
# {"status":"ok","database":true,...}
```

> En el plan Free de Render el servicio se duerme por inactividad y no hay
> disco persistente. Para una demo con datos que sobrevivan a reinicios, usa
> el plan Starter. La API debe correr en **una sola instancia**: el worker de
> entrenamiento vive dentro del proceso.

---

## 8. Configuración

Copia `.env.example` a `.env` (o exporta las variables). El backend lee:

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `NEUROLAB_ENV` | `development` | Entorno lógico. |
| `NEUROLAB_SECRET` | secreto local | Firma de tokens. **Cámbialo en producción.** |
| `NEUROLAB_TOKEN_HOURS` | `8` | Vigencia del token. |
| `NEUROLAB_DATABASE_URL` | SQLite local | URL SQLAlchemy (`sqlite:///...` o `postgresql+psycopg://...`). |
| `NEUROLAB_STORAGE_DIR` | `services/api/storage` | CSV y modelos. |
| `NEUROLAB_MAX_UPLOAD_BYTES` | `5000000` | Tamaño máximo de CSV. |
| `NEUROLAB_WORKERS` | `2` | Hilos de entrenamiento. |
| `NEUROLAB_EPOCH_DELAY_MS` | `120` | Pausa didáctica entre épocas. |
| `NEUROLAB_SEED_DEMO` | `true` | Carga datos de demostración. |
| `NEUROLAB_DEMO_PASSWORD` | `NeuroLab2026!` | Contraseña inicial del admin demo. |
| `NEUROLAB_DEMO_ANALYST_PASSWORD` | `Analista2026!` | Contraseña inicial del analista demo. |
| `NEUROLAB_DEMO_REVIEWER_PASSWORD` | `Revisor2026!` | Contraseña inicial del revisor demo. |
| `NEUROLAB_LOGIN_RATE_LIMIT` | `10` | Intentos de login por minuto. |
| `NEUROLAB_WRITE_RATE_LIMIT` | `120` | Escrituras por minuto. |
| `NEUROLAB_CORS_ORIGINS` | localhost:5173/5174 | Orígenes permitidos. |
| `NEUROLAB_CORS_ORIGIN_REGEX` | vacío | Regex opcional para previews de Vercel. |

Frontend:

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `VITE_API_URL` | `http://127.0.0.1:8000` | URL base de la API. Vacío = mismo origen. |

La pausa entre épocas solo hace visible el progreso; no altera las métricas. Con
30 épocas y 120 ms el entrenamiento tarda ~3.6 s más el cómputo real.

---

## 9. Motor de entrenamiento

`services/api/app/modules/training/engine.py` implementa:

- Red feedforward densa con inicialización determinista por semilla.
- Activaciones ReLU, tanh, sigmoid, softmax y lineal.
- Pérdida binaria, categórica y MSE.
- Backpropagation con gradiente descendente y optimizadores Adam, SGD y RMSprop.
- Split interno de entrenamiento/validación y métricas por época.
- Persistencia del artefacto `.npz` (pesos, configuración y metadatos).

El resultado es reproducible con la misma semilla y dataset. No se simulan
pérdidas ni precisiones en el navegador.

### TensorFlow/Keras opcional

Para sustituir el motor NumPy puede instalarse `tensorflow>=2.16` y adaptar el
worker para usar Keras. La API ya reporta `tensorflow_available` y el diseño de
artefactos admite ambos motores. Esta entrega prioriza un entorno reproducible
sin dependencias pesadas.

---

## 10. Pruebas y verificación

```bash
cd services/api
python3 -m pytest -q
```

Cobertura actual: 28 pruebas de autenticación, permisos, proyectos, datasets,
arquitecturas, flujo de entrenamiento, modelos, reportes y health.

```bash
cd apps/web
npm run build
```

Compila TypeScript y genera el bundle de producción. El build también sirve como
verificación de tipos.

---

## 11. Seguridad

- El backend es la única frontera de seguridad; el frontend oculta acciones por
  rol, pero la API vuelve a validar permisos.
- Tokens HMAC con expiración; contraseñas PBKDF2 con salt.
- Rate limiting en login y escrituras.
- Validación de tamaño y contenido de CSV; límite de filas/columnas.
- Cabeceras `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y
  `Permissions-Policy`.
- Descargas autenticadas por endpoint, sin rutas públicas al storage.
- Auditoría de login, proyectos, datasets, arquitecturas, entrenamientos y
  cambios de estado de modelo.
- Errores internos saneados para no filtrar trazas al cliente.

Antes de producción: usa HTTPS, un secreto robusto, PostgreSQL, backups,
observabilidad centralizada y revisa los límites de workers y subida.

---

## 12. Limitaciones conocidas

- Solo Feedforward ejecuta entrenamientos; RNN/CNN/GAN se validan y registran.
- El motor por defecto es NumPy, no TensorFlow/Keras.
- El split de validación es interno y determinista; no hay edición avanzada de pipelines.
- El canal SSE se implementa con polling de base de datos del lado servidor.
- No hay entrenamiento distribuido ni GPU.
- Las migraciones formales (Alembic) aún no están incluidas; el esquema se crea al arrancar.

---

## 13. Documentación

- `docs/COMO_FUNCIONA.md`: **qué es, qué hace y cómo funciona por dentro** (lectura recomendada para empezar).
- `docs/ARQUITECTURA_Y_CODIGO.md`: arquitectura, módulos, API y decisiones.
- `docs/IMPLEMENTACION.md`: estado por fases y criterios de aceptación.
- `docs/DESPLIEGUE.md`: publicación en Supabase, Render y Vercel.
- `docs/Documento_Maestro_NeuroLab_Enterprise_Semana_11.pdf`: documento maestro.
- `/docs`: Swagger interactivo generado por FastAPI.

---

## 14. Solución de problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `uvicorn: command not found` | Dependencias no instaladas | `python3 -m pip install -r requirements.txt` y usa `python3 -m uvicorn`. |
| El frontend muestra error de red | API detenida o URL incorrecta | Verifica `/health` y `VITE_API_URL`. |
| `422` al entrenar | Dataset y arquitectura incompatibles | Ajusta entrada/salida, pérdida o familia según el mensaje. |
| El progreso no se mueve | Trabajo en cola o worker ocupado | Revisa workers y `NEUROLAB_WORKERS`; espera o cancela. |
| SSE se corta detrás de un proxy | Buffering activo | Usa la configuración nginx incluida o desactiva buffering. |
| SQLite bloqueada | Varios procesos escribiendo | Usa un solo proceso API o PostgreSQL. |
