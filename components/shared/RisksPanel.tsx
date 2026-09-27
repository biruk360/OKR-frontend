'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { AlertTriangle, Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { PersonTooltip } from '@/components/shared/UserAvatar'

type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type Status = 'OPEN' | 'MITIGATING' | 'RESOLVED' | 'ACCEPTED'

export interface Risk {
  id: string
  title: string
  description: string | null
  severity: Severity
  status: Status
  mitigation: string | null
  objectiveId: string | null
  keyResultId: string | null
  reporterId: string
  reporter: { id: string; name: string; avatar: string | null; email?: string | null }
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

interface Props {
  parent: { type: 'objective'; id: string } | { type: 'keyResult'; id: string }
  currentUserId: string
  currentUserRole: string
  /**
   * Whether the viewer may report a new risk (POST /api/risks requires edit
   * rights on the parent). Callers should pass the server-computed flag;
   * when omitted the button is shown and the API's 403 is surfaced.
   */
  canReport?: boolean
  /** Optional callback receiving the count whenever the list updates (lets parent show badge). */
  onCountChange?: (n: number) => void
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

// Palette channel variables (app/globals.css) so the chips follow dark mode.
const SEVERITY_STYLE: Record<Severity, { bg: string; fg: string; label: string }> = {
  CRITICAL: { bg: 'rgb(var(--rgb-danger-500) / 0.14)', fg: 'rgb(var(--rgb-danger-700))', label: 'Critical' },
  HIGH: { bg: 'rgb(var(--rgb-warning-500) / 0.16)', fg: 'rgb(var(--rgb-warning-700))', label: 'High' },
  MEDIUM: { bg: 'rgb(var(--rgb-warning-300) / 0.20)', fg: 'rgb(var(--rgb-warning-800))', label: 'Medium' },
  LOW: { bg: 'rgb(var(--rgb-ink-secondary) / 0.18)', fg: 'var(--ap-fg-secondary)', label: 'Low' },
}

const STATUS_STYLE: Record<Status, { bg: string; fg: string; label: string }> = {
  OPEN: { bg: 'rgb(var(--rgb-danger-500) / 0.10)', fg: 'rgb(var(--rgb-danger-700))', label: 'Open' },
  MITIGATING: { bg: 'rgb(var(--rgb-warning-500) / 0.12)', fg: 'rgb(var(--rgb-warning-700))', label: 'Mitigating' },
  RESOLVED: { bg: 'rgb(var(--rgb-success-500) / 0.14)', fg: 'rgb(var(--rgb-success-700))', label: 'Resolved' },
  ACCEPTED: { bg: 'rgb(var(--rgb-ink-secondary) / 0.16)', fg: 'var(--ap-fg-secondary)', label: 'Accepted' },
}

function initialsOf(name?: string | null): string {
  return (name || '?').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function risksQueryKey(parent: Props['parent']) {
  return ['risks', parent.type, parent.id] as const
}

async function fetchRisks(parent: Props['parent']): Promise<Risk[]> {
  const qs = parent.type === 'objective' ? `objectiveId=${parent.id}` : `keyResultId=${parent.id}`
  const res = await fetch(`/api/risks?${qs}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Failed to load risks')
  return json.data as Risk[]
}

export default function RisksPanel({ parent, currentUserId, currentUserRole, canReport = true, onCountChange }: Props) {
  const qc = useQueryClient()
  const queryKey = risksQueryKey(parent)
  const { data: risks = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchRisks(parent),
  })

  // emit count changes
  useMemo(() => { onCountChange?.(risks.length) }, [risks.length, onCountChange])

  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Risk | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Risk | null>(null)

  const isAdmin = currentUserRole === 'ADMIN' || currentUserRole === 'EXECUTIVE'

  const sorted = useMemo(() => {
    return [...risks].sort((a, b) => {
      const r = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      if (r !== 0) return r
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [risks])

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/risks/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Delete failed')
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); setConfirmDelete(null) },
  })

  return (
    <div className="px-4 py-3 max-h-[460px] overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">Risks</span>
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-micro font-semibold tabular-nums"
            style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}>
            {risks.length}
          </span>
        </div>
        {canReport && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-3.5" /> Add risk
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading risks">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-[var(--ap-radius-sm)]" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          bare
          icon={AlertTriangle}
          title="No risks logged"
          description={canReport ? 'Flag a blocker if you spot one' : 'Owners and editors can flag blockers here'}
        />
      ) : (
        <ul className="space-y-2">
          {sorted.map((risk) => {
            const canEdit = isAdmin || risk.reporterId === currentUserId
            return (
              <RiskCard
                key={risk.id}
                risk={risk}
                canEdit={canEdit}
                onEdit={() => setEditing(risk)}
                onDelete={() => setConfirmDelete(risk)}
              />
            )
          })}
        </ul>
      )}

      {addOpen && canReport && (
        <RiskFormModal
          mode="add"
          parent={parent}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); qc.invalidateQueries({ queryKey }) }}
        />
      )}

      {editing && (
        <RiskFormModal
          mode="edit"
          risk={editing}
          parent={parent}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey }) }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete risk?"
        message={confirmDelete ? `"${confirmDelete.title}" will be permanently removed.` : ''}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMut.isPending}
        onConfirm={() => { if (confirmDelete) deleteMut.mutate(confirmDelete.id) }}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  )
}

function RiskCard({
  risk, canEdit, onEdit, onDelete,
}: { risk: Risk; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const sev = SEVERITY_STYLE[risk.severity]
  const stat = STATUS_STYLE[risk.status]
  const [openMit, setOpenMit] = useState(false)

  return (
    <li
      className="group rounded-[var(--ap-radius-sm)] border p-3 hover:bg-[var(--ap-bg-hover)] transition-colors"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Pill bg={sev.bg} fg={sev.fg}>{sev.label}</Pill>
        <Pill bg={stat.bg} fg={stat.fg}>{stat.label}</Pill>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-1 transition-opacity">
              <button type="button" onClick={onEdit} aria-label="Edit risk"
                className="p-1 rounded hover:bg-[var(--ap-bg-sunken)]">
                <Pencil className="size-3 text-muted-foreground" />
              </button>
              <button type="button" onClick={onDelete} aria-label="Delete risk"
                className="p-1 rounded hover:bg-[var(--ap-bg-sunken)]">
                <Trash2 className="size-3 text-muted-foreground" />
              </button>
            </div>
          )}
          {/* Full name on hover (docs/user_name_hover_REQUIREMENTS.md UNH-2). */}
          <PersonTooltip person={risk.reporter} detail="Reported this risk">
          {risk.reporter.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={risk.reporter.avatar} alt={risk.reporter.name}
              className="size-5 rounded-full object-cover" />
          ) : (
            <span role="img" aria-label={risk.reporter.name}
              className="flex size-5 items-center justify-center rounded-full text-[9px] font-semibold"
              style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}>
              <span aria-hidden>{initialsOf(risk.reporter.name)}</span>
            </span>
          )}
          </PersonTooltip>
          <span className="text-micro text-muted-foreground tabular-nums">
            {formatDistanceToNow(new Date(risk.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      <p className="text-sm font-medium leading-snug">{risk.title}</p>
      {risk.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{risk.description}</p>
      )}

      {risk.mitigation && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpenMit((v) => !v)}
            className="flex items-center gap-1 text-micro uppercase tracking-wide font-semibold text-muted-foreground hover:text-[var(--ap-fg)]"
          >
            {openMit ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Mitigation
          </button>
          {openMit && (
            <p className="mt-1 text-xs rounded-[8px] px-2.5 py-1.5"
              style={{ background: 'var(--ap-bg-sunken)' }}>
              {risk.mitigation}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

function Pill({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-micro font-semibold uppercase tracking-wide"
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  )
}

interface FormFields {
  title: string
  description: string
  severity: Severity
  status: Status
  mitigation: string
}

function RiskFormModal({
  mode, risk, parent, onClose, onSaved,
}: {
  mode: 'add' | 'edit'
  risk?: Risk
  parent: Props['parent']
  onClose: () => void
  onSaved: () => void
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormFields>({
    defaultValues: {
      title: risk?.title ?? '',
      description: risk?.description ?? '',
      severity: risk?.severity ?? 'MEDIUM',
      status: risk?.status ?? 'OPEN',
      mitigation: risk?.mitigation ?? '',
    },
  })
  const severity = watch('severity')
  const status = watch('status')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (values: FormFields) => {
    setError(null)
    try {
      if (mode === 'add') {
        const body: Record<string, unknown> = {
          title: values.title,
          description: values.description || undefined,
          severity: values.severity,
          mitigation: values.mitigation || undefined,
        }
        if (parent.type === 'objective') body.objectiveId = parent.id
        else body.keyResultId = parent.id
        const res = await fetch('/api/risks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Failed to add risk')
      } else if (risk) {
        const res = await fetch(`/api/risks/${risk.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: values.title,
            description: values.description,
            severity: values.severity,
            status: values.status,
            mitigation: values.mitigation,
          }),
        })
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Failed to update risk')
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'add' ? 'Add risk' : 'Edit risk'}
      icon={AlertTriangle}
      size="md"
      className="ap-modal-enter"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="risk-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : mode === 'add' ? 'Add risk' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="risk-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-1">
        <div>
          <label className="text-caption font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Title</label>
          <Input
            {...register('title', { required: 'Title is required', minLength: { value: 2, message: 'Too short' } })}
            placeholder="What's the risk?"
            autoFocus
          />
          {errors.title && <p className="mt-1 text-caption text-destructive">{errors.title.message}</p>}
        </div>

        <div>
          <label className="text-caption font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Description</label>
          <Textarea
            {...register('description')}
            placeholder="Optional context — what's at stake, when it could hit"
            rows={3}
          />
        </div>

        <div>
          <label className="text-caption font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">Severity</label>
          <Segmented
            options={[
              { value: 'LOW', label: 'Low' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HIGH', label: 'High' },
              { value: 'CRITICAL', label: 'Critical' },
            ]}
            value={severity}
            onChange={(v) => setValue('severity', v as Severity, { shouldDirty: true })}
          />
        </div>

        {mode === 'edit' && (
          <div>
            <label className="text-caption font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">Status</label>
            <Segmented
              options={[
                { value: 'OPEN', label: 'Open' },
                { value: 'MITIGATING', label: 'Mitigating' },
                { value: 'RESOLVED', label: 'Resolved' },
                { value: 'ACCEPTED', label: 'Accepted' },
              ]}
              value={status}
              onChange={(v) => setValue('status', v as Status, { shouldDirty: true })}
            />
          </div>
        )}

        <div>
          <label className="text-caption font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Mitigation plan</label>
          <Textarea
            {...register('mitigation')}
            placeholder="Optional — how we'll prevent or recover"
            rows={3}
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    </Modal>
  )
}

function Segmented({
  options, value, onChange,
}: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-[8px] border p-0.5"
      style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 h-7 text-xs rounded-[6px] transition-colors',
            value === opt.value ? 'bg-[var(--ap-bg-raised)] shadow-sm font-medium' : 'text-muted-foreground hover:text-[var(--ap-fg)]',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
