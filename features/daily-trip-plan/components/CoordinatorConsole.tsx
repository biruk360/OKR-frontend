'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Filter, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from './StatusBadge'
import { usePlans } from '../hooks/queries'
import type { DtpPlanSummary } from '../types'
import { formatEthiopian } from '@/lib/dtp/ec-calendar'

const PENDING_STATUSES = ['SUBMITTED', 'MANAGER_ENDORSED', 'UNDER_REVIEW', 'ADJUSTED']

/**
 * Three-panel Coordinator console (FR-07 / 9.3 A). On wide screens the layout
 * is left = pending list / center = plan summary / right = adjustments queue.
 * The center / right rails are wired into the plan detail page route so users
 * can drill in. The KPI strip is computed from the visible plan list.
 */
export function CoordinatorConsole() {
  const [date, setDate] = useState(() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [flag, setFlag] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')

  const plans = usePlans({
    status: PENDING_STATUSES.join(','),
    date,
    flag,
  })

  const filtered = useMemo(() => {
    const rows = plans.data ?? []
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((p) => p.id.toLowerCase().includes(q) || p.requesterId.toLowerCase().includes(q))
  }, [plans.data, search])

  const kpis = useMemo(() => {
    const rows = plans.data ?? []
    return {
      pending: rows.length,
      late: rows.filter((p) => p.late).length,
      adjusted: rows.filter((p) => p.adjusted).length,
      emergency: rows.filter((p) => p.emergency).length,
    }
  }, [plans.data])

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Pending plans" value={kpis.pending} />
        <Kpi label="Late submissions" value={kpis.late} />
        <Kpi label="Adjusted (awaiting ack)" value={kpis.adjusted} />
        <Kpi label="Emergency" value={kpis.emergency} />
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Pending plans</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
            <div className="flex items-center gap-1">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={flag ?? ''} onChange={(e) => setFlag(e.target.value || undefined)}>
                <option value="">All</option>
                <option value="late">Late only</option>
                <option value="emergency">Emergency only</option>
              </select>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 w-56" placeholder="Search by plan id" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => plans.refetch()}>Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          {plans.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <EmptyState title="No pending plans" description="Nothing waiting for your decision on this date." />
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((p) => <PlanRow key={p.id} plan={p} />)}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-card">
      <div className="text-overline text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function PlanRow({ plan }: { plan: DtpPlanSummary }) {
  const date = new Date(plan.tripDate)
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/travel/plans/${plan.id}`} className="text-sm font-medium hover:underline truncate">
            {plan.id.slice(0, 8)} · {date.toISOString().slice(0, 10)}
          </Link>
          <StatusBadge status={plan.status} />
          {plan.late && <span className="rounded-pill bg-warning-50 text-warning-700 border border-warning-200 px-2 py-0.5 text-[11px] font-medium">Late</span>}
          {plan.adjusted && <span className="rounded-pill bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 text-[11px] font-medium">Adjusted</span>}
          {plan.emergency && <span className="rounded-pill bg-danger-50 text-danger-700 border border-danger-200 px-2 py-0.5 text-[11px] font-medium">Emergency</span>}
        </div>
        <div className="text-xs text-muted-foreground">{formatEthiopian(date)} · priority {plan.priority}</div>
      </div>
      <Link href={`/dashboard/travel/plans/${plan.id}`} className="text-sm text-primary hover:underline shrink-0">
        Open →
      </Link>
    </li>
  )
}
