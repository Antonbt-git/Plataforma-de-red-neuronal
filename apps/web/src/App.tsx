import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity,
  BarChart3,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Database,
  FileBarChart2,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Network,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  X,
  Zap,
} from 'lucide-react'
import type {
  DashboardData,
  Dataset,
  Family,
  JobStatus,
  ModelVersion,
  ModuleKey,
  Project,
  TrainingJob,
  User,
} from './types'
import { api, ApiError, clearToken, getToken, messageFromDetail } from './lib/api'
import { Login } from './features/Login'
import { Dashboard } from './features/Dashboard'
import { Projects } from './features/Projects'
import { Datasets } from './features/Datasets'
import { Architectures } from './features/Architectures'
import { Training } from './features/Training'
import { Evaluation } from './features/Evaluation'
import { Models } from './features/Models'
import { Reports } from './features/Reports'
import { Fundamentals } from './features/Fundamentals'
import { Admin } from './features/Admin'
import { Modal, Toast, initials } from './components/ui'
import type { ToastKind } from './components/ui'

const NAV: { key: ModuleKey; label: string; group: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'ESPACIO DE TRABAJO', icon: LayoutDashboard },
  { key: 'projects', label: 'Proyectos de IA', group: 'ESPACIO DE TRABAJO', icon: FolderKanban },
  { key: 'datasets', label: 'Datasets', group: 'PREPARACIÓN DE DATOS', icon: Database },
  { key: 'architectures', label: 'Diseñador de redes', group: 'DISEÑO DEL MODELO', icon: Network },
  { key: 'training', label: 'Entrenamientos', group: 'EXPERIMENTACIÓN', icon: Zap },
  { key: 'evaluation', label: 'Evaluación y métricas', group: 'EXPERIMENTACIÓN', icon: BarChart3 },
  { key: 'models', label: 'Registro de modelos', group: 'GESTIÓN DE MODELOS', icon: GitBranch },
  { key: 'reports', label: 'Reportes', group: 'GESTIÓN DE MODELOS', icon: FileBarChart2 },
  { key: 'fundamentals', label: 'Fundamentos neuronales', group: 'RECURSOS', icon: BookOpen },
  { key: 'admin', label: 'Administración', group: 'SISTEMA', icon: ShieldCheck },
]

const FAMILIES: Family[] = ['Feedforward', 'RNN', 'CNN', 'GAN']

export default function App() {
  const [booting, setBooting] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [projects, setProjects] = useState<Project[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [jobs, setJobs] = useState<TrainingJob[]>([])
  const [models, setModels] = useState<ModelVersion[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)

  const [active, setActive] = useState<ModuleKey>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('neurolab_theme')
    return saved === 'dark' ? 'dark' : 'light'
  })
  const [toast, setToast] = useState<{ kind: ToastKind; message: string; nonce: number } | null>(null)

  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [focusJobId, setFocusJobId] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectFamily, setProjectFamily] = useState<Family>('Feedforward')
  const [creating, setCreating] = useState(false)

  const notify = useCallback((kind: ToastKind, message: string) => {
    setToast({ kind, message, nonce: Date.now() })
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [projectResponse, datasetResponse, jobResponse, modelResponse, dashboardResponse] =
        await Promise.all([
          api.projects(),
          api.datasets(),
          api.jobs(),
          api.models(),
          api.dashboard(),
        ])
      setProjects(projectResponse.items)
      setDatasets(datasetResponse.items)
      setJobs(jobResponse.items)
      setModels(modelResponse.items)
      setDashboard(dashboardResponse)
      setSelectedProjectId(old => old || projectResponse.items[0]?.id || '')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearToken()
        setUser(null)
        return
      }
      notify(
        'error',
        error instanceof ApiError
          ? messageFromDetail(error.detail)
          : 'No se pudo conectar con la API. Verifica que el backend esté en ejecución.',
      )
    }
  }, [notify])

  useEffect(() => {
    if (!getToken()) {
      setBooting(false)
      return
    }
    api
      .me()
      .then(response => setUser(response))
      .catch(() => clearToken())
      .finally(() => setBooting(false))
  }, [])

  useEffect(() => {
    if (user) void refresh()
  }, [user, refresh])

  useEffect(() => {
    localStorage.setItem('neurolab_theme', theme)
  }, [theme])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const activeJobKey = useMemo(
    () =>
      jobs
        .filter(job => !job.terminal)
        .map(job => job.id)
        .sort()
        .join(','),
    [jobs],
  )

  useEffect(() => {
    if (!user || !activeJobKey) return
    const sources = activeJobKey.split(',').map(jobId => {
      const source = new EventSource(api.jobEventsUrl(jobId))
      source.addEventListener('state', event => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as TrainingJob
          setJobs(old => {
            const exists = old.some(job => job.id === payload.id)
            return exists
              ? old.map(job => (job.id === payload.id ? payload : job))
              : [payload, ...old]
          })
          if (payload.terminal) {
            source.close()
            void refresh()
          }
        } catch {
          source.close()
        }
      })
      source.addEventListener('done', () => source.close())
      source.onerror = () => source.close()
      return source
    })
    return () => sources.forEach(source => source.close())
  }, [activeJobKey, user, refresh])

  useEffect(() => {
    if (!user || !activeJobKey) return
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [user, activeJobKey, refresh])

  const handleLogin = async (email: string, password: string) => {
    setLoginLoading(true)
    setLoginError('')
    try {
      const response = await api.login(email, password)
      setUser(response.user)
      setActive('dashboard')
    } catch (error) {
      setLoginError(
        error instanceof ApiError
          ? messageFromDetail(error.detail)
          : 'No se pudo conectar con la API. Inicia el backend y vuelve a intentarlo.',
      )
    } finally {
      setLoginLoading(false)
    }
  }

  const logout = () => {
    clearToken()
    setUser(null)
    setProjects([])
    setDatasets([])
    setJobs([])
    setModels([])
    setDashboard(null)
    setSelectedProjectId('')
    setFocusJobId(null)
    setActive('dashboard')
  }

  const openCreate = () => {
    setProjectName('')
    setProjectDescription('')
    setProjectFamily('Feedforward')
    setCreateOpen(true)
  }

  const createProject = async (event: FormEvent) => {
    event.preventDefault()
    setCreating(true)
    try {
      const project = await api.createProject({
        name: projectName.trim(),
        description: projectDescription.trim(),
        family: projectFamily,
      })
      setSelectedProjectId(project.id)
      await refresh()
      setCreateOpen(false)
      notify('success', 'Proyecto creado. Carga un dataset y configura su arquitectura.')
    } catch (error) {
      notify(
        'error',
        error instanceof ApiError
          ? messageFromDetail(error.detail)
          : 'No se pudo crear el proyecto.',
      )
    } finally {
      setCreating(false)
    }
  }

  const go = (key: ModuleKey) => {
    setActive(key)
    setSidebarOpen(false)
  }

  const openArchitecture = (project: Project) => {
    setSelectedProjectId(project.id)
    go('architectures')
  }

  const openJob = (job: TrainingJob) => {
    setFocusJobId(job.id)
    setSelectedProjectId(job.project_id)
    go('evaluation')
  }

  const visibleNav = useMemo(
    () =>
      NAV.filter(item =>
        `${item.label} ${item.group}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [search],
  )

  if (booting) {
    return (
      <div className="boot-screen">
        <div className="brand-mark">
          <BrainCircuit size={28} />
        </div>
        <Loader2 size={22} className="spin" />
        <p>Iniciando NeuroLab Enterprise...</p>
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={handleLogin} error={loginError} loading={loginLoading} />
  }

  const title = NAV.find(item => item.key === active)?.label || 'Dashboard'
  const activeJobs = jobs.filter(job => !job.terminal).length
  const selectedProject = projects.find(project => project.id === selectedProjectId)

  return (
    <div className={`app-shell theme-${theme} ${active === 'training' ? 'training-mode' : ''}`}>
      {sidebarOpen && (
        <button
          aria-label="Cerrar menú"
          className="mobile-scrim"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <BrainCircuit size={25} />
          </div>
          <div className="brand-copy">
            <strong>
              NeuroLab <span>Enterprise</span>
            </strong>
            <small>NEURAL NETWORK STUDIO</small>
          </div>
          <button
            className="icon-btn mobile-only"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-card">
          <div className="workspace-avatar">NL</div>
          <div>
            <b>Laboratorio IA</b>
            <small>Workspace principal</small>
          </div>
          <ChevronDown size={15} />
        </div>

        <div className="nav-search">
          <Search size={15} />
          <input
            placeholder="Buscar módulo..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          <kbd>⌘ K</kbd>
        </div>

        <nav className="side-nav">
          {visibleNav.map((item, index) => (
            <div key={item.key}>
              {(index === 0 || item.group !== visibleNav[index - 1]?.group) && (
                <div className="nav-group-label">{item.group}</div>
              )}
              <button
                className={`nav-item ${active === item.key ? 'active' : ''}`}
                onClick={() => go(item.key)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.key === 'training' && activeJobs > 0 && <em>{activeJobs}</em>}
              </button>
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="usage-card">
            <div className="usage-top">
              <span>Estado del laboratorio</span>
              <b>{models.length} modelos</b>
            </div>
            <div className="usage-track">
              <span style={{ width: `${Math.min(100, 18 + models.length * 9)}%` }} />
            </div>
            <small>API real · workers NumPy</small>
          </div>
          <button className="nav-item" onClick={() => go('admin')}>
            <Settings size={18} />
            <span>Configuración</span>
          </button>
          <div className="user-mini">
            <div className="user-avatar">{initials(user.display_name)}</div>
            <div className="user-copy">
              <b>{user.display_name}</b>
              <small>{user.role}</small>
            </div>
            <button className="icon-btn" title="Cerrar sesión" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-only"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumbs">
              <span>NeuroLab</span>
              <span>/</span>
              <b>{title}</b>
            </div>
            {selectedProject && active !== 'dashboard' && (
              <span className="topbar-context">{selectedProject.name}</span>
            )}
          </div>
          <div className="topbar-actions">
            <span className="api-indicator">
              <i /> API conectada
            </span>
            {activeJobs > 0 && (
              <span className="subtle-badge">
                <Activity size={13} /> {activeJobs} en ejecución
              </span>
            )}
            <button
              className="icon-btn theme-toggle"
              title="Cambiar tema"
              onClick={() => setTheme(old => (old === 'light' ? 'dark' : 'light'))}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button className="top-avatar" title={user.email}>
              {initials(user.display_name)}
            </button>
          </div>
        </header>

        <div className="page-content">
          {active === 'dashboard' && (
            <Dashboard
              data={dashboard}
              projects={projects}
              jobs={jobs}
              onGo={go}
              onCreate={openCreate}
              onOpenJob={openJob}
            />
          )}
          {active === 'projects' && (
            <Projects
              projects={projects}
              onOpenArchitecture={openArchitecture}
              onCreate={openCreate}
              onRefresh={refresh}
              notify={notify}
              currentUser={user}
            />
          )}
          {active === 'datasets' && (
            <Datasets
              datasets={datasets}
              projects={projects}
              onRefresh={refresh}
              notify={notify}
            />
          )}
          {active === 'architectures' && (
            <Architectures
              projects={projects}
              datasets={datasets}
              initialProjectId={selectedProjectId}
              onRefresh={refresh}
              notify={notify}
              onGoTraining={() => go('training')}
            />
          )}
          {active === 'training' && (
            <Training
              projects={projects}
              datasets={datasets}
              jobs={jobs}
              initialProjectId={selectedProjectId}
              focusJobId={focusJobId}
              onFocusJob={job => setFocusJobId(job?.id ?? null)}
              onRefresh={refresh}
              notify={notify}
              onGoArchitectures={() => go('architectures')}
            />
          )}
          {active === 'evaluation' && (
            <Evaluation
              jobs={jobs}
              projects={projects}
              focusJobId={focusJobId}
              onFocusJob={job => setFocusJobId(job.id)}
            />
          )}
          {active === 'models' && (
            <Models
              models={models}
              projects={projects}
              currentUser={user}
              onRefresh={refresh}
              notify={notify}
              onGoTraining={() => go('training')}
            />
          )}
          {active === 'reports' && <Reports projects={projects} notify={notify} />}
          {active === 'fundamentals' && <Fundamentals />}
          {active === 'admin' && <Admin currentUser={user} notify={notify} />}
        </div>

        <footer className="app-footer">
          <span>© 2026 NeuroLab Enterprise</span>
          <span>
            <i /> Entrenamientos reales · métricas persistidas · SSE
          </span>
          <span>v2.0.0 · React + FastAPI</span>
        </footer>
      </main>

      {createOpen && (
        <Modal
          eyebrow="NUEVO EXPERIMENTO"
          title="Crear proyecto de IA"
          description="El proyecto agrupa datasets, arquitecturas, ejecuciones y modelos auditables."
          onClose={() => setCreateOpen(false)}
        >
          <form onSubmit={createProject}>
            <div className="form-grid">
              <label className="form-span">
                Nombre del proyecto
                <input
                  autoFocus
                  required
                  minLength={2}
                  maxLength={120}
                  value={projectName}
                  onChange={event => setProjectName(event.target.value)}
                  placeholder="Ej. Predicción de abandono de clientes"
                />
              </label>
              <label className="form-span">
                Descripción
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={projectDescription}
                  onChange={event => setProjectDescription(event.target.value)}
                  placeholder="Describe el problema y el objetivo del modelo..."
                />
              </label>
              <label>
                Familia de red
                <select
                  value={projectFamily}
                  onChange={event => setProjectFamily(event.target.value as Family)}
                >
                  {FAMILIES.map(item => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCreateOpen(false)}
              >
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit" disabled={creating}>
                <Plus size={16} /> {creating ? 'Creando...' : 'Crear proyecto'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {toast && (
        <Toast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
