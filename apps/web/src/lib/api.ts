import type {
  Architecture,
  ArchitectureConfig,
  AuditEvent,
  DashboardData,
  Dataset,
  ModelStatus,
  ModelVersion,
  Project,
  ProjectReport,
  SystemHealth,
  TrainingJob,
  User,
  ValidationResult,
} from '../types'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')
const TOKEN_KEY = 'neurolab_token'

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(messageFromDetail(detail))
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export function messageFromDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(item => messageFromDetail(item)).join(' ')
  if (detail && typeof detail === 'object') {
    const record = detail as Record<string, unknown>
    if (Array.isArray(record.errors)) return record.errors.map(String).join(' ')
    if (record.detail) return messageFromDetail(record.detail)
    if (record.msg) return String(record.msg)
  }
  return 'Ocurrió un error inesperado. Inténtalo nuevamente.'
}

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (response.status === 401 && !path.includes('/auth/login')) {
    clearToken()
  }
  if (!response.ok) {
    let detail: unknown = response.statusText
    try {
      const body = await response.json()
      detail = body.detail ?? body
    } catch {
      try {
        detail = await response.text()
      } catch {
        detail = response.statusText
      }
    }
    throw new ApiError(response.status, detail)
  }
  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return (await response.text()) as T
  return (await response.json()) as T
}

async function download(path: string, filename: string): Promise<void> {
  const token = getToken()
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    let detail: unknown = response.statusText
    try {
      detail = (await response.json()).detail
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(response.status, detail)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export const api = {
  baseUrl: API_URL,

  async login(email: string, password: string) {
    const data = await request<{ access_token: string; user: User }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setToken(data.access_token)
    return data
  },

  me: () => request<User>('/api/v1/auth/me'),

  dashboard: () => request<DashboardData>('/api/v1/dashboard'),

  projects: () => request<{ items: Project[]; total: number }>('/api/v1/projects'),
  project: (id: string) => request<Project>(`/api/v1/projects/${id}`),
  createProject: (payload: { name: string; description: string; family: string }) =>
    request<Project>('/api/v1/projects', { method: 'POST', body: JSON.stringify(payload) }),
  updateProject: (id: string, payload: Partial<Pick<Project, 'name' | 'description' | 'family' | 'status'>>) =>
    request<Project>(`/api/v1/projects/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  members: (id: string) => request<{ items: User[] }>(`/api/v1/projects/${id}/members`),
  addMember: (id: string, email: string, role: string) =>
    request<User>(`/api/v1/projects/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),

  datasets: () => request<{ items: Dataset[]; total: number }>('/api/v1/datasets'),
  projectDatasets: (projectId: string) =>
    request<{ items: Dataset[]; total: number }>(`/api/v1/projects/${projectId}/datasets`),
  uploadDataset: (
    projectId: string,
    file: File,
    targetColumn: string,
    name?: string,
  ) => {
    const form = new FormData()
    form.append('file', file)
    if (targetColumn) form.append('target_column', targetColumn)
    if (name) form.append('name', name)
    return request<Dataset>(`/api/v1/projects/${projectId}/datasets`, {
      method: 'POST',
      body: form,
    })
  },
  deleteDataset: (id: string) =>
    request<void>(`/api/v1/datasets/${id}`, { method: 'DELETE' }),
  downloadDataset: (dataset: Dataset) =>
    download(`/api/v1/datasets/${dataset.id}/download`, dataset.name),

  validateArchitecture: (config: ArchitectureConfig) =>
    request<ValidationResult>('/api/v1/architectures/validate', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  projectArchitectures: (projectId: string) =>
    request<{ items: Architecture[]; total: number }>(`/api/v1/projects/${projectId}/architectures`),
  createArchitecture: (projectId: string, config: ArchitectureConfig) =>
    request<Architecture>(`/api/v1/projects/${projectId}/architectures`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  jobs: () => request<{ items: TrainingJob[]; total: number }>('/api/v1/training-jobs'),
  projectJobs: (projectId: string) =>
    request<{ items: TrainingJob[]; total: number }>(`/api/v1/projects/${projectId}/training-jobs`),
  job: (id: string) => request<TrainingJob>(`/api/v1/training-jobs/${id}`),
  createJob: (
    projectId: string,
    payload: {
      architecture_id: string
      dataset_id: string
      epochs?: number
      batch_size?: number
      learning_rate?: number
      seed?: number
    },
  ) =>
    request<TrainingJob>(`/api/v1/projects/${projectId}/training-jobs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  cancelJob: (id: string) =>
    request<{ message: string; job: TrainingJob }>(`/api/v1/training-jobs/${id}/cancel`, {
      method: 'POST',
    }),
  jobEventsUrl: (id: string) =>
    `${API_URL}/api/v1/training-jobs/${id}/events?token=${encodeURIComponent(getToken() || '')}`,

  models: () => request<{ items: ModelVersion[]; total: number }>('/api/v1/models'),
  projectModels: (projectId: string) =>
    request<{ items: ModelVersion[]; total: number }>(`/api/v1/projects/${projectId}/models`),
  updateModelStatus: (id: string, status: ModelStatus) =>
    request<ModelVersion>(`/api/v1/models/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  downloadModel: (model: ModelVersion) => {
    const project = (model.project_name || 'modelo').replace(/\s+/g, '_')
    return download(`/api/v1/models/${model.id}/download`, `neurolab_${project}_v${model.version}.npz`)
  },

  report: (projectId: string) => request<ProjectReport>(`/api/v1/projects/${projectId}/report`),
  downloadReport: (projectId: string) =>
    download(`/api/v1/projects/${projectId}/report.csv`, `neurolab_reporte_${projectId}.csv`),
  projectAudit: (projectId: string) =>
    request<{ items: AuditEvent[] }>(`/api/v1/projects/${projectId}/audit-events`),

  users: () => request<{ items: User[]; total: number }>('/api/v1/users'),
  updateUser: (id: string, payload: { role?: string; status?: string }) =>
    request<User>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  systemHealth: () => request<SystemHealth>('/api/v1/system/health'),
  audit: (limit = 150) => request<{ items: AuditEvent[]; total: number }>(`/api/v1/audit-events?limit=${limit}`),
}
