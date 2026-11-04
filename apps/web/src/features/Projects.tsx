import { useMemo, useState } from 'react'
import {
  BrainCircuit,
  Database,
  FolderKanban,
  Layers3,
  Network,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react'
import type { Project, User } from '../types'
import { api, messageFromDetail } from '../lib/api'
import {
  Empty,
  Modal,
  PageIntro,
  ProjectStatus,
  formatDate,
  initials,
} from '../components/ui'

export function Projects({
  projects,
  onOpenArchitecture,
  onCreate,
  onRefresh,
  notify,
  currentUser,
}: {
  projects: Project[]
  onOpenArchitecture: (project: Project) => void
  onCreate: () => void
  onRefresh: () => Promise<void>
  notify: (kind: 'success' | 'error' | 'info', message: string) => void
  currentUser: User
}) {
  const [search, setSearch] = useState('')
  const [family, setFamily] = useState('Todas')
  const [membersProject, setMembersProject] = useState<Project | null>(null)
  const [members, setMembers] = useState<User[]>([])
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState('Analista')
  const [busy, setBusy] = useState(false)

  const visible = useMemo(
    () =>
      projects.filter(project => {
        const matchesSearch =
          project.name.toLowerCase().includes(search.toLowerCase()) ||
          project.description.toLowerCase().includes(search.toLowerCase())
        const matchesFamily = family === 'Todas' || project.family === family
        return matchesSearch && matchesFamily
      }),
    [projects, search, family],
  )

  const toggleStatus = async (project: Project) => {
    try {
      await api.updateProject(project.id, {
        status: project.status === 'Activo' ? 'Inactivo' : 'Activo',
      })
      await onRefresh()
      notify('success', 'Estado del proyecto actualizado.')
    } catch (error) {
      notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error))
    }
  }

  const openMembers = async (project: Project) => {
    setMembersProject(project)
    setMembers([])
    try {
      const response = await api.members(project.id)
      setMembers(response.items)
    } catch (error) {
      notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error))
    }
  }

  const addMember = async () => {
    if (!membersProject || !memberEmail.trim()) return
    setBusy(true)
    try {
      await api.addMember(membersProject.id, memberEmail.trim(), memberRole)
      const response = await api.members(membersProject.id)
      setMembers(response.items)
      setMemberEmail('')
      notify('success', 'Miembro agregado al proyecto.')
    } catch (error) {
      notify('error', messageFromDetail((error as { detail?: unknown }).detail ?? error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageIntro
        eyebrow="PROJECT MANAGEMENT"
        title="Proyectos de IA"
        description="Cada proyecto vincula datasets, arquitecturas versionadas, entrenamientos y modelos auditables."
        action={
          <button className="btn btn-primary" onClick={onCreate}>
            <Plus size={17} /> Crear proyecto
          </button>
        }
      />

      <div className="toolbar panel">
        <div className="toolbar-search">
          <Search size={16} />
          <input
            placeholder="Buscar por nombre o descripción..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <label>
          Familia
          <select value={family} onChange={event => setFamily(event.target.value)}>
            <option>Todas</option>
            <option>Feedforward</option>
            <option>RNN</option>
            <option>CNN</option>
            <option>GAN</option>
          </select>
        </label>
        <span className="toolbar-count">{visible.length} proyecto(s)</span>
      </div>

      {visible.length === 0 ? (
        <Empty
          icon={FolderKanban}
          title="No hay proyectos que coincidan"
          text="Crea un proyecto nuevo o ajusta los filtros de búsqueda."
          action={
            <button className="btn btn-primary btn-small" onClick={onCreate}>
              <Plus size={15} /> Crear proyecto
            </button>
          }
        />
      ) : (
        <div className="project-grid">
          {visible.map(project => (
            <article className="project-card" key={project.id}>
              <div className="project-card-top">
                <div className="project-logo">
                  <BrainCircuit size={22} />
                </div>
                <ProjectStatus status={project.status} />
              </div>
              <span className="project-id">{project.id.slice(0, 8)}</span>
              <h3>{project.name}</h3>
              <p>{project.description || 'Sin descripción adicional.'}</p>
              <div className="project-meta">
                <div>
                  <Database size={15} />
                  <span>{project.counts.datasets} dataset(s)</span>
                </div>
                <div>
                  <Network size={15} />
                  <span>{project.family}</span>
                </div>
                <div>
                  <Layers3 size={15} />
                  <span>{project.counts.architectures} arquitectura(s)</span>
                </div>
              </div>
              <div className="project-stats">
                <span>
                  <b>{project.counts.training_jobs}</b> entrenamientos
                </span>
                <span>
                  <b>{project.counts.models}</b> modelos
                </span>
                <span>{formatDate(project.created_at)}</span>
              </div>
              <div className="project-card-footer">
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => onOpenArchitecture(project)}
                >
                  <SlidersHorizontal size={15} /> Configurar red
                </button>
                <button className="btn btn-ghost btn-small" onClick={() => openMembers(project)}>
                  <Users size={15} /> Miembros
                </button>
                <button className="btn btn-ghost btn-small" onClick={() => toggleStatus(project)}>
                  {project.status === 'Activo' ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {membersProject && (
        <Modal
          eyebrow="EQUIPO DEL PROYECTO"
          title={`Miembros · ${membersProject.name}`}
          description="Administra quién puede leer, entrenar o revisar los modelos del proyecto."
          onClose={() => setMembersProject(null)}
        >
          <div className="member-list">
            {members.map(member => (
              <div className="member-row" key={member.id}>
                <div className="member-avatar">{initials(member.display_name)}</div>
                <div>
                  <b>{member.display_name}</b>
                  <small>{member.email}</small>
                </div>
                <span className="subtle-badge">{member.project_role || member.role}</span>
              </div>
            ))}
            {members.length === 0 && <p className="muted-text">Cargando miembros...</p>}
          </div>
          {currentUser.role === 'Administrador' ||
          membersProject.owner_id === currentUser.id ||
          currentUser.role === 'Responsable' ? (
            <div className="member-form">
              <label>
                Correo del usuario
                <input
                  type="email"
                  placeholder="analista@neurolab.local"
                  value={memberEmail}
                  onChange={event => setMemberEmail(event.target.value)}
                />
              </label>
              <label>
                Rol en el proyecto
                <select value={memberRole} onChange={event => setMemberRole(event.target.value)}>
                  <option>Analista</option>
                  <option>Revisor</option>
                  <option>Lector</option>
                  <option>Responsable</option>
                </select>
              </label>
              <button className="btn btn-primary" onClick={addMember} disabled={busy}>
                <Plus size={15} /> Agregar
              </button>
            </div>
          ) : (
            <p className="muted-text">
              Solo el propietario, un responsable o un administrador pueden modificar miembros.
            </p>
          )}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setMembersProject(null)}>
              <X size={15} /> Cerrar
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
