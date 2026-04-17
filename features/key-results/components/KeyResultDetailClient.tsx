'use client'

/**
 * Key Result detail view.
 *
 * Layout mirrors app/dashboard/objectives/[id]/page.tsx exactly: top action bar
 * + breadcrumb, then a 12-column grid (8 main / 4 sidebar). The sections are
 * KR-specific but render in the same slots as objective details, so a user
 * moving between Objective ↔ Key Result sees the same page shape.
 *
 * The client renders everything (breadcrumb, kanban, comments, activity log)
 * so the surrounding server page stays thin — same pattern as the objective page.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Archive,
  Bot,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plug,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  User,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { formatRelativeTime, getProgressBarClass } from '@/lib/utils'
import { formatAxisValue } from '@/lib/keyResultChart'
import KeyResultProgressChart from './KeyResultProgressChart'
import CreateCheckInModal from './CreateCheckInModal'
import { ToDoList } from '@/features/todos'
import EditKeyResultButton from './EditKeyResultButton'
import { useDashboardTitleContext } from '@/components/layout/DashboardTitleContext'
import { ActivityLogPanel } from '@/components/shared/ActivityLogPanel'
import OkrBreadcrumb, { type BreadcrumbNode } from '@/components/shared/OkrBreadcrumb'
import OkrComments from '@/components/shared/OkrComments'
import WorkItemsKanban from '@/components/shared/WorkItemsKanban'

function safePct(p: unknown): number {
  const n = typeof p === 'number' ? p : Number(p)
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(n, 0), 100)
}

/** Mirrors the confidence label helper on the objective page so statuses render identically. */
function confidenceLabel(confidence: string | null | undefined): { label: string; classes: string } | null {
  if (!confidence) return null
  switch (confidence) {
    case 'ON_TRACK': return { label: 'ON TRACK', classes: 'bg-green-100 text-green-800' }
    case 'AT_RISK': return { label: 'AT RISK', classes: 'bg-yellow-100 text-yellow-800' }
    case 'OFF_TRACK': return { label: 'OFF TRACK', classes: 'bg-red-100 text-red-800' }
    default: return null
  }
}

function Avatar({
  name, avatar, size = 'sm',
}: { name: string; avatar?: string | null; size?: 'xs' | 'sm' | 'md' }) {
  const sizeClass = size === 'xs' ? 'h-6 w-6 text-[10px]' : size === 'md' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs'
  if (avatar) {
    return <img src={avatar} alt={name} className={`${sizeClass} rounded-full object-cover`} />
  }
  const initial = (name || '?').slice(0, 1).toUpperCase()
  return (
    <div className={`${sizeClass} rounded-full bg-blue-500 text-white flex items-center justify-center font-medium`}>
      {initial}
    </div>
  )
}

type TimeframeLike = {
  name?: string
  type?: string
  startDate: string | Date
  endDate: string | Date
} | null

export interface KeyResultDetailClientProps {
  keyResult: any
  objective: {
    id: string
    title: string
    level?: string
    timeframe?: TimeframeLike
    department?: { id: string; name: string } | null
    owner?: { id: string; name: string; avatar?: string | null; email?: string | null }
  }
  checkIns: any[]
  siblingNav: {
    index: number
    total: number
    prevId: string | null
    nextId: string | null
  }
  canEdit: boolean
  users: Array<{ id: string; name: string; email: string }>
  isRedacted: boolean
  todoCount: number
  breadcrumbNodes: BreadcrumbNode[]
  /** Initiatives (todos) for the Work Items kanban rendered below the content. */
  initiatives: Array<{ id: string; title: string; status: string; keyResultId?: string | null }>
}

export default function KeyResultDetailClient({
  keyResult: kr,
  objective,
  checkIns,
  siblingNav,
  canEdit,
  users,
  isRedacted,
  todoCount,
  breadcrumbNodes,
  initiatives,
}: KeyResultDetailClientProps) {
  const router = useRouter()
  const { setOverrideTitle } = useDashboardTitleContext()
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setOverrideTitle(kr.title)
    return () => setOverrideTitle(null)
  }, [kr.title, setOverrideTitle])

  const timeframe = objective.timeframe ?? null
  const deadline = timeframe?.endDate != null ? format(new Date(timeframe.endDate), 'MMM d, yyyy') : null
  const unit = kr.unit || ''

  const pct = safePct(kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : kr.progress)
  const progressRounded = Math.round(pct)
  const status = confidenceLabel(kr.confidence)
  const showCheckIn = canEdit && kr.status === 'ACTIVE' && !isRedacted

  const chartCheckIns = isRedacted
    ? []
    : checkIns.map((c) => ({ asOfDate: c.asOfDate, value: c.value }))

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Link copied to clipboard')
    } catch {
      toast.error('Could not copy link')
    }
  }
  const afterMutation = () => router.refresh()

  const TIMELINE_ELEMENT_ID = `kr-timeline-${kr.id}`
  const ACTIVITY_ELEMENT_ID = `kr-activity-${kr.id}`

  const timeframeTypeLabel =
    timeframe?.type === 'MONTHLY' ? 'Monthly'
    : timeframe?.type === 'QUARTERLY' ? 'Quarterly'
    : timeframe?.type === 'SIX_MONTH' ? '6-Month'
    : timeframe?.type === 'YEARLY' ? 'Yearly'
    : ''

  return (
    <div className="space-y-4">
      {/* Top action bar — mirrors the objective page */}
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/objectives/${objective.id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Objective
        </Link>
        <div className="flex items-center space-x-2">
          {showCheckIn && (
            <button
              type="button"
              onClick={() => setCheckInOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border bg-card text-foreground shadow-sm hover:bg-muted"
            >
              Create check-in
            </button>
          )}
          {canEdit && !isRedacted && (
            <EditKeyResultButton keyResult={kr} users={users} canEdit={canEdit} onUpdated={afterMutation} />
          )}
          <button
            type="button"
            onClick={copyShare}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((m) => !m)}
              className="p-2 rounded-md border border-border bg-card text-muted-foreground hover:bg-muted"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-md border border-border bg-card shadow-lg py-1 text-sm">
                  <Link
                    href={`/dashboard/objectives/${objective.id}`}
                    className="block px-3 py-2 text-muted-foreground hover:bg-muted"
                    onClick={() => setMenuOpen(false)}
                  >
                    View objective
                  </Link>
                  <a
                    href={`#${TIMELINE_ELEMENT_ID}`}
                    className="block px-3 py-2 text-muted-foreground hover:bg-muted"
                    onClick={() => setMenuOpen(false)}
                  >
                    Jump to Progress Timeline
                  </a>
                  <a
                    href={`#${ACTIVITY_ELEMENT_ID}`}
                    className="block px-3 py-2 text-muted-foreground hover:bg-muted"
                    onClick={() => setMenuOpen(false)}
                  >
                    Jump to Activity log
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <OkrBreadcrumb nodes={breadcrumbNodes} />

      {siblingNav.total > 1 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {siblingNav.prevId ? (
            <Link
              href={`/dashboard/key-results/${siblingNav.prevId}`}
              className="p-2 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className="p-2 text-muted-foreground"><ChevronLeft className="h-4 w-4" /></span>
          )}
          <span className="px-2 tabular-nums">KR {siblingNav.index + 1} of {siblingNav.total} on this objective</span>
          {siblingNav.nextId ? (
            <Link
              href={`/dashboard/key-results/${siblingNav.nextId}`}
              className="p-2 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="p-2 text-muted-foreground"><ChevronRight className="h-4 w-4" /></span>
          )}
        </div>
      )}

      {/* 12-column grid identical to the objective page */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* -------- Main column -------- */}
        <div className="lg:col-span-8 space-y-4">
          {kr.status === 'ARCHIVED' && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center">
              <Archive className="h-5 w-5 text-orange-600 mr-2" />
              <span className="text-sm font-medium text-orange-800">
                This key result has been archived
              </span>
            </div>
          )}

          {/* Header card: KR badge, title, parent objective, description, big progress */}
          <section className="bg-card shadow rounded-lg p-6">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  <Target className="h-3.5 w-3.5 mr-1" />
                  Key Result
                </span>
                <h1 className="mt-3 text-2xl font-semibold text-foreground leading-tight">
                  {kr.title}
                </h1>
                <div className="mt-2">
                  <Link
                    href={`/dashboard/objectives/${objective.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    <Target className="h-3 w-3 text-muted-foreground" />
                    Supports: {objective.title}
                    {deadline && <span className="text-muted-foreground ml-1">· Target {deadline}</span>}
                  </Link>
                </div>
                {kr.description && !isRedacted && (
                  <p className="mt-3 text-base text-muted-foreground leading-relaxed">{kr.description}</p>
                )}
              </div>

              <div className="flex-shrink-0 text-right min-w-[180px]">
                <div className="flex items-center justify-end gap-2 mb-1">
                  <span className="text-3xl font-bold text-foreground">{progressRounded}%</span>
                  {status && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.classes}`}>
                      {status.label}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">Key Result Progress</div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${getProgressBarClass(pct)}`}
                    style={{ width: `${Math.min(progressRounded, 100)}%` }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  Last updated {formatRelativeTime(kr.updatedAt)}
                </div>
                {!isRedacted && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-muted-foreground">{unit} {formatAxisValue(Number(kr.currentValue) || 0)}</span>
                    {' '} / {unit} {formatAxisValue(Number(kr.targetValue) || 0)}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Check-in history */}
          <section className="bg-card shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Check-in history</h2>
              <span className="text-xs text-muted-foreground">{isRedacted ? '—' : `${checkIns.length} total`}</span>
            </div>

            {!isRedacted && checkIns.length === 0 ? (
              <div className="text-center py-10 px-4 border-2 border-dashed border-border rounded-lg bg-muted/50">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-violet-600 mb-4">
                  <Bot className="h-8 w-8" />
                </div>
                <p className="text-muted-foreground font-medium mb-1">Waiting for the first check-in</p>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Record progress to see trends and history on this key result.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  {showCheckIn && (
                    <button
                      type="button"
                      onClick={() => setCheckInOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                    >
                      Create the first check-in
                    </button>
                  )}
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-sm text-muted-foreground cursor-not-allowed"
                    title="Coming soon"
                  >
                    <Plug className="h-4 w-4" /> Connect a data source
                  </button>
                </div>
              </div>
            ) : !isRedacted ? (
              <ul className="space-y-4">
                {[...checkIns].reverse().map((c) => (
                  <li key={c.id} className="border-l-2 border-blue-500 pl-4 py-1">
                    <div className="flex flex-wrap items-baseline gap-2 text-sm">
                      <time className="font-medium text-foreground">
                        {format(new Date(c.asOfDate), 'PP')}
                      </time>
                      <span className="text-muted-foreground">{unit} {formatAxisValue(c.value)}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          c.confidence === 'ON_TRACK' ? 'bg-green-100 text-green-800'
                          : c.confidence === 'AT_RISK' ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {String(c.confidence).replace(/_/g, ' ')}
                      </span>
                    </div>
                    {c.analysis && (
                      <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{c.analysis}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">by {c.createdBy?.name ?? 'Unknown'}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Check-in history is hidden for this private key result.</p>
            )}
          </section>

          {/* Initiatives under this KR */}
          <section className="bg-card shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Initiatives ({todoCount})
              </h2>
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white opacity-60 cursor-not-allowed"
                title="Coming soon"
              >
                <Sparkles className="h-3 w-3" /> Generate via AI
              </span>
            </div>
            <div className="p-4">
              {!isRedacted ? (
                <ToDoList keyResultId={kr.id} keyResult={kr} users={users} variant="embedded" />
              ) : (
                <p className="text-sm text-muted-foreground">Initiatives are managed from the objective page.</p>
              )}
            </div>
          </section>

          {/* Work items kanban — drag-drop status for this KR's initiatives */}
          {!isRedacted && (
            <WorkItemsKanban
              keyResults={[{
                id: kr.id,
                title: kr.title,
                progress: kr.progress,
                confidence: kr.confidence,
                status: kr.status,
              }]}
              initiatives={initiatives}
              title="Work items"
            />
          )}

          {!isRedacted && (
            <OkrComments endpoint="keyresults" entityId={kr.id} users={users} />
          )}
        </div>

        {/* -------- Sidebar -------- */}
        <aside className="lg:col-span-4 space-y-4">
          <section className="bg-card shadow rounded-lg p-5" id={TIMELINE_ELEMENT_ID}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Progress Timeline
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Expected vs actual</p>
              </div>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <KeyResultProgressChart
              keyResult={kr}
              checkIns={chartCheckIns}
              timeframe={timeframe}
              height={220}
              showTodayMarker={!isRedacted}
            />
          </section>

          <section className="bg-card shadow rounded-lg p-5">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
              Key Result Details
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                  <User className="h-3 w-3 mr-1" /> Owner
                </div>
                <div className="flex items-center space-x-2">
                  <Avatar name={kr.owner?.name ?? '?'} avatar={kr.owner?.avatar} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{kr.owner?.name ?? 'Unknown'}</div>
                    {kr.owner?.email && (
                      <div className="text-xs text-muted-foreground truncate">{kr.owner.email}</div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                  <Target className="h-3 w-3 mr-1" /> Parent Objective
                </div>
                <Link
                  href={`/dashboard/objectives/${objective.id}`}
                  className="block rounded-md border border-border hover:border-border hover:bg-muted transition-colors px-3 py-2"
                >
                  <div className="text-sm font-medium text-foreground line-clamp-2">{objective.title}</div>
                  {objective.level && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {objective.level === 'COMPANY' ? 'Company Objective'
                        : objective.level === 'DEPARTMENT' ? 'Department Objective'
                        : 'Individual Objective'}
                    </div>
                  )}
                </Link>
              </div>

              {timeframe && (
                <div>
                  <div className="flex items-center text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                    <Calendar className="h-3 w-3 mr-1" /> Timeframe
                  </div>
                  <div className="flex items-center gap-2">
                    {timeframe.name && (
                      <span className="text-sm font-medium text-foreground">{timeframe.name}</span>
                    )}
                    {timeframeTypeLabel && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">
                        {timeframeTypeLabel}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {objective.department && (
                <div>
                  <div className="flex items-center text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                    <Building2 className="h-3 w-3 mr-1" /> Department
                  </div>
                  <div className="text-sm font-medium text-foreground">{objective.department.name}</div>
                </div>
              )}

              {!isRedacted && (
                <div>
                  <div className="flex items-center text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
                    <TrendingUp className="h-3 w-3 mr-1" /> Measurement
                  </div>
                  <div className="text-sm text-foreground">
                    Start <span className="font-semibold">{unit} {formatAxisValue(Number(kr.startValue) || 0)}</span>
                    {' '}→ Target <span className="font-semibold">{unit} {formatAxisValue(Number(kr.targetValue) || 0)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Current: {unit} {formatAxisValue(Number(kr.currentValue) || 0)}
                  </div>
                </div>
              )}
            </div>
          </section>

          <div id={ACTIVITY_ELEMENT_ID}>
            <ActivityLogPanel entityType="key-result" entityId={kr.id} />
          </div>
        </aside>
      </div>

      {showCheckIn && (
        <CreateCheckInModal
          isOpen={checkInOpen}
          onClose={() => setCheckInOpen(false)}
          keyResult={kr}
          objectiveTimeframe={timeframe}
          onSuccess={() => {
            setCheckInOpen(false)
            afterMutation()
          }}
        />
      )}
    </div>
  )
}
