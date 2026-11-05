-- ============================================================================
-- NeuroLab Enterprise — endurecimiento de Supabase
--
-- Ejecuta este script en Supabase → SQL Editor DESPUÉS del primer arranque
-- de la API (la API crea las tablas automáticamente con SQLAlchemy).
--
-- Qué hace:
--   1. Activa Row Level Security (RLS) en todas las tablas de la aplicación.
--   2. Revoca los permisos de los roles `anon` y `authenticated` que Supabase
--      expone a través de PostgREST.
--
-- La API se conecta con el rol `postgres` (propietario de las tablas), por lo
-- que sigue funcionando con normalidad. Sin este script, cualquiera con la
-- clave `anon` podría leer las tablas desde la API REST pública de Supabase.
--
-- Importante: NO uses la `service_role` key en el frontend. NeuroLab no la
-- necesita; toda la autorización ocurre en FastAPI.
-- ============================================================================

begin;

do $$
declare
    tabla text;
    tablas text[] := array[
        'users',
        'projects',
        'project_members',
        'datasets',
        'architectures',
        'training_jobs',
        'training_metrics',
        'model_versions',
        'audit_events'
    ];
begin
    foreach tabla in array tablas loop
        if to_regclass(format('public.%I', tabla)) is not null then
            execute format('alter table public.%I enable row level security', tabla);
            execute format('revoke all on table public.%I from anon, authenticated', tabla);
            execute format('revoke all on table public.%I from public', tabla);
        end if;
    end loop;
end $$;

-- Evita que objetos futuros creados en `public` vuelvan a quedar expuestos.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

commit;

-- Verificación: debe devolver rowsecurity = true para las 9 tablas.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'users', 'projects', 'project_members', 'datasets', 'architectures',
    'training_jobs', 'training_metrics', 'model_versions', 'audit_events'
  )
order by tablename;
