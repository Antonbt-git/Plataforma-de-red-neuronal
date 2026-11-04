export type Role = 'Administrador' | 'Responsable' | 'Analista' | 'Revisor' | 'Lector'
export type ModuleKey =
  | 'dashboard'
  | 'projects'
  | 'datasets'
  | 'architectures'
  | 'training'
  | 'evaluation'
  | 'models'
  | 'reports'
  | 'fundamentals'
  | 'admin'
export type Family = 'Feedforward' | 'RNN' | 'CNN' | 'GAN'
export type Activation = 'relu' | 'sigmoid' | 'softmax' | 'tanh' | 'linear'
export type Optimizer = 'Adam' | 'SGD' | 'RMSprop'
export type LossName = 'binary_crossentropy' | 'categorical_crossentropy' | 'mse'
export type JobStatus =
  | 'QUEUED'
  | 'PREPARING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
export type ModelStatus = 'draft' | 'reviewed' | 'approved' | 'retired'

export interface User {
  id: string
  email: string
  display_name: string
  role: Role
  status: 'active' | 'disabled'
  created_at: string
  project_role?: string
}

export interface ProjectCounts {
  datasets: number
  architectures: number
  training_jobs: number
  models: number
}

export interface Project {
  id: string
  name: string
  description: string
  family: Family
  status: 'Activo' | 'Borrador' | 'Inactivo'
  owner_id: string
  owner_email: string | null
  created_at: string
  updated_at: string
  counts: ProjectCounts
}

export interface DatasetMetadata {
  rows: number
  columns: number
  column_names: string[]
  numeric_columns: string[]
  feature_columns: string[]
  target_column: string
  classes: string[]
  task: 'binary' | 'multiclass' | 'regression'
  filename: string | null
  preview: Record<string, string>[]
}

export interface Dataset {
  id: string
  project_id: string
  name: string
  version: number
  target_column: string
  checksum: string
  size_bytes: number
  metadata: DatasetMetadata
  created_at: string
}

export interface LayerSpec {
  units: number
  activation: Activation
  dropout: number
}

export interface ArchitectureConfig {
  name: string
  family: Family
  input_units: number
  output_units: number
  output_activation: Activation
  layers: LayerSpec[]
  optimizer: Optimizer
  loss: LossName
  epochs: number
  batch_size: number
  learning_rate: number
  sequence_length?: number | null
  input_height?: number | null
  input_width?: number | null
  input_channels?: number | null
  latent_dim?: number | null
}

export interface Architecture {
  id: string
  project_id: string
  name: string
  family: Family
  version: number
  config: ArchitectureConfig
  parameter_count: number
  created_at: string
}

export interface MetricPoint {
  epoch: number
  loss?: number
  val_loss?: number
  accuracy?: number
  val_accuracy?: number
  mae?: number
  val_mae?: number
}

export interface TrainingJob {
  id: string
  project_id: string
  project_name: string | null
  architecture_id: string
  architecture_name: string | null
  dataset_id: string
  dataset_name: string | null
  status: JobStatus
  progress: number
  epochs: number
  current_epoch: number
  learning_rate: number
  batch_size: number
  optimizer: string
  loss_function: string
  seed: number
  engine: string
  error_message: string | null
  cancel_requested: boolean
  created_at: string
  started_at: string | null
  ended_at: string | null
  last_metrics: MetricPoint
  history: MetricPoint[]
  terminal: boolean
}

export interface ModelVersion {
  id: string
  project_id: string
  project_name: string | null
  job_id: string
  version: number
  status: ModelStatus
  checksum: string
  metrics: Record<string, unknown>
  created_at: string
  download_url: string
}

export interface AuditEvent {
  id: number
  actor_id: string | null
  actor_email: string | null
  project_id: string | null
  action: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface EngineStatus {
  numpy_engine: string
  tensorflow_available: boolean
  tensorflow_version: string | null
  families_enabled: string[]
  families_validated: string[]
}

export interface DashboardData {
  counts: {
    projects: number
    active_projects: number
    datasets: number
    jobs: number
    active_jobs: number
    completed_jobs: number
    failed_jobs: number
    models: number
    approved_models: number
  }
  recent_jobs: TrainingJob[]
  recent_models: ModelVersion[]
  engine: EngineStatus
  generated_at: string
}

export interface SystemHealth {
  status: 'ok' | 'degraded'
  version: string
  environment: string
  database: { ok: boolean; url_engine: string }
  storage: { ok: boolean; path: string; free_gb: number; used_percent: number }
  worker: { queue_size: number; configured_workers: number }
  engine: EngineStatus
  pid: number
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  parameter_count: number
  family: Family
  message: string
}

export interface ProjectReport {
  project: Project
  datasets: Dataset[]
  architectures: Architecture[]
  jobs: TrainingJob[]
  models: ModelVersion[]
  summary: Record<string, number>
  generated_at: string
}
