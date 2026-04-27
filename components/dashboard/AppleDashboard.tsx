'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Activity, AlertTriangle, ArrowUpRight, Calendar, CheckCircle2,
  CheckSquare, ChevronRight, Clock, Sparkles, Target, TrendingDown, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import WorkItemsKanban from '@/components/shared/WorkItemsKanban'
import type { HeroStatsData } from './HeroStats'
import type { CheckInBannerData } from './CheckInBanner'
import type { QuickStatsData } from './QuickStats'
import type { OkrTreeObjective } from './UserOkrTree'
import type { NeedsAttentionItem } from './NeedsAttention'
import type { ActivityFeedItem } from './TeamActivityFeed'
import { cn } from '@/lib/utils'

/* ────────────────────────────────────────────────────────────────────────────
 * Reused AP primitives (ported from ObjectiveHero)
 * ──────────────────────────────────────────────────────────────────────── */

type StatusKey = 'on-track' | 'at-risk' | 'off-track' | 'completed' | 'none'

function statusFromConfidence(c: string): StatusKey {
  if (c === 'ON_TRACK') return 'on-track'
  if (c === 'AT_RISK') return 'at-risk'
  if (c === 'OFF_TRACK') return 'off-track'
  return 'none'
}

function StatusPill({ status, label }: { status: StatusKey; label?: string }) {
  const map: Record<StatusKey, { label: string; bg: string; fg: string }> = {
    'on-track':  { label: 'On track',   bg: 'rgba(52,199,89,0.12)', fg: 'var(--ap-green)' },
    'at-risk':   { label: 'At risk',    bg: 'rgba(255,149,0,0.12)', fg: 'var(--ap-orange)' },
    'off-track': { label: 'Off track',  bg: 'rgba(255,59,48,0.12)', fg: 'var(--ap-red)' },
    'completed': { label: 'Done',       bg: 'rgba(0,122,255,0.12)', fg: 'var(--ap-accent)' },
    'none':      { label: 'Not started',bg: 'rgba(142,142,147,0.15)', fg: 'var(--ap-fg-muted)' },
  }
  const c = map[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c.fg }} />
      {label ?? c.label}
    </span>
  )
}

function PaceChip({ delta }: { delta: number }) {
  const positive = delta >= 0
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
      style={{
        background: positive ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)',
        color: positive ? 'var(--ap-green)' : 'var(--ap-red)',
      }}
    >
      {positive ? '▲' : '▼'}{Math.abs(delta)}pt
    </span>
  )
}

function SectionHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--ap-border)' }}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
      {right}
    </div>
  )
}

function APCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn('rounded-[14px] border bg-card overflow-hidden', className)}
      style={{ borderColor: 'var(--ap-border)' }}
    >
      {children}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hero strip — greeting + date + Check in CTA
 * ──────────────────────────────────────────────────────────────────────── */

function partOfDay(d: Date): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

function DashboardHero({ name, banner }: { name: string; banner: CheckInBannerData }) {
  const now = new Date()
  const greeting = `Good ${partOfDay(now)}, ${name.split(' ')[0]}`
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const showAlert = banner.overdueCount > 0 || banner.dueThisWeekCount > 0

  return (
    <APCard>
      <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{date}</p>
          <h1
            className="mt-1 text-[28px] font-semibold leading-tight"
            style={{ letterSpacing: '-0.02em', textWrap: 'balance' } as React.CSSProperties}
          >
            {greeting}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Here&apos;s what&apos;s happening with your OKRs today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/my-okrs">
            <Button variant="outline" size="sm" className="rounded-[10px] h-8 px-3 text-[12px]">
              My OKRs
            </Button>
          </Link>
          <Link href="/dashboard/key-results">
            <Button size="sm" className="rounded-[10px] h-8 px-3 text-[12px]">
              Check in
            </Button>
          </Link>
        </div>
      </div>

      {showAlert && (
        <div
          className="flex items-center gap-2 px-5 py-2 border-t text-[12px]"
          style={{
            borderColor: 'var(--ap-border)',
            background: 'rgba(255,149,0,0.08)',
            color: 'var(--ap-orange)',
          }}
        >
          <Clock className="size-3.5" />
          <span className="font-semibold">
            {banner.overdueCount > 0 && `${banner.overdueCount} check-in${banner.overdueCount !== 1 ? 's' : ''} overdue`}
            {banner.overdueCount > 0 && banner.dueThisWeekCount > 0 && ' · '}
            {banner.dueThisWeekCount > 0 && `${banner.dueThisWeekCount} due this week`}
          </span>
          {banner.lastCheckInDaysAgo !== null && banner.lastCheckInKrTitle && (
            <span className="text-muted-foreground truncate">
              · last {banner.lastCheckInDaysAgo}d ago on &ldquo;{banner.lastCheckInKrTitle}&rdquo;
            </span>
          )}
        </div>
      )}
    </APCard>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4-up KPI strip
 * ──────────────────────────────────────────────────────────────────────── */

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <div className="h-7" />
  }
  const W = 96
  const H = 28
  const max = Math.max(...values, 100)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const stepX = W / (values.length - 1)
  const path = values
    .map((v, i) => {
      const x = i * stepX
      const y = H - ((v - min) / range) * H
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={path} fill="none" stroke="var(--ap-accent)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export interface DashboardKpis {
  activeObjectives: number
  activeObjectivesDelta?: number
  avgProgress: number
  expectedProgress: number
  momentumValues: number[]
  atRiskCount: number
  offTrackCount: number
  upcomingDeadlinesCount: number
  soonestDeadlineLabel: string | null
}

function KpiStrip({ kpis }: { kpis: DashboardKpis }) {
  const paceDelta = Math.round(kpis.avgProgress - kpis.expectedProgress)
  const atRiskStatus: StatusKey = kpis.offTrackCount > 0 ? 'off-track' : kpis.atRiskCount > 0 ? 'at-risk' : 'on-track'
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <APCard className="ap-hover-lift">
        <div className="px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active objectives</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[28px] font-semibold tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>
              {kpis.activeObjectives}
            </span>
            {typeof kpis.activeObjectivesDelta === 'number' && kpis.activeObjectivesDelta !== 0 && (
              <PaceChip delta={kpis.activeObjectivesDelta} />
            )}
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">In your current cycle</p>
        </div>
      </APCard>

      <APCard className="ap-hover-lift">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Average progress</p>
            <Sparkline values={kpis.momentumValues} />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[28px] font-semibold tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>
              {kpis.avgProgress}%
            </span>
            <PaceChip delta={paceDelta} />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground tabular-nums">
            Expected {kpis.expectedProgress}%
          </p>
        </div>
      </APCard>

      <APCard className="ap-hover-lift">
        <div className="px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">At-risk items</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className="text-[28px] font-semibold tabular-nums leading-none"
              style={{
                letterSpacing: '-0.02em',
                color: kpis.offTrackCount > 0 ? 'var(--ap-red)' : kpis.atRiskCount > 0 ? 'var(--ap-orange)' : 'var(--ap-fg)',
              }}
            >
              {kpis.atRiskCount + kpis.offTrackCount}
            </span>
            <StatusPill
              status={atRiskStatus}
              label={kpis.offTrackCount > 0 ? `${kpis.offTrackCount} off` : kpis.atRiskCount > 0 ? `${kpis.atRiskCount} at risk` : 'Healthy'}
            />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">KRs needing attention</p>
        </div>
      </APCard>

      <APCard className="ap-hover-lift">
        <div className="px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Upcoming deadlines</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[28px] font-semibold tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>
              {kpis.upcomingDeadlinesCount}
            </span>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground truncate">
            {kpis.soonestDeadlineLabel ? `Soonest: ${kpis.soonestDeadlineLabel}` : 'No upcoming due dates'}
          </p>
        </div>
      </APCard>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * My OKRs This Cycle — compact KR rows
 * ──────────────────────────────────────────────────────────────────────── */

function MyOkrsCard({ objectives }: { objectives: OkrTreeObjective[] }) {
  // flatten KRs with parent objective context
  const rows = useMemo(() => {
    const out: Array<{
      krId: string; krTitle: string; krProgress: number; krConfidence: string
      objId: string; objTitle: string
      idx: number
    }> = []
    let i = 1
    for (const obj of objectives) {
      for (const kr of obj.keyResults) {
        out.push({
          krId: kr.id, krTitle: kr.title, krProgress: kr.progress, krConfidence: kr.confidence,
          objId: obj.id, objTitle: obj.title,
          idx: i++,
        })
      }
    }
    return out
  }, [objectives])

  return (
    <APCard>
      <SectionHeader
        right={
          <Link href="/dashboard/my-okrs" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            View all <ChevronRight className="size-3" />
          </Link>
        }
      >
        My OKRs this cycle <span className="ml-1 font-mono normal-case text-muted-foreground">({rows.length})</span>
      </SectionHeader>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="flex size-10 items-center justify-center rounded-[10px]" style={{ background: 'var(--ap-bg-sunken)' }}>
            <Target className="size-5 text-muted-foreground" />
          </div>
          <p className="mt-2 text-[13px] font-medium">No active key results</p>
          <p className="text-[12px] text-muted-foreground">Create an objective to get started.</p>
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
          {rows.slice(0, 8).map((r) => {
            const status = statusFromConfidence(r.krConfidence)
            const color =
              status === 'on-track' ? 'var(--ap-green)'
              : status === 'at-risk' ? 'var(--ap-orange)'
              : status === 'off-track' ? 'var(--ap-red)'
              : 'var(--ap-fg-faint)'
            return (
              <li key={r.krId}>
                <Link
                  href={`/dashboard/key-results/${r.krId}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-[color:var(--ap-bg-hover)] transition"
                >
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-5">
                    {r.idx.toString().padStart(2, '0')}
                  </span>
                  <span className="size-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{r.krTitle}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.objTitle}</p>
                  </div>
                  <span className="text-[12px] font-mono tabular-nums text-muted-foreground w-10 text-right">
                    {Math.round(r.krProgress)}%
                  </span>
                  <div className="hidden sm:block h-1.5 w-20 rounded-full overflow-hidden" style={{ background: 'var(--ap-kr-bar-bg)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(r.krProgress, 100)}%`, background: color }} />
                  </div>
                  <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </APCard>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Activity & Updates timeline
 * ──────────────────────────────────────────────────────────────────────── */

function actionVerb(action: string, entityType: string): string {
  if (action === 'CHECKIN') return 'checked in on'
  if (action === 'CREATE') return entityType === 'TODO' ? 'created' : 'created'
  if (action === 'UPDATE') return 'updated'
  if (action === 'COMPLETE') return 'completed'
  if (action === 'ARCHIVE') return 'archived'
  if (action === 'STATUS_CHANGE') return 'changed status of'
  return action.toLowerCase().replace(/_/g, ' ')
}

function entityHref(type: string, id: string): string {
  if (type === 'KEY_RESULT') return `/dashboard/key-results/${id}`
  if (type === 'TODO') return `/dashboard/todos?open=${id}`
  return `/dashboard/objectives/${id}`
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/)
  const letters = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0].slice(0, 2)
  return (
    <span
      className="flex size-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: 'var(--ap-accent)' }}
    >
      {letters.toUpperCase()}
    </span>
  )
}

function ActivityCard({ items }: { items: ActivityFeedItem[] }) {
  return (
    <APCard>
      <SectionHeader
        right={
          <Link href="/dashboard/activity" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            See all <ChevronRight className="size-3" />
          </Link>
        }
      >
        Activity & updates
      </SectionHeader>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="flex size-10 items-center justify-center rounded-[10px]" style={{ background: 'var(--ap-bg-sunken)' }}>
            <Activity className="size-5 text-muted-foreground" />
          </div>
          <p className="mt-2 text-[13px] font-medium">Nothing new yet</p>
          <p className="text-[12px] text-muted-foreground">Check-ins and updates will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y max-h-[420px] overflow-y-auto" style={{ borderColor: 'var(--ap-border)' }}>
          {items.slice(0, 10).map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[color:var(--ap-bg-hover)] transition">
              <div className="mt-0.5 shrink-0">
                {item.actorAvatar
                  ? <img src={item.actorAvatar} alt="" className="size-7 rounded-full object-cover" />
                  : <Initials name={item.actorName ?? '?'} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-snug">
                  <span className="font-semibold">{item.actorName ?? 'Someone'}</span>{' '}
                  <span className="text-muted-foreground">{actionVerb(item.action, item.entityType)}</span>{' '}
                  <Link
                    href={entityHref(item.entityType, item.entityId)}
                    className="font-medium hover:text-[color:var(--ap-accent)] truncate inline-block max-w-[220px] align-bottom"
                    title={item.entityTitle}
                  >
                    {item.entityTitle}
                  </Link>
                </p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                  {item.entityType === 'KEY_RESULT' && <TrendingUp className="size-3" />}
                  {item.entityType === 'TODO' && <CheckSquare className="size-3" />}
                  {item.entityType === 'OBJECTIVE' && <Target className="size-3" />}
                  <span className="capitalize">{item.entityType.replace('_', ' ').toLowerCase()}</span>
                  <span>·</span>
                  <span>{formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
              {item.progress !== null && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                  style={{
                    background: item.progress >= 70
                      ? 'rgba(52,199,89,0.12)'
                      : item.progress >= 35
                      ? 'rgba(255,149,0,0.12)'
                      : 'rgba(255,59,48,0.12)',
                    color: item.progress >= 70
                      ? 'var(--ap-green)'
                      : item.progress >= 35
                      ? 'var(--ap-orange)'
                      : 'var(--ap-red)',
                  }}
                >
                  {Math.round(item.progress)}%
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </APCard>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Initiatives In Flight — mini kanban (uses shared WorkItemsKanban)
 * ──────────────────────────────────────────────────────────────────────── */

export interface InitiativesInFlight {
  id: string
  title: string
  status: string
  keyResultId?: string | null
}

function InitiativesKanban({ initiatives }: { initiatives: InitiativesInFlight[] }) {
  // Reuse the existing AP-styled WorkItemsKanban directly
  return (
    <WorkItemsKanban
      title="Initiatives in flight"
      keyResults={[]}
      initiatives={initiatives}
    />
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Top-level composition
 * ──────────────────────────────────────────────────────────────────────── */

export interface AppleDashboardProps {
  userName: string
  hero: HeroStatsData
  banner: CheckInBannerData
  quick: QuickStatsData
  kpis: DashboardKpis
  myOkrs: OkrTreeObjective[]
  activity: ActivityFeedItem[]
  initiatives: InitiativesInFlight[]
}

export default function AppleDashboard(props: AppleDashboardProps) {
  return (
    <div className="space-y-3">
      <DashboardHero name={props.userName} banner={props.banner} />
      <KpiStrip kpis={props.kpis} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <MyOkrsCard objectives={props.myOkrs} />
        <ActivityCard items={props.activity} />
      </div>
      <InitiativesKanban initiatives={props.initiatives} />
    </div>
  )
}
