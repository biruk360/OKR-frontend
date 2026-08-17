'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Archive, BarChart3, BookOpenCheck, Link2, Settings, ShieldAlert, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { projectKeys } from '../hooks/useProjects'
import type { ProjectDetail } from '../hooks/useProject'
import { ProjectObjectiveLinker } from './okr/ProjectObjectiveLinker'
import { DelayLedgerTable } from './DelayLedgerTable'
import { RaidRegister } from './registers/RaidRegister'
import { ChangeControlBoard } from './registers/ChangeControlBoard'
import { StageGateRegister } from './registers/StageGateRegister'
import { ClientObligationsRegister } from './registers/ClientObligationsRegister'
import { CorrectionOfErrorsRegister } from './registers/CorrectionOfErrorsRegister'
import { PaymentMilestonesRegister } from './registers/PaymentMilestonesRegister'
import { ClientReportsPanel } from './reports/ClientReportsPanel'
import { ManagementReportsPanel } from './reports/ManagementReportsPanel'
import { PerformanceReportsPanel } from './reports/PerformanceReportsPanel'
import { JiraIntegrationPanel } from './integrations/JiraIntegrationPanel'
import { ScrumLogWidget } from './ScrumLogWidget'

type ControlTab = 'team' | 'governance' | 'delivery' | 'reports' | 'integrations' | 'settings'

const TABS: Array<{ id: ControlTab; label: string; icon: typeof Users }> = [
  { id: 'team', label: 'Team & OKRs', icon: Users },
  { id: 'governance', label: 'Governance', icon: ShieldAlert },
  { id: 'delivery', label: 'Delivery', icon: BookOpenCheck },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function ProjectDeliveryControlCenter({
  project,
  canEdit,
  onArchive,
  archivePending = false,
}: {
  project: ProjectDetail
  canEdit: boolean
  onArchive: () => void
  archivePending?: boolean
}) {
  const [activeTab, setActiveTab] = useState<ControlTab>('team')
  const { users } = useUsersForSelection()
  const queryClient = useQueryClient()
  const [memberUserId, setMemberUserId] = useState('')
  const [memberRole, setMemberRole] = useState('DEVELOPER')
  const [allocationPct, setAllocationPct] = useState(100)
  const [savingMember, setSavingMember] = useState(false)
  const names = useMemo(() => new Map(users.map((user) => [user.id, user.name ?? user.email])), [users])
  const currentMemberIds = useMemo(() => new Set(project.members.map((member) => member.userId)), [project.members])

  const mutateMember = async (method: 'POST' | 'DELETE', body: Record<string, unknown>) => {
    setSavingMember(true)
    try {
      const response = await fetch(`/api/projects/${project.id}/members`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success === false) throw new Error(result.error || 'Unable to update project team')
      await queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) })
      toast.success(method === 'POST' ? 'Project member saved' : 'Project member removed')
      if (method === 'POST') setMemberUserId('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update project team')
    } finally {
      setSavingMember(false)
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)] overflow-hidden border-t border-black/[0.08]">
      <nav className="space-y-1 border-r border-black/[0.08] bg-[#f7f8fa] p-2" aria-label="Project delivery controls">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] font-medium',
              activeTab === id ? 'bg-white text-primary-700 shadow-sm' : 'text-ink-secondary hover:bg-white/70 hover:text-ink-primary'
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 overflow-y-auto bg-white p-5">
        {activeTab === 'team' && (
          <ControlSection title="Team and project alignment" description="Project membership, allocation and OKR linkage remain connected to the existing access model.">
            <ProjectObjectiveLinker projectId={project.id} objectiveId={project.objectiveId} canEdit={canEdit} />
            {canEdit && (
              <div className="mt-5 rounded-card border border-black/[0.08] bg-surface-muted/30 p-3">
                <div className="mb-2 text-body-sm font-semibold text-ink-primary">Invite or update a member</div>
                <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_150px_110px_auto]">
                  <select className="input h-9" value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)}>
                    <option value="">Select a user</option>
                    {users.filter((candidate) => candidate.id !== project.projectManagerId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name ?? candidate.email}{currentMemberIds.has(candidate.id) ? ' · member' : ''}</option>)}
                  </select>
                  <select className="input h-9" value={memberRole} onChange={(event) => setMemberRole(event.target.value)}>
                    <option value="DEVELOPER">Developer</option><option value="QA">QA</option><option value="DESIGNER">Designer</option><option value="BA">Business analyst</option><option value="PM">Project manager</option><option value="CLIENT_CONTACT">Client contact</option>
                  </select>
                  <label className="flex h-9 items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 text-[12px] text-ink-secondary"><input className="w-12 bg-transparent text-right outline-none" type="number" min={0} max={100} value={allocationPct} onChange={(event) => setAllocationPct(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} />%</label>
                  <button className="btn btn-primary btn-sm" disabled={!memberUserId || savingMember} onClick={() => void mutateMember('POST', { userId: memberUserId, role: memberRole, allocationPct })}>Save member</button>
                </div>
              </div>
            )}
            <div className="mt-5 overflow-hidden rounded-card border border-black/[0.08]">
              <div className="grid grid-cols-[1fr_150px_120px] bg-surface-muted/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">
                <span>Member</span><span>Role</span><span>Allocation</span>
              </div>
              {project.members.length === 0 ? (
                <div className="px-3 py-5 text-body-sm text-ink-tertiary">No additional project members. The project manager still has full delivery access.</div>
              ) : project.members.map((member) => (
                <div key={member.id} className="grid grid-cols-[1fr_150px_120px] border-t border-black/[0.05] px-3 py-2 text-body-sm text-ink-secondary">
                  <span className="font-medium text-ink-primary">{names.get(member.userId) ?? member.userId}</span>
                  <span>{member.role.replace(/_/g, ' ')}</span>
                  <span className="flex items-center justify-between gap-2">{member.allocationPct}%{canEdit && <button type="button" disabled={savingMember} className="text-[11px] text-danger-600 hover:underline" onClick={() => void mutateMember('DELETE', { userId: member.userId })}>Remove</button>}</span>
                </div>
              ))}
            </div>
          </ControlSection>
        )}

        {activeTab === 'governance' && (
          <div className="space-y-8">
            <ControlSection title="RAID register" description="Risks, assumptions, issues and dependencies."><RaidRegister projectId={project.id} canEdit={canEdit} /></ControlSection>
            <ControlSection title="Change control board" description="Scope, requirement and descope decisions."><ChangeControlBoard project={project} canEdit={canEdit} /></ControlSection>
            <ControlSection title="Stage gates" description="Phase entry, exit, deliverable and approval gates."><StageGateRegister project={project} canEdit={canEdit} /></ControlSection>
          </div>
        )}

        {activeTab === 'delivery' && (
          <div className="space-y-8">
            <ControlSection title="Delay ledger" description="Every delay, its owner and recovery plan."><DelayLedgerTable projectId={project.id} canEdit={canEdit} /></ControlSection>
            <ControlSection title="Client obligations" description="Responsibilities, SLAs and compliance."><ClientObligationsRegister projectId={project.id} canEdit={canEdit} /></ControlSection>
            <ControlSection title="Correction of errors" description="Root causes, systemic fixes and lessons learned."><CorrectionOfErrorsRegister projectId={project.id} canEdit={canEdit} /></ControlSection>
            <ControlSection title="Payment milestones" description="Approvals, invoicing and overdue cash."><PaymentMilestonesRegister project={project} canEdit={canEdit} /></ControlSection>
            <ControlSection title="Daily scrum" description="Attendance, blockers and accountability."><ScrumLogWidget projectId={project.id} canEdit={canEdit} /></ControlSection>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-8">
            <ControlSection title="Public snapshots" description="Static, read-only schedule links. Refreshing is always explicit so recipients see a stable version."><ProjectSnapshotsPanel projectId={project.id} canEdit={canEdit} /></ControlSection>
            <ControlSection title="Client reports" description="Draft, approve, send and publish to the client portal."><ClientReportsPanel projectId={project.id} canEdit={canEdit} /></ControlSection>
            <ControlSection title="Management reports" description="Steering, COE, estimation and capacity packs."><ManagementReportsPanel projectId={project.id} canEdit={canEdit} /></ControlSection>
            {project.jiraLinked && <ControlSection title="Performance reports" description="Jira evidence and PM-editable insights."><PerformanceReportsPanel projectId={project.id} canEdit={canEdit} jiraLinked /></ControlSection>}
          </div>
        )}

        {activeTab === 'integrations' && (
          <ControlSection title="Project integrations" description="Connect external delivery systems without leaving the project workspace.">
            <div className="mb-3 flex items-center gap-2 text-body-sm text-ink-secondary"><Settings className="size-4" /> Integration settings use the existing project permission checks.</div>
            <JiraIntegrationPanel projectId={project.id} canEdit={canEdit} />
          </ControlSection>
        )}

        {activeTab === 'settings' && (
          <ControlSection title="Project settings" description="Manage this project's lifecycle and visibility.">
            <div className="rounded-card border border-danger-500/25 bg-danger-50 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-body font-semibold text-danger-800">Archive project</h4>
                  <p className="mt-1 text-body-sm text-danger-700">
                    Remove this project from the active project directory while retaining its schedule and audit history.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="shrink-0"
                  disabled={!canEdit || archivePending}
                  onClick={onArchive}
                >
                  <Archive className="size-4" /> {archivePending ? 'Archiving…' : 'Archive project'}
                </Button>
              </div>
              {!canEdit && <p className="mt-3 text-body-sm text-danger-700">Only a project manager or authorized management role can archive this project.</p>}
            </div>
          </ControlSection>
        )}
      </div>
    </div>
  )
}

interface PublicSnapshot { id: string; generatedAt: string; status: string }

function ProjectSnapshotsPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [snapshots, setSnapshots] = useState<PublicSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/snapshots`)
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success === false) throw new Error(result.error || 'Unable to load snapshots')
      setSnapshots(result.data ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load snapshots')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [projectId])

  const mutate = async (method: 'POST' | 'PATCH' | 'DELETE', snapshotId?: string) => {
    setBusyId(snapshotId ?? 'NEW')
    try {
      const response = await fetch(`/api/projects/${projectId}/snapshots`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? undefined : JSON.stringify({ snapshotId }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success === false) throw new Error(result.error || 'Unable to update snapshot')
      await load()
      if (method === 'POST') {
        await navigator.clipboard?.writeText(`${window.location.origin}/projects/snapshots/${result.data.id}`)
        toast.success('Snapshot published and link copied')
      } else toast.success(method === 'PATCH' ? 'Snapshot refreshed' : 'Snapshot deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update snapshot')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="overflow-hidden rounded-card border border-black/[0.08]">
      <div className="flex items-center justify-between bg-surface-muted/40 px-3 py-2"><span className="text-body-sm text-ink-secondary">{snapshots.length} published snapshot{snapshots.length === 1 ? '' : 's'}</span>{canEdit && <button className="btn btn-primary btn-sm" disabled={busyId === 'NEW'} onClick={() => void mutate('POST')}>Publish snapshot</button>}</div>
      {loading ? <div className="p-3 text-body-sm text-ink-tertiary">Loading snapshots…</div> : snapshots.length === 0 ? <div className="p-3 text-body-sm text-ink-tertiary">No public snapshots have been published.</div> : snapshots.map((snapshot) => (
        <div key={snapshot.id} className="flex items-center gap-3 border-t border-black/[0.05] px-3 py-2 text-body-sm">
          <span className="font-medium text-ink-primary">Captured {new Date(snapshot.generatedAt).toLocaleString()}</span>
          <button className="ml-auto text-primary-700 hover:underline" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/projects/snapshots/${snapshot.id}`).then(() => toast.success('Snapshot link copied'))}>Copy link</button>
          {canEdit && <><button disabled={busyId === snapshot.id} className="text-primary-700 hover:underline" onClick={() => void mutate('PATCH', snapshot.id)}>Refresh</button><button disabled={busyId === snapshot.id} className="text-danger-600 hover:underline" onClick={() => { if (window.confirm('Delete this public snapshot?')) void mutate('DELETE', snapshot.id) }}>Delete</button></>}
        </div>
      ))}
    </div>
  )
}

function ControlSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-section-title text-ink-primary">{title}</h3>
        <p className="text-body-sm text-ink-tertiary">{description}</p>
      </div>
      {children}
    </section>
  )
}
