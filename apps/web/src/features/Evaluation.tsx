import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  Gauge,
  LineChart as LineChartIcon,
  Target,
  TrendingDown,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Project, TrainingJob } from '../types'
import {
  Empty,
  JobStatus,
  Metric,
  PageIntro,
  formatDate,
  formatPercent,
  jobMetric,
} from '../components/ui'

export function Evaluation({
  jobs,
  projects,
  focusJobId,
  onFocusJob,
}: {
  jobs: TrainingJob[]
  projects: Project[]
  focusJobId: string | null
  onFocusJob: (job: TrainingJob) => void
}) {
  const completed = useMemo(() => jobs.filter(job => job.status === 'COMPLETED'), [jobs])
  const [selectedId, setSelectedId] = useState(focusJobId || completed[0]?.id || jobs[0]?.id || '')
  const selected = jobs.find(job => job.id === selectedId) || jobs[0]

  useEffect(() => {
    if (focusJobId) setSelectedId(focusJobId)
  }, [focusJobId])

  const projectName = (id: string) => projects.find(project => project.id === id)?.name || 'Proyecto'
  const withAccuracy = completed.filter(job => jobMetric(job, 'accuracy') !== undefined)
  const averageAccuracy = withAccuracy.length
    ? withAccuracy.reduce((sum, job) => sum + (jobMetric(job, 'accuracy') || 0), 0) / withAccuracy.length
    : undefined
  const averageLoss = completed.length
    ? completed.reduce((sum, job) => sum + (jobMetric(job, 'val_loss') || 0), 0) / completed.length
    : undefined
  const best = completed.reduce<TrainingJob | undefined>((current, job) => {
    const value = jobMetric(job, 'val_loss')
    if (value === undefined) return current
    if (!current) return job
    const currentValue = jobMetric(current, 'val_loss')
    return currentValue === undefined || value < currentValue ? job : current
  }, undefined)

  const chartData = (selected?.history ?? []).map(point => ({
    ...point,
    accuracy: point.accuracy !== undefined ? point.accuracy * 100 : undefined,
    val_accuracy: point.val_accuracy !== undefined ? point.val_accuracy * 100 : undefined,
  }))

  return (
    <>
      <PageIntro
        eyebrow="MODEL ANALYTICS"
        title="Evaluación y métricas"
        description="Analiza pérdida, precisión y validación de ejecuciones reales, y compara el historial entre trabajos."
      />

      <div className="metric-grid">
        <Metric
          label="Ejecuciones completadas"
          value={completed.length}
          note={`de ${jobs.length} trabajos`}
          icon={CheckCircle2}
          color="purple"
        />
        <Metric
          label="Precisión media"
          value={formatPercent(averageAccuracy, 2)}
          note="Clasificación en validación"
          icon={Target}
          color="green"
        />
        <Metric
          label="Val loss media"
          value={averageLoss !== undefined ? averageLoss.toFixed(4) : '—'}
          note="Entropía / MSE según tarea"
          icon={TrendingDown}
          color="blue"
        />
        <Metric
          label="Mejor modelo"
          value={best ? `v${best.id.slice(0, 4)}` : '—'}
          note={best ? projectName(best.project_id) : 'Sin ejecuciones'}
          icon={Gauge}
          color="orange"
        />
      </div>

      {jobs.length === 0 ? (
        <Empty
          icon={BarChart3}
          title="Aún no hay métricas"
          text="Ejecuta un entrenamiento y sus curvas aparecerán aquí, recuperables tras recargar la página."
        />
      ) : (
        <div className="evaluation-layout">
          <section className="panel performance-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SELECTED EXPERIMENT</span>
                <h3>{selected?.project_name || 'Ejecución'}</h3>
                <p>
                  {selected?.architecture_name} · {selected?.dataset_name} ·{' '}
                  {formatDate(selected?.created_at)}
                </p>
              </div>
              {selected && <JobStatus status={selected.status} />}
            </div>
            <div className="evaluation-toolbar">
              <label>
                Ejecución
                <select value={selected?.id || ''} onChange={event => setSelectedId(event.target.value)}>
                  {jobs.map(job => (
                    <option key={job.id} value={job.id}>
                      {job.id.slice(0, 8)} · {projectName(job.project_id)} · {job.status}
                    </option>
                  ))}
                </select>
              </label>
              <span className="engine-tag">{selected?.engine}</span>
            </div>

            {chartData.length > 1 ? (
              <>
                <div className="chart-box large-chart">
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
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="loss"
                        name="Pérdida entrenamiento"
                        stroke="#7657f6"
                        fill="#7657f622"
                        strokeWidth={2.5}
                      />
                      <Area
                        type="monotone"
                        dataKey="val_loss"
                        name="Pérdida validación"
                        stroke="#f59e0b"
                        fill="#f59e0b18"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-box large-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="epoch" />
                      <YAxis domain={[0, 100]} unit="%" />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--panel)',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="accuracy"
                        name="Precisión entrenamiento"
                        stroke="#13b98b"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="val_accuracy"
                        name="Precisión validación"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <Empty
                icon={LineChartIcon}
                title="Sin curvas disponibles"
                text="La ejecución no tiene épocas registradas o todavía está en cola."
              />
            )}

            <div className="detail-grid">
              <div>
                <small>Train loss</small>
                <b>{jobMetric(selected, 'loss')?.toFixed(4) ?? '—'}</b>
              </div>
              <div>
                <small>Val loss</small>
                <b>{jobMetric(selected, 'val_loss')?.toFixed(4) ?? '—'}</b>
              </div>
              <div>
                <small>Accuracy</small>
                <b>{formatPercent(jobMetric(selected, 'accuracy'))}</b>
              </div>
              <div>
                <small>Val accuracy</small>
                <b>{formatPercent(jobMetric(selected, 'val_accuracy'))}</b>
              </div>
              <div>
                <small>Épocas</small>
                <b>
                  {selected?.current_epoch}/{selected?.epochs}
                </b>
              </div>
              <div>
                <small>Duración registrada</small>
                <b>
                  <Clock3 size={13} /> {formatDate(selected?.started_at)} → {formatDate(selected?.ended_at)}
                </b>
              </div>
            </div>
          </section>

          <aside className="panel comparison-panel">
            <div className="panel-heading">
              <div>
                <h3>Comparación</h3>
                <p>Ordenada por fecha de creación.</p>
              </div>
            </div>
            <div className="comparison-list">
              {jobs.slice(0, 12).map(job => (
                <button
                  key={job.id}
                  className={`comparison-row ${job.id === selected?.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedId(job.id)
                    onFocusJob(job)
                  }}
                >
                  <div>
                    <b>{job.id.slice(0, 8)}</b>
                    <small>{projectName(job.project_id)}</small>
                  </div>
                  <div>
                    <span>{formatPercent(jobMetric(job, 'accuracy'))}</span>
                    <small>val loss {jobMetric(job, 'val_loss')?.toFixed(3) ?? '—'}</small>
                  </div>
                  <JobStatus status={job.status} />
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
