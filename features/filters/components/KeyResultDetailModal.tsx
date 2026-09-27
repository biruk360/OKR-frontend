'use client'

/**
 * Key-result quick view (Filters workspace). A trimmed, read-mostly mirror of
 * /dashboard/key-results/[id] — same numbers, same check-in timeline, same
 * comment thread — with "View full page" for editing and check-ins.
 * Spec: docs/okr_quick_view_modals_REQUIREMENTS.md (QV-2).
 */

import { useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import { Calendar, ChevronRight, Gauge, Target, User } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import { formatAxisValue } from '@/lib/keyResultChart'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { OKR_REALTIME_EVENT_NAMES, keyResultRealtimeChannel } from '@/lib/okr/realtime'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'
import { UserAvatar } from '@/components/shared/UserAvatar'
import OkrComments from '@/components/shared/OkrComments'
import CheckInTimeline from '@/components/key-result-detail/CheckInTimeline'
import KrProgressConfidenceCard from '@/components/key-result-detail/KrProgressConfidenceCard'
import {
  Chip, Crumb, LEVEL_LABEL, MetaRow, PersonLink, PrivateNotice, ProgressRing, QuickLink,
  QuickViewError, QuickViewShell, QuickViewSkeleton, RailCard, Section, StatCell, StatStrip,
  TierPill, ViewAllLink, asAvatarUser, clampPct, fetchEnvelope, scoreColor, useQuickViewData,
} from './quick-view-parts'

// ─── Types (shape of GET /api/keyresults/[id] and /check-ins) ────────────────

interface Person { id: string; name: string | null; avatar?: string | null }

interface KrCheckIn {
  id: string
  asOfDate: string
  value: number
  confidence: string | null
  confidenceScore?: number | null
  analysis?: string | null
  createdBy?: Person | null
}

interface KrTodo { id: string; title: string; status: string; assignee?: Person | null }

interface KrDetail {
  id: string
  title: string
  description?: string | null
  startValue: number
  targetValue: number
  currentValue: number
  unit?: string | null
  confidence?: string | null
  progress: number
  status?: string
  isPrivate?: boolean
  updatedAt?: string
  owner?: Person | null
  objective?: {
    id: string
    title: string
    level?: string
    timeframe?: { name: string; startDate?: string | null; endDate?: string | null } | null
  } | null
  todos?: KrTodo[]
  isRedacted?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Initiative status → dot colour + pill colours (tokens only). */
const WORK_STYLE: Record<string, { label: string; dot: string; bg: string; fg: string }> = {
  COMPLETED:   { label: 'Done',        dot: 'var(--ap-green)',     bg: 'var(--ap-ok-bg)',      fg: 'var(--ap-ok-fg)' },
  IN_PROGRESS: { label: 'In progress', dot: 'var(--ap-accent)',    bg: 'var(--ap-accent-soft)', fg: 'var(--ap-accent)' },
  IN_REVIEW:   { label: 'In review',   dot: 'var(--ap-accent)',    bg: 'var(--ap-accent-soft)', fg: 'var(--ap-accent)' },
  STUCK:       { label: 'Stuck',       dot: 'var(--ap-red)',       bg: 'var(--ap-danger-bg)',  fg: 'var(--ap-danger-fg)' },
  PENDING:     { label: 'To do',       dot: 'var(--ap-fg-subtle)', bg: 'var(--ap-none-bg)',    fg: 'var(--ap-none-fg)' },
}
const TIER_PROXY: Record<string, number> = { ON_TRACK: 85, AT_RISK: 55, OFF_TRACK: 25 }

/** Numeric confidence: prefer the check-in slider score, else the tier proxy
 *  (same rule as KeyResultDetailClient). */
function confidenceOf(c: { confidenceScore?: number | null; confidence?: string | null } | undefined): number {
  if (typeof c?.confidenceScore === 'number') return c.confidenceScore
  return TIER_PROXY[c?.confidence ?? ''] ?? 50
}

const CHECKINS_SHOWN = 3
const INITIATIVES_SHOWN = 5

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  krId: string | null
  onClose: () => void
  /** Swap to the objective quick view (breadcrumb / "Aligned to"). */
  onOpenObjective?: (objectiveId: string) => void
}

export function KeyResultDetailModal({ krId, onClose, onOpenObjective }: Props) {
  const { data: session } = useSession()
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null

  const load = useCallback(async (signal: AbortSignal) => {
    const [kr, checkIns] = await Promise.all([
      fetchEnvelope<KrDetail>(`/api/keyresults/${krId}`, signal),
      fetchEnvelope<KrCheckIn[]>(`/api/keyresults/${krId}/check-ins`, signal).catch(() => [] as KrCheckIn[]),
    ])
    return { kr, checkIns: Array.isArray(checkIns) ? checkIns : [] }
  }, [krId])
  const { data, error, loading, reload } = useQuickViewData(krId, load)

  const kr = data?.kr ?? null
  const redacted = !!kr?.isRedacted

  // Another user's check-in / edit on this KR refreshes the view silently.
  const silentReload = useCallback(() => reload(true), [reload])
  useRealtimeRefresh({
    channel: krId && kr && !redacted ? keyResultRealtimeChannel(krId) : null,
    events: OKR_REALTIME_EVENT_NAMES,
    onRefresh: silentReload,
    ignoreActorId: currentUserId,
  })

  const checkIns = useMemo(
    () => [...(data?.checkIns ?? [])].sort((a, b) => new Date(a.asOfDate).getTime() - new Date(b.asOfDate).getTime()),
    [data?.checkIns],
  )

  // Falls back to the loaded id so the header holds steady while the dialog animates out.
  const fullHrefId = krId ?? data?.kr?.id ?? null
  const fullHref = fullHrefId ? `/dashboard/key-results/${fullHrefId}` : null
  const objective = kr?.objective ?? null
  const timeframe = objective?.timeframe ?? null

  const breadcrumb = (
    <>
      {objective && (
        <>
          <Crumb
            icon={Target}
            label={redacted ? 'Objective' : objective.title}
            onClick={onOpenObjective ? () => onOpenObjective(objective.id) : undefined}
          />
          <ChevronRight className="size-3 shrink-0" aria-hidden />
        </>
      )}
      <span className="shrink-0 font-medium" style={{ color: 'var(--ap-fg-muted)' }}>Key result</span>
    </>
  )

  let body: React.ReactNode
  let rail: React.ReactNode = null

  if (loading) {
    body = <QuickViewSkeleton label="Loading key result" />
  } else if (error || !kr) {
    body = <QuickViewError message={error ?? 'Could not load this key result.'} onRetry={() => reload()} fullHref={fullHref} onClose={onClose} />
  } else {
    const unit = kr.unit ?? ''
    const target = Number(kr.targetValue) || 0
    const current = Number(kr.currentValue) || 0
    const start = Number(kr.startValue) || 0
    // Same formula as the full page and the result list: current / target.
    const pct = clampPct(target > 0 ? (current / target) * 100 : kr.progress)
    const latest = checkIns[checkIns.length - 1]
    const previous = checkIns[checkIns.length - 2]
    const confidence = latest ? confidenceOf(latest) : confidenceOf(kr)
    const todos = (kr.todos ?? []).filter((t) => t.status !== 'CANCELLED')
    const doneCount = todos.filter((t) => t.status === 'COMPLETED').length
    const recentCheckIns = checkIns.slice(-CHECKINS_SHOWN)

    const end = timeframe?.endDate ? new Date(timeframe.endDate) : null
    const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86_400_000) : null

    body = (
      <div className="space-y-4">
        {/* Hero */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {objective?.level && LEVEL_LABEL[objective.level] && <Chip>{LEVEL_LABEL[objective.level]}</Chip>}
            <Chip accent>KR</Chip>
            {timeframe?.name && <Chip><Calendar className="size-3" aria-hidden />{timeframe.name}</Chip>}
            {kr.isPrivate && <Chip>Private</Chip>}
            {kr.status === 'ARCHIVED' && <Chip>Archived</Chip>}
          </div>
          <h2 className="text-xl font-semibold leading-snug" style={{ color: 'var(--ap-fg)', letterSpacing: '-0.02em', textWrap: 'balance' } as React.CSSProperties}>
            {kr.title}
          </h2>
          {objective && !redacted && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
              <Target className="size-3.5 shrink-0" aria-hidden />
              <span className="shrink-0">Aligned to</span>
              {onOpenObjective ? (
                <button type="button" onClick={() => onOpenObjective(objective.id)} className="truncate font-medium hover:underline" style={{ color: 'var(--ap-accent)' }}>
                  {objective.title}
                </button>
              ) : (
                <QuickLink href={`/dashboard/objectives/${objective.id}`} onNavigate={onClose} className="truncate">{objective.title}</QuickLink>
              )}
            </p>
          )}
          {kr.description && !redacted && (
            <p className="mt-2 line-clamp-3 text-body-sm" style={{ color: 'var(--ap-fg-muted)' }}>{kr.description}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
            <PersonLink person={kr.owner} role="KR owner" onNavigate={onClose} />
            {end && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5" aria-hidden />
                Due {format(end, 'MMM d, yyyy')} · {daysLeft !== null && daysLeft > 0 ? `${daysLeft}d left` : 'past due'}
              </span>
            )}
            {kr.updatedAt && <span className="sm:ml-auto">Updated {formatRelativeTime(kr.updatedAt)}</span>}
          </div>
        </div>

        {/* Stat strip */}
        <StatStrip>
          <StatCell label="Progress">
            <div className="flex items-center gap-3">
              <ProgressRing value={pct} tier={kr.confidence} />
              {!redacted && (
                <span className="text-caption tabular-nums" style={{ color: 'var(--ap-fg-muted)' }}>
                  {formatAxisValue(current)}/{formatAxisValue(target)} {unit}
                </span>
              )}
            </div>
          </StatCell>
          <StatCell label="Status"><span><TierPill tier={kr.confidence} /></span></StatCell>
          <StatCell label="Confidence">
            <p className="text-lg font-semibold leading-none tabular-nums">
              {confidence}<span className="text-xs font-normal" style={{ color: 'var(--ap-fg-subtle)' }}>/100</span>
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--ap-kr-bar-bg)' }}>
              <div className="h-full rounded-full" style={{ width: `${confidence}%`, background: scoreColor(confidence) }} />
            </div>
          </StatCell>
          <StatCell label="Last check-in">
            {latest ? (
              <>
                <p className="text-sm font-semibold leading-none">{formatRelativeTime(latest.asOfDate)}</p>
                <p className="truncate text-caption" style={{ color: 'var(--ap-fg-subtle)' }}>by {latest.createdBy?.name ?? 'Unknown'}</p>
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>{redacted ? 'Hidden' : 'No check-ins yet'}</p>
            )}
          </StatCell>
        </StatStrip>

        {redacted ? (
          <PrivateNotice what="key result" />
        ) : (
          <>
            {/* Check-ins */}
            <Section
              title="Check-in history"
              count={checkIns.length}
              action={checkIns.length > CHECKINS_SHOWN && fullHref
                ? <ViewAllLink href={fullHref} label={`View all ${checkIns.length}`} onNavigate={onClose} />
                : undefined}
            >
              <CheckInTimeline checkIns={recentCheckIns} unit={unit} />
            </Section>

            {/* Initiatives */}
            <Section
              title="Initiatives"
              count={todos.length > 0 ? `${doneCount}/${todos.length} done` : 0}
              action={todos.length > INITIATIVES_SHOWN && fullHref
                ? <ViewAllLink href={fullHref} label={`View all ${todos.length}`} onNavigate={onClose} />
                : undefined}
            >
              {todos.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>No initiatives linked to this key result yet.</p>
              ) : (
                <ul className="-my-1">
                  {todos.slice(0, INITIATIVES_SHOWN).map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        // Close first — the initiative drawer is its own dialog at layout level.
                        onClick={() => { onClose(); useInitiativeDetailStore.getState().open(t.id) }}
                        className="flex w-full items-center gap-3 rounded-[var(--ap-radius-sm)] px-2 py-2 text-left transition-colors hover:bg-[var(--ap-bg-hover)]"
                      >
                        <span className="size-2 shrink-0 rounded-full" style={{ background: (WORK_STYLE[t.status] ?? WORK_STYLE.PENDING).dot }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-body-sm" style={{ color: 'var(--ap-fg)' }}>{t.title}</span>
                        {t.assignee && <UserAvatar user={asAvatarUser(t.assignee)} size={22} tooltipDetail="Assignee" />}
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold"
                          style={{ background: (WORK_STYLE[t.status] ?? WORK_STYLE.PENDING).bg, color: (WORK_STYLE[t.status] ?? WORK_STYLE.PENDING).fg }}
                        >
                          {WORK_STYLE[t.status]?.label ?? t.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Comments — same thread as the full page (rich text, attachments, realtime). */}
            <OkrComments endpoint="keyresults" entityId={kr.id} users={[]} currentUserId={currentUserId} />
          </>
        )}
      </div>
    )

    rail = (
      <>
        {!redacted && timeframe?.startDate && timeframe?.endDate && (
          <KrProgressConfidenceCard
            checkIns={checkIns}
            startValue={start}
            targetValue={target}
            currentValue={current}
            currentConfidence={confidence}
            previousConfidence={previous ? confidenceOf(previous) : null}
            timeframeStart={timeframe.startDate}
            timeframeEnd={timeframe.endDate}
          />
        )}
        <RailCard title="Details">
          <MetaRow icon={User} label="Owner">{kr.owner?.name ?? '—'}</MetaRow>
          {timeframe && (
            <MetaRow icon={Calendar} label="Timeframe">
              <p>{timeframe.name}</p>
              {timeframe.startDate && timeframe.endDate && (
                <p className="mt-0.5" style={{ color: 'var(--ap-fg-subtle)' }}>
                  {format(new Date(timeframe.startDate), 'MMM yyyy')} → {format(new Date(timeframe.endDate), 'MMM yyyy')}
                </p>
              )}
            </MetaRow>
          )}
          {objective && !redacted && (
            <MetaRow icon={Target} label="Objective">
              <QuickLink href={`/dashboard/objectives/${objective.id}`} onNavigate={onClose} className="line-clamp-2">
                {objective.title}
              </QuickLink>
            </MetaRow>
          )}
          {!redacted && (
            <MetaRow icon={Gauge} label="Measure">
              <p className="tabular-nums">
                {formatAxisValue(start)} → {formatAxisValue(target)} {unit}
              </p>
              <p className="mt-0.5 tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>
                Current {formatAxisValue(current)} {unit}
              </p>
            </MetaRow>
          )}
        </RailCard>
      </>
    )
  }

  return (
    <QuickViewShell
      open={!!krId}
      onClose={onClose}
      title={kr?.title ?? 'Key result'}
      breadcrumb={breadcrumb}
      fullHref={fullHref}
      fullLabel="View full page"
      rail={rail}
    >
      {body}
    </QuickViewShell>
  )
}
