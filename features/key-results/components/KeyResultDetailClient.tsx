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

import { useState } from 'react'
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
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { formatRelativeTime } from '@/lib/utils'
import { formatAxisValue } from '@/lib/keyResultChart'
import CreateCheckInModal from './CreateCheckInModal'
import { ToDoList } from '@/features/todos'
import EditKeyResultButton from './EditKeyResultButton'
import { type BreadcrumbNode } from '@/components/shared/OkrBreadcrumb'
import OkrComments from '@/components/shared/OkrComments'
import WorkItemsKanban from '@/components/shared/WorkItemsKanban'
import KrProgressConfidenceCard from '@/components/key-result-detail/KrProgressConfidenceCard'
import KrInspectorTabs from '@/components/key-result-detail/KrInspectorTabs'
import CheckInTimeline from '@/components/key-result-detail/CheckInTimeline'

function safePct(p: unknown): number {
  const n = typeof p === 'number' ? p : Number(p)
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(n, 0), 100)
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
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const timeframe = objective.timeframe ?? null
  const deadline = timeframe?.endDate != null ? format(new Date(timeframe.endDate), 'MMM d, yyyy') : null
  const unit = kr.unit || ''

  const pct = safePct(kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : kr.progress)
  const progressRounded = Math.round(pct)
  const showCheckIn = canEdit && kr.status === 'ACTIVE' && !isRedacted

  // Timeframe-derived metrics for the hero row (mirrors ObjectiveHero).
  let daysLeft = 0
  let weekLabel: string | null = null
  if (timeframe?.endDate) {
    const now = new Date()
    const end = new Date(timeframe.endDate)
    daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    if (timeframe.startDate) {
      const start = new Date(timeframe.startDate)
      const totalWeeks = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7)))
      const weeksElapsed = Math.max(
        0,
        Math.min(totalWeeks, Math.round((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7))),
      )
      weekLabel = `Week ${weeksElapsed} of ${totalWeeks}`
    }
  }

  const ownerInitials = (kr.owner?.name || '?')
    .split(' ')
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const objectiveLevelLabel =
    objective.level === 'COMPANY' ? 'Company'
    : objective.level === 'DEPARTMENT' ? 'Department'
    : objective.level === 'INDIVIDUAL' ? 'Individual'
    : null

  // Numeric confidence: prefer the new `confidenceScore` column; fall back to
  // the legacy enum tier for old rows.
  const confNum = (c: any): number => {
    if (typeof c?.confidenceScore === 'number') return c.confidenceScore
    if (c?.confidence === 'ON_TRACK') return 85
    if (c?.confidence === 'AT_RISK') return 55
    if (c?.confidence === 'OFF_TRACK') return 25
    return 50
  }
  const ordered = [...checkIns].sort(
    (a, b) => new Date(a.asOfDate).getTime() - new Date(b.asOfDate).getTime(),
  )
  const latest = ordered[ordered.length - 1]
  const prev = ordered[ordered.length - 2]
  const currentConfidenceNum = latest ? confNum(latest) : confNum(kr)
  const previousConfidenceNum = prev ? confNum(prev) : null
  const confidenceTrend = ordered.slice(-4).map((c) => confNum(c))

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

  return (
    <div className="space-y-4">
      {/* Apple Pro breadcrumb bar */}
      {(() => {
        const objCodePrefix = objective.level === 'COMPANY' ? 'CO' : objective.level === 'DEPARTMENT' ? 'DE' : 'IN'
        const objCode = `${objCodePrefix}‑${String((objective as any).code ?? '').toString().padStart(2, '0') || objective.id.slice(-4).toUpperCase()}`
        const krCode = `KR${siblingNav.index + 1}`
        return (
          <div className="flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--ap-border)' }}>
            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <Link
                href={`/dashboard/objectives/${objective.id}`}
                className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-muted-foreground transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Objective
              </Link>
              <span className="text-muted-foreground/50">/</span>
              <Link
                href={`/dashboard/objectives/${objective.id}`}
                className="rounded-[8px] px-2 py-1 font-mono text-[12px] text-muted-foreground transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-foreground"
              >
                {objCode}
              </Link>
              <span className="text-muted-foreground/50">/</span>
              <span className="rounded-[8px] bg-[var(--ap-accent-soft)] px-2 py-1 text-[12px] font-semibold text-[var(--ap-accent)]">
                {krCode}
              </span>
              <span className="text-muted-foreground/50">/</span>
              <span className="truncate text-[13px] font-medium text-foreground" title={kr.title}>
                {kr.title}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {siblingNav.total > 1 && (
                <div className="flex items-center gap-1">
                  {siblingNav.prevId ? (
                    <Link
                      href={`/dashboard/key-results/${siblingNav.prevId}`}
                      aria-label="Previous KR"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border bg-card shadow-sm transition-colors hover:bg-[var(--ap-bg-hover)]"
                      style={{ borderColor: 'var(--ap-border)' }}
                    >
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  ) : (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border bg-card opacity-40" style={{ borderColor: 'var(--ap-border)' }}>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="rounded-[8px] border bg-card px-2.5 py-1 font-mono text-[12px] text-muted-foreground tabular-nums shadow-sm" style={{ borderColor: 'var(--ap-border)' }}>
                    KR {siblingNav.index + 1} of {siblingNav.total}
                  </span>
                  {siblingNav.nextId ? (
                    <Link
                      href={`/dashboard/key-results/${siblingNav.nextId}`}
                      aria-label="Next KR"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border bg-card shadow-sm transition-colors hover:bg-[var(--ap-bg-hover)]"
                      style={{ borderColor: 'var(--ap-border)' }}
                    >
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  ) : (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border bg-card opacity-40" style={{ borderColor: 'var(--ap-border)' }}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </span>
                  )}
                </div>
              )}
              {showCheckIn && (
                <button
                  type="button"
                  onClick={() => setCheckInOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border bg-card px-3 text-[12px] font-medium shadow-sm transition-colors hover:bg-[var(--ap-bg-hover)]"
                  style={{ borderColor: 'var(--ap-border)' }}
                >
                  Check in
                </button>
              )}
              {canEdit && !isRedacted && (
                <EditKeyResultButton keyResult={kr} users={users} canEdit={canEdit} onUpdated={afterMutation} />
              )}
              <button
                type="button"
                onClick={copyShare}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[var(--ap-accent-soft)] px-3 text-[12px] font-semibold text-[var(--ap-accent)] transition-colors hover:bg-[var(--ap-accent)] hover:text-white"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((m) => !m)}
                  aria-expanded={menuOpen}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-[var(--ap-bg-hover)]"
                  style={{ borderColor: 'var(--ap-border)' }}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-40 cursor-default"
                      aria-label="Close menu"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-[10px] border bg-card py-1 text-[13px] shadow-[var(--ap-shadow-lg)]" style={{ borderColor: 'var(--ap-border)' }}>
                      <Link
                        href={`/dashboard/objectives/${objective.id}`}
                        className="block px-3 py-1.5 text-muted-foreground hover:bg-[var(--ap-bg-hover)]"
                        onClick={() => setMenuOpen(false)}
                      >
                        View objective
                      </Link>
                      <a
                        href={`#${TIMELINE_ELEMENT_ID}`}
                        className="block px-3 py-1.5 text-muted-foreground hover:bg-[var(--ap-bg-hover)]"
                        onClick={() => setMenuOpen(false)}
                      >
                        Jump to Progress Timeline
                      </a>
                      <a
                        href={`#${ACTIVITY_ELEMENT_ID}`}
                        className="block px-3 py-1.5 text-muted-foreground hover:bg-[var(--ap-bg-hover)]"
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
        )
      })()}

      {/* Apple Pro 2-column grid: main + 340px rail */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        {/* -------- Main column -------- */}
        <div className="min-w-0 space-y-3">
          {kr.status === 'ARCHIVED' && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center">
              <Archive className="h-5 w-5 text-orange-600 mr-2" />
              <span className="text-sm font-medium text-orange-800">
                This key result has been archived
              </span>
            </div>
          )}

          {/* Apple Pro KR Hero */}
          <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
            <div className="px-5 pt-5 pb-4">
              {/* Chip row */}
              <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px]">
                {objectiveLevelLabel && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold"
                    style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}>
                    {objectiveLevelLabel}
                  </span>
                )}
                <span className="inline-flex items-center rounded-full px-2 py-0.5 font-bold"
                  style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}>
                  KR
                </span>
                <span className="text-muted-foreground tabular-nums">{kr.id.slice(-6).toUpperCase()}</span>
                {timeframe?.name && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Calendar className="size-3" />{timeframe.name}
                    </span>
                  </>
                )}
                {objective.department?.name && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Building2 className="size-3" />{objective.department.name}
                    </span>
                  </>
                )}
                {kr.isPrivate && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold"
                    style={{ background: 'rgba(255,149,0,0.12)', color: 'var(--ap-orange)' }}>Private</span>
                )}
              </div>

              <h1 className="text-[24px] font-semibold leading-tight"
                style={{ letterSpacing: '-0.02em', textWrap: 'balance', maxWidth: 720 } as any}>
                {kr.title}
              </h1>

              <p className="mt-2 text-[12px] flex items-center gap-1.5 text-muted-foreground">
                <Target className="size-3.5" />
                <span>Aligned to</span>
                <Link href={`/dashboard/objectives/${objective.id}`}
                  className="font-medium hover:underline" style={{ color: 'var(--ap-accent)' }}>
                  {objective.title}
                </Link>
              </p>

              {kr.description && !isRedacted && (
                <p className="mt-2 text-[13px] text-muted-foreground"
                  style={{ maxWidth: 720, textWrap: 'pretty' } as any}>
                  {kr.description}
                </p>
              )}

              <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
                <Link href={`/dashboard/org/users/${kr.owner?.id ?? ''}`} className="flex items-center gap-2">
                  {kr.owner?.avatar ? (
                    <img src={kr.owner.avatar} alt={kr.owner?.name ?? ''} className="size-7 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: 'var(--ap-accent)' }}>{ownerInitials}</span>
                  )}
                  <span className="font-medium" style={{ color: 'var(--ap-fg)' }}>{kr.owner?.name ?? 'Unknown'}</span>
                </Link>
                <span className="text-[11px]">· KR Owner</span>
                {deadline && (
                  <>
                    <span className="hidden sm:inline-block h-3.5 w-px" style={{ background: 'var(--ap-border)' }} />
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="size-3.5" /> Due {deadline} · {daysLeft > 0 ? `${daysLeft}d left` : 'past due'}
                    </span>
                  </>
                )}
                {weekLabel && (
                  <>
                    <span className="hidden sm:inline-block h-3.5 w-px" style={{ background: 'var(--ap-border)' }} />
                    <span>{weekLabel}</span>
                  </>
                )}
                <span className="ml-auto text-[11px]">Updated {formatRelativeTime(kr.updatedAt)}</span>
              </div>
            </div>

            {/* 5-stat strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 border-t"
              style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}>
              {/* Progress with ring */}
              <div className="flex items-center gap-3 px-4 py-4 border-r" style={{ borderColor: 'var(--ap-border)' }}>
                {(() => {
                  const size = 56, stroke = 6
                  const r = (size - stroke) / 2
                  const c = 2 * Math.PI * r
                  const offset = c - (Math.min(progressRounded, 100) / 100) * c
                  const ringColor = kr.confidence === 'ON_TRACK' ? 'var(--ap-green)'
                    : kr.confidence === 'AT_RISK' ? 'var(--ap-orange)'
                    : kr.confidence === 'OFF_TRACK' ? 'var(--ap-red)' : 'var(--ap-accent)'
                  return (
                    <div className="relative inline-flex" style={{ width: size, height: size }}>
                      <svg width={size} height={size} className="-rotate-90">
                        <circle cx={size/2} cy={size/2} r={r} stroke="var(--ap-kr-bar-bg)" strokeWidth={stroke} fill="none" />
                        <circle cx={size/2} cy={size/2} r={r} stroke={ringColor} strokeWidth={stroke} fill="none"
                          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums"
                        style={{ letterSpacing: '-0.02em' }}>{progressRounded}%</span>
                    </div>
                  )
                })()}
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Progress</p>
                  {!isRedacted && (
                    <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                      {formatAxisValue(Number(kr.currentValue) || 0)}/{formatAxisValue(Number(kr.targetValue) || 0)} {unit}
                    </p>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="flex flex-col justify-center gap-1.5 px-4 py-4 border-r" style={{ borderColor: 'var(--ap-border)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                {(() => {
                  const map: any = {
                    ON_TRACK: { label: 'On track', bg: 'rgba(52,199,89,0.12)', fg: 'var(--ap-green)' },
                    AT_RISK: { label: 'At risk', bg: 'rgba(255,149,0,0.12)', fg: 'var(--ap-orange)' },
                    OFF_TRACK: { label: 'Off track', bg: 'rgba(255,59,48,0.12)', fg: 'var(--ap-red)' },
                  }
                  const s = map[kr.confidence] ?? { label: 'No status', bg: 'var(--ap-bg-sunken)', fg: 'var(--ap-fg-muted)' }
                  return (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: s.bg, color: s.fg }}>
                      <span className="size-1.5 rounded-full" style={{ background: s.fg }} />
                      {s.label}
                    </span>
                  )
                })()}
              </div>

              {/* Confidence (use confidence string as a 0/50/100 proxy) */}
              <div className="flex flex-col justify-center gap-1.5 px-4 py-4 border-r" style={{ borderColor: 'var(--ap-border)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Confidence</p>
                {(() => {
                  const c = kr.confidence === 'ON_TRACK' ? 85 : kr.confidence === 'AT_RISK' ? 55 : kr.confidence === 'OFF_TRACK' ? 25 : 50
                  return (
                    <>
                      <p className="text-[18px] font-semibold tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>
                        {c}<span className="text-[12px] text-muted-foreground font-normal">/100</span>
                      </p>
                      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--ap-kr-bar-bg)' }}>
                        <div className="h-full rounded-full"
                          style={{ width: `${c}%`, background: c >= 70 ? 'var(--ap-green)' : c >= 40 ? 'var(--ap-orange)' : 'var(--ap-red)' }} />
                      </div>
                    </>
                  )
                })()}
              </div>

              {/* Initiatives */}
              <div className="flex flex-col justify-center gap-1.5 px-4 py-4 border-r" style={{ borderColor: 'var(--ap-border)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Initiatives</p>
                <p className="text-[18px] font-semibold tabular-nums leading-none">{todoCount}</p>
                <p className="text-[11px] text-muted-foreground">
                  {todoCount === 0 ? 'none yet' : todoCount === 1 ? 'initiative' : 'initiatives'}
                </p>
              </div>

              {/* Last check-in */}
              <div className="flex flex-col justify-center gap-1.5 px-4 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Last check-in</p>
                {checkIns.length > 0 ? (
                  <>
                    <p className="text-[14px] font-semibold tabular-nums leading-none">
                      {formatRelativeTime(checkIns[checkIns.length - 1].asOfDate)}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      by {checkIns[checkIns.length - 1].createdBy?.name ?? 'Unknown'}
                    </p>
                  </>
                ) : (
                  <p className="text-[12px] text-muted-foreground">No check-ins yet</p>
                )}
              </div>
            </div>
          </section>

          {/* Quick check-in bar */}
          {showCheckIn && (
            <div className="rounded-[14px] border bg-card flex items-center gap-3 px-4 py-2.5"
              style={{ borderColor: 'var(--ap-border)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Quick check-in</span>
              <span className="text-[12px] text-muted-foreground tabular-nums">
                Currently {unit} {formatAxisValue(Number(kr.currentValue) || 0)}
              </span>
              <button
                type="button"
                onClick={() => setCheckInOpen(true)}
                className="ml-auto rounded-[10px] bg-[var(--ap-accent)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--ap-accent-hover)]"
              >
                Post check-in
              </button>
            </div>
          )}

          {/* Check-in history */}
          <section className="rounded-[14px] border bg-card p-5" style={{ borderColor: 'var(--ap-border)' }} id={TIMELINE_ELEMENT_ID}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Check-in history</h2>
              <span className="text-[11px] text-muted-foreground tabular-nums">{isRedacted ? '—' : `${checkIns.length} total`}</span>
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
              <CheckInTimeline checkIns={checkIns} unit={unit} />
            ) : (
              <p className="text-sm text-muted-foreground">Check-in history is hidden for this private key result.</p>
            )}
          </section>

          {/* Initiatives under this KR */}
          <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
            <div className="px-5 py-3 border-b flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'var(--ap-border)' }}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Initiatives <span className="ml-1 tabular-nums">({todoCount})</span>
              </h2>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white opacity-60 cursor-not-allowed"
                style={{ background: 'linear-gradient(90deg, #af52de, #ff2d55)' }}
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

        {/* -------- Sidebar (Apple Pro right rail) -------- */}
        <aside className="space-y-3">
          {!isRedacted && timeframe?.startDate && timeframe?.endDate ? (
            <KrProgressConfidenceCard
              checkIns={checkIns.map((c: any) => ({ asOfDate: c.asOfDate, value: c.value, confidence: c.confidence, confidenceScore: c.confidenceScore }))}
              startValue={Number(kr.startValue) || 0}
              targetValue={Number(kr.targetValue) || 0}
              currentValue={Number(kr.currentValue) || 0}
              currentConfidence={currentConfidenceNum}
              previousConfidence={previousConfidenceNum}
              timeframeStart={timeframe.startDate}
              timeframeEnd={timeframe.endDate}
            />
          ) : null}

          <KrInspectorTabs
            keyResultId={kr.id}
            activityElementId={ACTIVITY_ELEMENT_ID}
            checkIns={isRedacted ? [] : checkIns}
            details={{
              owner: kr.owner,
              timeframe: timeframe ?? null,
              parentObjective: { id: objective.id, title: objective.title },
              startValue: Number(kr.startValue) || 0,
              targetValue: Number(kr.targetValue) || 0,
              currentValue: Number(kr.currentValue) || 0,
              unit,
              updatedAt: kr.updatedAt,
              updatedBy: checkIns[checkIns.length - 1]?.createdBy ?? kr.owner,
              confidenceTrend,
            }}
          />
        </aside>
      </div>

      {showCheckIn && (
        <CreateCheckInModal
          isOpen={checkInOpen}
          onClose={() => setCheckInOpen(false)}
          keyResult={kr}
          objectiveTimeframe={timeframe}
          objectiveCode={(() => {
            const prefix = objective.level === 'COMPANY' ? 'CO' : objective.level === 'DEPARTMENT' ? 'DE' : 'IN'
            const suffix = String((objective as any).code ?? '').padStart(2, '0') || objective.id.slice(-4).toUpperCase()
            return `${prefix}-${suffix}`
          })()}
          krLabel={`KR${siblingNav.index + 1}`}
          onSuccess={() => {
            setCheckInOpen(false)
            afterMutation()
          }}
        />
      )}
    </div>
  )
}
