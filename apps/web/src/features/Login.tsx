import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  BrainCircuit,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  Sparkles,
} from 'lucide-react'

export function Login({
  onLogin,
  error,
  loading,
}: {
  onLogin: (email: string, password: string) => Promise<void>
  error: string
  loading: boolean
}) {
  const [email, setEmail] = useState('admin@neurolab.local')
  const [password, setPassword] = useState('NeuroLab2026!')
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await onLogin(email.trim(), password)
  }

  return (
    <div className="login-page">
      <div className="login-art">
        <div className="login-art-glow glow-one" />
        <div className="login-art-glow glow-two" />
        <div className="login-brand">
          <div className="brand-mark">
            <BrainCircuit size={27} />
          </div>
          <div>
            <strong>
              NeuroLab <span>Enterprise</span>
            </strong>
            <small>NEURAL NETWORK STUDIO</small>
          </div>
        </div>
        <div className="login-hero">
          <span className="hero-chip">
            <Sparkles size={14} /> PLATAFORMA DE IA · v2.0
          </span>
          <h1>
            Diseña. Entrena.
            <br />
            <em>Descubre.</em>
          </h1>
          <p>
            Diseña arquitecturas neuronales, ejecuta entrenamientos reales con
            backpropagation, observa métricas en tiempo real y conserva versiones
            trazables de cada modelo.
          </p>
          <div className="network-art">
            <div className="network-lines" />
            <div className="network-col">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="network-col middle">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="network-col">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="login-stat-row">
            <div>
              <b>04</b>
              <span>Familias validadas</span>
            </div>
            <div>
              <b>10</b>
              <span>Módulos integrados</span>
            </div>
            <div>
              <b>SSE</b>
              <span>Progreso en vivo</span>
            </div>
          </div>
        </div>
        <div className="login-art-footer">
          <span>© 2026 NeuroLab Enterprise</span>
          <span>API real · PostgreSQL / SQLite</span>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-panel-inner">
          <div className="login-mobile-brand">
            <div className="brand-mark">
              <BrainCircuit size={24} />
            </div>
            <b>NeuroLab Enterprise</b>
          </div>
          <span className="eyebrow">BIENVENIDO DE NUEVO</span>
          <h2>Accede a tu laboratorio</h2>
          <p className="login-subtitle">
            Autenticación contra la API. Tu rol determina qué proyectos y acciones
            puedes utilizar.
          </p>
          <form className="login-form" onSubmit={submit}>
            <label>
              Correo electrónico
              <div className="input-with-icon">
                <Mail size={17} />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="nombre@empresa.com"
                />
              </div>
            </label>
            <label>
              Contraseña
              <div className="input-with-icon">
                <LockKeyhole size={17} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(value => !value)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            {error && <div className="login-error">{error}</div>}
            <button className="btn btn-primary login-submit" type="submit" disabled={loading}>
              {loading ? <Loader2 size={17} className="spin" /> : <LockKeyhole size={17} />}
              {loading ? 'Verificando...' : 'Iniciar sesión'}
            </button>
          </form>
          <div className="login-demo-box">
            <b>Credenciales de demostración</b>
            <span>
              <code>admin@neurolab.local</code> · <code>NeuroLab2026!</code>
            </span>
            <small>
              También: analista@neurolab.local / Analista2026! · revisor@neurolab.local /
              Revisor2026!
            </small>
          </div>
        </div>
      </div>
    </div>
  )
}
