import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react'
import type { JobStatus, ModelStatus, TrainingJob } from '../types'

export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="page-intro">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="intro-actions">{action}</div>}
    </div>
  )
}

export function Metric({
  label,
  value,
  note,
  icon: Icon,
  color,
  trend,
}: {
  label: string
  value: string | number
  note: string
  icon: LucideIcon
  color: string
  trend?: string
}) {
  return (
    <div className={`metric-card metric-${color}`}>
      <div className="metric-top">
        <span>{label}</span>
        <div className="metric-icon">
          <Icon size={19} />
        </div>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom">
        <span>{note}</span>
        {trend && <b>{trend}</b>}
      </div>
    </div>
  )
}

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  QUEUED: 'En cola',
  PREPARING: 'Preparando',
  RUNNING: 'Ejecutando',
  COMPLETED: 'Completado',
  FAILED: 'Fallido',
  CANCELLED: 'Cancelado',
}

export function jobStatusClass(status: JobStatus): string {
  if (status === 'COMPLETED') return 'status-green'
  if (status === 'RUNNING' || status === 'PREPARING') return 'status-blue'
  if (status === 'QUEUED') return 'status-amber'
  if (status === 'FAILED') return 'status-red'
  return 'status-gray'
}

export function JobStatus({ status }: { status: JobStatus }) {
  return (
    <span className={`status-pill ${jobStatusClass(status)}`}>
      <i />
      {JOB_STATUS_LABEL[status]}
    </span>
  )
}

export function ProjectStatus({ status }: { status: string }) {
  const kind =
    status === 'Activo' ? 'status-green' : status === 'Borrador' ? 'status-amber' : 'status-gray'
  return (
    <span className={`status-pill ${kind}`}>
      <i />
      {status}
    </span>
  )
}

export const MODEL_STATUS_LABEL: Record<ModelStatus, string> = {
  draft: 'Borrador',
  reviewed: 'Revisado',
  approved: 'Aprobado',
  retired: 'Retirado',
}

export function ModelStatusPill({ status }: { status: ModelStatus }) {
  const kind =
    status === 'approved'
      ? 'status-green'
      : status === 'reviewed'
        ? 'status-blue'
        : status === 'retired'
          ? 'status-gray'
          : 'status-amber'
  return (
    <span className={`status-pill ${kind}`}>
      <i />
      {MODEL_STATUS_LABEL[status]}
    </span>
  )
}

export function Empty({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div>
        <Icon size={25} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

export function ProgressBar({ value, status }: { value: number; status?: JobStatus }) {
  const normalized = Math.max(0, Math.min(100, value))
  return (
    <div className={`progress-track ${status ? `progress-${status.toLowerCase()}` : ''}`}>
      <span style={{ width: `${normalized}%` }} />
    </div>
  )
}

export function Modal({
  title,
  eyebrow,
  description,
  children,
  onClose,
  wide,
}: {
  title: string
  eyebrow?: string
  description?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export type ToastKind = 'success' | 'error' | 'info'

export function Toast({
  kind,
  message,
  onClose,
}: {
  kind: ToastKind
  message: string
  onClose: () => void
}) {
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? AlertTriangle : Info
  return (
    <div className={`toast toast-${kind}`}>
      <Icon size={18} />
      <span>{message}</span>
      <button onClick={onClose} aria-label="Cerrar aviso">
        <X size={15} />
      </button>
    </div>
  )
}

export function LoadingBlock({ label = 'Cargando información...' }: { label?: string }) {
  return (
    <div className="loading-block">
      <Loader2 size={20} className="spin" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner">
      <AlertTriangle size={17} />
      <span>{message}</span>
    </div>
  )
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="info-callout">
      <Info size={18} />
      <span>{children}</span>
    </div>
  )
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function formatPercent(value: number | undefined, digits = 1): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function jobMetric(job: TrainingJob, key: string): number | undefined {
  const value = job.last_metrics?.[key as keyof typeof job.last_metrics]
  return typeof value === 'number' ? value : undefined
}
