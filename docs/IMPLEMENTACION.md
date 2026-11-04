# Guía de implementación por fases

Estado de la entrega **Semana 11**: MVP funcional con backend real, entrenamiento
ejecutado en servidor, métricas en vivo y trazabilidad de modelos.

---

## 1. Resumen de fases

| Fase | Alcance | Estado |
| --- | --- | --- |
| 1. Base de plataforma | React + TypeScript, FastAPI, autenticación, SQLite/PostgreSQL, proyectos | ✅ Completada |
| 2. Gestión de datos | Carga CSV, validación, metadata, checksum, versionado | ✅ Completada |
| 3. Arquitecturas | Diseñador visual, reglas por familia, validación y versionado | ✅ Completada |
| 4. Entrenamiento | Cola, workers, motor NumPy, máquina de estados, cancelación | ✅ Completada |
| 5. Tiempo real y evaluación | SSE, historial persistido, curvas, comparación | ✅ Completada |
| 6. Modelos y reportes | Registro inmutable, checksum, revisión, descargas, JSON/CSV, auditoría | ✅ Completada |
| 7. Operación | Docker Compose, nginx con SSE, scripts, pruebas, documentación | ✅ Completada |
| 8. Familias avanzadas | RNN, CNN y GAN ejecutables | 🟡 Validación/registro; ejecución progresiva |
| 9. Endurecimiento enterprise | Alembic, cola distribuida, observabilidad, backups | 🔵 Recomendado |

---

## 2. Criterio de aceptación del MVP

> Usuario autenticado crea proyecto, configura una red Feedforward, selecciona un
> dataset, inicia un entrenamiento real, visualiza estado y métricas sin recargar,
> consulta resultados después y conserva una versión de modelo trazable.

| Requisito | Evidencia |
| --- | --- |
| Usuario autenticado | Login con token HMAC; rutas protegidas; pruebas de auth. |
| Crear proyecto | `POST /projects`, UI de Proyectos, auditoría `project.created`. |
| Configurar Feedforward | Diseñador con capas, activaciones, optimizador, pérdida y validación backend. |
| Seleccionar dataset | Dataset demo o CSV validado asociado al proyecto. |
| Entrenamiento real | Worker ejecuta MLP NumPy con backpropagation; no hay simulación en el navegador. |
| Métricas sin recargar | SSE `snapshot` + polling de respaldo; historial por época. |
| Resultados posteriores | `GET /training-jobs/{id}`, Evaluación y Reportes desde base de datos. |
| Versión trazable | `model_versions` con checksum SHA-256, métricas, job y estado de revisión. |

---

## 3. Verificación manual recomendada

1. Arranca API y frontend con `INICIAR_NEUROLAB.sh` o el `.bat`.
2. Inicia sesión como `admin@neurolab.local / NeuroLab2026!`.
3. Comprueba el Dashboard: proyecto, dataset, motor NumPy y estado del sistema.
4. Entra en **Entrenamientos**, selecciona `MLP base v1` y `clientes_demo.csv`.
5. Lanza la ejecución y observa el avance por época sin recargar.
6. Al completar, revisa pérdida, val loss, accuracy y val accuracy.
7. Entra en **Registro de modelos**, descarga el `.npz` y marca el modelo como revisado.
8. Recarga la página o cierra sesión y vuelve a entrar: el historial debe persistir.
9. Abre **Evaluación y métricas**: curvas y comparación de ejecuciones.
10. Abre **Reportes**: ficha, historial, auditoría y exportación CSV/JSON.
11. Como administrador, revisa **Administración**: usuarios, salud y auditoría global.
12. Prueba un caso inválido (p. ej. cambiar la salida a 5 neuronas) y verifica el `422`.

---

## 4. Verificación automática

```bash
# Backend
cd services/api
python3 -m pytest -q

# Frontend + tipos
cd apps/web
npm run build
```

Resultado esperado: todas las pruebas en verde y build sin errores de TypeScript.

---

## 5. Despliegue con Docker

```bash
cp .env.example .env
# Ajusta NEUROLAB_SECRET y POSTGRES_PASSWORD
docker compose up --build
```

Servicios:

- `postgres`: PostgreSQL 16 con `infra/postgres/schema.sql`.
- `api`: FastAPI + worker, storage persistente.
- `web`: build React servido por nginx, proxy `/api` y SSE sin buffering.

---

## 6. Brechas conocidas y siguiente iteración

| Brecha | Impacto | Siguiente paso |
| --- | --- | --- |
| RNN/CNN/GAN no ejecutan | Alcance limitado a Feedforward | Añadir motores y validación de formas por familia. |
| Motor NumPy en lugar de TensorFlow | Menor ecosistema de capas | Adaptador Keras seleccionable por arquitectura. |
| Sin Alembic | Cambios de esquema manuales | Incorporar migraciones versionadas. |
| Cola en memoria | No escala a varios procesos API | Redis + workers dedicados. |
| SSE por polling de DB | Latencia ~700 ms | Broker pub/sub o WebSocket. |
| Sin GPU ni entrenamiento distribuido | Datasets grandes limitados | Workers con GPU y orquestación. |
| Sin backups automáticos | Riesgo operativo | Política de backup de PostgreSQL y storage. |

---

## 7. Historias de usuario cubiertas

- Como administrador, quiero gestionar usuarios y ver la salud del sistema.
- Como responsable, quiero crear proyectos y asignar miembros con roles.
- Como analista, quiero cargar datasets validados y diseñar arquitecturas.
- Como analista, quiero lanzar entrenamientos y ver el progreso en vivo.
- Como revisor, quiero aprobar versiones de modelo con trazabilidad.
- Como lector, quiero consultar resultados y reportes sin modificar nada.

---

## 8. Definition of Done aplicada

- [x] Backend real con validación y permisos.
- [x] Entrenamiento fuera de la petición HTTP.
- [x] Estado y métricas persistidos.
- [x] SSE operativo con reconexión y respaldo por polling.
- [x] Artefacto de modelo con checksum y versión.
- [x] Auditoría de acciones relevantes.
- [x] Interfaz en español, responsive y con modo oscuro.
- [x] Pruebas backend y build frontend.
- [x] Docker Compose, scripts de arranque y documentación.
- [x] Limitaciones declaradas explícitamente.
