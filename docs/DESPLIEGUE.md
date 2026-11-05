# Despliegue en la nube: Supabase + Render + Vercel

Esta guía deja NeuroLab Enterprise publicado con tres servicios gratuitos o de
bajo coste:

| Pieza | Plataforma | Función |
| --- | --- | --- |
| Base de datos | **Supabase** | PostgreSQL gestionado |
| API + workers | **Render** | FastAPI, entrenamientos reales, SSE, artefactos |
| Frontend | **Vercel** | React + Vite (sitio estático) |

```
Navegador
   │  HTTPS
   ▼
Vercel (React)  ──fetch/SSE──►  Render (FastAPI)  ──SQL──►  Supabase (PostgreSQL)
                                      │
                                      └── disco persistente: CSV + modelos .npz
```

> El entrenamiento ocurre **siempre** en Render. El navegador solo consume la
> API; nunca ejecuta el modelo ni recibe credenciales de la base de datos.

---

## 0. Requisitos previos

- Repositorio subido a GitHub (público o privado).
- Cuenta en [supabase.com](https://supabase.com), [render.com](https://render.com)
  y [vercel.com](https://vercel.com).
- El repositorio debe incluir `render.yaml`, `infra/docker/Dockerfile.api` y
  `apps/web/vercel.json` (ya están en el proyecto).

Comprueba que el proyecto compila antes de desplegar:

```bash
# Backend
cd services/api
python3 -m pytest -q

# Frontend
cd ../../apps/web
npm ci
npm run build
```

---

## 1. Supabase: crear la base de datos

1. Entra en Supabase → **New project**.
2. Elige organización, nombre (por ejemplo `neurolab`), una contraseña fuerte
   para la base de datos y **la misma región** que usarás en Render
   (`Frankfurt` si estás en Europa, `us-east-1` si usas Render en `virginia`).
3. Espera a que termine el aprovisionamiento (1–2 minutos).
4. Ve a **Connect** (o *Project Settings → Database*) → **Connection string**
   → pestaña **URI**.
5. Selecciona **Session pooler** (puerto `5432`). Es la opción recomendada para
   Render porque funciona por IPv4. La cadena se parece a:

   ```
   postgresql://postgres.YOUR_PROJECT_REF:POOLER_PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```

   > El **Session pooler** usa un usuario y una contraseña distintos del
   > acceso directo. Copia siempre la cadena completa que muestra Supabase.

6. Sustituye `POOLER_PASSWORD` por la contraseña real. Si contiene caracteres
   especiales (`@`, `#`, `/`, `:`), codifícalos:

   ```bash
   python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" 'Mi#Clave@2026'
   ```

7. Añade `?sslmode=require` al final. La URL final para Render será:

   ```
   postgresql+psycopg://postgres.YOUR_PROJECT_REF:Mi%23Clave%402026@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
   ```

   > La API normaliza automáticamente `postgres://` y `postgresql://` a
   > `postgresql+psycopg://`, así que también puedes pegar la URI tal cual te la
   > da Supabase.
   >
   > El **transaction pooler** (puerto `6543`) también funciona: el backend
   > detecta el puerto y desactiva las sentencias preparadas de psycopg.
   > Para Render, el *session pooler* de `5432` es más sencillo.

8. **No** hace falta crear tablas a mano. Al arrancar, la API ejecuta
   `Base.metadata.create_all()` y crea el esquema completo. El archivo
   `infra/postgres/schema.sql` es solo para el `docker-compose` local.

### Probar la conexión desde tu equipo (opcional)

```bash
cd services/api
NEUROLAB_DATABASE_URL='postgresql+psycopg://...:5432/postgres?sslmode=require' \
  python3 -c "from app.db.base import init_db; init_db(); print('Conexión y esquema OK')"
```

Si el comando termina con `Conexión y esquema OK`, Render también podrá
conectarse.

### Endurecer Supabase (importante)

Supabase expone el esquema `public` mediante su API REST. Para que las tablas
no sean legibles con la clave `anon`:

1. Termina primero el despliegue de Render (paso 2), para que las tablas
   existan.
2. En Supabase → **SQL Editor**, pega y ejecuta
   [`infra/supabase/hardening.sql`](../infra/supabase/hardening.sql).
3. La consulta final debe mostrar `rowsecurity = true` en las 9 tablas.

La API sigue funcionando porque se conecta con el rol propietario `postgres`.
**Nunca** pongas la `service_role` key en el frontend: NeuroLab no la usa.

---

## 2. Render: desplegar la API

### Opción A — Blueprint (recomendada)

1. En Render → **New** → **Blueprint**.
2. Conecta tu repositorio de GitHub y aplica el `render.yaml` de la raíz.
3. Render pedirá los valores marcados con `sync: false`:

   | Variable | Valor |
   | --- | --- |
   | `NEUROLAB_DATABASE_URL` | URI de Supabase del paso 1 |
   | `NEUROLAB_CORS_ORIGINS` | Dominio de Vercel (puedes poner `http://localhost:5173` y cambiarlo después) |
   | `NEUROLAB_DEMO_PASSWORD` | Contraseña del admin demo |
   | `NEUROLAB_DEMO_ANALYST_PASSWORD` | Contraseña del analista demo |
   | `NEUROLAB_DEMO_REVIEWER_PASSWORD` | Contraseña del revisor demo |

4. El blueprint ya configura:
   - `NEUROLAB_ENV=production`
   - `NEUROLAB_SECRET` generado aleatoriamente
   - `NEUROLAB_STORAGE_DIR=/var/data/storage`
   - disco persistente de 1 GB montado en `/var/data`
   - health check en `/health`
   - región `frankfurt` (cámbiala si tu Supabase está en otra)
5. Pulsa **Apply** y espera a que el estado sea **Live**.
6. Abre `https://TU-SERVICIO.onrender.com/health`. Debe responder:

   ```json
   {
     "status": "ok",
     "service": "neurolab-api",
     "database": true,
     ...
   }
   ```

   Si `database` es `false`, revisa la URL de Supabase y los logs de Render.

7. Guarda la URL pública; la necesitarás en Vercel.

### Opción B — Servicio manual

Si prefieres no usar el blueprint:

1. **New** → **Web Service** → conecta el repositorio.
2. Configura:
   - **Language / Runtime**: Docker
   - **Dockerfile Path**: `./infra/docker/Dockerfile.api`
   - **Docker Build Context Directory**: `.`
   - **Health Check Path**: `/health`
   - **Instance Type**: Starter (necesario para disco persistente)
3. Añade las variables de entorno de la tabla anterior más:
   - `NEUROLAB_ENV=production`
   - `NEUROLAB_SECRET=<cadena aleatoria larga>`
   - `NEUROLAB_STORAGE_DIR=/var/data/storage`
   - `NEUROLAB_SEED_DEMO=true`
   - `NEUROLAB_EPOCH_DELAY_MS=120`
4. En **Disks**, añade un disco de 1 GB montado en `/var/data`.

### Notas operativas de Render

- **Un solo proceso.** El worker de entrenamiento vive dentro del proceso de
  FastAPI. No escales a varias instancias ni uses varios workers de Uvicorn:
  cada proceso tendría su propia cola.
- **Reinicios.** Si Render reinicia el servicio durante un entrenamiento, el
  trabajo queda como `FAILED` con un mensaje claro; los trabajos en cola se
  reencolan automáticamente al arrancar.
- **Plan Free.** El servicio se duerme tras 15 minutos sin tráfico. El primer
  acceso tarda 30–60 s y **un entrenamiento en curso se interrumpe**. Para una
  demo o evaluación, usa el plan Starter.
- **Disco.** Sin disco persistente, los CSV subidos y los modelos `.npz` se
  pierden en cada despliegue. El plan Free no permite discos.
- **Región.** Debe estar cerca de Supabase para reducir latencia.
- **Despliegues.** Cada `git push` a la rama conectada reconstruye la imagen.

---

## 3. Vercel: desplegar el frontend

1. En Vercel → **Add New** → **Project** → importa el repositorio.
2. Configura el proyecto:
   - **Root Directory**: `apps/web` ← imprescindible.
   - **Framework Preset**: Vite (se detecta solo).
   - **Build Command**: `npm run build`.
   - **Output Directory**: `dist`.
   - **Install Command**: `npm ci`.
3. En **Environment Variables**, añade para **Production** (y Preview si
   quieres):

   | Variable | Valor |
   | --- | --- |
   | `VITE_API_URL` | `https://TU-SERVICIO.onrender.com` |

   Sin barra final. Las variables `VITE_*` se incrustan en el bundle **en el
   momento del build**: si cambias la URL, vuelve a desplegar.
4. Pulsa **Deploy** y abre el dominio resultante, por ejemplo
   `https://neurolab.vercel.app`.
5. Vuelve a Render → tu servicio → **Environment** y actualiza:

   ```
   NEUROLAB_CORS_ORIGINS=https://neurolab.vercel.app
   ```

   Sin barra final. Guarda y espera el redeploy (o pulsa **Manual Deploy**).
   Si usas dominios de preview de Vercel, el blueprint ya define:

   ```
   NEUROLAB_CORS_ORIGIN_REGEX=https://.*\.vercel\.app
   ```

6. Recarga el frontend e inicia sesión con las credenciales demo (las
   contraseñas que elegiste en Render).

### Dominios personalizados (opcional)

- En Vercel → **Settings → Domains**, añade tu dominio y configura el DNS.
- Añade ese dominio exacto a `NEUROLAB_CORS_ORIGINS` en Render, separado por
  comas si tienes varios.
- Vuelve a desplegar el frontend si cambia `VITE_API_URL`.

---

## 4. Verificación de extremo a extremo

1. `GET https://TU-API.onrender.com/health` → `status: ok`, `database: true`.
2. `https://TU-API.onrender.com/docs` muestra Swagger.
3. En Vercel, inicia sesión con el usuario administrador.
4. Crea un proyecto o usa el proyecto demo **Clasificación de clientes**.
5. Sube un CSV (o usa `clientes_demo.csv` del seed).
6. Crea/valida una arquitectura Feedforward.
7. Lanza un entrenamiento y comprueba que las métricas avanzan **sin recargar**
   (SSE directo a Render).
8. Al terminar, revisa el modelo en **Modelos**, descarga el `.npz` y verifica
   el reporte en **Reportes**.
9. En Supabase → **Table Editor**, confirma que aparecen filas en
   `training_jobs`, `training_metrics` y `model_versions`.
10. En Render → **Logs**, no debe haber errores 500 ni avisos de CORS.

---

## 5. Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| `blocked by CORS policy` | El dominio exacto del navegador no está en `NEUROLAB_CORS_ORIGINS`. Incluye `https://…` sin barra final y reinicia Render. Para previews usa `NEUROLAB_CORS_ORIGIN_REGEX`. |
| El frontend llama a `127.0.0.1:8000` | Falta `VITE_API_URL` o se cambió después del build. Configúrala en Vercel y **redeploy**. |
| `password authentication failed` | Contraseña mal codificada en la URL. Codifica `@`, `#`, `%`, `:` con `urllib.parse.quote`. |
| `could not translate host name` / timeout | Usa el **session pooler** de Supabase (puerto 5432) en lugar de la conexión directa, que puede ser solo IPv6. |
| `prepared statement "…" already exists` | Estás usando el transaction pooler (6543). El backend ya lo detecta; si persiste, cambia al puerto 5432. |
| `database: false` en `/health` | URL incorrecta, proyecto de Supabase pausado o firewall. Revisa los logs de Render. |
| El entrenamiento no avanza y la página duerme | Plan Free de Render. El servicio se suspendió; usa Starter para demos. |
| Los modelos descargados dan 404 tras un redeploy | No hay disco persistente o `NEUROLAB_STORAGE_DIR` no apunta a `/var/data/storage`. |
| Cambié `NEUROLAB_SECRET` y todos fueron deslogueados | Es el comportamiento esperado: invalida los tokens HMAC. |
| Supabase marca el proyecto como pausado | Los proyectos Free se pausan por inactividad. Restáuralo desde el panel. |
| Error 500 al arrancar por `JSONB` | Asegúrate de que `psycopg[binary]` está en `requirements.txt` (ya lo está) y que la URL usa `postgresql+psycopg://`. |

---

## 6. Seguridad antes de compartir la URL

- [ ] `NEUROLAB_SECRET` es largo, aleatorio y distinto del valor de ejemplo.
- [ ] Cambiaste las tres contraseñas demo en Render **antes** del primer
      arranque (el seed solo crea usuarios si no existen).
- [ ] Ejecutaste `infra/supabase/hardening.sql` y RLS está activo.
- [ ] `NEUROLAB_CORS_ORIGINS` contiene solo tus dominios reales.
- [ ] La API y el frontend usan HTTPS (Render y Vercel lo dan por defecto).
- [ ] No hay claves de Supabase (`anon`, `service_role`) en el repositorio ni
      en el bundle del frontend.
- [ ] Si la instancia es pública y solo quieres una demo, considera rotar las
      contraseñas demo periódicamente y limitar el acceso con el firewall de
      Render o un dominio privado.
- [ ] Revisa `/api/v1/audit-events` desde el usuario administrador.

---

## 7. Costes orientativos

| Servicio | Plan | Coste |
| --- | --- | --- |
| Supabase | Free | 0 USD (se pausa por inactividad) |
| Render | Free | 0 USD (se duerme; sin disco) |
| Render | Starter + disco 1 GB | ~7 USD/mes + disco |
| Vercel | Hobby | 0 USD |

Para una entrega académica o una demo puntual, el plan Free de Render es
suficiente si despiertas el servicio antes de la presentación. Para dejar la
plataforma disponible con datos persistentes, usa Starter.

---

## 8. Actualizaciones

```bash
git add .
git commit -m "despliegue: Supabase + Render + Vercel"
git push origin main
```

- Render reconstruye la API automáticamente.
- Vercel reconstruye el frontend automáticamente.
- Los cambios de esquema compatibles los aplica SQLAlchemy al arrancar. Para
  cambios destructivos, añade una migración (Alembic) antes de desplegar.
