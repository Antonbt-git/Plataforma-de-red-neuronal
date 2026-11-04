import { useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Download,
  FileBarChart2,
  FileJson,
  FolderKanban,
  Network,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import type { AuditEvent, Project, ProjectReport } from '../types'
import { api, messageFromDetail } from '../lib/api'
import {
  Empty,
  JobStatus,
  Metric,
  PageIntro,
  formatDate,
} from '../components/ui'

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'project.created': 'Proyecto creado',
  'project.updated': 'Proyecto actualizado',
  'project.member_added': 'Miembro agregado',
  'project.member_removed': 'Miembro retirado',
  'dataset.uploaded': 'Dataset cargado',
  'dataset.deleted': 'Dataset eliminado',
  'architecture.created': 'Arquitectura versionada',
  'training.queued': 'Entrenamiento encolado',
  'training.completed': 'Entrenamiento completado',
  'training.failed': 'Entrenamiento fallido',
  'training.cancelled': 'Entrenamiento cancelado',
  'training.cancel_requested': 'Cancelación solicitada',
  'model.status_changed': 'Estado de modelo cambiado',
  'model.downloaded': 'Modelo descargado',
  'admin.user_updated': 'Usuario actualizado',
}

export function Reports({
  projects,
  notify,
}: {
  projects: Project[]
  notify: (kind: 'success' | 'error' | 'info', message: string) => void
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [report, setReport] = useState<ProjectReport | null>(null)
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    Promise.all([api.report(projectId), api.projectAudit(projectId)])
      .then(([reportResponse, auditResponse]) => {
        if (cancelled) return
        setReport(reportResponse)
        setAudit(auditResponse.items)
      })
      .catch(error =>
        notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error)),
      )
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, reloadKey, notify])

  const downloadJson = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `neurolab_reporte_${projectId}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const downloadCsv = async () => {
    try {
      await api.downloadReport(projectId)
      notify('success', 'Reporte CSV descargado.')
    } catch (error) {
      notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error))
    }
  }

  return (
    <>
      <PageIntro
        eyebrow="REPORT CENTER"
        title="Centro de reportes"
        description="Ficha del proyecto, arquitecturas, datasets, historial de entrenamiento, modelos y auditoría exportables."
        action={
          <>
            <button className="btn btn-secondary" onClick={downloadJson} disabled={!report}>
              <FileJson size={16} /> JSON
            </button>
            <button className="btn btn-primary" onClick={downloadCsv} disabled={!report}>
              <Download size={16} /> Exportar CSV
            </button>
          </>
        }
      />

      <div className="toolbar panel">
        <label>
          Proyecto a reportar
          <select value={projectId} onChange={event => setProjectId(event.target.value)}>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <span className="toolbar-count">
          {loading ? 'Generando reporte...' : report ? `Generado ${formatDate(report.generated_at)}` : 'Sin datos'}
        </span>
      </div>

      {!report ? (
        <Empty
          icon={FileBarChart2}
          title="Selecciona un proyecto"
          text="El reporte se genera desde los datos persistidos en la API."
        />
      ) : (
        <>
          <div className="report-project-head panel">
            <div className="project-logo">
              <FolderKanban size={22} />
            </div>
            <div>
              <span className="eyebrow">FICHA DE PROYECTO</span>
              <h2>{report.project.name}</h2>
              <p>{report.project.description || 'Sin descripción.'}</p>
            </div>
            <div className="report-project-meta">
              <span>{report.project.family}</span>
              <span>{report.project.status}</span>
              <span>{report.project.owner_email}</span>
            </div>
          </div>

          <div className="metric-grid">
            <Metric label="Datasets" value={report.summary.datasets} note="Versionados" icon={FolderKanban} color="blue" />
            <Metric label="Arquitecturas" value={report.summary.architectures} note="Validadas" icon={Network} color="purple" />
            <Metric label="Entrenamientos" value={report.summary.jobs} note={`${report.summary.completed_jobs} completados`} icon={Activity} color="green" />
            <Metric label="Modelos" value={report.summary.models} note={`${report.summary.approved_models} aprobados`} icon={CheckCircle2} color="orange" />
          </div>

          <div className="report-grid">
            {[
              {
                title: 'Historial de entrenamientos',
                text: 'Estados, épocas y resultados persistidos.',
                count: report.jobs.length,
                icon: Activity,
              },
              {
                title: 'Arquitecturas',
                text: 'Configuraciones validadas y versionadas.',
                count: report.architectures.length,
                icon: Network,
              },
              {
                title: 'Modelos',
                text: 'Artefactos con checksum y estado de revisión.',
                count: report.models.length,
                icon: BarChart3,
              },
              {
                title: 'Eventos de auditoría',
                text: 'Trazabilidad de acciones relevantes.',
                count: audit.length,
                icon: ShieldCheck,
              },
            ].map(item => (
              <article className="report-card panel" key={item.title}>
                <div className="report-icon">
                  <item.icon size={22} />
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <div className="report-card-bottom">
                  <span>{item.count} registro(s)</span>
                </div>
              </article>
            ))}
          </div>

          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h3>Historial de entrenamientos</h3>
                <p>Resultados consultables después de cerrar sesión y volver a ingresar.</p>
              </div>
              <button className="inline-action" onClick={() => setReloadKey(key => key + 1)}>
                <RefreshCw size={14} /> Recargar
              </button>
            </div>
            {report.jobs.length === 0 ? (
              <Empty icon={Activity} title="Sin ejecuciones" text="El proyecto aún no tiene entrenamientos." />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Trabajo</th>
                      <th>Arquitectura</th>
                      <th>Dataset</th>
                      <th>Estado</th>
                      <th>Épocas</th>
                      <th>Val loss</th>
                      <th>Accuracy</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.jobs.map(job => (
                      <tr key={job.id}>
                        <td>
                          <code className="job-code">{job.id.slice(0, 8)}</code>
                        </td>
                        <td>{job.architecture_name}</td>
                        <td>{job.dataset_name}</td>
                        <td>
                          <JobStatus status={job.status} />
                        </td>
                        <td>
                          {job.current_epoch}/{job.epochs}
                        </td>
                        <td>{job.last_metrics.val_loss?.toFixed(4) ?? '—'}</td>
                        <td>
                          {job.last_metrics.accuracy !== undefined
                            ? `${(job.last_metrics.accuracy * 100).toFixed(2)}%`
                            : '—'}
                        </td>
                        <td>{formatDate(job.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h3>Auditoría del proyecto</h3>
                <p>Últimos eventos registrados por la API.</p>
              </div>
              <span className="subtle-badge">
                <ShieldCheck size={14} /> {audit.length} eventos
              </span>
            </div>
            <div className="audit-list">
              {audit.slice(0, 25).map(event => (
                <div className="audit-row" key={event.id}>
                  <div className="audit-dot" />
                  <div>
                    <b>{ACTION_LABEL[event.action] || event.action}</b>
                    <small>
                      {event.actor_email || 'sistema'} · {formatDate(event.created_at)}
                    </small>
                  </div>
                  <code>{event.action}</code>
                </div>
              ))}
              {audit.length === 0 && <p className="muted-text">Sin eventos de auditoría.</p>}
            </div>
          </section>
        </>
      )}
    </>
  )
}
