import {
  Activity,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Database,
  Gauge,
  GitBranch,
  Layers3,
  Network,
  Sparkles,
  Zap,
} from 'lucide-react'
import { PageIntro } from '../components/ui'

const CONCEPTS = [
  {
    n: '01',
    title: 'Neurona artificial',
    desc: 'Unidad que combina entradas ponderadas, un sesgo y una función de activación. El entrenamiento ajusta esos pesos con backpropagation.',
    icon: Zap,
    color: 'violet',
  },
  {
    n: '02',
    title: 'Capa de entrada',
    desc: 'Recibe las variables del dataset. En este MVP corresponde exactamente a las columnas numéricas de entrada validadas por la API.',
    icon: Database,
    color: 'blue',
  },
  {
    n: '03',
    title: 'Capas ocultas',
    desc: 'Transforman la representación mediante pesos, sesgos, activaciones y dropout. El diseñador valida cantidad y tamaño antes de guardar.',
    icon: Layers3,
    color: 'green',
  },
  {
    n: '04',
    title: 'Capa de salida',
    desc: 'Produce la predicción. Sigmoid para binaria, Softmax para multiclase y Linear para regresión; la pérdida debe ser coherente.',
    icon: GitBranch,
    color: 'orange',
  },
  {
    n: '05',
    title: 'Función de activación',
    desc: 'Introduce no linealidad. ReLU, Tanh, Sigmoid y Linear se usan en capas ocultas; Softmax se reserva para la salida multiclase.',
    icon: Activity,
    color: 'pink',
  },
  {
    n: '06',
    title: 'Optimizador y pérdida',
    desc: 'Adam, SGD y RMSprop ajustan los parámetros. La pérdida mide el error: binary_crossentropy, categorical_crossentropy o mse.',
    icon: Gauge,
    color: 'cyan',
  },
]

const FAMILIES = [
  {
    name: 'Feedforward',
    tag: 'Datos tabulares · habilitada',
    text: 'La información fluye de entrada a salida. Es la familia que el worker ejecuta de extremo a extremo en este MVP.',
  },
  {
    name: 'RNN',
    tag: 'Secuencias · validada',
    text: 'Mantiene estado entre pasos para series temporales y texto. Requiere sequence_length y se habilitará de forma progresiva.',
  },
  {
    name: 'CNN',
    tag: 'Imágenes · validada',
    text: 'Aprende patrones locales con convoluciones. Exige alto, ancho y canales de entrada; su entrenamiento se incorporará después del MVP.',
  },
  {
    name: 'GAN',
    tag: 'Generativa · validada',
    text: 'Enfrenta generador y discriminador. Se registra con dimensión latente y validaciones específicas; no se entrena en esta versión.',
  },
]

const PIPELINE = [
  'Autenticación y rol',
  'Proyecto',
  'Dataset CSV validado',
  'Arquitectura versionada',
  'Cola del worker',
  'Entrenamiento real',
  'SSE + métricas',
  'Modelo inmutable',
]

export function Fundamentals() {
  return (
    <>
      <PageIntro
        eyebrow="LEARNING CENTER"
        title="Fundamentos neuronales"
        description="Referencia de los elementos que configuras en el diseñador y que el backend valida antes de entrenar."
        action={
          <span className="subtle-badge">
            <BookOpen size={14} /> Semana 11 · Redes neuronales
          </span>
        }
      />

      <div className="fundamental-grid">
        {CONCEPTS.map(item => (
          <article className="fundamental-card panel" key={item.n}>
            <div className={`fundamental-icon ${item.color}`}>
              <item.icon size={22} />
            </div>
            <span className="fundamental-number">{item.n}</span>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
          </article>
        ))}
      </div>

      <section className="panel family-reference">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">NETWORK FAMILIES</span>
            <h3>Familias de redes</h3>
            <p>El diseñador valida reglas específicas por familia; el motor ejecuta Feedforward.</p>
          </div>
          <span className="subtle-badge">
            <Network size={14} /> 4 familias
          </span>
        </div>
        <div className="family-grid">
          {FAMILIES.map(item => (
            <article key={item.name}>
              <div className="family-head">
                <h4>{item.name}</h4>
                <span>{item.tag}</span>
              </div>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel pipeline-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">END-TO-END FLOW</span>
            <h3>Del dato al modelo trazable</h3>
            <p>El navegador administra la experiencia; el worker ejecuta el aprendizaje fuera de la petición HTTP.</p>
          </div>
          <BrainCircuit size={22} />
        </div>
        <div className="pipeline">
          {PIPELINE.map((step, index) => (
            <div className="pipeline-step" key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <b>{step}</b>
              {index < PIPELINE.length - 1 && <ArrowRight size={15} />}
            </div>
          ))}
        </div>
      </section>

      <section className="panel glossary-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">QUICK REFERENCE</span>
            <h3>Buenas prácticas aplicadas</h3>
          </div>
          <Sparkles size={20} />
        </div>
        <div className="glossary-grid">
          <div>
            <b>Validación en servidor</b>
            <p>El frontend no es una frontera de seguridad: la API revisa rangos, familias, pérdida y dimensiones.</p>
          </div>
          <div>
            <b>Estado persistido</b>
            <p>Cada época se guarda en base de datos; reconectar recarga el historial aunque el socket se pierda.</p>
          </div>
          <div>
            <b>Artefactos inmutables</b>
            <p>Cada modelo se guarda con checksum y versión. No se sobrescribe: se crea una nueva versión.</p>
          </div>
          <div>
            <b>Auditoría</b>
            <p>Las acciones relevantes quedan registradas con actor, proyecto, fecha y metadatos acotados.</p>
          </div>
          <div>
            <b>Cancelación cooperativa</b>
            <p>La solicitud se registra y el worker confirma el estado final, sin matar procesos de forma insegura.</p>
          </div>
          <div>
            <b>Aislamiento</b>
            <p>Los entrenamientos corren en workers con sesión propia; no dentro de la petición HTTP del usuario.</p>
          </div>
        </div>
      </section>
    </>
  )
}
