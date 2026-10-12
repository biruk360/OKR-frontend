'use client'

/**
 * Role & duties tab — the duties half (PRF-13). Duties grouped by cadence
 * (Daily → Yearly → Every sprint → Event), each a DutyCard. Fetches through
 * its own hook and shows actions only when the API's `permissions` allow.
 *
 * Profile composition contract: `<DutiesProfileTab userId timeframeId />`.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Lock, Plus, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { DUTY_CADENCE_LABELS, DUTY_CADENCE_ORDER, type DutyCadence } from '@/types/package'
import { combineAdherence, type AdherenceWindow } from '../services/adherence'
import { useDeleteDuty, useDutyAction, useDuties } from '../hooks/queries'
import type { DutyDTO } from '../types'
import { DutyCard, adherenceTone, type DutyCardAction } from './DutyCard'
import { DutyFormModal } from './DutyFormModal'
import { LogOccurrenceModal } from './LogOccurrenceModal'

export interface DutiesProfileTabProps {
  userId: string
  timeframeId: string
  /** Per-duty slot, e.g. the package review Agree / Dispute controls (PKG-2). */
  renderItemActions?: (duty: DutyDTO) => ReactNode
}

type Confirm = { kind: 'retire' | 'delete'; duty: DutyDTO } | null

function groupByCadence(duties: DutyDTO[]): Array<{ cadence: DutyCadence; duties: DutyDTO[] }> {
  const map = new Map<DutyCadence, DutyDTO[]>()
  for (const d of duties) {
    const list = map.get(d.cadence) ?? []
    list.push(d)
    map.set(d.cadence, list)
  }
  return DUTY_CADENCE_ORDER.filter((c) => map.has(c)).map((c) => ({ cadence: c, duties: map.get(c) ?? [] }))
}

function LoadingState() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading duties">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-28 w-full rounded-card" />
      <Skeleton className="h-28 w-full rounded-card" />
    </div>
  )
}

export function DutiesProfileTab({ userId, timeframeId, renderItemActions }: DutiesProfileTabProps) {
  const { data, isLoading, isError, error, refetch } = useDuties(userId, timeframeId)
  const dutyAction = useDutyAction()
  const deleteDuty = useDeleteDuty()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DutyDTO | null>(null)
  const [logging, setLogging] = useState<DutyDTO | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [showRetired, setShowRetired] = useState(false)

  const duties = useMemo(() => data?.duties ?? [], [data])
  const live = useMemo(() => duties.filter((d) => d.status !== 'RETIRED'), [duties])
  const retired = useMemo(() => duties.filter((d) => d.status === 'RETIRED'), [duties])
  const groups = useMemo(() => groupByCadence(live), [live])
  const overall: AdherenceWindow = useMemo(() => combineAdherence(live.map((d) => d.adherence.d30)), [live])
  const permissions = data?.permissions

  const busyId = dutyAction.isPending ? dutyAction.variables?.id : deleteDuty.isPending ? deleteDuty.variables : null

  const handleAction = (action: DutyCardAction, duty: DutyDTO) => {
    switch (action) {
      case 'edit':
        setEditing(duty)
        setFormOpen(true)
        return
      case 'log':
        setLogging(duty)
        return
      case 'pause':
      case 'resume':
        dutyAction.mutate({ id: duty.id, action })
        return
      case 'retire':
      case 'delete':
        setConfirm({ kind: action, duty })
        return
    }
  }

  const runConfirm = async () => {
    if (!confirm) return
    try {
      if (confirm.kind === 'retire') await dutyAction.mutateAsync({ id: confirm.duty.id, action: 'retire' })
      else await deleteDuty.mutateAsync(confirm.duty.id)
      setConfirm(null)
    } catch {
      // Toast shown by the mutation; keep the dialog so the user sees the context.
      setConfirm(null)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  if (isLoading) return <LoadingState />

  if (isError) {
    const status = (error as { status?: number } | null)?.status
    if (status === 403) {
      return (
        <EmptyState
          icon={Lock}
          title="Duties are private"
          description="You can see a person's recurring duties when you are them, their manager, in their department, or HR."
        />
      )
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load duties"
        description={(error as Error | null)?.message ?? 'Something went wrong.'}
        action={{ label: 'Try again', onClick: () => void refetch() }}
      />
    )
  }

  return (
    <section className="space-y-4" aria-label="Recurring duties">
      <SectionHeading
        title="Recurring duties"
        as="h3"
        right={
          <div className="flex items-center gap-2">
            {live.length > 0 && (
              <span className="inline-flex items-center gap-1 text-caption text-[var(--ap-fg-muted)]">
                30-day adherence
                <MiniBadge tone={adherenceTone(overall.rate)} mono>
                  {overall.rate === null ? '—' : `${overall.rate}%`}
                </MiniBadge>
              </span>
            )}
            {permissions?.canCreate && (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                Add duty
              </Button>
            )}
          </div>
        }
      />

      {permissions?.readOnly && (
        <p className="inline-flex items-center gap-1.5 text-caption text-[var(--ap-fg-muted)]">
          <Lock className="size-3.5" aria-hidden />
          This timeframe has ended — its duties are read-only.
        </p>
      )}

      {live.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring duties"
          description="A recurring duty is work on a fixed cadence that is part of the role — it can create a to-do automatically every time it is due."
          action={permissions?.canCreate ? { label: 'Add duty', onClick: openCreate } : undefined}
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.cadence} className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-caption font-semibold uppercase tracking-wide text-[var(--ap-fg-subtle)]">
                  {DUTY_CADENCE_LABELS[group.cadence]}
                </h4>
                <MiniBadge mono>{group.duties.length}</MiniBadge>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {group.duties.map((duty) => (
                  <DutyCard key={duty.id} duty={duty} onAction={handleAction} busy={busyId === duty.id} extra={renderItemActions?.(duty)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {retired.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[var(--ap-radius-sm)] text-caption font-semibold text-[var(--ap-fg-muted)] ap-focus-ring hover:text-[var(--ap-fg)]"
            onClick={() => setShowRetired((v) => !v)}
            aria-expanded={showRetired}
          >
            {showRetired ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
            Retired ({retired.length})
          </button>
          {showRetired && (
            <div className="grid gap-2 lg:grid-cols-2">
              {retired.map((duty) => (
                <DutyCard key={duty.id} duty={duty} onAction={handleAction} busy={busyId === duty.id} extra={renderItemActions?.(duty)} />
              ))}
            </div>
          )}
        </div>
      )}

      <DutyFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        ownerId={userId}
        timeframeId={timeframeId}
        duty={editing}
      />
      <LogOccurrenceModal open={Boolean(logging)} onClose={() => setLogging(null)} duty={logging} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        variant={confirm?.kind === 'delete' ? 'danger' : 'warning'}
        title={confirm?.kind === 'delete' ? 'Delete duty' : 'Retire duty'}
        message={
          confirm?.kind === 'delete'
            ? `Delete "${confirm?.duty.title}" and its open to-dos? This cannot be undone.`
            : `Retire "${confirm?.duty.title ?? ''}"? It stops creating to-dos and moves to Retired. Its history and adherence are kept.`
        }
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : 'Retire'}
        isLoading={dutyAction.isPending || deleteDuty.isPending}
      />
    </section>
  )
}
