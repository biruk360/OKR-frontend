'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { ProjectDatePicker } from '../ProjectDatePicker'
import {
  RAID_DEPENDENCY_PARTIES,
  RAID_SEVERITIES,
  RAID_STATUSES,
  RAID_TYPES,
  type RaidType,
} from '../../types'
import {
  useAddRaidItem,
  useCreateRaidDelay,
  useDeleteRaidItem,
  useRaidItems,
  useUpdateRaidItem,
  type RaidItemNode,
} from '../../hooks/useProject'

const TYPE_LABEL: Record<RaidType, string> = {
  RISK: 'Risks',
  ASSUMPTION: 'Assumptions',
  ISSUE: 'Issues',
  DEPENDENCY: 'Dependencies',
}

export function RaidRegister({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [activeType, setActiveType] = useState<RaidType>('RISK')
  const { data: allItems, isLoading } = useRaidItems(projectId)
  const addRaid = useAddRaidItem(projectId)
  const updateRaid = useUpdateRaidItem(projectId)
  const deleteRaid = useDeleteRaidItem(projectId)
  const createDelay = useCreateRaidDelay(projectId)
  const { users } = useUsersForSelection({ enabled: canEdit })
  const [draft, setDraft] = useState(() => initialDraft('RISK'))

  const items = allItems ?? []
  const visible = items.filter((item) => item.type === activeType)
  const riskItems = items.filter((item) => item.type === 'RISK')
  const redRiskCount = riskItems.filter((item) => item.riskTone === 'RED' && item.status !== 'CLOSED').length

  const switchType = (type: RaidType) => {
    setActiveType(type)
    setDraft(initialDraft(type))
  }

  const submit = async () => {
    if (!draft.title.trim()) return
    await addRaid.mutateAsync(normalizeDraft(draft))
    setDraft(initialDraft(activeType))
  }

  if (isLoading) return <Skeleton className="h-80 w-full rounded-card" />

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {RAID_TYPES.map((type) => {
          const count = items.filter((item) => item.type === type).length
          return (
            <button
              key={type}
              className={cn('rounded-md px-3 py-1.5 text-body-sm font-medium', activeType === type ? 'bg-primary-500 text-white' : 'bg-surface-muted text-ink-secondary hover:text-ink-primary')}
              onClick={() => switchType(type)}
            >
              {TYPE_LABEL[type]} <span className="ml-1 opacity-75">{count}</span>
            </button>
          )
        })}
        {redRiskCount > 0 && (
          <span className="ml-auto rounded-pill bg-danger-50 px-2.5 py-1 text-body-sm font-medium text-danger-700">
            {redRiskCount} red {redRiskCount === 1 ? 'risk' : 'risks'} feeding confidence
          </span>
        )}
      </div>

      {activeType === 'RISK' && <RiskMatrix items={riskItems} />}

      {canEdit && (
        <div className="mb-4 rounded-card border border-black/[0.08] p-3">
          <div className="mb-2 text-body-sm font-medium text-ink-primary">Add {TYPE_LABEL[activeType].slice(0, -1)}</div>
          <div className="grid gap-2 md:grid-cols-4">
            <input className="input" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Title" />
            <input className="input" value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} placeholder="Category" />
            <select className="input" value={draft.ownerId} onChange={(e) => setDraft((d) => ({ ...d, ownerId: e.target.value }))}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
            </select>
            <label className="flex items-center gap-2 rounded-md border border-black/[0.08] px-2 text-body-sm">
              <input type="checkbox" checked={draft.clientVisible} onChange={(e) => setDraft((d) => ({ ...d, clientVisible: e.target.checked }))} />
              Client-visible
            </label>
          </div>
          <textarea className="input mt-2 w-full" rows={2} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Description" />
          <TypeFields type={activeType} draft={draft} setDraft={setDraft} />
          <div className="mt-2 flex justify-end">
            <button className="btn btn-primary btn-sm" disabled={!draft.title.trim() || addRaid.isPending} onClick={() => void submit()}>
              <Plus className="mr-1 size-3.5" /> Add
            </button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState icon={ShieldAlert} title={`No ${TYPE_LABEL[activeType].toLowerCase()} logged`} description="RAID items added here become part of the project governance record." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-black/[0.08] text-left text-ink-tertiary">
                <th className="px-2 py-1.5 font-medium">Ref</th>
                <th className="px-2 py-1.5 font-medium">Item</th>
                <th className="px-2 py-1.5 font-medium">Owner</th>
                <th className="px-2 py-1.5 font-medium">Type Fields</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5 font-medium">Client</th>
                <th className="px-2 py-1.5 font-medium">Age</th>
                {canEdit && <th className="px-2 py-1.5 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {visible.map((item) => (
                <RaidRow
                  key={item.id}
                  item={item}
                  canEdit={canEdit}
                  onUpdate={(patch) => updateRaid.mutate({ raidId: item.id, ...patch })}
                  onDelete={() => deleteRaid.mutate({ raidId: item.id })}
                  onDelay={() => createDelay.mutate({ raidId: item.id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RiskMatrix({ items }: { items: RaidItemNode[] }) {
  const cells = useMemo(() => {
    const map = new Map<string, RaidItemNode[]>()
    for (const item of items) {
      if (!item.probability || !item.impact) continue
      const key = `${item.probability}:${item.impact}`
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return map
  }, [items])

  return (
    <div className="mb-4 grid gap-2 lg:grid-cols-[220px_1fr]">
      <div className="rounded-card border border-black/[0.08] p-3">
        <div className="text-body-sm font-medium text-ink-primary">Risk Matrix</div>
        <div className="mt-1 text-[12px] text-ink-tertiary">Probability × Impact. Red risks are counted by project confidence.</div>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {[5, 4, 3, 2, 1].flatMap((probability) =>
          [1, 2, 3, 4, 5].map((impact) => {
            const score = probability * impact
            const itemsInCell = cells.get(`${probability}:${impact}`) ?? []
            return (
              <div key={`${probability}-${impact}`} className={cn('min-h-14 rounded-md border p-1 text-[11px]', matrixTone(score))}>
                <div className="flex justify-between font-medium">
                  <span>P{probability}/I{impact}</span>
                  <span>{score}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {itemsInCell.slice(0, 5).map((item) => (
                    <span key={item.id} title={`${item.refCode}: ${item.title}`} className="size-2 rounded-full bg-current" />
                  ))}
                  {itemsInCell.length > 5 && <span>+{itemsInCell.length - 5}</span>}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function TypeFields({ type, draft, setDraft }: { type: RaidType; draft: RaidDraft; setDraft: (fn: (draft: RaidDraft) => RaidDraft) => void }) {
  if (type === 'RISK') {
    return (
      <div className="mt-2 grid gap-2 md:grid-cols-4">
        <NumberSelect label="Probability" value={draft.probability} onChange={(v) => setDraft((d) => ({ ...d, probability: v }))} />
        <NumberSelect label="Impact" value={draft.impact} onChange={(v) => setDraft((d) => ({ ...d, impact: v }))} />
        <input className="input" value={draft.mitigation} onChange={(e) => setDraft((d) => ({ ...d, mitigation: e.target.value }))} placeholder="Mitigation" />
        <input className="input" value={draft.contingency} onChange={(e) => setDraft((d) => ({ ...d, contingency: e.target.value }))} placeholder="Contingency" />
      </div>
    )
  }
  if (type === 'ISSUE') {
    return (
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <select className="input" value={draft.severity} onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value }))}>
          {RAID_SEVERITIES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
        </select>
        <input className="input" value={draft.resolution} onChange={(e) => setDraft((d) => ({ ...d, resolution: e.target.value }))} placeholder="Resolution plan" />
      </div>
    )
  }
  if (type === 'DEPENDENCY') {
    return (
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <select className="input" value={draft.dependsOnParty} onChange={(e) => setDraft((d) => ({ ...d, dependsOnParty: e.target.value }))}>
          <option value="">Depends on...</option>
          {RAID_DEPENDENCY_PARTIES.map((p) => <option key={p} value={p}>{p === '360GROUND' ? '360Ground' : labelize(p)}</option>)}
        </select>
        <ProjectDatePicker value={draft.neededByDate} onChange={(neededByDate) => setDraft((d) => ({ ...d, neededByDate }))} ariaLabel="Dependency needed by date" />
      </div>
    )
  }
  return (
    <div className="mt-2 grid gap-2 md:grid-cols-2">
      <label className="flex items-center gap-2 rounded-md border border-black/[0.08] px-2 text-body-sm">
        <input type="checkbox" checked={draft.validated} onChange={(e) => setDraft((d) => ({ ...d, validated: e.target.checked }))} />
        Validated
      </label>
      <input className="input" value={draft.impactIfFalse} onChange={(e) => setDraft((d) => ({ ...d, impactIfFalse: e.target.value }))} placeholder="Impact if false" />
    </div>
  )
}

function RaidRow({ item, canEdit, onUpdate, onDelete, onDelay }: {
  item: RaidItemNode
  canEdit: boolean
  onUpdate: (patch: Record<string, unknown>) => void
  onDelete: () => void
  onDelay: () => void
}) {
  return (
    <tr>
      <td className="px-2 py-2 font-medium text-ink-primary">{item.refCode}</td>
      <td className="max-w-xs px-2 py-2">
        <div className="font-medium text-ink-primary">{item.title}</div>
        {item.description && <div className="line-clamp-2 text-[12px] text-ink-tertiary">{item.description}</div>}
      </td>
      <td className="px-2 py-2 text-ink-secondary">{item.owner?.name ?? 'Unassigned'}</td>
      <td className="px-2 py-2 text-ink-secondary">{typeSummary(item)}</td>
      <td className="px-2 py-2">
        {canEdit ? (
          <select className="rounded-md border border-black/[0.08] bg-surface-card px-2 py-1" value={item.status} onChange={(e) => onUpdate({ status: e.target.value })}>
            {RAID_STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
          </select>
        ) : labelize(item.status)}
      </td>
      <td className="px-2 py-2">
        {canEdit ? (
          <button className={cn('rounded-md px-2 py-1 text-[12px] font-medium', item.clientVisible ? 'bg-success-50 text-success-700' : 'bg-surface-muted text-ink-secondary')} onClick={() => onUpdate({ clientVisible: !item.clientVisible })}>
            <Eye className="mr-1 inline size-3" /> {item.clientVisible ? 'Visible' : 'Internal'}
          </button>
        ) : item.clientVisible ? 'Visible' : 'Internal'}
      </td>
      <td className="px-2 py-2">
        <span className={cn('text-ink-secondary', item.isOverdueClientDependency && 'font-medium text-danger-700')}>
          {item.daysOpen}d
          {item.isOverdueClientDependency && <AlertTriangle className="ml-1 inline size-3.5" />}
        </span>
      </td>
      {canEdit && (
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            {item.isOverdueClientDependency && (
              <button className="btn btn-outline btn-sm" onClick={onDelay}>
                <CheckCircle2 className="mr-1 size-3.5" /> Delay
              </button>
            )}
            <button className="rounded p-1 text-danger-600 hover:bg-danger-50" onClick={onDelete} title="Delete">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}

interface RaidDraft {
  type: RaidType
  title: string
  description: string
  category: string
  ownerId: string
  clientVisible: boolean
  probability: string
  impact: string
  mitigation: string
  contingency: string
  severity: string
  resolution: string
  dependsOnParty: string
  neededByDate: string
  validated: boolean
  impactIfFalse: string
}

function initialDraft(type: RaidType): RaidDraft {
  return {
    type,
    title: '',
    description: '',
    category: '',
    ownerId: '',
    clientVisible: false,
    probability: type === 'RISK' ? '3' : '',
    impact: type === 'RISK' ? '3' : '',
    mitigation: '',
    contingency: '',
    severity: 'MEDIUM',
    resolution: '',
    dependsOnParty: '',
    neededByDate: '',
    validated: false,
    impactIfFalse: '',
  }
}

function normalizeDraft(draft: RaidDraft): Record<string, unknown> {
  return {
    ...draft,
    description: draft.description.trim() || null,
    category: draft.category.trim() || null,
    ownerId: draft.ownerId || null,
    probability: draft.probability ? Number(draft.probability) : null,
    impact: draft.impact ? Number(draft.impact) : null,
    mitigation: draft.mitigation.trim() || null,
    contingency: draft.contingency.trim() || null,
    resolution: draft.resolution.trim() || null,
    dependsOnParty: draft.dependsOnParty || null,
    neededByDate: draft.neededByDate || null,
    impactIfFalse: draft.impactIfFalse.trim() || null,
  }
}

function NumberSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{label}: {n}</option>)}
    </select>
  )
}

function typeSummary(item: RaidItemNode): string {
  if (item.type === 'RISK') return `P${item.probability ?? '-'} × I${item.impact ?? '-'} = ${item.score ?? '-'}`
  if (item.type === 'ISSUE') return `${item.severity ? labelize(item.severity) : 'Unrated'}${item.resolution ? ` · ${item.resolution}` : ''}`
  if (item.type === 'DEPENDENCY') return `${item.dependsOnParty ? labelize(item.dependsOnParty) : 'Unassigned'}${item.neededByDate ? ` · needed ${fmtDate(item.neededByDate)}` : ''}`
  return item.validated ? 'Validated' : item.impactIfFalse ? `Unvalidated · ${item.impactIfFalse}` : 'Unvalidated'
}

function matrixTone(score: number): string {
  if (score >= 15) return 'border-danger-500/30 bg-danger-50 text-danger-700'
  if (score >= 8) return 'border-warning-500/30 bg-warning-50 text-warning-700'
  return 'border-success-500/30 bg-success-50 text-success-700'
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function fmtDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}
