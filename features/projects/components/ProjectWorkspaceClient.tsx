'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  ChevronDown,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldAlert,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import SideDrawer from '@/components/ui/SideDrawer'
import { cn } from '@/lib/utils'
import { useProjectViewStore } from '@/lib/stores/project-view-store'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useArchiveProject, useProject, useUpdateProject } from '../hooks/useProject'
import { ProjectViewSwitcher } from './views/ProjectViewSwitcher'
import { ProjectDeliveryControlCenter } from './ProjectDeliveryControlCenter'
import { ScheduleImportModal } from './ScheduleImportModal'
import { ProjectDatePicker } from './ProjectDatePicker'

interface Props {
  projectId: string
  user: { id: string; role: string }
}

const CAN_EDIT_ROLES = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD']

export function ProjectWorkspaceClient({ projectId, user }: Props) {
  const { data: project, isLoading, isError } = useProject(projectId)
  const updateProject = useUpdateProject(projectId)
  const archiveProject = useArchiveProject(projectId)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [controlsOpen, setControlsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [referenceDate, setReferenceDate] = useState('')
  const [railExpanded, setRailExpanded] = useState(false)
  const assignee = useProjectViewStore((state) => state.assignee)
  const priority = useProjectViewStore((state) => state.priority)
  const risk = useProjectViewStore((state) => state.risk)
  const enterProject = useProjectViewStore((state) => state.enterProject)
  const setActiveView = useProjectViewStore((state) => state.setActiveView)
  const setAssignee = useProjectViewStore((state) => state.setAssignee)
  const setPriority = useProjectViewStore((state) => state.setPriority)
  const setRisk = useProjectViewStore((state) => state.setRisk)
  const { users } = useUsersForSelection()

  useEffect(() => {
    enterProject(projectId)
  }, [enterProject, projectId])

  const createdFromDraft = searchParams.get('created') === '1'
  useEffect(() => {
    if (createdFromDraft) setActiveView('gantt')
  }, [createdFromDraft, setActiveView])

  useEffect(() => {
    const storageKey = `project.reference-date.${projectId}`
    const stored = window.localStorage.getItem(storageKey)
    setReferenceDate(stored || new Date().toISOString().slice(0, 10))
  }, [projectId])

  if (isLoading) return <WorkspaceLoading />
  if (isError || !project) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa]"><EmptyState icon={AlertTriangle} title="Project unavailable" description="It may have been archived or you do not have access." /></div>
  }

  const canEdit = CAN_EDIT_ROLES.includes(user.role) || project.projectManagerId === user.id
  const activityCount = project.phases.reduce((count, phase) => count + phase.milestones.reduce((sum, milestone) => sum + milestone.activities.length, 0), 0)
  const milestoneCount = project.phases.reduce((count, phase) => count + phase.milestones.length, 0)
  const deliverableCount = project.phases.reduce((count, phase) => count + phase.milestones.filter((milestone) => milestone.isKeyMilestone).length, 0)
  const acknowledgedWarnings = Math.max(0, Number.parseInt(searchParams.get('warnings') ?? '0', 10) || 0)
  const health = project.ragStatus === 'RED' ? 'Behind' : project.ragStatus === 'AMBER' ? 'At Risk' : 'On Time'

  const saveName = async () => {
    const name = draftName.trim()
    setEditingName(false)
    if (name.length < 3 || name === project.name) return
    await updateProject.mutateAsync({ name })
  }

  return (
    <div className="flex h-screen min-h-[560px] overflow-hidden bg-white text-ink-primary">
      <aside className={cn('flex shrink-0 flex-col border-r border-black/[0.08] bg-white transition-[width] duration-150', railExpanded ? 'w-44' : 'w-12')}>
        <button type="button" className="flex h-12 items-center gap-2 border-b border-black/[0.08] px-2" onClick={() => setRailExpanded((value) => !value)} aria-label="Toggle project rail">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#080c42] text-white"><Menu className="size-4" /></span>
          {railExpanded && <span className="truncate text-[13px] font-semibold">Project tools</span>}
        </button>
        <RailLink href="/dashboard" label="Dashboard" expanded={railExpanded} icon={LayoutDashboard} />
        <RailLink href="/dashboard/projects" label="All projects" expanded={railExpanded} icon={FolderKanban} />
        <RailButton label="Delivery controls" expanded={railExpanded} icon={ShieldAlert} onClick={() => setControlsOpen(true)} />
        <RailButton label="Project team" expanded={railExpanded} icon={Users} onClick={() => setControlsOpen(true)} />
        <div className="mt-auto border-t border-black/[0.08]">
          <RailLink href="/dashboard/projects" label="Exit workspace" expanded={railExpanded} icon={ArrowLeft} />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/[0.08] bg-white px-3">
          <div className="min-w-0 max-w-[300px]">
            {editingName ? (
              <input
                autoFocus
                className="h-7 w-full rounded border border-primary-400 px-2 text-[15px] font-semibold outline-none ring-2 ring-primary-100"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveName()
                  if (event.key === 'Escape') setEditingName(false)
                }}
              />
            ) : (
              <button
                type="button"
                disabled={!canEdit}
                className="flex max-w-full items-center gap-1.5 text-left"
                onClick={() => { setDraftName(project.name); setEditingName(true) }}
                title={canEdit ? 'Rename project' : project.name}
              >
                <span className="truncate text-[15px] font-semibold">{project.name}</span>
                {canEdit && <ChevronDown className="size-3.5 shrink-0 text-ink-tertiary" />}
              </button>
            )}
            <div className="truncate text-[9px] text-ink-tertiary">{project.code} · {project.clientName}</div>
          </div>

          <Link
            href="/dashboard/projects"
            className="order-first inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-black/[0.1] px-2 text-[12px] font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
            aria-label="Back to all projects"
            title="Back to all projects"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden lg:inline">Projects</span>
          </Link>
          <button type="button" className="rounded p-1.5 text-ink-secondary hover:bg-surface-hover" onClick={() => setControlsOpen(true)} aria-label="Project settings"><Settings className="size-3.5" /></button>
          <select
            value={project.ragStatus}
            disabled={!canEdit || updateProject.isPending}
            onChange={(event) => updateProject.mutate({ ragStatus: event.target.value })}
            className={cn('h-8 rounded-md border px-2 text-[12px] font-semibold', healthTone(project.ragStatus))}
            aria-label="Project health"
          >
            <option value="GREEN">On Time</option><option value="AMBER">At Risk</option><option value="RED">Behind</option>
          </select>
          <ProjectDatePicker
            value={referenceDate}
            onChange={(value) => { setReferenceDate(value); window.localStorage.setItem(`project.reference-date.${projectId}`, value) }}
            ariaLabel="Reference date"
            allowClear={false}
            displayFormat="dd/MM/yyyy"
            className="h-8 w-[138px]"
          />

          <select value={assignee} onChange={(event) => setAssignee(event.target.value)} className="h-8 max-w-[150px] rounded-md border border-black/[0.1] bg-white px-2 text-[12px] text-ink-secondary outline-none" aria-label="Filter by assignee">
            <option value="">All assignees</option><option value="UNASSIGNED">Unassigned</option>
            {users.map((person) => <option key={person.id} value={person.id}>{person.name ?? person.email}</option>)}
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className="h-8 rounded-md border border-black/[0.1] bg-white px-2 text-[12px] text-ink-secondary outline-none" aria-label="Filter by priority">
            <option value="">Priority</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
          </select>
          <select value={risk} onChange={(event) => setRisk(event.target.value)} className="h-8 rounded-md border border-black/[0.1] bg-white px-2 text-[12px] text-ink-secondary outline-none" aria-label="Filter by risk">
            <option value="">Risk</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
          </select>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1 text-[11px] text-success-700 xl:flex"><Check className="size-3.5" /> In sync</span>
            {canEdit && <button type="button" className="btn btn-outline btn-sm" onClick={() => setImportOpen(true)}><Upload className="size-3.5" /> Import</button>}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setControlsOpen(true)}><UserPlus className="size-3.5" /> Invite</button>
          </div>
        </header>

        {!project.baselineCommittedAt && (
          <div className="flex shrink-0 items-center gap-2 border-b border-warning-500/20 bg-warning-50 px-4 py-1.5 text-[12px] text-warning-800">
            <AlertTriangle className="size-3.5" /> Baseline is not committed. Delay tracking begins after the first schedule baseline is frozen.
          </div>
        )}

        {createdFromDraft && (
          <section className="shrink-0 border-b border-success-500/20 bg-success-50 px-4 py-3" aria-label="Project creation summary">
            <div className="flex items-start gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-success-700" />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-semibold text-success-800">Project created in Planning with the Gantt schedule open.</p>
                <p className="mt-0.5 text-body-sm text-success-700">
                  {project.phases.length} phases · {milestoneCount} milestones · {activityCount} activities · {deliverableCount} deliverables · {project.dependencies.length} dependency links · {acknowledgedWarnings} acknowledged unresolved warnings
                </p>
                <p className="mt-0.5 text-body-sm text-success-700">The project remains unbaselined. No assignee, client, portal, or external notification was sent.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveView('gantt')}>Review schedule</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setControlsOpen(true)}>Configure project team</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setControlsOpen(true)}>Configure client obligations</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveView('gantt')}>Commit baseline when ready</button>
                </div>
              </div>
              <button type="button" aria-label="Dismiss creation summary" className="rounded-lg p-1 text-success-700 hover:bg-success-100" onClick={() => router.replace(pathname, { scroll: false })}><X className="size-4" /></button>
            </div>
          </section>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          <ProjectViewSwitcher project={project} canEdit={canEdit} />
        </div>
      </main>

      <ScheduleImportModal open={importOpen} onClose={() => setImportOpen(false)} projectId={project.id} hasSchedule={activityCount > 0} />
      <SideDrawer open={controlsOpen} onClose={() => setControlsOpen(false)} title={`${project.name} — Delivery controls`} width="full">
        <ProjectDeliveryControlCenter
          project={project}
          canEdit={canEdit}
          onArchive={() => setArchiveOpen(true)}
          archivePending={archiveProject.isPending}
        />
      </SideDrawer>
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          await archiveProject.mutateAsync()
          setArchiveOpen(false)
          setControlsOpen(false)
          router.replace('/dashboard/projects')
          router.refresh()
        }}
        title="Archive project"
        message={`Archive “${project.name}”?`}
        description="This removes the project from the active directory without permanently deleting its records."
        variant="warning"
        icon={Archive}
        confirmLabel="Archive project"
        loadingLabel="Archiving project…"
        isLoading={archiveProject.isPending}
        bullets={[
          'The project will disappear from the active Projects list.',
          'Its schedule, delivery records, and audit history will be retained.',
          'No project members or clients will be notified.',
        ]}
      />
    </div>
  )
}

function RailLink({ href, label, expanded, icon: Icon }: { href: string; label: string; expanded: boolean; icon: typeof FolderKanban }) {
  return <Link href={href} title={label} className="flex h-12 items-center gap-3 px-4 text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"><Icon className="size-4 shrink-0" />{expanded && <span className="truncate text-[12px] font-medium">{label}</span>}</Link>
}

function RailButton({ label, expanded, icon: Icon, onClick }: { label: string; expanded: boolean; icon: typeof FolderKanban; onClick: () => void }) {
  return <button type="button" title={label} onClick={onClick} className="flex h-12 w-full items-center gap-3 px-4 text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"><Icon className="size-4 shrink-0" />{expanded && <span className="truncate text-[12px] font-medium">{label}</span>}</button>
}

function WorkspaceLoading() {
  return <div className="flex h-screen bg-white"><Skeleton className="h-full w-[58px] rounded-none" /><div className="flex-1"><Skeleton className="h-[58px] w-full rounded-none" /><div className="p-4"><Skeleton className="h-[520px] w-full rounded-card" /></div></div></div>
}

function healthTone(rag: string) {
  if (rag === 'RED') return 'border-danger-500/25 bg-danger-50 text-danger-700'
  if (rag === 'AMBER') return 'border-warning-500/25 bg-warning-50 text-warning-700'
  return 'border-primary-500/25 bg-primary-50 text-primary-700'
}
