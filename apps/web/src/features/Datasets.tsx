import { useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  Database,
  Download,
  FileText,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import type { Dataset, Project } from '../types'
import { api, messageFromDetail } from '../lib/api'
import {
  Empty,
  Modal,
  PageIntro,
  formatBytes,
  formatDate,
} from '../components/ui'

export function Datasets({
  datasets,
  projects,
  onRefresh,
  notify,
}: {
  datasets: Dataset[]
  projects: Project[]
  onRefresh: () => Promise<void>
  notify: (kind: 'success' | 'error' | 'info', message: string) => void
}) {
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('Todos')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [target, setTarget] = useState('')
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<Dataset | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const projectName = (id: string) => projects.find(project => project.id === id)?.name || 'Proyecto'

  const visible = useMemo(
    () =>
      datasets.filter(dataset => {
        const matchesSearch =
          dataset.name.toLowerCase().includes(search.toLowerCase()) ||
          dataset.metadata.column_names.some(column =>
            column.toLowerCase().includes(search.toLowerCase()),
          )
        const matchesProject = projectFilter === 'Todos' || dataset.project_id === projectFilter
        return matchesSearch && matchesProject
      }),
    [datasets, search, projectFilter],
  )

  const openUpload = () => {
    setProjectId(projects[0]?.id || '')
    setTarget('')
    setName('')
    setFile(null)
    setUploadOpen(true)
  }

  const upload = async () => {
    if (!projectId || !file) {
      notify('error', 'Selecciona un proyecto y un archivo CSV.')
      return
    }
    setBusy(true)
    try {
      const dataset = await api.uploadDataset(projectId, file, target.trim(), name.trim() || undefined)
      await onRefresh()
      setUploadOpen(false)
      setDetail(dataset)
      notify(
        'success',
        `Dataset validado: ${dataset.metadata.rows} filas, ${dataset.metadata.columns} columnas.`,
      )
    } catch (error) {
      notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (dataset: Dataset) => {
    if (!window.confirm(`¿Eliminar el dataset ${dataset.name}? Esta acción no se puede deshacer.`)) {
      return
    }
    try {
      await api.deleteDataset(dataset.id)
      await onRefresh()
      notify('success', 'Dataset eliminado del almacenamiento.')
    } catch (error) {
      notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error))
    }
  }

  return (
    <>
      <PageIntro
        eyebrow="DATA MANAGEMENT"
        title="Biblioteca de datasets"
        description="Carga CSV, valida columnas y objetivos en el servidor y vincula los datos a un proyecto."
        action={
          <button className="btn btn-primary" onClick={openUpload}>
            <Upload size={16} /> Cargar CSV
          </button>
        }
      />

      <div className="upload-zone">
        <div className="upload-symbol">
          <Upload size={25} />
        </div>
        <h3>Importa un dataset para comenzar</h3>
        <p>
          Formato CSV · máximo 5 MB y 200.000 filas. La API calcula perfilado, columna
          objetivo y tipo de tarea antes de habilitar el entrenamiento.
        </p>
        <button className="btn btn-secondary" onClick={openUpload}>
          Seleccionar archivo
        </button>
        <span className="upload-hint">
          <ShieldCheck size={14} /> El archivo se guarda en el almacenamiento del servidor;
          nunca se ejecuta código del CSV.
        </span>
      </div>

      <div className="toolbar panel">
        <div className="toolbar-search">
          <Search size={16} />
          <input
            placeholder="Buscar dataset o columna..."
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
        <span className="toolbar-count">{visible.length} archivo(s)</span>
      </div>

      {visible.length === 0 ? (
        <Empty
          icon={Database}
          title="Sin datasets registrados"
          text="Carga un CSV y asígnalo a un proyecto para comenzar."
          action={
            <button className="btn btn-primary btn-small" onClick={openUpload}>
              <Plus size={15} /> Cargar dataset
            </button>
          }
        />
      ) : (
        <div className="dataset-grid">
          {visible.map(dataset => (
            <article className="dataset-card" key={dataset.id}>
              <div className="dataset-card-top">
                <div className="dataset-icon">
                  <FileText size={22} />
                </div>
                <span className="file-extension">.CSV</span>
                <span className="dataset-version">v{dataset.version}</span>
              </div>
              <h3>{dataset.name}</h3>
              <p>
                {projectName(dataset.project_id)} · {formatDate(dataset.created_at)}
              </p>
              <div className="dataset-stats">
                <div>
                  <b>{dataset.metadata.rows.toLocaleString()}</b>
                  <span>Filas</span>
                </div>
                <div>
                  <b>{dataset.metadata.columns}</b>
                  <span>Columnas</span>
                </div>
                <div>
                  <b>{formatBytes(dataset.size_bytes)}</b>
                  <span>Tamaño</span>
                </div>
              </div>
              <div className="dataset-target">
                <span>Objetivo</span>
                <b>{dataset.target_column}</b>
                <em>{dataset.metadata.task}</em>
              </div>
              <div className="field-chips">
                {dataset.metadata.feature_columns.slice(0, 5).map(field => (
                  <span key={field}>{field}</span>
                ))}
                {dataset.metadata.feature_columns.length > 5 && (
                  <span>+{dataset.metadata.feature_columns.length - 5}</span>
                )}
              </div>
              <div className="dataset-card-footer">
                <span>
                  <CheckCircle2 size={14} /> Validado
                </span>
                <div className="card-actions">
                  <button className="inline-action" onClick={() => setDetail(dataset)}>
                    Detalle
                  </button>
                  <button
                    className="icon-btn"
                    title="Descargar dataset"
                    onClick={() =>
                      api
                        .downloadDataset(dataset)
                        .catch(error => notify('error', messageFromDetail(error?.detail ?? error)))
                    }
                  >
                    <Download size={15} />
                  </button>
                  <button className="icon-btn danger-hover" title="Eliminar" onClick={() => remove(dataset)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {uploadOpen && (
        <Modal
          eyebrow="NUEVA CARGA"
          title="Cargar dataset CSV"
          description="La API validará el archivo y detectará el tipo de tarea antes de aceptarlo."
          onClose={() => setUploadOpen(false)}
        >
          <div className="form-grid">
            <label>
              Proyecto destino
              <select value={projectId} onChange={event => setProjectId(event.target.value)}>
                <option value="">Selecciona un proyecto...</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nombre del dataset (opcional)
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Ej. clientes_2026.csv"
              />
            </label>
            <label className="form-span">
              Columna objetivo (opcional)
              <input
                value={target}
                onChange={event => setTarget(event.target.value)}
                placeholder="Ej. segmento · si se omite, se usa la última columna numérica"
              />
            </label>
            <label className="form-span file-drop">
              <Upload size={20} />
              <span>{file ? file.name : 'Selecciona un archivo .csv'}</span>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={event => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setUploadOpen(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={upload} disabled={busy || !file}>
              {busy ? 'Validando...' : 'Subir y validar'}
            </button>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal
          eyebrow="PERFIL DEL DATASET"
          title={detail.name}
          description={`${projectName(detail.project_id)} · versión ${detail.version}`}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="detail-grid">
            <div>
              <small>Filas</small>
              <b>{detail.metadata.rows.toLocaleString()}</b>
            </div>
            <div>
              <small>Columnas</small>
              <b>{detail.metadata.columns}</b>
            </div>
            <div>
              <small>Tarea detectada</small>
              <b>{detail.metadata.task}</b>
            </div>
            <div>
              <small>Clases</small>
              <b>{detail.metadata.classes.length ? detail.metadata.classes.join(', ') : 'Regresión'}</b>
            </div>
          </div>
          <div className="detail-section">
            <h4>Variables de entrada</h4>
            <div className="field-chips">
              {detail.metadata.feature_columns.map(field => (
                <span key={field}>{field}</span>
              ))}
            </div>
          </div>
          <div className="detail-section">
            <h4>Vista previa</h4>
            <div className="table-scroll">
              <table className="data-table compact">
                <thead>
                  <tr>
                    {detail.metadata.column_names.map(column => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.metadata.preview.map((row, index) => (
                    <tr key={index}>
                      {detail.metadata.column_names.map(column => (
                        <td key={column}>{row[column]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="detail-meta">
            <span>
              Checksum SHA-256: <code>{detail.checksum.slice(0, 24)}…</code>
            </span>
            <span>{formatBytes(detail.size_bytes)}</span>
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDetail(null)}>
              Cerrar
            </button>
            <button
              className="btn btn-primary"
              onClick={() => api.downloadDataset(detail).catch(() => notify('error', 'No se pudo descargar.'))}
            >
              <Download size={15} /> Descargar CSV
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
