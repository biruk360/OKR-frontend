'use client'

/**
 * Objective quick view (Filters workspace). A trimmed, read-mostly mirror of
 * /dashboard/objectives/[id] — real status (goalStatus), real confidence
 * (0–100 int), clickable key results, the same comment thread — with
 * "View full page" for everything else.
 * Spec: docs/okr_quick_view_modals_REQUIREMENTS.md (QV-3).
 */

import { useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import { Building2, Calendar, CheckSquare, ChevronRight, Flag, Layers, Lock, Target, User } from 'lucide-react'
import { formatAxisValue } from '@/lib/keyResultChart'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { OKR_REALTIME_EVENT_NAMES, objectiveRealtimeChannel } from '@/lib/okr/realtime'
import { Progress } from '@/components/ui/progress'
import { UserAvatar, UserAvatarStack } from '@/components/shared/UserAvatar'
import OkrComments from '@/components/shared/OkrComments'
import {
  Chip, Crumb, LEVEL_LABEL, MetaRow, PersonLink, PrivateNotice, ProgressRing, QuickLink,
  QuickViewError, QuickViewShell, QuickViewSkeleton, RailCard, Section, StatCell, StatStrip,
  TierPill, asAvatarUser, clampPct, fetchEnvelope, scoreColor, useQuickViewData,
} from './quick-view-parts'

// ─── Types (shape of GET /api/objectives/[id]) ────────────────────────────────

interface Person { id: string; name: string | null; avatar?: string | null; email?: string | null }

interface ObjKR {
  id: string
  title: string
  progress: number
  confidence?: string | null
  currentValue?: number
  targetValue?: number
  unit?: string | null
  owner?: Person | null
  _count?: { todos?: number }
  isRedacted?: boolean
}

interface ObjectiveDetail {
  id: string
  title: string
  description?: string | null
  level: string
  status?: string
  goalStatus?: string | null
  progress: number
  /** Owner-reported objective confidence, 0–100. */
  confidence?: number | null
  isPrivate?: boolean
  owner?: Person | null
  timeframe?: { id: string; name: string; startDate?: string | null; endDate?: string | null } | null
  department?: { id: string; name: string } | null
  parentObjective?: { id: string; title: string } | null
  contributors?: Array<{ user: Person }>
  keyResults?: ObjKR[]
  isRedacted?: boolean
}

const TIER_DOT: Record<string, string> = {
  ON_TRACK: 'var(--ap-green)', AT_RISK: 'var(--ap-orange)', OFF_TRACK: 'var(--ap-red)',
}

/** KR % the way the list and KR page compute it: current / target. */
function krPct(kr: ObjKR): number {
  const target = Number(kr.targetValue) || 0
  return clampPct(target > 0 && !kr.isRedacted ? ((Number(kr.currentValue) || 0) / target) * 100 : kr.progress)
}

// ─── KR row ───────────────────────────────────────────────────────────────────

function KrRow({ kr, onOpen }: { kr: ObjKR; onOpen: () => void }) {
  const pct = Math.round(krPct(kr))
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-[var(--ap-radius-sm)] px-2 py-2.5 text-left transition-colors hover:bg-[var(--ap-bg-hover)]"
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: TIER_DOT[kr.confidence ?? ''] ?? 'var(--ap-fg-subtle)' }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-body-sm font-medium leading-snug" style={{ color: 'var(--ap-fg)' }}>
            {kr.isRedacted && <Lock className="size-3 shrink-0" style={{ color: 'var(--ap-fg-subtle)' }} aria-hidden />}
            <span className="line-clamp-2">{kr.isRedacted ? 'Private key result' : kr.title}</span>
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <Progress className="flex-1" height={4} value={pct} fill="var(--ap-accent)" track="var(--ap-kr-bar-bg)" aria-label="Progress" />
            <span className="w-9 text-right text-micro tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>{pct}%</span>
          </div>
          {!kr.isRedacted && kr.targetValue !== undefined && (
            <p className="mt-0.5 text-caption tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>
              {formatAxisValue(Number(kr.currentValue) || 0)} / {formatAxisValue(Number(kr.targetValue) || 0)} {kr.unit ?? ''}
            </p>
          )}
        </div>
        <span className="hidden sm:inline"><TierPill tier={kr.confidence} /></span>
        {kr.owner && <UserAvatar user={asAvatarUser(kr.owner)} size={24} tooltipDetail="Key result owner" />}
        <ChevronRight className="size-3.5 shrink-0" style={{ color: 'var(--ap-fg-subtle)' }} aria-hidden />
      </button>
    </li>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  objectiveId: string | null
  onClose: () => void
  /** Swap to a key result's quick view. */
  onOpenKr?: (krId: string) => void
  /** Swap to another objective's quick view (parent breadcrumb). */
  onOpenObjective?: (objectiveId: string) => void
}

export function ObjectiveDetailModal({ objectiveId, onClose, onOpenKr, onOpenObjective }: Props) {
  const { data: session } = useSession()
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null

  const load = useCallback(
    (signal: AbortSignal) => fetchEnvelope<ObjectiveDetail>(`/api/objectives/${objectiveId}`, signal),
    [objectiveId],
  )
  const { data: obj, error, loading, reload } = useQuickViewData(objectiveId, load)
  const redacted = !!obj?.isRedacted

  const silentReload = useCallback(() => reload(true), [reload])
  useRealtimeRefresh({
    channel: objectiveId && obj && !redacted ? objectiveRealtimeChannel(objectiveId) : null,
    events: OKR_REALTIME_EVENT_NAMES,
    onRefresh: silentReload,
    ignoreActorId: currentUserId,
  })

  // Falls back to the loaded id so the header holds steady while the dialog animates out.
  const fullHrefId = objectiveId ?? obj?.id ?? null
  const fullHref = fullHrefId ? `/dashboard/objectives/${fullHrefId}` : null
  const parent = !redacted ? obj?.parentObjective ?? null : null

  const breadcrumb = (
    <>
      {parent && (
        <>
          <Crumb
            icon={Target}
            label={parent.title}
            onClick={onOpenObjective ? () => onOpenObjective(parent.id) : undefined}
          />
          <ChevronRight className="size-3 shrink-0" aria-hidden />
        </>
      )}
      {!parent && obj?.timeframe?.name && (
        <>
          <Crumb icon={Calendar} label={obj.timeframe.name} />
          <ChevronRight className="size-3 shrink-0" aria-hidden />
        </>
      )}
      <span className="shrink-0 font-medium" style={{ color: 'var(--ap-fg-muted)' }}>Objective</span>
    </>
  )

  let body: React.ReactNode
  let rail: React.ReactNode = null

  if (loading) {
    body = <QuickViewSkeleton label="Loading objective" />
  } else if (error || !obj) {
    body = <QuickViewError message={error ?? 'Could not load this objective.'} onRetry={() => reload()} fullHref={fullHref} onClose={onClose} />
  } else {
    const krs = obj.keyResults ?? []
    const onTrack = krs.filter((k) => k.confidence === 'ON_TRACK').length
    const initiatives = krs.reduce((s, k) => s + (k._count?.todos ?? 0), 0)
    const confidence = typeof obj.confidence === 'number' ? Math.round(clampPct(obj.confidence)) : null
    const tf = obj.timeframe

    body = (
      <div className="space-y-4">
        {/* Hero */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {LEVEL_LABEL[obj.level] && <Chip>{LEVEL_LABEL[obj.level]}</Chip>}
            {tf?.name && <Chip><Calendar className="size-3" aria-hidden />{tf.name}</Chip>}
            {obj.department?.name && <Chip><Building2 className="size-3" aria-hidden />{obj.department.name}</Chip>}
            {obj.isPrivate && <Chip>Private</Chip>}
            {obj.status === 'ARCHIVED' && <Chip>Archived</Chip>}
          </div>
          <div className="flex items-start gap-2.5">
            <Flag className="mt-1 size-4 shrink-0" style={{ color: 'var(--ap-accent)' }} aria-hidden />
            <h2 className="text-xl font-semibold leading-snug" style={{ color: 'var(--ap-fg)', letterSpacing: '-0.02em', textWrap: 'balance' } as React.CSSProperties}>
              {obj.title}
            </h2>
          </div>
          {obj.description && !redacted && (
            <p className="mt-2 line-clamp-3 text-body-sm" style={{ color: 'var(--ap-fg-muted)' }}>{obj.description}</p>
          )}
          <div className="mt-3 text-xs">
            <PersonLink person={obj.owner} role="Objective owner" onNavigate={onClose} />
          </div>
        </div>

        {/* Stat strip */}
        <StatStrip>
          <StatCell label="Progress">
            <ProgressRing value={obj.progress} tier={obj.goalStatus} />
          </StatCell>
          <StatCell label="Status"><span><TierPill tier={obj.goalStatus} /></span></StatCell>
          <StatCell label="Confidence">
            {confidence !== null ? (
              <>
                <p className="text-lg font-semibold leading-none tabular-nums">
                  {confidence}<span className="text-xs font-normal" style={{ color: 'var(--ap-fg-subtle)' }}>/100</span>
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--ap-kr-bar-bg)' }}>
                  <div className="h-full rounded-full" style={{ width: `${confidence}%`, background: scoreColor(confidence) }} />
                </div>
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>—</p>
            )}
          </StatCell>
          <StatCell label="Key results">
            <p className="text-lg font-semibold leading-none tabular-nums">{krs.length}</p>
            <p className="text-caption" style={{ color: 'var(--ap-fg-subtle)' }}>{onTrack} on track</p>
          </StatCell>
        </StatStrip>

        {redacted ? (
          <PrivateNotice what="objective" />
        ) : (
          <>
            <Section title="Key results" count={krs.length}>
              {krs.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>No key results yet.</p>
              ) : (
                <ul className="-my-1">
                  {krs.map((kr) => (
                    <KrRow key={kr.id} kr={kr} onOpen={() => onOpenKr?.(kr.id)} />
                  ))}
                </ul>
              )}
            </Section>

            {/* Comments — same thread as the full page (rich text, attachments, realtime). */}
            <OkrComments endpoint="objectives" entityId={obj.id} users={[]} currentUserId={currentUserId} />
          </>
        )}
      </div>
    )

    const contributors = (obj.contributors ?? []).map((c) => c.user).filter(Boolean).map(asAvatarUser)
    rail = (
      <>
        <RailCard title="Details">
          <MetaRow icon={User} label="Owner">{obj.owner?.name ?? '—'}</MetaRow>
          {tf && (
            <MetaRow icon={Calendar} label="Timeframe">
              <p>{tf.name}</p>
              {tf.startDate && tf.endDate && (
                <p className="mt-0.5" style={{ color: 'var(--ap-fg-subtle)' }}>
                  {format(new Date(tf.startDate), 'MMM d, yyyy')} → {format(new Date(tf.endDate), 'MMM d, yyyy')}
                </p>
              )}
            </MetaRow>
          )}
          {obj.department && <MetaRow icon={Building2} label="Team">{obj.department.name}</MetaRow>}
          {parent && (
            <MetaRow icon={Target} label="Parent">
              <QuickLink href={`/dashboard/objectives/${parent.id}`} onNavigate={onClose} className="line-clamp-2">
                {parent.title}
              </QuickLink>
            </MetaRow>
          )}
          <MetaRow icon={Layers} label="Level">{LEVEL_LABEL[obj.level] ?? obj.level}</MetaRow>
          {!redacted && <MetaRow icon={CheckSquare} label="Initiatives">{initiatives}</MetaRow>}
        </RailCard>

        {!redacted && contributors.length > 0 && (
          <RailCard title={`Contributors (${contributors.length})`}>
            <div className="py-2">
              <UserAvatarStack users={contributors} size={26} max={6} detail={() => 'Contributor'} />
            </div>
          </RailCard>
        )}
      </>
    )
  }

  return (
    <QuickViewShell
      open={!!objectiveId}
      onClose={onClose}
      title={obj?.title ?? 'Objective'}
      breadcrumb={breadcrumb}
      fullHref={fullHref}
      fullLabel="View full page"
      rail={rail}
    >
      {body}
    </QuickViewShell>
  )
}
