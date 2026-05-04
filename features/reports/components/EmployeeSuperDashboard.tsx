'use client'

/**
 * Employee-mode super dashboard. Replaces the generic SuperDashboard render
 * for employee scope with a richer, action-driving layout: today strip,
 * radial gauges per owned KR, velocity sparkline, alignment strip, kanban
 * preview, streak heatmap, upcoming agenda.
 */

import Link from 'next/link'
import { useMemo } from 'react'
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Flame, Lightbulb,
  ListChecks, MessageSquare, Sparkles, Target, TrendingUp, type LucideIcon,
} from 'lucide-react'
import { format, addDays, isAfter, isBefore, parseISO, startOfDay } from 'date-fns'
import {
  DashboardCard, InsightTile, MiniBadge, Sparkline,
} from '@/components/ui/dashboard'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'
import type { KrDisplayStatus } from '@/lib/reportDashboard'

export interface EmployeeSuperData {
  /** Owned + assigned-scope KRs with display status. */
  krs: Array<{
    id: string
    title: string
    progress: number
    confidence: string
    objectiveId: string
    objectiveTitle: string
    ownerId: string
    checkInCount: number
    displayStatus: KrDisplayStatus
  }>
  /** Owned objectives (for the alignment strip). */
  objectives: Array<{ id: string; title: string; level: string; ownerId: string }>
  /** Initiatives in scope (assigned to me OR linked to my KRs). */
  todos: Array<{
    id: string
    title: string
    status: string
    priority: string
    keyResultId: string
    krTitle: string
    objectiveTitle: string
    assigneeId: string | null
    dueDate: string | null
  }>
  recommendations: Array<{ title: string; detail: string; tone: KrDisplayStatus; href?: string }>
  /** Personal enrichment from /api/dashboards/me. */
  personal: {
    completionDates: string[]
    checkinDates: string[]
    alignmentChains: Array<{
      objectiveId: string
      objectiveTitle: string
      ancestors: Array<{ id: string; title: string; level: string }>
    }>
  }
  currentUserId: string
  currentUserName: string
}

export function EmployeeSuperDashboard(props: EmployeeSuperData) {
  const { krs, objectives, todos, recommendations, personal, currentUserId, currentUserName } = props
  const open = useInitiativeDetailStore((s) => s.open)

  const ownedKrs = useMemo(() => krs.filter((k) => k.ownerId === currentUserId), [krs, currentUserId])
  const ownedObjectives = useMemo(() => objectives.filter((o) => o.ownerId === currentUserId), [objectives, currentUserId])
  const myTodos = useMemo(() => todos.filter((t) => t.assigneeId === currentUserId), [todos, currentUserId])

  // ── Today strip metrics ──
  const today = startOfDay(new Date())
  const todayIso = format(today, 'yyyy-MM-dd')
  const dueToday = myTodos.filter((t) => {
    if (!t.dueDate) return false
    if (['COMPLETED', 'CANCELLED'].includes(t.status)) return false
    return t.dueDate.slice(0, 10) === todayIso
  })
  const overdueCount = myTodos.filter((t) => {
    if (!t.dueDate || ['COMPLETED', 'CANCELLED'].includes(t.status)) return false
    return isBefore(parseISO(t.dueDate), today)
  }).length
  const krsNeedingCheckin = ownedKrs.filter((k) => k.checkInCount === 0 || k.displayStatus === 'at_risk' || k.displayStatus === 'off_track')

  // ── Velocity (initiatives completed per ISO week, last 8 weeks) ──
  const velocity = useMemo(() => buildWeeklySeries(personal.completionDates, 8), [personal.completionDates])
  const velocityTotal = velocity.reduce((s, n) => s + n, 0)
  const velocityAvg = velocity.length > 0 ? Math.round(velocityTotal / velocity.length) : 0

  // ── Streak (last 84 days) ──
  const streakDays = useMemo(() => buildStreakGrid(personal.checkinDates, 84), [personal.checkinDates])
  const streakRun = useMemo(() => computeCurrentStreak(personal.checkinDates), [personal.checkinDates])

  // ── Upcoming agenda (next 14 days) ──
  const fortnightEnd = addDays(today, 14)
  const upcoming = myTodos
    .filter((t) => {
      if (!t.dueDate || ['COMPLETED', 'CANCELLED'].includes(t.status)) return false
      const d = parseISO(t.dueDate)
      return !isBefore(d, today) && !isAfter(d, fortnightEnd)
    })
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 8)

  // ── Kanban preview (top 5 in-progress) ──
  const inProgress = myTodos
    .filter((t) => t.status === 'IN_PROGRESS')
    .slice(0, 5)

  return (
    <section className="space-y-3">
      {/* ── Today strip ── */}
      <div className="grid gap-3 md:grid-cols-3">
        <InsightTile
          icon={CalendarClock}
          label="Due today"
          value={dueToday.length}
          detail={overdueCount > 0 ? `${overdueCount} overdue waiting` : 'You’re on top of it'}
          tint={dueToday.length > 0 || overdueCount > 0 ? 'var(--ap-orange)' : 'var(--ap-green)'}
        />
        <InsightTile
          icon={Target}
          label="KRs needing check-in"
          value={krsNeedingCheckin.length}
          detail={`${ownedKrs.length} owned · ${ownedKrs.filter((k) => k.displayStatus === 'on_track').length} on track`}
          tint={krsNeedingCheckin.length > 0 ? 'var(--ap-accent)' : 'var(--ap-green)'}
        />
        <InsightTile
          icon={Flame}
          label="Check-in streak"
          value={`${streakRun} ${streakRun === 1 ? 'day' : 'days'}`}
          detail={`${personal.checkinDates.length} check-ins in 12 weeks`}
          tint={streakRun >= 5 ? 'var(--ap-orange)' : 'var(--ap-fg)'}
        />
      </div>

      {/* ── My OKRs (radial gauges) ── */}
      <DashboardCard
        title="My key results"
        right={<MiniBadge color="var(--ap-accent)">{ownedKrs.length} owned</MiniBadge>}
      >
        {ownedKrs.length === 0 ? (
          <EmptyHint icon={Target} message="You don't own any active key results yet." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ownedKrs.slice(0, 6).map((kr) => (
              <KrGaugeCard key={kr.id} kr={kr} />
            ))}
          </div>
        )}
      </DashboardCard>

      {/* ── Velocity + Alignment ── */}
      <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
        <DashboardCard
          title="Personal velocity"
          right={<MiniBadge color="var(--ap-green)">{velocityTotal} / 8 wk</MiniBadge>}
        >
          <div className="flex items-end gap-4">
            <div>
              <p className="text-[28px] font-semibold tabular-nums tracking-tight" style={{ color: 'var(--ap-green)' }}>
                {velocityAvg}
              </p>
              <p className="text-[12px] text-muted-foreground">avg per week</p>
            </div>
            <div className="flex-1">
              <Sparkline data={velocity} color="#34C759" height={56} />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>8 wks ago</span>
                <span>this week</span>
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard
          title="My alignment"
          right={<MiniBadge color="var(--ap-fg-muted)">{ownedObjectives.length} objectives</MiniBadge>}
        >
          {personal.alignmentChains.length === 0 ? (
            <EmptyHint icon={Sparkles} message="Set a parent objective on your OKRs to see how your work rolls up." />
          ) : (
            <div className="space-y-3">
              {personal.alignmentChains.slice(0, 3).map((chain) => (
                <AlignmentRow key={chain.objectiveId} chain={chain} />
              ))}
            </div>
          )}
        </DashboardCard>
      </div>

      {/* ── In-progress preview + Streak grid ── */}
      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardCard
          title="In progress"
          right={<MiniBadge color="var(--ap-accent)">{inProgress.length} cards</MiniBadge>}
        >
          {inProgress.length === 0 ? (
            <EmptyHint icon={ListChecks} message="Nothing in flight. Pick a card from your queue and move it forward." />
          ) : (
            <div className="space-y-2">
              {inProgress.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => open(t.id)}
                  className="flex w-full items-center gap-3 rounded-[12px] border bg-card p-3 text-left transition hover:bg-muted/40"
                  style={{ borderColor: 'var(--ap-border)' }}
                >
                  <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ background: priorityBg(t.priority), color: priorityFg(t.priority) }}
                  >
                    <ListChecks className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-foreground">{t.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t.krTitle} · {t.objectiveTitle}
                      {t.dueDate && ` · due ${format(parseISO(t.dueDate), 'MMM d')}`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title="Check-in streak"
          right={<MiniBadge color="var(--ap-orange)">{streakRun}-day run</MiniBadge>}
        >
          <StreakGrid days={streakDays} />
          <p className="mt-3 text-[11px] text-muted-foreground">
            Each cell is a day. Darker = more check-ins. Last 12 weeks of activity.
          </p>
        </DashboardCard>
      </div>

      {/* ── Upcoming + Recommendations ── */}
      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardCard
          title="Upcoming · next 14 days"
          right={<MiniBadge color="var(--ap-fg-muted)">{upcoming.length} items</MiniBadge>}
        >
          {upcoming.length === 0 ? (
            <EmptyHint icon={CalendarClock} message="No deadlines in the next two weeks." />
          ) : (
            <ul className="space-y-1.5">
              {upcoming.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => open(t.id)}
                    className="flex w-full items-start gap-3 rounded-[10px] px-2 py-1.5 text-left transition hover:bg-muted/40"
                  >
                    <span className="mt-0.5 inline-flex h-9 w-12 shrink-0 flex-col items-center justify-center rounded-[8px] text-center"
                      style={{ background: 'var(--ap-bg-sunken)' }}>
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">
                        {format(parseISO(t.dueDate!), 'MMM')}
                      </span>
                      <span className="text-[14px] font-semibold leading-none tabular-nums" style={{ color: 'var(--ap-fg)' }}>
                        {format(parseISO(t.dueDate!), 'd')}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">{t.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{t.krTitle}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard title="Recommendations" right={<Lightbulb className="h-4 w-4 text-muted-foreground" />}>
          {recommendations.length === 0 ? (
            <EmptyHint icon={Sparkles} message="Nothing flagged right now. Keep the rhythm." />
          ) : (
            <div className="space-y-2">
              {recommendations.slice(0, 5).map((item, idx) => (
                <RecommendationRow key={`${item.title}-${idx}`} item={item} />
              ))}
            </div>
          )}
        </DashboardCard>
      </div>
    </section>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function KrGaugeCard({ kr }: { kr: EmployeeSuperData['krs'][number] }) {
  const tone =
    kr.displayStatus === 'on_track' ? 'var(--ap-green)' :
    kr.displayStatus === 'at_risk' ? 'var(--ap-orange)' :
    kr.displayStatus === 'off_track' ? 'var(--ap-red)' :
    'var(--ap-fg-muted)'
  const pct = Math.max(0, Math.min(100, Math.round(kr.progress)))
  return (
    <div className="rounded-[14px] border bg-card p-4" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="flex items-start gap-4">
        <RadialGauge percent={pct} color={tone} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-semibold text-foreground">{kr.title}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{kr.objectiveTitle}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[10px] font-semibold"
            style={{ background: 'var(--ap-bg-sunken)', color: tone }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
            {kr.confidence}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{kr.checkInCount} check-ins</span>
        <Link
          href={`/dashboard/key-results/${kr.id}`}
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11px] font-semibold text-foreground hover:bg-muted/40"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          Log check-in <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}

function RadialGauge({ percent, color }: { percent: number; color: string }) {
  const size = 56
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke="var(--ap-bg-sunken)" strokeWidth={stroke} fill="none"
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke={color} strokeWidth={stroke} fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        className="text-[12px] font-semibold tabular-nums"
        fill={color}
      >
        {percent}%
      </text>
    </svg>
  )
}

function AlignmentRow({ chain }: { chain: EmployeeSuperData['personal']['alignmentChains'][number] }) {
  // Render the chain as: my objective → ancestor → ancestor → root
  const nodes = [
    { id: chain.objectiveId, title: chain.objectiveTitle, level: 'me' },
    ...chain.ancestors,
  ]
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {nodes.map((n, idx) => (
        <div key={n.id} className="flex items-center gap-2 shrink-0">
          <Link
            href={`/dashboard/objectives/${n.id}`}
            className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/40"
            style={{
              borderColor: 'var(--ap-border)',
              background: idx === 0 ? 'var(--ap-accent-soft)' : 'transparent',
              color: idx === 0 ? 'var(--ap-accent)' : 'var(--ap-fg)',
            }}
          >
            <span className="truncate">{n.title}</span>
          </Link>
          {idx < nodes.length - 1 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
        </div>
      ))}
    </div>
  )
}

function StreakGrid({ days }: { days: Array<{ date: string; count: number }> }) {
  // 12 weeks × 7 days
  const weeks: Array<Array<{ date: string; count: number }>> = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return (
    <div className="flex gap-[3px]">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((d) => {
            const tint =
              d.count === 0 ? 'var(--ap-bg-sunken)' :
              d.count === 1 ? 'rgba(255,149,0,0.35)' :
              d.count === 2 ? 'rgba(255,149,0,0.65)' :
              '#FF9500'
            return (
              <span
                key={d.date}
                title={`${d.date} · ${d.count} check-in${d.count === 1 ? '' : 's'}`}
                className="h-[12px] w-[12px] rounded-[3px]"
                style={{ background: tint }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function RecommendationRow({ item }: {
  item: { title: string; detail: string; tone: KrDisplayStatus; href?: string }
}) {
  const toneColor =
    item.tone === 'on_track' ? 'var(--ap-green)' :
    item.tone === 'at_risk' ? 'var(--ap-orange)' :
    item.tone === 'off_track' ? 'var(--ap-red)' :
    'var(--ap-fg-muted)'
  const Icon =
    item.tone === 'on_track' ? CheckCircle2 :
    item.tone === 'pending' || item.tone === 'not_measurable' ? TrendingUp :
    AlertTriangle
  const body = (
    <div className="flex gap-3 rounded-[12px] border p-3 transition hover:bg-muted/40"
      style={{ borderColor: 'var(--ap-border)' }}>
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: `${toneColor}1F`, color: toneColor }}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-foreground">{item.title}</div>
        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{item.detail}</p>
      </div>
    </div>
  )
  return item.href ? <Link href={item.href}>{body}</Link> : body
}

function EmptyHint({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-dashed p-4"
      style={{ borderColor: 'var(--ap-border)' }}>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px]"
        style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <p className="text-[13px] text-muted-foreground">{message}</p>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function priorityBg(p: string): string {
  switch (p) {
    case 'URGENT': return 'rgba(175,82,222,0.14)'
    case 'HIGH':   return 'rgba(255,59,48,0.14)'
    case 'MEDIUM': return 'rgba(255,149,0,0.14)'
    default:       return 'var(--ap-bg-sunken)'
  }
}
function priorityFg(p: string): string {
  switch (p) {
    case 'URGENT': return '#AF52DE'
    case 'HIGH':   return '#FF3B30'
    case 'MEDIUM': return '#FF9500'
    default:       return 'var(--ap-fg-muted)'
  }
}

function buildWeeklySeries(dates: string[], weeks: number): number[] {
  // Bucket completion ISO-week-aligned for the past `weeks` weeks (oldest → newest).
  const now = new Date()
  const buckets = new Array<number>(weeks).fill(0)
  for (const d of dates) {
    const t = new Date(d).getTime()
    const ageDays = Math.floor((now.getTime() - t) / 86_400_000)
    const weekIdx = weeks - 1 - Math.floor(ageDays / 7)
    if (weekIdx >= 0 && weekIdx < weeks) buckets[weekIdx]++
  }
  return buckets
}

function buildStreakGrid(dates: string[], days: number): Array<{ date: string; count: number }> {
  // Aligned to today, oldest → newest. Counts occurrences per day.
  const counts = new Map<string, number>()
  for (const d of dates) counts.set(d, (counts.get(d) ?? 0) + 1)
  const out: Array<{ date: string; count: number }> = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    out.push({ date: key, count: counts.get(key) ?? 0 })
  }
  return out
}

function computeCurrentStreak(dates: string[]): number {
  if (dates.length === 0) return 0
  const set = new Set(dates)
  let streak = 0
  const cursor = new Date()
  // Walk backwards from today; stop on the first gap.
  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().slice(0, 10)
    if (set.has(key)) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      // Allow today to be empty; the streak is everything *before* today.
      if (i === 0) {
        cursor.setDate(cursor.getDate() - 1)
        continue
      }
      break
    }
  }
  return streak
}
