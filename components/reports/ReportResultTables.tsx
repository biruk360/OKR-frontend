'use client'

/**
 * The three tab bodies of the /dashboard/reports results card (key results
 * grouped by objective, objectives, initiatives). Split out of
 * ReportDashboardClient.tsx (2026-09-25) — no behaviour change.
 */
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import StatusPill from '@/components/shared/StatusPill'
import { PersonTooltip } from '@/components/shared/UserAvatar'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  initials,
  statusToPillKey,
  type ReportKrWithStatus,
  type ReportObjectiveRow,
  type ReportTodoRow,
} from './report-dashboard-utils'

const KR_COLUMNS = 'minmax(0,2.5fr) minmax(120px,1fr) 160px 60px'
const OBJECTIVE_COLUMNS = 'minmax(0,2.5fr) minmax(120px,1fr) 80px 80px 60px'
const INITIATIVE_COLUMNS = 'minmax(0,2.5fr) minmax(140px,1fr) 110px 120px'

const ROW_CLASS =
  'grid items-center gap-2 px-4 py-2.5 border-b transition-colors hover:bg-[var(--ap-bg-hover)]'
const HEAD_CLASS =
  'grid items-center gap-2 px-4 text-micro font-semibold uppercase tracking-wide text-muted-foreground border-b'

function OwnerInitials({ name, detail }: { name: string; detail: string }) {
  return (
    <PersonTooltip person={{ name }} detail={detail}>
      <span
        role="img"
        aria-label={name}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-micro font-semibold"
        style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
      >
        <span aria-hidden>{initials(name)}</span>
      </span>
    </PersonTooltip>
  )
}

export function ReportKeyResultsTable({
  sortedKrs,
  groupedByObjective,
  expandedObjectives,
  onToggleObjective,
  tableLimit,
  onLoadMore,
}: {
  sortedKrs: ReportKrWithStatus[]
  groupedByObjective: Map<string, ReportKrWithStatus[]>
  expandedObjectives: Record<string, boolean>
  onToggleObjective: (id: string) => void
  tableLimit: number
  onLoadMore: () => void
}) {
  if (sortedKrs.length === 0) {
    return (
      <div className="p-2">
        <EmptyState bare title="No key results match these filters" description="Adjust filters above or reset to start over." />
      </div>
    )
  }

  return (
    <div className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
      {Array.from(groupedByObjective.entries()).map(([objId, rows]) => {
        const title = rows[0]?.objectiveTitle ?? 'Objective'
        const open = expandedObjectives[objId] ?? true
        return (
          <div key={objId}>
            <button
              type="button"
              onClick={() => onToggleObjective(objId)}
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold text-foreground"
              style={{ background: 'var(--ap-bg-sunken)' }}
            >
              {open ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="truncate">{title}</span>
            </button>
            {open && (
              <div className="overflow-x-auto">
                <div className={`${HEAD_CLASS} py-1.5`} style={{ borderColor: 'var(--ap-border)', gridTemplateColumns: KR_COLUMNS }}>
                  <div>Key result</div>
                  <div className="hidden sm:block">Plan</div>
                  <div>Progress</div>
                  <div>Owner</div>
                </div>
                {rows.map((kr) => (
                  <div key={kr.id} className={ROW_CLASS} style={{ borderColor: 'var(--ap-border)', gridTemplateColumns: KR_COLUMNS }}>
                    <Link
                      href={`/dashboard/key-results/${kr.id}`}
                      className="text-body-sm font-medium text-foreground hover:underline truncate"
                    >
                      {kr.title}
                    </Link>
                    <div className="hidden sm:block text-xs text-muted-foreground truncate">{kr.planLabel}</div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={statusToPillKey(kr.displayStatus)} size="xs" />
                      <span className="text-xs tabular-nums text-muted-foreground">{Math.round(kr.progress)}%</span>
                    </div>
                    <div>
                      <OwnerInitials name={kr.ownerName} detail="Key result owner" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {sortedKrs.length > tableLimit && (
        <div className="border-t p-3 text-center no-print" style={{ borderColor: 'var(--ap-border)' }}>
          <button
            type="button"
            onClick={onLoadMore}
            className="text-xs font-semibold"
            style={{ color: 'var(--ap-accent)' }}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  )
}

export function ReportObjectivesTable({ objectives }: { objectives: ReportObjectiveRow[] }) {
  if (objectives.length === 0) {
    return (
      <div className="p-2">
        <EmptyState bare title="No objectives match these filters" description="Try a broader query or reset filters." />
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div
        className={`${HEAD_CLASS} py-2`}
        style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)', gridTemplateColumns: OBJECTIVE_COLUMNS }}
      >
        <div>Objective</div>
        <div className="hidden sm:block">Plan</div>
        <div>Progress</div>
        <div className="hidden md:block">KRs</div>
        <div>Owner</div>
      </div>
      {objectives.map((o) => (
        <div key={o.id} className={ROW_CLASS} style={{ borderColor: 'var(--ap-border)', gridTemplateColumns: OBJECTIVE_COLUMNS }}>
          <div className="min-w-0">
            <Link href={`/dashboard/objectives/${o.id}`} className="text-body-sm font-medium text-foreground hover:underline truncate block">
              {o.title}
            </Link>
            <div className="text-caption text-muted-foreground">{o.level.replace('_', ' ')}</div>
          </div>
          <div className="hidden sm:block text-xs text-muted-foreground truncate">{o.planLabel}</div>
          <div className="text-xs tabular-nums font-medium text-foreground">{Math.round(o.progress)}%</div>
          <div className="hidden md:block text-xs tabular-nums text-muted-foreground">{o.keyResultCount}</div>
          <div>
            <OwnerInitials name={o.ownerName} detail="Objective owner" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ReportInitiativesTable({ todos }: { todos: ReportTodoRow[] }) {
  if (todos.length === 0) {
    return (
      <div className="p-2">
        <EmptyState bare title="No initiatives in this scope" description="Try clearing the search or filters." />
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div
        className={`${HEAD_CLASS} py-2`}
        style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)', gridTemplateColumns: INITIATIVE_COLUMNS }}
      >
        <div>Initiative</div>
        <div className="hidden lg:block">Key result</div>
        <div>Status</div>
        <div className="hidden md:block">Assignee</div>
      </div>
      {todos.map((t) => (
        <div key={t.id} className={ROW_CLASS} style={{ borderColor: 'var(--ap-border)', gridTemplateColumns: INITIATIVE_COLUMNS }}>
          <div className="min-w-0">
            <div className="text-body-sm font-medium text-foreground truncate">{t.title}</div>
            <div className="text-caption text-muted-foreground truncate">{t.objectiveTitle}</div>
          </div>
          <div className="hidden lg:block text-xs text-muted-foreground truncate">
            <Link href={`/dashboard/key-results/${t.keyResultId}`} className="hover:underline">{t.krTitle}</Link>
          </div>
          <div>
            <StatusPill status={t.status.toLowerCase().replace(/_/g, '-')} size="xs" />
          </div>
          <div className="hidden md:block text-xs text-muted-foreground truncate">{t.assigneeName}</div>
        </div>
      ))}
    </div>
  )
}
