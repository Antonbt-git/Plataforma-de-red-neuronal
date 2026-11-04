import { useMemo, useState } from 'react'
import {
  Archive,
  BrainCircuit,
  Check,
  Download,
  FolderKanban,
  Search,
  ShieldCheck,
  Stamp,
} from 'lucide-react'
import type { ModelStatus, ModelVersion, Project, User } from '../types'
import { api, messageFromDetail } from '../lib/api'
import {
  Empty,
  MODEL_STATUS_LABEL,
  Metric,
  ModelStatusPill,
  PageIntro,
  formatDate,
} from '../components/ui'

const NEXT_STATUS: Partial<Record<ModelStatus, ModelStatus>> = {
  draft: 'reviewed',
  reviewed: 'approved',
  approved: 'retired',
}

const NEXT_LABEL: Partial<Record<ModelStatus, string>> = {
  draft: 'Marcar revisado',
  reviewed: 'Aprobar',
  approved: 'Retirar',
}

function metricNumber(model: ModelVersion, key: string): number | undefined {
  const value = model.metrics[key]
  return typeof value === 'number' ? value : undefined
}

export function Models({
  models,
  projects,
  currentUser,
  onRefresh,
  notify,
  onGoTraining,
}: {
  models: ModelVersion[]
  projects: Project[]
  currentUser: User
  onRefresh: () => Promise<void>
  notify: (kind: 'success' | 'error' | 'info', message: string) => void
  onGoTraining: () => void
}) {
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('Todos')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [busyId, setBusyId] = useState('')

  const visible = useMemo(
    () =>
      models.filter(model => {
        const project = projects.find(item => item.id === model.project_id)
        const matchesSearch =
          (model.project_name || project?.name || '').toLowerCase().includes(search.toLowerCase()) ||
          model.id.toLowerCase().includes(search.toLowerCase())
        const matchesProject = projectFilter === 'Todos' || model.project_id === projectFilter
        const matchesStatus = statusFilter === 'Todos' || model.status === statusFilter
        return matchesSearch && matchesProject && matchesStatus
      }),
    [models, projects, search, projectFilter, statusFilter],
  )

  const canReview = (model: ModelVersion) => {
    if (currentUser.role === 'Administrador' || currentUser.role === 'Revisor') return true
    if (currentUser.role === 'Responsable') return true
    const project = projects.find(item => item.id === model.project_id)
    return project?.owner_id === currentUser.id
  }

  const changeStatus = async (model: ModelVersion) => {
    const next = NEXT_STATUS[model.status]
    if (!next) return
    setBusyId(model.id)
    try {
      await api.updateModelStatus(model.id, next)
      await onRefresh()
      notify('success', `Modelo v${model.version}: ${MODEL_STATUS_LABEL[next]}.`)
    } catch (error) {
      notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error))
    } finally {
      setBusyId('')
    }
  }

  const downloadModel = async (model: ModelVersion) => {
    try {
      await api.downloadModel(model)
      notify('success', 'Artefacto del modelo descargado con verificación de checksum.')
    } catch (error) {
      notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error))
    }
  }

  const approved = models.filter(model => model.status === 'approved').length
  const reviewed = models.filter(model => model.status === 'reviewed').length
  const families = new Set(models.map(model => String(model.metrics.task || 'modelo'))).size

  return (
    <>
      <PageIntro
        eyebrow="MODEL REGISTRY"
        title="Registro de modelos"
        description="Cada entrenamiento completado genera una versión inmutable con checksum, métricas y flujo de revisión."
        action={
          <button className="btn btn-secondary" onClick={onGoTraining}>
            <BrainCircuit size={16} /> Ver entrenamientos
          </button>
        }
      />

      <div className="metric-grid">
        <Metric label="Versiones registradas" value={models.length} note="Artefactos inmutables" icon={Archive} color="purple" />
        <Metric label="Aprobadas" value={approved} note="Listas para uso" icon={ShieldCheck} color="green" />
        <Metric label="En revisión" value={reviewed} note="Pendientes de aprobación" icon={Stamp} color="blue" />
        <Metric label="Proyectos con modelo" value={new Set(models.map(model => model.project_id)).size} note={`${families} tipos de tarea`} icon={FolderKanban} color="orange" />
      </div>

      <div className="toolbar panel">
        <div className="toolbar-search">
          <Search size={16} />
          <input
            placeholder="Buscar por proyecto o identificador..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <label>
          Proyecto
          <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
            <option>Todos</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option>Todos</option>
            <option value="draft">Borrador</option>
            <option value="reviewed">Revisado</option>
            <option value="approved">Aprobado</option>
            <option value="retired">Retirado</option>
          </select>
        </label>
        <span className="toolbar-count">{visible.length} versión(es)</span>
      </div>

      {visible.length === 0 ? (
        <Empty
          icon={BrainCircuit}
          title="Sin modelos registrados"
          text="Completa un entrenamiento para generar la primera versión inmutable."
          action={
            <button className="btn btn-primary btn-small" onClick={onGoTraining}>
              Ir a entrenamientos
            </button>
          }
        />
      ) : (
        <div className="model-card-grid">
          {visible.map(model => (
            <article className="model-card" key={model.id}>
              <div className="model-card-top">
                <div className="model-symbol">
                  <BrainCircuit size={22} />
                </div>
                <span className="model-version">v{model.version}</span>
                <ModelStatusPill status={model.status} />
              </div>
              <h3>{model.project_name || projects.find(project => project.id === model.project_id)?.name}</h3>
              <p>
                Job {model.job_id?.slice(0, 8)} · {formatDate(model.created_at)}
              </p>
              <div className="model-metrics">
                <div>
                  <small>Accuracy</small>
                  <b>
                    {metricNumber(model, 'accuracy') !== undefined
                      ? `${((metricNumber(model, 'accuracy') || 0) * 100).toFixed(2)}%`
                      : '—'}
                  </b>
                </div>
                <div>
                  <small>Val loss</small>
                  <b>{metricNumber(model, 'val_loss')?.toFixed(4) ?? '—'}</b>
                </div>
                <div>
                  <small>Épocas</small>
                  <b>{String(model.metrics.epochs ?? '—')}</b>
                </div>
              </div>
              <div className="model-meta">
                <span>
                  Tarea <b>{String(model.metrics.task ?? '—')}</b>
                </span>
                <span>
                  Clases <b>{Array.isArray(model.metrics.classes) ? (model.metrics.classes as string[]).join(', ') : '—'}</b>
                </span>
              </div>
              <div className="checksum-row">
                <span>SHA-256</span>
                <code>{model.checksum.slice(0, 18)}…</code>
              </div>
              <div className="model-card-footer">
                <button className="btn btn-secondary btn-small" onClick={() => downloadModel(model)}>
                  <Download size={15} /> Descargar .npz
                </button>
                {NEXT_STATUS[model.status] && canReview(model) && (
                  <button
                    className="btn btn-primary btn-small"
                    onClick={() => changeStatus(model)}
                    disabled={busyId === model.id}
                  >
                    <Check size={15} /> {NEXT_LABEL[model.status]}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
