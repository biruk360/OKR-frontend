'use client'

import { useEffect, useMemo, useRef } from 'react'
import { AlertCircle, BarChart3, Clipboard, Trophy } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, EmptyState, MiniBadge } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { scrumDateKeyOf } from '../services/view-state'
import { ScrumUpdateCard, type ScrumMemberMap } from './ScrumUpdateCard'

/**
 * Daily Scrum calendar views (spec S3): month wall, ISO week, day, streak, health.
 * `days` come from /api/scrum/calendar and are already working-day filtered
 * (weekends + configured holidays removed) on the server.
 */

type OpenDay = (dateKey: string) => void
type OpenUpdate = (dateKey: string, updateId: string) => void

export function ScrumMonthView({ data, days, memberMap, onOpenDay, onOpenUpdate }: {
  data: any
  days: any[]
  memberMap: ScrumMemberMap
  onOpenDay: OpenDay
  onOpenUpdate: OpenUpdate
}) {
  if (!data) return <ScrumPanelSkeleton />
  if (days.length === 0) return <EmptyPanel title="No working days in this range" />
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
      {days.map((day: any) => (
        <div
          key={day.date}
          className={cn(
            'flex min-h-32 flex-col rounded-card border bg-surface-card p-3 shadow-card',
            day.redTint && 'border-danger-500/40 bg-danger-50',
            day.goldTint && 'border-warning-500/40 bg-warning-50',
          )}
        >
          <button
            type="button"
            onClick={() => onOpenDay(day.date)}
            className="-m-1 mb-2 rounded-md p-1 text-left transition-colors ease-apple hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            aria-label={`Open ${formatDay(day.date)} in day view`}
          >
            <div className="flex items-center justify-between text-body-sm font-medium">
              <span>{day.date.slice(5)}</span>
              <span className="tabular-nums">{day.submittedCount}/{Math.max(1, data.members.length - day.excusedCount)}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-body-sm text-ink-secondary">
              {day.blockerCount > 0 && <span>Blockers {day.blockerCount}</span>}
              {day.winCount > 0 && <span>Wins {day.winCount}</span>}
              {day.absentCount > 0 && <span>Absent {day.absentCount}</span>}
            </div>
          </button>
          <MemberDots day={day} memberMap={memberMap} onOpenDay={onOpenDay} onOpenUpdate={onOpenUpdate} />
        </div>
      ))}
    </div>
  )
}

function MemberDots({ day, memberMap, onOpenDay, onOpenUpdate }: {
  day: any
  memberMap: ScrumMemberMap
  onOpenDay: OpenDay
  onOpenUpdate: OpenUpdate
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {day.dots.map((dot: any) => {
        const member = memberMap.get(dot.userId)
        const who = member?.name || member?.email || 'Team member'
        const text = `${who}: ${DOT_LABEL[dot.state] ?? dot.state}`
        return (
          <button
            key={`${day.date}-${dot.userId}`}
            type="button"
            title={text}
            aria-label={dot.updateId ? `Open update — ${text}` : `${text} (${formatDay(day.date)})`}
            onClick={() => (dot.updateId ? onOpenUpdate(day.date, dot.updateId) : onOpenDay(day.date))}
            className="rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <span className={cn('block size-3 rounded-full', dotColor(dot.state))} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

/** ISO week (Mon–Sun) of the focused date, working days only; each column is one day. */
export function ScrumWeekView({ data, days, memberMap, onOpenDay, onOpenUpdate }: {
  data: any
  days: any[]
  memberMap: ScrumMemberMap
  onOpenDay: OpenDay
  onOpenUpdate: OpenUpdate
}) {
  const updatesByDay = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const update of data?.updates ?? []) {
      const key = scrumDateKeyOf(update.scrumDate)
      const list = map.get(key) ?? []
      list.push(update)
      map.set(key, list)
    }
    return map
  }, [data])
  if (!data) return <ScrumPanelSkeleton />
  if (days.length === 0) return <EmptyPanel title="No working days this week" />
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
      {days.map((day: any) => {
        const updates = updatesByDay.get(day.date) ?? []
        return (
          <div key={day.date} className="flex min-h-40 flex-col gap-2 rounded-card bg-surface-card p-3 shadow-card">
            <button
              type="button"
              onClick={() => onOpenDay(day.date)}
              className="rounded-md text-left transition-colors ease-apple hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              aria-label={`Open ${formatDay(day.date)} in day view`}
            >
              <div className="text-body-sm font-medium">{weekday(day.date)}</div>
              <div className="text-body-sm text-ink-secondary">{day.date.slice(5)} · {day.submittedCount}/{Math.max(1, data.members.length - day.excusedCount)}</div>
            </button>
            {updates.length === 0 ? (
              <p className="text-body-sm text-ink-secondary">No updates</p>
            ) : updates.map((update: any) => {
              const member = memberMap.get(update.userId)
              return (
                <button
                  key={update.id}
                  type="button"
                  onClick={() => onOpenUpdate(day.date, update.id)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-left text-body-sm transition-colors ease-apple hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                    update.hasBlocker ? 'border-danger-500/40' : update.hasWin ? 'border-warning-500/40' : 'border-border',
                  )}
                >
                  <span className="block truncate font-medium">{member?.name || member?.email || 'Team member'}</span>
                  <span className="flex flex-wrap gap-1 pt-0.5">
                    {update.hasBlocker && <MiniBadge tone="danger">Blocker</MiniBadge>}
                    {update.hasWin && <MiniBadge tone="warn">Win</MiniBadge>}
                    {update.isLate && <MiniBadge>Late</MiniBadge>}
                    {update.isProxyEntry && <MiniBadge tone="accent">Proxy</MiniBadge>}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export function ScrumDayView({ data, dateKey, memberMap, currentUserId, highlightId }: {
  data: any
  dateKey: string
  memberMap: ScrumMemberMap
  currentUserId?: string
  highlightId?: string | null
}) {
  const updates = useMemo(
    () => (data?.updates ?? []).filter((u: any) => scrumDateKeyOf(u.scrumDate) === dateKey),
    [data, dateKey],
  )
  const day = useMemo(() => (data?.days ?? []).find((d: any) => d.date === dateKey), [data, dateKey])

  // Deep link (?update=): scroll the highlighted card into view once it renders (once per id, not on refetch).
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!highlightId || !data || scrolledFor.current === highlightId) return
    const el = document.getElementById(`scrum-update-${highlightId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    scrolledFor.current = highlightId
  }, [highlightId, data, updates])

  if (!data) return <ScrumPanelSkeleton />
  const blockers = updates.filter((u: any) => u.hasBlocker)
  const wins = updates.filter((u: any) => u.hasWin)
  const anchored = new Set<string>()
  const takeAnchor = (id: string) => (anchored.has(id) ? false : (anchored.add(id), true))
  const missing = (day?.dots ?? []).filter((dot: any) => dot.state === 'absent' || dot.state === 'excused')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-section-title text-ink-primary">{formatDay(dateKey)}</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => copyStandup(updates, memberMap)}>
          <Clipboard className="mr-2 size-4" aria-hidden="true" />Copy for standup
        </Button>
      </div>
      {!day && <p className="text-body-sm text-ink-secondary">This is not a working day.</p>}
      {[
        { title: 'Blockers first', icon: AlertCircle, rows: blockers, tone: 'danger' as const },
        { title: 'Wins', icon: Trophy, rows: wins, tone: 'warning' as const },
        { title: 'All updates', icon: Clipboard, rows: updates, tone: 'neutral' as const },
      ].map(({ title, icon: Icon, rows, tone }) => (
        <section key={title} className="rounded-card bg-surface-card p-4 shadow-card">
          <h4 className="mb-3 flex items-center gap-2 text-section-title"><Icon className="size-4" aria-hidden="true" />{title} ({rows.length})</h4>
          {rows.length === 0 ? <EmptyState bare title="Nothing here" /> : (
            <div className="space-y-2">
              {rows.map((update: any) => (
                <ScrumUpdateCard
                  key={update.id}
                  update={update}
                  tone={tone}
                  memberMap={memberMap}
                  currentUserId={currentUserId}
                  highlighted={update.id === highlightId}
                  anchor={takeAnchor(update.id)}
                />
              ))}
            </div>
          )}
        </section>
      ))}
      {missing.length > 0 && (
        <section className="rounded-card border border-dashed border-border p-4">
          <h4 className="mb-2 text-body font-medium text-ink-secondary">No update ({missing.length})</h4>
          <ul className="flex flex-wrap gap-2 text-body-sm text-ink-secondary">
            {missing.map((dot: any) => {
              const member = memberMap.get(dot.userId)
              return <li key={dot.userId}>{member?.name || member?.email || 'Team member'}{dot.state === 'excused' ? ' (excused)' : ''}</li>
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

export function ScrumStreakView({ data, days }: { data: any; days: any[] }) {
  if (!data) return <ScrumPanelSkeleton />
  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="space-y-3">
        {data.members.map((member: any) => {
          const dots = days.map((day: any) => day.dots.find((dot: any) => dot.userId === member.id))
          const submitted = dots.filter((dot: any) => dot && dot.state !== 'absent' && dot.state !== 'excused').length
          const rate = dots.length ? Math.round((submitted / dots.length) * 100) : 0
          return (
            <div key={member.id} className="grid gap-2 md:grid-cols-[180px_1fr_120px]">
              <div className="truncate text-body-sm font-medium">{member.name}</div>
              <div className="flex flex-wrap gap-1" role="img" aria-label={`${member.name}: ${submitted} of ${dots.length} days submitted`}>
                {dots.map((dot: any, i: number) => <span key={i} className={cn('size-3 rounded-sm', dotColor(dot?.state ?? 'absent'))} />)}
              </div>
              <div className={cn('text-body-sm', rate < 75 ? 'text-danger-700' : 'text-ink-secondary')}>{rate}% submitted</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ScrumAnalyticsView({ data, error }: { data: any; error: unknown }) {
  if (error) {
    const forbidden = (error as { status?: number }).status === 403
    return (
      <div className="rounded-card bg-surface-card p-4 shadow-card">
        <EmptyState
          bare
          icon={BarChart3}
          title={forbidden ? 'Team health is for managers' : 'Could not load team health'}
          description={forbidden ? 'Health analytics are available to managers, department leads, and admins.' : 'Try again in a moment.'}
        />
      </div>
    )
  }
  if (!data) return <ScrumPanelSkeleton />
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => downloadHealthPng(data)}>
          <BarChart3 className="mr-2 size-4" aria-hidden="true" />Export PNG
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card bg-surface-card p-4 shadow-card">
          <h3 className="mb-3 text-section-title">Blocker Pareto</h3>
          <div className="space-y-2">{(data.blockerPareto ?? []).map((row: any) => <div key={row.category} className="flex justify-between text-body-sm"><span>{label(row.category)}</span><span>{row.daysLost}d</span></div>)}</div>
        </div>
        <div className="rounded-card bg-surface-card p-4 shadow-card">
          <h3 className="mb-3 text-section-title">Integrity</h3>
          <div className="space-y-2 text-body-sm">
            <div className="flex justify-between"><span>Proxy ratio</span><span>{data.totals.proxyRatio}%</span></div>
            <div className="flex justify-between"><span>Carry-forward rate</span><span>{data.carryForwardRate}%</span></div>
            <div className="flex justify-between"><span>Team wins</span><span>{data.totals.wins}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ScrumPanelSkeleton() {
  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card" aria-busy="true" aria-label="Loading scrum data">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-card" />)}
      </div>
    </div>
  )
}

function EmptyPanel({ title }: { title: string }) {
  return <div className="rounded-card bg-surface-card p-4 shadow-card"><EmptyState bare title={title} /></div>
}

const DOT_LABEL: Record<string, string> = {
  submitted: 'submitted',
  late: 'submitted late',
  blocker: 'has a blocker',
  win: 'has a win',
  proxy: 'proxy entry',
  excused: 'excused',
  absent: 'no update',
}

function dotColor(state: string) {
  switch (state) {
    case 'submitted': return 'bg-success-500'
    case 'late': return 'bg-warning-500'
    case 'blocker': return 'bg-danger-500'
    case 'win': return 'bg-warning-400'
    case 'proxy': return 'bg-primary-500'
    case 'excused': return 'bg-primary-200'
    default: return 'bg-ink-tertiary'
  }
}

function formatDay(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function weekday(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
}

async function copyStandup(updates: any[], memberMap?: ScrumMemberMap) {
  const text = buildStandupText(updates, memberMap)
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Standup summary copied')
  } catch {
    toast.error('Clipboard permission blocked')
  }
}

function buildStandupText(updates: any[], memberMap?: ScrumMemberMap) {
  if (updates.length === 0) return 'Daily Scrum: no submitted updates.'
  return updates.map((update) => {
    const member = memberMap?.get(update.userId)
    const userLabel = member?.name || member?.email || 'Team member'
    const header = `${userLabel}${update.isProxyEntry ? ' (proxy)' : ''}${update.isLate ? ' - late' : ''}`
    const parts = [
      header,
      update.blockers ? `Blocker: ${stripHtml(update.blockers)}` : null,
      update.todayPlan ? `Today: ${stripHtml(update.todayPlan)}` : null,
      update.wins ? `Win: ${stripHtml(update.wins)}` : null,
    ].filter(Boolean)
    return parts.join('\n')
  }).join('\n\n')
}

function downloadHealthPng(data: any) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 720
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const styles = getComputedStyle(document.documentElement)
  ctx.fillStyle = styles.getPropertyValue('--ap-bg') || 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = styles.getPropertyValue('--ap-fg') || 'black'
  ctx.font = 'bold 36px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillText('Daily Scrum Team Health', 48, 64)
  ctx.font = '24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  const totals = data.totals ?? {}
  const rows = [
    `Submission rate: ${data.submissionRate ?? 0}%`,
    `Proxy ratio: ${totals.proxyRatio ?? 0}%`,
    `Carry-forward rate: ${data.carryForwardRate ?? 0}%`,
    `Wins: ${totals.wins ?? 0}`,
    `Blockers: ${totals.blockers ?? 0}`,
  ]
  rows.forEach((row, index) => ctx.fillText(row, 56, 130 + index * 44))
  ctx.font = '20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillText('Blocker Pareto', 56, 400)
  ;(data.blockerPareto ?? []).slice(0, 8).forEach((row: any, index: number) => {
    ctx.fillText(`${label(row.category)} - ${row.daysLost}d`, 80, 440 + index * 30)
  })
  const link = document.createElement('a')
  link.download = `daily-scrum-health-${new Date().toISOString().slice(0, 10)}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

function stripHtml(value: string) {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    // Stored text is HTML-escaped; decode for the plain-text clipboard digest.
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
