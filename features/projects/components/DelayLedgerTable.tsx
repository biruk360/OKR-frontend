'use client'

import { useMemo, useState } from 'react'
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table'
import { AlertTriangle, Download } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { delaysToCsv } from '@/lib/projects/delay-ledger'
import { SLIP_REASON_LABEL, type SlipReason } from '../types'
import {
  useDelayLedger, useUpdateDelayRecovery,
  type DelayLedgerRow, type DelayLedgerFilters,
} from '../hooks/useProject'

const OWNER_LABEL: Record<string, string> = { '360GROUND': '360Ground', CLIENT: 'Client', SHARED: 'Shared' }
const OWNER_TONE: Record<string, string> = {
  CLIENT: 'text-danger-600',
  '360GROUND': 'text-primary-600',
  SHARED: 'text-ink-secondary',
}

const reasonLabel = (r: string) => SLIP_REASON_LABEL[r as SlipReason] ?? r.replace(/_/g, ' ').toLowerCase()
const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

const columnHelper = createColumnHelper<DelayLedgerRow>()

export function DelayLedgerTable({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [filters, setFilters] = useState<DelayLedgerFilters>({})
  const { data, isLoading } = useDelayLedger(projectId, filters)
  const recovery = useUpdateDelayRecovery(projectId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPlan, setEditPlan] = useState('')
  const [editOwner, setEditOwner] = useState('')
  const [editDate, setEditDate] = useState('')

  const columns = useMemo(
    () => [
      columnHelper.accessor('activityTitle', {
        header: 'Activity',
        cell: (c) => (
          <span className="font-medium text-ink-primary">
            {c.getValue() ?? '(deleted activity)'}
            {c.row.original.isAutoDetected && (
              <span className="ml-1.5 rounded-pill bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary" title="Auto-detected by the approval clock">auto</span>
            )}
            {c.row.original.daysLost > 7 && !c.row.original.recoveryPlan && (
              <AlertTriangle className="ml-1.5 inline size-3.5 text-warning-600" aria-label="Over 7 days without a recovery plan" />
            )}
          </span>
        ),
      }),
      columnHelper.accessor('phase', { header: 'Phase', cell: (c) => c.getValue() ?? '—' }),
      columnHelper.accessor('baselineDate', { header: 'Baseline', cell: (c) => fmtDate(c.getValue()) }),
      columnHelper.accessor('currentDate', { header: 'Current', cell: (c) => fmtDate(c.getValue()) }),
      columnHelper.accessor('daysLost', {
        header: 'Slip',
        cell: (c) => <span className="tabular-nums">+{c.getValue()}d</span>,
      }),
      columnHelper.accessor('reason', { header: 'Reason', cell: (c) => reasonLabel(c.getValue()) }),
      columnHelper.accessor('owner', {
        header: 'Owner',
        cell: (c) => <span className={OWNER_TONE[c.getValue()] ?? 'text-ink-secondary'}>{OWNER_LABEL[c.getValue()] ?? c.getValue()}</span>,
      }),
      columnHelper.accessor('slaBreachDays', {
        header: 'SLA',
        cell: (c) =>
          c.getValue() != null ? (
            <span className="rounded-pill bg-danger-50 px-1.5 py-0.5 text-[11px] font-medium text-danger-700">+{c.getValue()}d over</span>
          ) : (
            <span className="text-ink-tertiary">—</span>
          ),
      }),
      columnHelper.accessor('recoveryPlan', {
        header: 'Recovery',
        cell: (c) => {
          const row = c.row.original
          if (editingId === row.id) {
            return (
              <div className="flex flex-col gap-1">
                <input className="input w-40" placeholder="Recovery plan" value={editPlan} onChange={(e) => setEditPlan(e.target.value)} />
                <div className="flex gap-1">
                  <input className="input w-24" placeholder="Owner" value={editOwner} onChange={(e) => setEditOwner(e.target.value)} />
                  <input type="date" className="input" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                </div>
                <div className="flex gap-1">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={recovery.isPending}
                    onClick={() => {
                      recovery.mutate(
                        {
                          delayId: row.id,
                          recoveryPlan: editPlan.trim() || null,
                          recoveryOwner: editOwner.trim() || null,
                          recoveryDate: editDate || null,
                        },
                        { onSuccess: () => setEditingId(null) }
                      )
                    }}
                  >
                    Save
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            )
          }
          const summary = row.recoveryPlan
            ? `${row.recoveryPlan}${row.recoveryOwner ? ` · ${row.recoveryOwner}` : ''}${row.recoveryDate ? ` · ${fmtDate(row.recoveryDate)}` : ''}`
            : null
          if (!canEdit) return <span className="text-ink-secondary">{summary ?? '—'}</span>
          return (
            <button
              className={summary ? 'text-left text-ink-secondary hover:text-ink-primary' : 'text-primary-600 hover:underline'}
              onClick={() => {
                setEditingId(row.id)
                setEditPlan(row.recoveryPlan ?? '')
                setEditOwner(row.recoveryOwner ?? '')
                setEditDate(row.recoveryDate ? row.recoveryDate.slice(0, 10) : '')
              }}
            >
              {summary ?? '+ Add plan'}
            </button>
          )
        },
      }),
    ],
    [canEdit, editingId, editPlan, editOwner, editDate, recovery]
  )

  const rows = data?.rows ?? []
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  if (isLoading) return <Skeleton className="h-64 w-full rounded-card" />

  const totals = data?.totals
  const facets = data?.facets

  const exportCsv = () => {
    const csv = delaysToCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'delay-ledger.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      {/* Header: server-computed totals (over the filtered set) + filters + export */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 text-body-sm">
          <span className="font-medium text-ink-primary">Total: {totals?.total ?? 0}d</span>
          <span className="text-danger-600">Client: {totals?.byOwner.CLIENT ?? 0}d</span>
          <span className="text-primary-600">360Ground: {totals?.byOwner['360GROUND'] ?? 0}d</span>
          {(totals?.byOwner.SHARED ?? 0) > 0 && <span className="text-ink-secondary">Shared: {totals?.byOwner.SHARED}d</span>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <FilterSelect label="All Owners" value={filters.owner ?? ''} options={facets?.owners ?? []} optionLabel={(o) => OWNER_LABEL[o] ?? o}
            onChange={(v) => setFilters((f) => ({ ...f, owner: v || undefined }))} />
          <FilterSelect label="All Reasons" value={filters.reason ?? ''} options={facets?.reasons ?? []} optionLabel={reasonLabel}
            onChange={(v) => setFilters((f) => ({ ...f, reason: v || undefined }))} />
          <FilterSelect label="All Phases" value={filters.phase ?? ''} options={facets?.phases ?? []}
            onChange={(v) => setFilters((f) => ({ ...f, phase: v || undefined }))} />
          <button className="btn btn-outline btn-sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1 size-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No delays recorded" description="Approval waits and baselined slips will appear here automatically." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-black/[0.08] text-left text-ink-tertiary">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-2 py-1.5 font-medium">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-1.5 text-ink-secondary">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilterSelect({
  label, value, options, onChange, optionLabel,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  optionLabel?: (o: string) => string
}) {
  return (
    <select
      className="rounded-md border border-black/[0.08] bg-surface-card px-2 py-1 text-body-sm text-ink-secondary"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{optionLabel ? optionLabel(o) : o}</option>)}
    </select>
  )
}
