import {
  Activity,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  FolderKanban,
  Gauge,
  Play,
  Plus,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react'
import type { DashboardData, ModuleKey, Project, TrainingJob } from '../types'
import {
  Empty,
  JobStatus,
  Metric,
  PageIntro,
  ProgressBar,
  formatDate,
  formatPercent,
  jobMetric,
} from '../components/ui'

export function Dashboard({
  data,
  projects,
  jobs,
  onGo,
  onCreate,
  onOpenJob,
}: {
  data: DashboardData | null
  projects: Project[]
  jobs: TrainingJob[]
  onGo: (key: ModuleKey) => void
  onCreate: () => void
  onOpenJob: (job: TrainingJob) => void
}) {
  const counts = data?.counts
  const recent = data?.recent_jobs?.length ? data.recent_jobs : jobs.slice(0, 6)
  const engine = data?.engine

  return (
    <>
      <PageIntro
        eyebrow="OVERVIEW / WORKSPACE"
        title="Tu laboratorio, en perspectiva."
        description="Supervisa proyectos, datasets y entrenamientos reales desde un único espacio de trabajo."
        action={
          <>
            <button className="btn btn-secondary" onClick={() => onGo('datasets')}>
              <Upload size={16} /> Cargar dataset
            </button>
            <button className="btn btn-primary" onClick={onCreate}>
              <Plus size={17} /> Nuevo proyecto
            </button>
          </>
        }
      />

      <div className="welcome-banner">
        <div className="welcome-copy">
          <span>
            <Sparkles size={15} /> LABORATORIO DE INTELIGENCIA ARTIFICIAL
          </span>
          <h2>Convierte tus datos en modelos medibles.</h2>
          <p>
            El backend valida la arquitectura, ejecuta backpropagation real en un worker
            y publica cada época por SSE. Nada se simula en el navegador.
          </p>
          <button className="banner-link" onClick={() => onGo('architectures')}>
            Explorar diseñador de redes <span>→</span>
          </button>
        </div>
        <div className="welcome-graphic">
          <div className="orbit orbit-a" />
          <div className="orbit orbit-b" />
          <div className="orbit orbit-c" />
          <div className="orbit-core">
            <BrainCircuit size={35} />
          </div>
          <i className="orbit-dot dot-a" />
          <i className="orbit-dot dot-b" />
          <i className="orbit-dot dot-c" />
        </div>
      </div>

      <div className="metric-grid">
        <Metric
          label="Proyectos"
          value={String(counts?.projects ?? projects.length).padStart(2, '0')}
          note={`${counts?.active_projects ?? 0} activos`}
          icon={FolderKanban}
          color="purple"
          trend="Workspace"
        />
        <Metric
          label="Datasets"
          value={String(counts?.datasets ?? 0).padStart(2, '0')}
          note="Archivos CSV validados"
          icon={Database}
          color="blue"
          trend="Biblioteca"
        />
        <Metric
          label="Entrenamientos activos"
          value={String(counts?.active_jobs ?? 0).padStart(2, '0')}
          note="Cola y workers"
          icon={Activity}
          color="green"
          trend={counts?.active_jobs ? 'En vivo' : 'En espera'}
        />
        <Metric
          label="Ejecuciones"
          value={String(counts?.jobs ?? 0).padStart(2, '0')}
          note={`${counts?.completed_jobs ?? 0} completadas`}
          icon={Zap}
          color="orange"
          trend="Trazables"
        />
        <Metric
          label="Modelos"
          value={String(counts?.models ?? 0).padStart(2, '0')}
          note={`${counts?.approved_models ?? 0} aprobados`}
          icon={BrainCircuit}
          color="cyan"
          trend="Registro"
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel table-panel">
          <div className="panel-heading">
            <div>
              <h3>Trabajos recientes</h3>
              <p>Estado persistido y métricas de la última época.</p>
            </div>
            <button className="inline-action" onClick={() => onGo('training')}>
              Ver todos <span>→</span>
            </button>
          </div>
          {recent.length === 0 ? (
            <Empty
              icon={Play}
              title="Todavía no hay entrenamientos"
              text="Selecciona un proyecto con dataset y arquitectura para lanzar el primero."
              action={
                <button className="btn btn-primary btn-small" onClick={() => onGo('training')}>
                  <Play size={15} /> Iniciar entrenamiento
                </button>
              }
            />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Trabajo</th>
                    <th>Proyecto</th>
                    <th>Estado</th>
                    <th>Avance</th>
                    <th>Pérdida</th>
                    <th>Precisión</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(job => (
                    <tr key={job.id} onClick={() => onOpenJob(job)} className="clickable-row">
                      <td>
                        <code className="job-code">{job.id.slice(0, 8)}</code>
                        <small className="table-sub">{job.architecture_name}</small>
                      </td>
                      <td>{job.project_name}</td>
                      <td>
                        <JobStatus status={job.status} />
                      </td>
                      <td>
                        <div className="progress-cell">
                          <ProgressBar value={job.progress} status={job.status} />
                          <small>{job.progress.toFixed(0)}%</small>
                        </div>
                      </td>
                      <td>{jobMetric(job, 'loss')?.toFixed(4) ?? '—'}</td>
                      <td>{formatPercent(jobMetric(job, 'accuracy'))}</td>
                      <td>{formatDate(job.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel system-panel">
          <div className="panel-heading">
            <div>
              <h3>Estado del sistema</h3>
              <p>Servicios que sostienen la ejecución.</p>
            </div>
            <span className="status-pill status-green">
              <i /> Operativo
            </span>
          </div>
          <div className="system-list">
            <div className="system-row">
              <div className="system-icon">
                <Cpu size={18} />
              </div>
              <div>
                <b>Motor ML</b>
                <small>{engine?.numpy_engine ?? 'NumPy MLP'}</small>
              </div>
              <span className="subtle-badge">Activo</span>
            </div>
            <div className="system-row">
              <div className="system-icon">
                <Database size={18} />
              </div>
              <div>
                <b>Persistencia</b>
                <small>Estados, métricas y auditoría</small>
              </div>
              <CheckCircle2 size={18} className="success-icon" />
            </div>
            <div className="system-row">
              <div className="system-icon">
                <BarChart3 size={18} />
              </div>
              <div>
                <b>Eventos en tiempo real</b>
                <small>Server-Sent Events con reconexión</small>
              </div>
              <span className="subtle-badge">SSE</span>
            </div>
            <div className="system-row">
              <div className="system-icon">
                <Gauge size={18} />
              </div>
              <div>
                <b>Familias habilitadas</b>
                <small>{engine?.families_enabled?.join(', ') ?? 'Feedforward'}</small>
              </div>
              <span className="subtle-badge">
                {engine?.families_validated?.length ?? 4} validadas
              </span>
            </div>
          </div>
          {engine && (
            <div className={`engine-note ${engine.tensorflow_available ? 'engine-ok' : ''}`}>
              <BrainCircuit size={16} />
              <span>
                {engine.tensorflow_available
                  ? `TensorFlow ${engine.tensorflow_version} disponible como extensión.`
                  : 'Motor NumPy con backpropagation real. TensorFlow es opcional para producción.'}
              </span>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
