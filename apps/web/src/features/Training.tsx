import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleSlash,
  Clock3,
  Play,
  RefreshCw,
  Settings2,
  Square,
  Timer,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Architecture, Dataset, Project, TrainingJob } from '../types'
import { api, messageFromDetail } from '../lib/api'
import {
  Empty,
  JOB_STATUS_LABEL,
  JobStatus,
  Metric,
  PageIntro,
  ProgressBar,
  formatDate,
  formatPercent,
  jobMetric,
} from '../components/ui'

const FILTERS = ['Todos', 'Activos', 'Completados', 'Fallidos', 'Cancelados'] as const

function matchesFilter(job: TrainingJob, filter: string): boolean {
  if (filter === 'Todos') return true
  if (filter === 'Activos') return !job.terminal
  if (filter === 'Completados') return job.status === 'COMPLETED'
  if (filter === 'Fallidos') return job.status === 'FAILED'
  if (filter === 'Cancelados') return job.status === 'CANCELLED'
  return true
}

export function Training({
  projects,
  datasets,
  jobs,
  initialProjectId,
  focusJobId,
  onFocusJob,
  onRefresh,
  notify,
  onGoArchitectures,
}: {
  projects: Project[]
  datasets: Dataset[]
  jobs: TrainingJob[]
  initialProjectId: string
  focusJobId: string | null
  onFocusJob: (job: TrainingJob | null) => void
  onRefresh: () => Promise<void>
  notify: (kind: 'success' | 'error' | 'info', message: string) => void
  onGoArchitectures: () => void
}) {
  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '')
  const [architectures, setArchitectures] = useState<Architecture[]>([])
  const [architectureId, setArchitectureId] = useState('')
  const [datasetStore, setDatasetStore] = useState<Dataset[]>([])
  const [datasetId, setDatasetId] = useState('')
  const [epochs, setEpochs] = useState(30)
  const [batchSize, setBatchSize] = useState(24)
  const [learningRate, setLearningRate] = useState(0.01)
  const [seed, setSeed] = useState(42)
  const [filter, setFilter] = useState<string>('Todos')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const project = projects.find(item => item.id === projectId)
  const selectedJob = jobs.find(job => job.id === focusJobId) || jobs[0]
  const projectJobs = useMemo(
    () => jobs.filter(job => job.project_id === projectId && matchesFilter(job, filter)),
    [jobs, projectId, filter],
  )
  const activeCount = jobs.filter(job => !job.terminal).length

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    Promise.all([api.projectArchitectures(projectId), api.projectDatasets(projectId)])
      .then(([architectureResponse, datasetResponse]) => {
        if (cancelled) return
        setArchitectures(architectureResponse.items)
        setDatasetStore(datasetResponse.items)
        const latest = architectureResponse.items[0]
        if (latest) {
          setArchitectureId(latest.id)
          setEpochs(latest.config.epochs)
          setBatchSize(latest.config.batch_size)
          setLearningRate(latest.config.learning_rate)
        } else {
          setArchitectureId('')
        }
        setDatasetId(datasetResponse.items[0]?.id || '')
      })
      .catch(error =>
        setError(messageFromDetail((error as { detail?: unknown }).detail ?? error)),
      )
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => {
      if (jobs.some(job => !job.terminal)) void onRefresh()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, jobs, onRefresh])

  const architecture = architectures.find(item => item.id === architectureId)
  const dataset = datasetStore.find(item => item.id === datasetId)

  const chooseArchitecture = (id: string) => {
    setArchitectureId(id)
    const found = architectures.find(item => item.id === id)
    if (found) {
      setEpochs(found.config.epochs)
      setBatchSize(found.config.batch_size)
      setLearningRate(found.config.learning_rate)
    }
  }

  const start = async () => {
    if (!projectId || !architectureId || !datasetId) {
      setError('Selecciona proyecto, arquitectura y dataset antes de entrenar.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const job = await api.createJob(projectId, {
        architecture_id: architectureId,
        dataset_id: datasetId,
        epochs,
        batch_size: batchSize,
        learning_rate: learningRate,
        seed,
      })
      onFocusJob(job)
      await onRefresh()
      notify('success', `Trabajo ${job.id.slice(0, 8)} encolado. El worker iniciará en breve.`)
    } catch (error) {
      const message = messageFromDetail((error as { detail?: unknown }).detail ?? error)
      setError(message)
      notify('error', message)
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (job: TrainingJob) => {
    try {
      const response = await api.cancelJob(job.id)
      notify('info', response.message)
      await onRefresh()
    } catch (error) {
      notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error))
    }
  }

  const history = selectedJob?.history ?? []
  const chartData = history.map(point => ({
    ...point,
    accuracy: point.accuracy !== undefined ? point.accuracy * 100 : undefined,
    val_accuracy: point.val_accuracy !== undefined ? point.val_accuracy * 100 : undefined,
  }))

  return (
    <div className="training-view">
      <PageIntro
        eyebrow="EXPERIMENT CONTROL CENTER"
        title="Entrenamientos"
        description="Lanza ejecuciones reales en workers aislados y sigue cada época por SSE sin recargar la página."
        action={
          <button
            className="btn btn-secondary"
            onClick={() => {
              void onRefresh()
              notify('info', 'Estado actualizado desde la API.')
            }}
          >
            <RefreshCw size={16} /> Actualizar
          </button>
        }
      />

      <div className="training-launch panel">
        <div className="launch-icon">
          <Zap size={23} />
        </div>
        <div className="launch-description">
          <h3>Configurar nueva ejecución</h3>
          <p>El backend valida dataset y arquitectura antes de encolar el trabajo.</p>
        </div>
        <button
          className="btn btn-primary launch-action"
          onClick={start}
          disabled={busy || !architectureId || !datasetId}
        >
          <Play size={15} fill="currentColor" /> {busy ? 'Enviando...' : 'Iniciar entrenamiento'}
        </button>
        <div className="launch-fields">
          <label>
            Proyecto
            <select
              value={projectId}
              onChange={event => {
                setProjectId(event.target.value)
                setError('')
              }}
            >
              {projects.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Arquitectura
            <select value={architectureId} onChange={event => chooseArchitecture(event.target.value)}>
              <option value="">Selecciona...</option>
              {architectures.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name} · v{item.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dataset
            <select value={datasetId} onChange={event => setDatasetId(event.target.value)}>
              <option value="">Selecciona...</option>
              {datasetStore.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.metadata.rows} filas
                </option>
              ))}
            </select>
          </label>
          <label>
            Épocas
            <input
              type="number"
              min={1}
              max={500}
              value={epochs}
              onChange={event => setEpochs(Math.max(1, Math.min(500, Number(event.target.value))))}
            />
          </label>
          <label>
            Batch
            <input
              type="number"
              min={1}
              max={1024}
              value={batchSize}
              onChange={event => setBatchSize(Number(event.target.value))}
            />
          </label>
          <label>
            Learning rate
            <input
              type="number"
              min="0.0001"
              max="1"
              step="0.001"
              value={learningRate}
              onChange={event => setLearningRate(Number(event.target.value))}
            />
          </label>
          <label>
            Semilla
            <input
              type="number"
              min={0}
              max={1000000}
              value={seed}
              onChange={event => setSeed(Number(event.target.value))}
            />
          </label>
        </div>
      </div>

      {(!architectures.length || !datasetStore.length) && (
        <div className="warning-banner">
          <AlertTriangle size={17} />
          <span>
            {!datasetStore.length
              ? 'El proyecto no tiene datasets. Carga un CSV antes de entrenar.'
              : 'El proyecto no tiene arquitecturas. Guarda una configuración en el diseñador.'}
          </span>
          <button className="inline-action" onClick={onGoArchitectures}>
            Ir al diseñador <span>→</span>
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="training-stat-grid">
        <Metric
          label="En cola / ejecutando"
          value={activeCount}
          note="Workers activos"
          icon={Activity}
          color="green"
          trend={activeCount ? 'En vivo' : 'En espera'}
        />
        <Metric
          label="Completados"
          value={jobs.filter(job => job.status === 'COMPLETED').length}
          note="Con métricas persistidas"
          icon={CheckCircle2}
          color="purple"
        />
        <Metric
          label="Fallidos"
          value={jobs.filter(job => job.status === 'FAILED').length}
          note="Con error controlado"
          icon={AlertTriangle}
          color="orange"
        />
        <Metric
          label="Cancelados"
          value={jobs.filter(job => job.status === 'CANCELLED').length}
          note="Cancelación cooperativa"
          icon={CircleSlash}
          color="blue"
        />
      </div>

      <div className="training-layout">
        <section className="panel table-panel">
          <div className="panel-heading">
            <div>
              <h3>Cola de ejecuciones</h3>
              <p>
                {project?.name} · {projectJobs.length} trabajo(s)
              </p>
            </div>
            <div className="filter-pills">
              {FILTERS.map(item => (
                <button
                  key={item}
                  className={filter === item ? 'active' : ''}
                  onClick={() => setFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {projectJobs.length === 0 ? (
            <Empty
              icon={Play}
              title="Sin entrenamientos para este filtro"
              text="Configura una ejecución arriba y envíala a la cola del worker."
            />
          ) : (
            <div className="job-list">
              {projectJobs.map(job => (
                <article
                  key={job.id}
                  className={`job-row ${selectedJob?.id === job.id ? 'job-row-selected' : ''}`}
                  onClick={() => onFocusJob(job)}
                >
                  <div className="job-row-top">
                    <div>
                      <code className="job-code">{job.id.slice(0, 8)}</code>
                      <b>{job.architecture_name || 'Arquitectura'}</b>
                      <small>{job.dataset_name}</small>
                    </div>
                    <JobStatus status={job.status} />
                  </div>
                  <div className="job-row-progress">
                    <ProgressBar value={job.progress} status={job.status} />
                    <span>
                      {job.current_epoch}/{job.epochs} épocas · {job.progress.toFixed(0)}%
                    </span>
                  </div>
                  <div className="job-row-metrics">
                    <span>
                      Pérdida <b>{jobMetric(job, 'loss')?.toFixed(4) ?? '—'}</b>
                    </span>
                    <span>
                      Val loss <b>{jobMetric(job, 'val_loss')?.toFixed(4) ?? '—'}</b>
                    </span>
                    <span>
                      Precisión <b>{formatPercent(jobMetric(job, 'accuracy'))}</b>
                    </span>
                    <span>
                      <Clock3 size={13} /> {formatDate(job.created_at)}
                    </span>
                  </div>
                  {job.error_message && <p className="job-error">{job.error_message}</p>}
                  <div className="job-row-actions">
                    <span className="engine-tag">{job.engine}</span>
                    {!job.terminal && (
                      <button
                        className="btn btn-danger btn-small"
                        onClick={event => {
                          event.stopPropagation()
                          void cancel(job)
                        }}
                      >
                        <Square size={12} /> Cancelar
                      </button>
                    )}
                    {job.status === 'COMPLETED' && (
                      <span className="subtle-badge">
                        <CheckCircle2 size={13} /> modelo generado
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="panel training-detail">
          <div className="panel-heading">
            <div>
              <h3>Detalle de la ejecución</h3>
              <p>{selectedJob ? selectedJob.id.slice(0, 8) : 'Selecciona un trabajo'}</p>
            </div>
            {selectedJob && <JobStatus status={selectedJob.status} />}
          </div>

          {!selectedJob ? (
            <Empty
              icon={BarChart3}
              title="Sin ejecución seleccionada"
              text="Haz clic en un trabajo para ver su historial y configuración."
            />
          ) : (
            <>
              <div className="detail-grid">
                <div>
                  <small>Estado</small>
                  <b>{JOB_STATUS_LABEL[selectedJob.status]}</b>
                </div>
                <div>
                  <small>Progreso</small>
                  <b>{selectedJob.progress.toFixed(0)}%</b>
                </div>
                <div>
                  <small>Optimizador</small>
                  <b>{selectedJob.optimizer}</b>
                </div>
                <div>
                  <small>Pérdida</small>
                  <b>{selectedJob.loss_function}</b>
                </div>
                <div>
                  <small>Learning rate</small>
                  <b>{selectedJob.learning_rate}</b>
                </div>
                <div>
                  <small>Batch / semilla</small>
                  <b>
                    {selectedJob.batch_size} / {selectedJob.seed}
                  </b>
                </div>
              </div>

              <div className="chart-box training-chart">
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="epoch" />
                      <YAxis />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="loss"
                        name="Pérdida"
                        stroke="#7657f6"
                        fill="#7657f622"
                        strokeWidth={2.5}
                      />
                      <Area
                        type="monotone"
                        dataKey="val_loss"
                        name="Val loss"
                        stroke="#f59e0b"
                        fill="#f59e0b18"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-placeholder">
                    {selectedJob.terminal ? (
                      <>
                        <BarChart3 size={22} />
                        <span>Sin historial de épocas.</span>
                      </>
                    ) : (
                      <>
                        <Timer size={22} className="spin-slow" />
                        <span>Esperando la primera época del worker...</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="detail-section">
                <h4>Últimas métricas</h4>
                <div className="detail-grid">
                  <div>
                    <small>Train loss</small>
                    <b>{jobMetric(selectedJob, 'loss')?.toFixed(4) ?? '—'}</b>
                  </div>
                  <div>
                    <small>Val loss</small>
                    <b>{jobMetric(selectedJob, 'val_loss')?.toFixed(4) ?? '—'}</b>
                  </div>
                  <div>
                    <small>Accuracy</small>
                    <b>{formatPercent(jobMetric(selectedJob, 'accuracy'))}</b>
                  </div>
                  <div>
                    <small>Val accuracy</small>
                    <b>{formatPercent(jobMetric(selectedJob, 'val_accuracy'))}</b>
                  </div>
                </div>
              </div>

              <div className="timeline">
                <div>
                  <span>Creado</span>
                  <b>{formatDate(selectedJob.created_at)}</b>
                </div>
                <div>
                  <span>Inicio</span>
                  <b>{formatDate(selectedJob.started_at)}</b>
                </div>
                <div>
                  <span>Fin</span>
                  <b>{formatDate(selectedJob.ended_at)}</b>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      <div className="auto-refresh-row">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={event => setAutoRefresh(event.target.checked)}
          />
          Actualización automática cada 4 s (SSE se mantiene como canal principal)
        </label>
        <span className="subtle-badge">
          <Settings2 size={13} /> {activeCount} trabajo(s) activo(s)
        </span>
      </div>
    </div>
  )
}
