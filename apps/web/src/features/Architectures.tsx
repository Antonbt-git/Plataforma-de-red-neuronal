import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Layers3,
  Network,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  Zap,
} from 'lucide-react'
import type {
  Activation,
  Architecture,
  ArchitectureConfig,
  Dataset,
  Family,
  LayerSpec,
  LossName,
  Optimizer,
  Project,
} from '../types'
import { api, messageFromDetail } from '../lib/api'
import {
  ErrorBanner,
  PageIntro,
  formatDate,
} from '../components/ui'

const FAMILIES: Family[] = ['Feedforward', 'RNN', 'CNN', 'GAN']
const ACTIVATIONS: Activation[] = ['relu', 'tanh', 'sigmoid', 'linear']
const OUTPUT_ACTIVATIONS: Activation[] = ['sigmoid', 'softmax', 'linear']
const OPTIMIZERS: Optimizer[] = ['Adam', 'SGD', 'RMSprop']
const LOSSES: LossName[] = ['binary_crossentropy', 'categorical_crossentropy', 'mse']

const defaultLayers = (): LayerSpec[] => [
  { units: 16, activation: 'relu', dropout: 0 },
  { units: 8, activation: 'relu', dropout: 0 },
]

function taskDefaults(dataset: Dataset | undefined) {
  if (!dataset) {
    return {
      outputUnits: 1,
      outputActivation: 'sigmoid' as Activation,
      loss: 'binary_crossentropy' as LossName,
      inputUnits: 1,
    }
  }
  const task = dataset.metadata.task
  if (task === 'multiclass') {
    return {
      outputUnits: Math.max(2, dataset.metadata.classes.length),
      outputActivation: 'softmax' as Activation,
      loss: 'categorical_crossentropy' as LossName,
      inputUnits: dataset.metadata.feature_columns.length,
    }
  }
  if (task === 'regression') {
    return {
      outputUnits: 1,
      outputActivation: 'linear' as Activation,
      loss: 'mse' as LossName,
      inputUnits: dataset.metadata.feature_columns.length,
    }
  }
  return {
    outputUnits: 1,
    outputActivation: 'sigmoid' as Activation,
    loss: 'binary_crossentropy' as LossName,
    inputUnits: dataset.metadata.feature_columns.length,
  }
}

function parameterEstimate(input: number, layers: LayerSpec[], output: number): number {
  let previous = input
  let total = 0
  for (const layer of layers) {
    total += previous * layer.units + layer.units
    previous = layer.units
  }
  total += previous * output + output
  return total
}

export function Architectures({
  projects,
  datasets,
  initialProjectId,
  onRefresh,
  notify,
  onGoTraining,
}: {
  projects: Project[]
  datasets: Dataset[]
  initialProjectId: string
  onRefresh: () => Promise<void>
  notify: (kind: 'success' | 'error' | 'info', message: string) => void
  onGoTraining: () => void
}) {
  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '')
  const [saved, setSaved] = useState<Architecture[]>([])
  const [name, setName] = useState('MLP enterprise')
  const [family, setFamily] = useState<Family>('Feedforward')
  const [inputUnits, setInputUnits] = useState(4)
  const [outputUnits, setOutputUnits] = useState(1)
  const [outputActivation, setOutputActivation] = useState<Activation>('sigmoid')
  const [layers, setLayers] = useState<LayerSpec[]>(defaultLayers)
  const [optimizer, setOptimizer] = useState<Optimizer>('Adam')
  const [loss, setLoss] = useState<LossName>('binary_crossentropy')
  const [epochs, setEpochs] = useState(30)
  const [batchSize, setBatchSize] = useState(24)
  const [learningRate, setLearningRate] = useState(0.01)
  const [sequenceLength, setSequenceLength] = useState<number | null>(null)
  const [inputHeight, setInputHeight] = useState<number | null>(null)
  const [inputWidth, setInputWidth] = useState<number | null>(null)
  const [inputChannels, setInputChannels] = useState<number | null>(null)
  const [latentDim, setLatentDim] = useState<number | null>(null)
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[]; parameters: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const projectDatasets = useMemo(
    () => datasets.filter(dataset => dataset.project_id === projectId),
    [datasets, projectId],
  )
  const dataset = projectDatasets[0]
  const project = projects.find(item => item.id === projectId)

  const config: ArchitectureConfig = useMemo(
    () => ({
      name: name.trim() || 'Arquitectura sin nombre',
      family,
      input_units: inputUnits,
      output_units: outputUnits,
      output_activation: outputActivation,
      layers,
      optimizer,
      loss,
      epochs,
      batch_size: batchSize,
      learning_rate: learningRate,
      sequence_length: sequenceLength,
      input_height: inputHeight,
      input_width: inputWidth,
      input_channels: inputChannels,
      latent_dim: latentDim,
    }),
    [
      name,
      family,
      inputUnits,
      outputUnits,
      outputActivation,
      layers,
      optimizer,
      loss,
      epochs,
      batchSize,
      learningRate,
      sequenceLength,
      inputHeight,
      inputWidth,
      inputChannels,
      latentDim,
    ],
  )

  const applyDatasetDefaults = (target?: Dataset) => {
    const defaults = taskDefaults(target)
    setInputUnits(defaults.inputUnits)
    setOutputUnits(defaults.outputUnits)
    setOutputActivation(defaults.outputActivation)
    setLoss(defaults.loss)
    setValidation(null)
  }

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    api
      .projectArchitectures(projectId)
      .then(response => {
        if (cancelled) return
        setSaved(response.items)
        if (response.items.length) {
          loadArchitecture(response.items[0])
        } else {
          setLayers(defaultLayers())
          applyDatasetDefaults(projectDatasets[0])
        }
      })
      .catch(error => {
        if (!cancelled) setError(messageFromDetail((error as { detail?: unknown }).detail ?? error))
      })
    return () => {
      cancelled = true
    }
    // La carga depende del proyecto seleccionado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const loadArchitecture = (architecture: Architecture) => {
    const stored = architecture.config
    setName(stored.name)
    setFamily(stored.family)
    setInputUnits(stored.input_units)
    setOutputUnits(stored.output_units)
    setOutputActivation(stored.output_activation)
    setLayers(stored.layers.map(layer => ({ ...layer })))
    setOptimizer(stored.optimizer)
    setLoss(stored.loss)
    setEpochs(stored.epochs)
    setBatchSize(stored.batch_size)
    setLearningRate(stored.learning_rate)
    setSequenceLength(stored.sequence_length ?? null)
    setInputHeight(stored.input_height ?? null)
    setInputWidth(stored.input_width ?? null)
    setInputChannels(stored.input_channels ?? null)
    setLatentDim(stored.latent_dim ?? null)
    setValidation(null)
    setError('')
  }

  const updateLayer = (index: number, key: keyof LayerSpec, value: number | Activation) => {
    setLayers(old =>
      old.map((layer, position) => (position === index ? { ...layer, [key]: value } : layer)),
    )
    setValidation(null)
  }

  const addLayer = () => {
    setLayers(old => [...old, { units: 8, activation: 'relu', dropout: 0 }])
    setValidation(null)
  }

  const removeLayer = (index: number) => {
    setLayers(old => old.filter((_, position) => position !== index))
    setValidation(null)
  }

  const validate = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await api.validateArchitecture(config)
      setValidation({
        valid: result.valid,
        errors: result.errors,
        parameters: result.parameter_count,
      })
      if (result.valid) notify('success', 'Arquitectura validada por el servidor.')
      else notify('error', 'La configuración contiene errores.')
    } catch (error) {
      const message = messageFromDetail((error as { detail?: unknown }).detail ?? error)
      setError(message)
      notify('error', message)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const architecture = await api.createArchitecture(projectId, config)
      setSaved(old => [architecture, ...old])
      setValidation({ valid: true, errors: [], parameters: architecture.parameter_count })
      await onRefresh()
      notify(
        'success',
        `Arquitectura guardada como versión ${architecture.version} (${architecture.parameter_count.toLocaleString()} parámetros).`,
      )
    } catch (error) {
      const message = messageFromDetail((error as { detail?: unknown }).detail ?? error)
      setError(message)
      notify('error', message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageIntro
        eyebrow="NEURAL ARCHITECTURE BUILDER"
        title="Diseñador de redes"
        description="Define capas, activaciones y parámetros. El servidor valida la topología y versiona cada configuración."
        action={
          <>
            <button className="btn btn-secondary" onClick={validate} disabled={busy}>
              <Check size={16} /> Validar
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !projectId}>
              <Save size={16} /> Guardar versión
            </button>
          </>
        }
      />

      <div className="builder-toolbar panel">
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
          Familia de red
          <select value={family} onChange={event => setFamily(event.target.value as Family)}>
            {FAMILIES.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <div className="dataset-summary">
          <Network size={16} />
          <span>
            <small>Dataset vinculado</small>
            <b>{dataset ? `${dataset.name} · ${dataset.metadata.rows} filas` : 'Sin dataset'}</b>
          </span>
        </div>
        <div className="dataset-summary">
          <SlidersHorizontal size={16} />
          <span>
            <small>Parámetros estimados</small>
            <b>{parameterEstimate(inputUnits, layers, outputUnits).toLocaleString()}</b>
          </span>
        </div>
      </div>

      {family !== 'Feedforward' && (
        <div className="warning-banner">
          <AlertTriangle size={17} />
          <span>
            La familia <b>{family}</b> se valida y registra, pero el worker solo ejecuta
            Feedforward en esta versión. La habilitación de RNN, CNN y GAN es progresiva.
          </span>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      <div className="architecture-layout">
        <section className="panel architecture-canvas">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">VISUAL BUILDER</span>
              <h3>Topología de la red</h3>
              <p>Entrada, capas ocultas y salida de la configuración actual.</p>
            </div>
            <span className="subtle-badge">
              <Layers3 size={14} /> {layers.length} capas ocultas
            </span>
          </div>

          <div className="network-diagram">
            <div className="network-layer input-layer">
              <div className="layer-label">
                <span>Entrada</span>
                <b>{inputUnits}</b>
              </div>
              <div className="node-stack">
                {Array.from({ length: Math.min(6, Math.max(1, inputUnits)) }).map((_, index) => (
                  <i key={index} />
                ))}
              </div>
              {inputUnits > 6 && <small>+{inputUnits - 6}</small>}
            </div>
            {layers.map((layer, index) => (
              <div className="network-connector" key={`connector-${index}`}>
                <span />
              </div>
            ))}
            {layers.map((layer, index) => (
              <div className="network-layer" key={index}>
                <div className="layer-label">
                  <span>Oculta {index + 1}</span>
                  <b>{layer.units}</b>
                </div>
                <div className="node-stack">
                  {Array.from({ length: Math.min(6, layer.units) }).map((_, node) => (
                    <i key={node} />
                  ))}
                </div>
                <small>{layer.activation}</small>
              </div>
            ))}
            <div className="network-connector">
              <span />
            </div>
            <div className="network-layer output-layer">
              <div className="layer-label">
                <span>Salida</span>
                <b>{outputUnits}</b>
              </div>
              <div className="node-stack">
                {Array.from({ length: Math.min(4, outputUnits) }).map((_, index) => (
                  <i key={index} />
                ))}
              </div>
              <small>{outputActivation}</small>
            </div>
          </div>

          <div className="architecture-summary">
            <div>
              <small>Tipo de tarea</small>
              <b>{dataset?.metadata.task ?? 'Sin dataset'}</b>
            </div>
            <div>
              <small>Pérdida</small>
              <b>{loss}</b>
            </div>
            <div>
              <small>Optimizador</small>
              <b>{optimizer}</b>
            </div>
            <div>
              <small>Épocas / batch</small>
              <b>
                {epochs} / {batchSize}
              </b>
            </div>
          </div>

          {validation && (
            <div className={`validation-box ${validation.valid ? 'validation-ok' : 'validation-error'}`}>
              <div>
                {validation.valid ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <b>
                  {validation.valid
                    ? `Configuración válida · ${validation.parameters.toLocaleString()} parámetros`
                    : 'Configuración con errores'}
                </b>
              </div>
              {validation.errors.length > 0 && (
                <ul>
                  {validation.errors.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {validation.valid && (
                <p>
                  La arquitectura puede guardarse y usarse en un entrenamiento Feedforward.
                </p>
              )}
            </div>
          )}
        </section>

        <aside className="panel builder-side">
          <div className="panel-heading">
            <div>
              <h3>Propiedades</h3>
              <p>Parámetros que se validan en el backend.</p>
            </div>
          </div>

          <div className="form-grid">
            <label className="form-span">
              Nombre de la arquitectura
              <input value={name} onChange={event => setName(event.target.value)} />
            </label>
            <label>
              Entrada
              <input
                type="number"
                min={1}
                value={inputUnits}
                onChange={event => setInputUnits(Number(event.target.value))}
              />
            </label>
            <label>
              Salida
              <input
                type="number"
                min={1}
                value={outputUnits}
                onChange={event => setOutputUnits(Number(event.target.value))}
              />
            </label>
            <label>
              Activación salida
              <select
                value={outputActivation}
                onChange={event => setOutputActivation(event.target.value as Activation)}
              >
                {OUTPUT_ACTIVATIONS.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Pérdida
              <select value={loss} onChange={event => setLoss(event.target.value as LossName)}>
                {LOSSES.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Optimizador
              <select
                value={optimizer}
                onChange={event => setOptimizer(event.target.value as Optimizer)}
              >
                {OPTIMIZERS.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Learning rate
              <input
                type="number"
                step="0.001"
                min="0.0001"
                max="1"
                value={learningRate}
                onChange={event => setLearningRate(Number(event.target.value))}
              />
            </label>
            <label>
              Épocas
              <input
                type="number"
                min={1}
                max={500}
                value={epochs}
                onChange={event => setEpochs(Number(event.target.value))}
              />
            </label>
            <label>
              Batch size
              <input
                type="number"
                min={1}
                max={1024}
                value={batchSize}
                onChange={event => setBatchSize(Number(event.target.value))}
              />
            </label>

            {family === 'RNN' && (
              <label className="form-span">
                Longitud de secuencia
                <input
                  type="number"
                  min={2}
                  value={sequenceLength ?? 10}
                  onChange={event => setSequenceLength(Number(event.target.value))}
                />
              </label>
            )}
            {family === 'CNN' && (
              <>
                <label>
                  Alto
                  <input
                    type="number"
                    min={8}
                    value={inputHeight ?? 32}
                    onChange={event => setInputHeight(Number(event.target.value))}
                  />
                </label>
                <label>
                  Ancho
                  <input
                    type="number"
                    min={8}
                    value={inputWidth ?? 32}
                    onChange={event => setInputWidth(Number(event.target.value))}
                  />
                </label>
                <label>
                  Canales
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={inputChannels ?? 3}
                    onChange={event => setInputChannels(Number(event.target.value))}
                  />
                </label>
              </>
            )}
            {family === 'GAN' && (
              <label className="form-span">
                Dimensión latente
                <input
                  type="number"
                  min={2}
                  value={latentDim ?? 64}
                  onChange={event => setLatentDim(Number(event.target.value))}
                />
              </label>
            )}
          </div>

          <div className="layer-editor">
            <div className="layer-editor-head">
              <h4>Capas ocultas</h4>
              <button className="btn btn-secondary btn-small" onClick={addLayer}>
                <Plus size={14} /> Añadir
              </button>
            </div>
            {layers.map((layer, index) => (
              <div className="layer-row" key={index}>
                <span className="layer-index">{index + 1}</span>
                <div className="layer-fields">
                  <input
                    type="number"
                    min={1}
                    max={4096}
                    value={layer.units}
                    onChange={event => updateLayer(index, 'units', Number(event.target.value))}
                  />
                  <select
                    value={layer.activation}
                    onChange={event =>
                      updateLayer(index, 'activation', event.target.value as Activation)
                    }
                  >
                    {ACTIVATIONS.map(item => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={0.9}
                    step="0.05"
                    value={layer.dropout}
                    title="Dropout"
                    onChange={event => updateLayer(index, 'dropout', Number(event.target.value))}
                  />
                </div>
                <button
                  className="icon-btn danger-hover"
                  onClick={() => removeLayer(index)}
                  title="Eliminar capa"
                  disabled={layers.length === 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <small className="muted-text">Orden: neuronas · activación · dropout</small>
          </div>

          <button className="btn btn-secondary full-width" onClick={onGoTraining}>
            <Zap size={16} /> Ir a entrenamiento
          </button>
        </aside>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h3>Versiones guardadas</h3>
            <p>{project ? `Proyecto ${project.name}` : 'Selecciona un proyecto'} · las versiones son inmutables.</p>
          </div>
          <span className="subtle-badge">{saved.length} versión(es)</span>
        </div>
        {saved.length === 0 ? (
          <div className="empty-state compact">
            <div>
              <Activity size={22} />
            </div>
            <h3>Aún no hay arquitecturas</h3>
            <p>Valida y guarda la configuración actual para habilitar el entrenamiento.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Versión</th>
                  <th>Familia</th>
                  <th>Capas</th>
                  <th>Parámetros</th>
                  <th>Creada</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {saved.map(architecture => (
                  <tr key={architecture.id}>
                    <td>{architecture.name}</td>
                    <td>v{architecture.version}</td>
                    <td>{architecture.family}</td>
                    <td>{architecture.config.layers.length}</td>
                    <td>{architecture.parameter_count.toLocaleString()}</td>
                    <td>{formatDate(architecture.created_at)}</td>
                    <td>
                      <button className="inline-action" onClick={() => loadArchitecture(architecture)}>
                        Cargar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
