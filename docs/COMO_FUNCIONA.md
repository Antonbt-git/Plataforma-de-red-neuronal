# NeuroLab Enterprise — Cómo funciona este proyecto

Documento divulgativo: **qué es**, **qué hace** y **cómo funciona por dentro**.
Está pensado para leerse de principio a fin y entender el sistema completo sin
necesidad de abrir el código.

> Documentos relacionados:
>
> - [`../README.md`](../README.md) — instalación, configuración y uso.
> - [`ARQUITECTURA_Y_CODIGO.md`](ARQUITECTURA_Y_CODIGO.md) — detalle técnico por capas.
> - [`IMPLEMENTACION.md`](IMPLEMENTACION.md) — fases y criterios de aceptación.
> - [`DESPLIEGUE.md`](DESPLIEGUE.md) — publicación en Supabase, Render y Vercel.

---

## 1. Resumen en pocas palabras

NeuroLab Enterprise es una **plataforma web para diseñar, entrenar y gobernar
redes neuronales de forma trazable**.

Un usuario autenticado:

1. crea un **proyecto**,
2. sube un **dataset** en CSV,
3. **diseña la red** con un diseñador visual que valida las reglas,
4. lanza un **entrenamiento real** (no simulado) en el servidor,
5. ve las **métricas avanzar en vivo** sin recargar la página,
6. obtiene un **modelo versionado** con checksum, métricas y flujo de revisión,
7. genera **reportes** y deja **rastro de auditoría** de todo lo anterior.

El navegador **nunca entrena**. Todo el cómputo y toda la seguridad viven en el
backend FastAPI; el frontend solo presenta el estado y consume la API.

---

## 2. Qué hace y qué no hace

### ✅ Lo que hace

| Capacidad | Detalle |
| --- | --- |
| Autenticación | Token HMAC firmado (8 h de vigencia), contraseñas PBKDF2 con salt, rate limiting (10 intentos/min en login). |
| Autorización | 5 roles globales + roles por proyecto. El backend valida cada petición; el frontend solo oculta acciones. |
| Datasets | Subida de CSV con validación real: extensión `.csv`, máximo 5 MB, codificación (UTF-8/latin-1), separador detectado automáticamente, mínimo 2 columnas, sin encabezados duplicados, entre 20 y 200.000 filas y detección automática de la tarea. |
| Diseñador de redes | Editor visual con validación en servidor: nº de capas, activaciones, coherencia salida/pérdida, nº de parámetros. |
| Versionado | Arquitecturas y datasets se versionan: nada se sobrescribe. |
| Entrenamiento | MLP denso real con **backpropagation** en NumPy: Adam, SGD o RMSprop. |
| Tiempo real | Progreso por época mediante **Server-Sent Events (SSE)**, con respaldo de reconexión. |
| Registro de modelos | Cada ejecución completada crea una versión `.npz` con **SHA-256**, métricas y estado de revisión. |
| Reportes | Resumen JSON, exportación CSV, comparación de ejecuciones y auditoría del proyecto. |
| Administración | Gestión de usuarios, salud del sistema, uso de disco y auditoría global. |

### ⚠️ Lo que todavía no hace (limitaciones del MVP)

| Limitación | Estado |
| --- | --- |
| Solo **Feedforward** ejecuta. RNN, CNN y GAN **sí se validan y se registran**, pero al lanzarlas el servidor devuelve un error controlado `422`. | Validado / registrado, no ejecutable. |
| El motor por defecto es **NumPy**, no TensorFlow/Keras. Keras queda documentado como motor opcional. | Opcional. |
| Split de validación interno (80/20 aleatorio), sin pipelines ni features avanzados. | Diseño actual. |
| No hay GPU ni entrenamiento distribuido. | Fuera de alcance. |
| Sin migraciones formales (Alembic): el esquema se crea al arrancar. | Pendiente. |
| El canal SSE usa **polling de base de datos** en el lado servidor. | Funcional, no óptimo. |

---

## 3. Quién lo usa: roles

**Rol global** (se define en la cuenta de usuario):

| Rol | Qué puede hacer |
| --- | --- |
| **Administrador** | Todo en todos los proyectos. Gestiona usuarios, salud del sistema y auditoría global. |
| **Responsable** | Crea y dirige proyectos, gestiona miembros y aprueba modelos. |
| **Analista** | Diseña arquitecturas, sube datasets y lanza entrenamientos. |
| **Revisor** | Lee todo y revisa/aprueba modelos. No entrena. |
| **Lector** | Solo lectura. |

**Rol por proyecto** (herencia simplificada): el dueño es *Responsable*; el
rol efectivo es `Administrador` > `Responsable` > `Analista` > `Revisor` >
`Lector`.

- **Leer** → cualquier miembro.
- **Escribir** (datasets, arquitecturas, entrenamientos) → Administrador, Responsable, Analista o dueño.
- **Revisar** (aprobar modelos) → Administrador, Responsable, Revisor.

Si no eres miembro de un proyecto, la API devuelve **404** (no 403) para no
revelar que ese proyecto existe.

---

## 4. Las 10 vistas de la interfaz

| Grupo | Vista | Qué hace |
| --- | --- | --- |
| Espacio de trabajo | **Dashboard** | Estado del motor, base de datos, storage y workers + trabajos recientes. |
| Espacio de trabajo | **Proyectos de IA** | Crea proyectos, añade miembros y consulta su actividad. |
| Preparación de datos | **Datasets** | Sube CSV, muestra filas, columnas, tarea detectada, nulos y checksum. |
| Diseño del modelo | **Diseñador de redes** | Construye capas, activaciones, optimizador y pérdida; valida en servidor y calcula parámetros. |
| Experimentación | **Entrenamientos** | Configura proyecto/arquitectura/dataset/hiperparámetros, lanza y monitorea el entrenamiento (cola y detalle). |
| Experimentación | **Evaluación y métricas** | Curvas de pérdida y precisión, comparación entre ejecuciones y métrica clave por tarea. |
| Gestión de modelos | **Registro de modelos** | Lista versiones con checksum, estado (`draft → reviewed → approved → retired`) y descarga. |
| Gestión de modelos | **Reportes** | Resumen por proyecto, historial de entrenamientos, auditoría y exportación CSV. |
| Recursos | **Fundamentos neuronales** | Material teórico: familias de redes, del dato al modelo trazable, buenas prácticas. |
| Sistema | **Administración** | Usuarios y roles, salud del sistema y auditoría global (solo Administrador). |

---

## 5. El flujo completo: de un CSV a un modelo trazable

```text
┌────────────┐   ┌────────────┐   ┌──────────────┐   ┌────────────────┐
│ 1. Login   │──▶│ 2. Proyecto│──▶│ 3. Dataset   │──▶│ 4. Arquitectura│
└────────────┘   └────────────┘   └──────────────┘   └────────────────┘
                                                              │
┌────────────────┐   ┌──────────────┐   ┌──────────────┐       │
│ 8. Reporte     │◀──│ 7. Modelo    │◀──│ 6. Entreno   │◀──────┘
└────────────────┘   │   versionado │   │   en vivo    │
                     └──────────────┘   └──────────────┘
```

| Paso | Vista | Acción del usuario | Qué hace el servidor |
| --- | --- | --- | --- |
| 1 | Login | Email y contraseña | Valida con PBKDF2, aplica rate limit, emite token HMAC y registra `auth.login`. |
| 2 | Proyectos | Crear proyecto | Crea el proyecto y suscribe al dueño como *Responsable*. Audita. |
| 3 | Datasets | Subir CSV | Verifica tamaño/codificación/columnas, detecta tarea (binaria, multiclase o regresión), guarda el archivo con checksum SHA-256 y metadatos. |
| 4 | Diseñador | Validar y guardar | Aplica las reglas (ver §7.2), calcula el nº de parámetros y crea una **versión inmutable** de la arquitectura. |
| 5 | Entrenamientos | Configurar y *Iniciar* | Revalida dataset + arquitectura + permisos, crea el trabajo en `QUEUED` y lo encola. |
| 6 | Entrenamientos | Ver progreso | El worker entrena fuera de la petición HTTP y persiste cada época; la UI recibe eventos SSE. |
| 7 | Registro de modelos | Revisar / aprobar | Crea la versión de modelo con checksum y métricas; transición `draft → reviewed → approved → retired`. |
| 8 | Reportes | Exportar | Resume ejecuciones, métricas y auditoría; permite JSON y CSV. |

---

## 6. Qué ocurre al pulsar «Iniciar entrenamiento»

Este es el recorrido completo de un entrenamiento:

1. **El frontend** envía `POST /api/v1/projects/{id}/training-jobs` con la
   arquitectura, el dataset, épocas, batch, learning rate y semilla.
2. **El servidor valida**: sesión y permisos de escritura, que el dataset y la
   arquitectura pertenezcan al proyecto, que la familia sea `Feedforward`, y
   la coherencia entre la tarea detectada en los datos y la capa de salida.
3. Si algo falla, responde `422` con un mensaje en español y **no se crea nada**.
4. Si todo está bien, persiste el trabajo en estado **`QUEUED`** y lo devuelve
   con `202 Accepted`.
5. El **worker** (hilo de fondo, `NEUROLAB_WORKERS` por defecto 2) toma el
   trabajo de la cola y lo pasa a **`PREPARING`**: localiza el CSV, carga la
   configuración y construye el modelo.
6. Estado **`RUNNING`**: se dispara el bucle de épocas.
7. **Por cada época**, el servidor guarda en base de datos la pérdida, la
   pérdida de validación y las métricas. Ese es el dato que verá el navegador.
8. La vista de *Entrenamientos* mantiene un `EventSource` abierto; cada cambio
   emite un evento SSE `state` con el trabajo completo (historial incluido).
9. Al terminar: **`COMPLETED`** (y se crea la versión de modelo), **`FAILED`**
   con mensaje de error, o **`CANCELLED`** si el usuario lo interrumpió.
10. Se emite el evento `done`, el navegador cierra la conexión y el modelo ya
    está disponible en *Registro de modelos* con su checksum.

**Estados posibles**

```text
QUEUED → PREPARING → RUNNING → COMPLETED
                              → FAILED     (error controlado)
                              → CANCELLED  (interrupción del usuario)
```

**Recuperación.** El estado vive en la base de datos, no en la memoria del
navegador. Si te desconectas, el entrenamiento sigue; al volver, la cola se
recarga. Si el servicio se reinicia en mitad de una ejecución, los trabajos
interrumpidos se marcan como `FAILED` con un mensaje claro y los que estaban
en cola se reencolan automáticamente.

---

## 7. Cómo aprende la red (motor NumPy)

El motor está en `services/api/app/modules/training/engine.py` y no usa
frameworks de deep learning: está escrito con **NumPy** y matemática explícita.

### 7.1 Preparación de los datos

1. Lee el CSV y descarta las filas sin valor en la columna objetivo.
2. Exige un mínimo de **20 filas** utilizables.
3. **Imputa** los huecos numéricos con la media de la columna.
4. **Detecta la tarea automáticamente**:
   - exactamente **2** valores distintos → *binaria*;
   - valores **numéricos con más de 20** valores distintos → *regresión*;
   - el resto (de 3 a 20 categorías) → *multiclase*.
5. Mezcla las filas con la **semilla** elegida (resultado reproducible).
6. Separa **80 % entrenamiento / 20 % validación**.
7. **Normaliza** con z-score calculado **solo sobre el conjunto de
   entrenamiento** (`(x − media) / desviación`), y aplica esos mismos valores
   a la validación. Esto evita *data leakage*.

### 7.2 La red

- Capa de entrada del tamaño de las variables numéricas.
- De **1 a 12 capas ocultas**, con `relu`, `tanh`, `sigmoid` o `linear`, y
  **dropout** opcional (máx. 0.9) que solo se aplica durante el entrenamiento.
- Capa de salida según la tarea:
  - binaria → **1 neurona + sigmoid**,
  - multiclase → **N neuronas + softmax**,
  - regresión → **1 neurona + linear**.

**Reglas que el servidor valida** (`POST /architectures/validate`) — el
frontend nunca es la última palabra:

| Regla | Valor |
| --- | --- |
| Entrada y salida | ≥ 1 unidad / ≥ 1 neurona; al menos **1 capa oculta**. |
| Máximo de capas ocultas | 12 en general (6 en RNN, 10 en CNN). |
| Activaciones ocultas | `relu`, `sigmoid`, `tanh`, `linear`. **Softmax prohibido en capas ocultas**: solo en la salida. |
| Dropout | ≤ 0.9 por capa. |
| Coherencia pérdida ↔ salida | `binary_crossentropy` → 1 neurona + sigmoid · `categorical_crossentropy` → ≥ 2 neuronas + softmax · `mse` → linear. |
| Por familia | Feedforward: entrada ≤ 10.000 unidades. RNN: `sequence_length ≥ 2` y ≤ 1.024 unidades/ capa. CNN: exige `input_height`, `input_width` e `input_channels`. GAN: exige `latent_dim ≥ 2` y salida = entrada. |
| Tamaño | Máximo **50 millones de parámetros** (se calculan y devuelven). |
| Al lanzar | La familia debe ser **Feedforward** y debe haber capas ocultas; en otro caso se responde `422` con el motivo en español. |

### 7.3 El ciclo de cada época

```text
   X ──▶ producto ponderado (W·X + b) ──▶ activación ──▶ ... ──▶ ŷ
                                                                          │
   y ──────────────────────▶ función de pérdida ◀─────────────────────────┘
                                          │
                        derivada de la pérdida (delta)
                                          │
                        cadena inversa: backpropagation
                                          │
                        gradiente de cada capa (dW, db)
                                          │
                        optimizador actualiza W y b
                        (Adam / SGD / RMSprop)
```

- **Pérdida**: `binary_crossentropy` (binaria), `categorical_crossentropy`
  (multiclase) o `mse` (regresión). Las tres coinciden con lo que exige la
  capa de salida.
- **Optimizadores**: Adam (por defecto), RMSprop y SGD con momento, con el
  *learning rate* que indique el usuario.
- **Semilla**: pesos iniciales y orden de lotes salen de una RNG con semilla,
  así una misma configuración reproduce los mismos resultados.

### 7.4 Métricas que se calculan cada época

| Tarea | Métricas |
| --- | --- |
| Binaria y multiclase | `loss`, `val_loss`, `accuracy`, `val_accuracy` |
| Regresión | `loss`, `val_loss`, `mae`, `val_mae` |

Además se guarda `best_val_loss` (la menor pérdida de validación alcanzada).

> **Nota de honestidad técnica.** El historial que muestra la interfaz son las
> métricas de la **última época**, mientras que el archivo de modelo guarda
> los **pesos de la época con menor `val_loss`** (mejor generalización). Por
> eso el modelo descargado puede tener métricas ligeramente distintas a las
> que ves en pantalla.

### 7.5 Qué se guarda al terminar

- **Base de datos**: `training_jobs` (estado, hiperparámetros, resumen) y
  `training_metrics` (una fila por época).
- **Archivo**: `storage/models/{job_id}.npz` comprimido, con los pesos
  `W0..Wn`, `b0..bn`, las clases, las características, la tarea y la columna
  objetivo.
- **Registro**: `model_versions` con versión incremental, `checksum` SHA-256,
  métricas y estado inicial `draft`.

> El archivo con el que se calcula el checksum es el mismo que se descarga:
> no existe un modelo «fantasma» sin copia.

### 7.6 La pausa entre épocas

`NEUROLAB_EPOCH_DELAY_MS` (por defecto **120 ms**) añade una espera entre
épocas **solo para que el progreso sea visible**. No cambia ninguna métrica:
es una pausa didáctica, no lógica de entrenamiento.

---

## 8. Métricas en vivo sin recargar la página

```text
worker (hilo) ──▶ base de datos ──▶ poll cada 0.5 s ──▶ SSE ──▶ navegador
```

- Endpoint: `GET /api/v1/training-jobs/{id}/events?token=...`
- Eventos: `state` (trabajo completo con historial), `done` (fin), `error` y
  comentarios `: keep-alive` cada ~15 s para que el proxy no corte la conexión.
- Cabeceras `Cache-Control: no-cache`, `Connection: keep-alive` y
  `X-Accel-Buffering: no` para evitar buffering en proxies.
- El token viaja en la **query string** porque `EventSource` no permite
  cabeceras personalizadas.
- Si el navegador se desconecta, la información **no se pierde**: el frontend
  puede volver a pedir el estado completo y el historial persistido.

---

## 9. Seguridad: dónde está la frontera

- **El backend es la única frontera.** El frontend oculta botones por rol, pero
  cada endpoint vuelve a comprobar permisos en el servidor.
- Tokens **HMAC firmados** con expiración; contraseñas **PBKDF2 con salt**.
- **Rate limiting**: 10 intentos de login por minuto y 120 escrituras por minuto.
- Validación de CSV: extensión, tamaño máximo (5 MB), codificación, columnas,
  encabezados duplicados y límite de filas (entre 20 y 200.000).
- **Descargas autenticadas**: no hay rutas públicas al almacenamiento.
- Cabeceras de respuesta: `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` y `X-Process-Time-Ms`.
- Errores internos saneados: nunca se filtran trazas al cliente.
- **Auditoría** de login, proyectos, datasets, arquitecturas, entrenamientos y
  cambios de estado de modelo, consultable desde *Administración*.
- En la nube se aplica además `infra/supabase/hardening.sql` (RLS activo y
  permisos `anon`/`authenticated` revocados).

---

## 10. Modelo de datos

| Tabla | Qué guarda |
| --- | --- |
| `users` | Cuentas, rol global y estado (activo/bloqueado). |
| `projects` | Proyectos, familia, estado y propietario. |
| `project_members` | Quién es miembro de cada proyecto y con qué rol. |
| `datasets` | Referencia al CSV, versión, checksum, metadatos y tarea detectada. |
| `architectures` | Configuración JSON validada, versión y nº de parámetros. |
| `training_jobs` | Trabajo de entrenamiento: estado, hiperparámetros, fechas y error. |
| `training_metrics` | Una fila por época: pérdida, validación y métricas. |
| `model_versions` | Versión de modelo, checksum, métricas, estado y descarga. |
| `audit_events` | Quién hizo qué y cuándo. |

Las columnas JSON usan `JSON` en SQLite y **`JSONB`** en PostgreSQL.

---

## 11. Estructura del código

```text
apps/web/                     Frontend React 18 + TypeScript + Vite
  src/App.tsx                 Shell, navegación, sesión y conexión SSE
  src/features/               Una vista por módulo (10)
  src/components/ui.tsx       Componentes compartidos (metric, modal, toast…)
  src/lib/api.ts              Cliente HTTP tipado con token y descargas
  src/types.ts                Contrato de tipos con la API

services/api/                 Backend FastAPI
  app/core/                   config, security (HMAC/PBKDF2), deps, limits, logging
  app/db/                     Modelos SQLAlchemy, sesión y seed de datos demo
  app/schemas/                Validación Pydantic y serialización
  app/repositories/           Acceso a datos por dominio
  app/modules/
    auth · projects · datasets · architectures
    training/   router + worker (cola) + engine (motor NumPy)
    models · reports · admin
  app/api/v1.py               Agrupador de la API
  tests/                      28 pruebas con SQLite aislado

infra/
  docker/                     Dockerfiles + nginx con soporte SSE
  postgres/schema.sql         Esquema PostgreSQL
  supabase/hardening.sql      Endurecimiento para Supabase

render.yaml                   Blueprint de Render
docker-compose.yml            Despliegue local completo
docs/                         Esta documentación
```

**Capas del backend y por qué**

```text
router  → recibe la petición, valida permisos y parámetros (Pydantic)
repositories → única forma de leer/escribir en base de datos
modules (worker/engine) → lógica de negocio y cómputo
db (models/base) → esquema y sesión
core (config/security/limits) → política transversal
```

Separar router de repositorio evita que la lógica de permisos o de entrenamiento
se mezcle con el esquema SQL.

---

## 12. Cómo ejecutarlo en local

```bash
# Backend (terminal 1)
cd services/api
python3 -m pip install -r requirements.txt
python3 -m uvicorn app.main:app --reload --port 8000

# Frontend (terminal 2)
cd apps/web
npm install
npm run dev
```

- Frontend: <http://localhost:5173>
- API: <http://127.0.0.1:8000> (documentación en `/docs`)
- Credenciales demo:

  | Usuario | Contraseña | Rol |
  | --- | --- | --- |
  | `admin@neurolab.local` | `NeuroLab2026!` | Administrador |
  | `analista@neurolab.local` | `Analista2026!` | Analista |
  | `revisor@neurolab.local` | `Revisor2026!` | Revisor |

- Existen también los scripts `INICIAR_NEUROLAB.sh` / `.bat` y
  `docker compose up --build` (incluye PostgreSQL).

---

## 13. Cómo está publicado

| Pieza | Plataforma | Rol |
| --- | --- | --- |
| Base de datos | **Supabase** | PostgreSQL gestionado con RLS endurecido. |
| API + worker | **Render** | FastAPI, entrenamientos, SSE y artefactos en disco persistente. |
| Frontend | **Vercel** | Sitio estático React con `VITE_API_URL` apuntando a Render. |

```text
Navegador ──HTTPS──▶ Vercel (React) ──REST/SSE──▶ Render (FastAPI) ──SQL──▶ Supabase
                                                └── disco: CSV + modelos .npz
```

La configuración completa está en [`DESPLIEGUE.md`](DESPLIEGUE.md).

---

## 14. Verificación

```bash
# Backend: 28 pruebas de fin a fin (auth, permisos, datasets,
# arquitecturas, entrenamiento, modelos, reportes y auditoría)
cd services/api && python3 -m pytest -q

# Frontend: compilación de tipos + bundle de producción
cd apps/web && npm run build
```

Comprobación manual recomendada: crear proyecto → subir CSV → validar
arquitectura → entrenar → ver el progreso en vivo → descargar el modelo →
exportar el reporte.

---

## 15. Glosario

| Concepto | Significado |
| --- | --- |
| **Época** | Una pasada completa por todos los datos de entrenamiento. |
| **Batch / lote** | Subconjunto de filas que se procesan antes de actualizar los pesos. |
| **Learning rate** | Tamaño del paso con el que el optimizador corrige los pesos. |
| **Pérdida (`loss`)** | Cuánto se equivoca el modelo; debe bajar. Cuanto más baja, mejor ajuste. |
| **Validación (`val_`)** | Error medido en datos que el modelo **no** ha visto durante el entrenamiento. |
| **Precisión (`accuracy`)** | Porcentaje de aciertos en clasificación. |
| **MAE** | Error medio absoluto, la métrica típica de regresión. |
| **Overfitting** | El modelo memoriza el entrenamiento y falla en validación. Se detecta comparando `loss` y `val_loss`. |
| **Dropout** | Apaga aleatoriamente neuronas durante el entrenamiento para evitar sobreajuste. |
| **Backpropagation** | Cálculo del gradiente hacia atrás, capa a capa, para corregir los pesos. |
| **Adam / SGD / RMSprop** | Algoritmos que deciden cómo y cuánto se ajustan los pesos. |
| **SSE** | Server-Sent Events: canal HTTP unidireccional servidor → navegador. |
| **Checksum SHA-256** | Huella digital del archivo; garantiza que nadie lo modificó. |
| **Trazabilidad** | Saber siempre qué datos, arquitectura y ejecución produjeron un modelo. |

---

## 16. Siguientes pasos

1. Habilitar el entrenamiento de **RNN, CNN y GAN** (hoy validadas y registradas).
2. Motor **TensorFlow/Keras** como alternativa documentada.
3. Migraciones con **Alembic** para cambios de esquema en producción.
4. SSE con **pub/sub** en lugar de polling de base de datos.
5. Almacenamiento de artefactos en **S3/R2** para escalar a varias instancias.
6. Exportación de métricas a **Prometheus**.
