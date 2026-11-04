import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { AuditEvent, SystemHealth, User } from '../types'
import { api, messageFromDetail } from '../lib/api'
import {
  Empty,
  Metric,
  PageIntro,
  formatDate,
  formatPercent,
  initials,
} from '../components/ui'

const ROLES = ['Administrador', 'Responsable', 'Analista', 'Revisor', 'Lector']

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'project.created': 'Proyecto creado',
  'project.updated': 'Proyecto actualizado',
  'dataset.uploaded': 'Dataset cargado',
  'architecture.created': 'Arquitectura creada',
  'training.queued': 'Entrenamiento encolado',
  'training.completed': 'Entrenamiento completado',
  'training.failed': 'Entrenamiento fallido',
  'model.status_changed': 'Estado de modelo',
  'model.downloaded': 'Modelo descargado',
  'admin.user_updated': 'Usuario actualizado',
}

export function Admin({
  currentUser,
  notify,
}: {
  currentUser: User
  notify: (kind: 'success' | 'error' | 'info', message: string) => void
}) {
  const [users, setUsers] = useState<User[]>([])
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [userResponse, healthResponse, auditResponse] = await Promise.all([
        api.users(),
        api.systemHealth(),
        api.audit(80),
      ])
      setUsers(userResponse.items)
      setHealth(healthResponse)
      setAudit(auditResponse.items)
    } catch (error) {
      notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (currentUser.role === 'Administrador') void load()
    // Carga inicial de administración.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.role])

  if (currentUser.role !== 'Administrador') {
    return (
      <>
        <PageIntro
          eyebrow="WORKSPACE SETTINGS"
          title="Administración"
          description="Los usuarios, roles y la salud del sistema solo están disponibles para administradores."
        />
        <div className="warning-banner">
          <AlertTriangle size={17} />
          <span>
            Tu rol actual es <b>{currentUser.role}</b>. Solicita permisos de Administrador
            para gestionar usuarios y auditoría global.
          </span>
        </div>
        <section className="panel admin-profile">
          <div className="admin-profile-avatar">
            <ShieldCheck size={28} />
          </div>
          <div className="admin-profile-copy">
            <span className="eyebrow">CUENTA ACTIVA</span>
            <h3>{currentUser.display_name}</h3>
            <p>
              {currentUser.email} · Rol {currentUser.role}
            </p>
          </div>
          <span className="status-pill status-green">
            <i /> Activo
          </span>
        </section>
      </>
    )
  }

  const updateUser = async (user: User, payload: { role?: string; status?: string }) => {
    try {
      const updated = await api.updateUser(user.id, payload)
      setUsers(old => old.map(item => (item.id === updated.id ? updated : item)))
      notify('success', `Usuario ${updated.email} actualizado.`)
      void load()
    } catch (error) {
      notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error))
    }
  }

  return (
    <>
      <PageIntro
        eyebrow="ADMINISTRATION & SECURITY"
        title="Administración"
        description="Usuarios, roles, salud del sistema y auditoría global de la plataforma."
        action={
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
        }
      />

      <div className="metric-grid">
        <Metric label="Usuarios" value={users.length} note="Cuentas registradas" icon={Users} color="purple" />
        <Metric
          label="Sistema"
          value={health?.status === 'ok' ? 'OK' : '—'}
          note={`v${health?.version ?? '2.0.0'} · ${health?.environment ?? 'dev'}`}
          icon={ShieldCheck}
          color="green"
        />
        <Metric
          label="Cola del worker"
          value={health?.worker.queue_size ?? 0}
          note={`${health?.worker.configured_workers ?? 0} hilos`}
          icon={Activity}
          color="blue"
        />
        <Metric
          label="Almacenamiento"
          value={health ? `${health.storage.used_percent}%` : '—'}
          note={health ? `${health.storage.free_gb} GB libres` : 'Consultando...'}
          icon={HardDrive}
          color="orange"
        />
      </div>

      <div className="admin-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Usuarios y roles</h3>
              <p>El rol global determina el acceso a administración.</p>
            </div>
            <span className="subtle-badge">{users.length} cuentas</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol global</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <div className="member-avatar">{initials(user.display_name)}</div>
                        <div>
                          <b>{user.display_name}</b>
                          <small>{user.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        value={user.role}
                        onChange={event => updateUser(user, { role: event.target.value })}
                        disabled={user.id === currentUser.id}
                      >
                        {ROLES.map(role => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${user.status === 'active' ? 'status-green' : 'status-gray'}`}
                      >
                        <i /> {user.status === 'active' ? 'Activo' : 'Deshabilitado'}
                      </span>
                    </td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>
                      <button
                        className="inline-action"
                        disabled={user.id === currentUser.id}
                        onClick={() =>
                          updateUser(user, {
                            status: user.status === 'active' ? 'disabled' : 'active',
                          })
                        }
                      >
                        {user.status === 'active' ? 'Deshabilitar' : 'Habilitar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Salud del sistema</h3>
              <p>Comprobaciones de base de datos, storage y motor.</p>
            </div>
            <span
              className={`status-pill ${health?.status === 'ok' ? 'status-green' : 'status-amber'}`}
            >
              <i /> {health?.status ?? 'sin datos'}
            </span>
          </div>
          {health ? (
            <div className="system-list">
              <div className="system-row">
                <div className="system-icon">
                  <Database size={18} />
                </div>
                <div>
                  <b>Base de datos</b>
                  <small>{health.database.url_engine}</small>
                </div>
                {health.database.ok ? (
                  <CheckCircle2 size={18} className="success-icon" />
                ) : (
                  <AlertTriangle size={18} />
                )}
              </div>
              <div className="system-row">
                <div className="system-icon">
                  <HardDrive size={18} />
                </div>
                <div>
                  <b>Almacenamiento</b>
                  <small>{health.storage.path}</small>
                </div>
                <span className="subtle-badge">{health.storage.free_gb} GB libres</span>
              </div>
              <div className="system-row">
                <div className="system-icon">
                  <Cpu size={18} />
                </div>
                <div>
                  <b>Motor de entrenamiento</b>
                  <small>{health.engine.numpy_engine}</small>
                </div>
                <span className="subtle-badge">
                  {health.engine.tensorflow_available ? 'TensorFlow disponible' : 'NumPy'}
                </span>
              </div>
              <div className="system-row">
                <div className="system-icon">
                  <Activity size={18} />
                </div>
                <div>
                  <b>Worker</b>
                  <small>
                    {health.worker.queue_size} en cola · PID {health.pid}
                  </small>
                </div>
                <span className="subtle-badge">{health.worker.configured_workers} hilos</span>
              </div>
            </div>
          ) : (
            <Empty icon={Cpu} title="Sin estado de salud" text="Actualiza para consultar la API." />
          )}
          <div className="engine-note">
            <ShieldCheck size={16} />
            <span>
              Auditoría activa: inicios de sesión, cargas, entrenamientos, cambios de modelo
              y administración de usuarios.
            </span>
          </div>
        </section>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h3>Auditoría global</h3>
            <p>Eventos recientes ordenados por fecha descendente.</p>
          </div>
          <span className="subtle-badge">{audit.length} eventos</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Actor</th>
                <th>Acción</th>
                <th>Proyecto</th>
                <th>Metadatos</th>
              </tr>
            </thead>
            <tbody>
              {audit.map(event => (
                <tr key={event.id}>
                  <td>{formatDate(event.created_at)}</td>
                  <td>{event.actor_email || 'sistema'}</td>
                  <td>
                    <b>{ACTION_LABEL[event.action] || event.action}</b>
                    <small className="table-sub">{event.action}</small>
                  </td>
                  <td>{event.project_id?.slice(0, 8) || '—'}</td>
                  <td>
                    <code className="audit-meta">
                      {Object.entries(event.metadata)
                        .slice(0, 3)
                        .map(([key, value]) => `${key}=${String(value)}`)
                        .join(' · ') || '—'}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
