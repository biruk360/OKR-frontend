'use client'

import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import {
  AlertCircle,
  BarChart3,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Clock,
  Filter,
  Flame,
  Link2,
  MessageSquare,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Button, EmptyState, Input, Label, Modal, PageHeader, StatCard, StatGrid, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import RichTextEditor from '@/components/shared/RichTextEditor'
import { cn } from '@/lib/utils'
import { SCRUM_BLOCKER_CATEGORIES, SCRUM_MOODS, SCRUM_PROXY_REASONS } from '@/types/scrum'
import {
  useLinkableEntities,
  useProxySubjects,
  useSaveScrumUpdate,
  useScrumAnalytics,
  useScrumCalendar,
  useScrumPrefill,
  useScrumSettings,
} from '../hooks/queries'

type FormValues = {
  userId?: string
  scrumDate: string
  yesterdayDone: string
  todayPlan: string
  blockers: string
  blockerCategory: string
  wins: string
  mood: string
  projectId: string
  projectActivityId: string
  proxyReason: string
  proxyReasonDetail: string
}

type SelectedScrumLink = {
  entityType: 'OBJECTIVE' | 'KEY_RESULT' | 'TODO'
  id: string
  title: string
  context: 'TODAY' | 'BLOCKER' | 'WIN' | 'YESTERDAY'
}

const todayKey = () => new Date().toISOString().slice(0, 10)

export function ScrumHome() {
  const [view, setView] = useState('month')
  const [date, setDate] = useState(todayKey())
  const [selectedUserId, setSelectedUserId] = useState('')
  const [proxyOpen, setProxyOpen] = useState(false)
  const [prefillEdited, setPrefillEdited] = useState(false)
  const [filters, setFilters] = useState({ hasBlocker: false, hasWin: false, state: '' })
  const [selectedLinks, setSelectedLinks] = useState<SelectedScrumLink[]>([])
  const settings = useScrumSettings()
  const prefill = useScrumPrefill(selectedUserId || undefined, date)
  const save = useSaveScrumUpdate()
  const linkable = useLinkableEntities(selectedUserId || undefined)
  const proxySubjects = useProxySubjects()

  const monthRange = useMemo(() => {
    const d = new Date(`${date}T00:00:00.000Z`)
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
  }, [date])
  const calendar = useScrumCalendar({
    from: monthRange.from,
    to: monthRange.to,
    userId: selectedUserId || undefined,
    hasBlocker: filters.hasBlocker || undefined,
    hasWin: filters.hasWin || undefined,
    state: filters.state || undefined,
  })
  const analytics = useScrumAnalytics(monthRange)

  const form = useForm<FormValues>({
    defaultValues: {
      scrumDate: date,
      yesterdayDone: '',
      todayPlan: '',
      blockers: '',
      blockerCategory: '',
      wins: '',
      mood: '',
      projectId: '',
      projectActivityId: '',
      proxyReason: '',
      proxyReasonDetail: '',
    },
  })
  const { control, register, handleSubmit, reset, watch, setValue, getValues, formState } = form
  const blockers = watch('blockers')
  const isProxy = !!selectedUserId

  useEffect(() => {
    if (!prefill.data) return
    reset({
      ...getValues(),
      userId: selectedUserId || undefined,
      scrumDate: date,
      yesterdayDone: prefill.data.yesterdayDone || '',
      todayPlan: prefill.data.todayPlan || '',
    })
    setPrefillEdited(false)
  }, [prefill.data, date, selectedUserId])

  useEffect(() => {
    if (!formState.isDirty) return
    const timer = window.setInterval(() => {
      const values = getValues()
      window.localStorage.setItem(`scrum-draft:${values.userId || 'me'}:${values.scrumDate}`, JSON.stringify(values))
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [formState.isDirty, getValues])

  function submit(values: FormValues) {
    save.mutate({
      ...values,
      userId: selectedUserId || undefined,
      blockers: values.blockers || null,
      blockerCategory: values.blockers ? values.blockerCategory : null,
      wins: values.wins || null,
      mood: isProxy ? null : values.mood || null,
      projectId: values.projectId || null,
      projectActivityId: values.projectActivityId || null,
      proxyReason: isProxy ? values.proxyReason : null,
      proxyReasonDetail: isProxy ? values.proxyReasonDetail : null,
      links: selectedLinks.map((link) => ({
        context: link.context,
        objectiveId: link.entityType === 'OBJECTIVE' ? link.id : null,
        keyResultId: link.entityType === 'KEY_RESULT' ? link.id : null,
        todoId: link.entityType === 'TODO' ? link.id : null,
      })),
    })
  }

  function carryItem(item: { text: string; inheritedLinks?: Array<{ objectiveId: string | null; keyResultId: string | null; todoId: string | null; context: SelectedScrumLink['context']; progressNote?: string | null }> }) {
    const current = getValues('todayPlan')
    setValue('todayPlan', current ? `${current}<p>${item.text}</p>` : `<p>${item.text}</p>`, { shouldDirty: true })
    if (!item.inheritedLinks?.length) return
    setSelectedLinks((currentLinks) => mergeSelectedLinks(currentLinks, item.inheritedLinks!, item.text))
  }

  function monthStep(delta: number) {
    const d = new Date(`${date}T00:00:00.000Z`)
    d.setUTCMonth(d.getUTCMonth() + delta)
    setDate(d.toISOString().slice(0, 10))
  }

  const counts = calendar.data?.counts ?? { updates: 0, blockers: 0, wins: 0, absences: 0 }

  return (
    <div className="mx-auto max-w-content px-6 py-6">
      <PageHeader
        title="Daily Scrum"
        description="Submit updates, scan blockers, and review team rhythm."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild><Link href="/dashboard/scrum/wins"><Trophy className="mr-2 size-4" />Wins</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/dashboard/scrum/settings"><Settings className="mr-2 size-4" />Settings</Link></Button>
            <Button size="sm" onClick={() => setProxyOpen(true)}><Users className="mr-2 size-4" />Proxy</Button>
          </div>
        }
      />

      <StatGrid columns={4}>
        <StatCard label="Updates" value={String(counts.updates)} icon={CalendarCheck} tone="blue" />
        <StatCard label="Blockers" value={String(counts.blockers)} icon={AlertCircle} tone={counts.blockers ? 'red' : 'gray'} />
        <StatCard label="Wins" value={String(counts.wins)} icon={Trophy} tone="green" />
        <StatCard label="Excused" value={String(counts.absences)} icon={Clock} tone="gray" />
      </StatGrid>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(360px,480px)_1fr]">
        <form onSubmit={handleSubmit(submit)} className="space-y-4 rounded-card bg-surface-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-section-title text-ink-primary">{isProxy ? 'Proxy Update' : 'My Update'}</h2>
              <p className="text-body-sm text-ink-secondary">{date} · cutoff {settings.data?.cutoffTime ?? '08:30'}</p>
            </div>
            <Input type="date" className="w-40" {...register('scrumDate')} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {isProxy && (
            <div className="rounded-card border border-warning-500/30 bg-warning-50 p-3">
              <Label htmlFor="proxyReason">Proxy reason</Label>
              <select id="proxyReason" className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-body-sm" {...register('proxyReason', { required: isProxy })}>
                <option value="">Select reason</option>
                {SCRUM_PROXY_REASONS.map((reason) => <option key={reason} value={reason}>{label(reason)}</option>)}
              </select>
              <Input className="mt-2" placeholder="Detail" {...register('proxyReasonDetail')} />
            </div>
          )}

          <YesterdayPanel items={prefill.data?.planItems ?? []} openBlocker={prefill.data?.openBlocker} onCarry={carryItem} />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>What I did yesterday</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setValue('yesterdayDone', prefill.data?.yesterdayDone ?? '', { shouldDirty: true })}>
                <RefreshCcw className="mr-2 size-4" />Restore
              </Button>
            </div>
            <Controller
              control={control}
              name="yesterdayDone"
              rules={{ validate: (value) => value.replace(/<[^>]+>/g, '').trim().length >= 10 || 'Minimum 10 characters' }}
              render={({ field }) => (
                <div className={cn(!prefillEdited && prefill.data?.yesterdayDone ? 'italic text-ink-secondary' : 'text-ink-primary')}>
                  <RichTextEditor key={`yd-${prefill.data?.previousUpdateId ?? 'empty'}-${prefillEdited}`} value={field.value} onChange={(value) => { setPrefillEdited(true); field.onChange(value) }} minHeight={110} />
                </div>
              )}
            />
          </div>

          <div>
            <Label>What I will do today</Label>
            <Controller
              control={control}
              name="todayPlan"
              rules={{ validate: (value) => value.replace(/<[^>]+>/g, '').trim().length >= 10 || 'Minimum 10 characters' }}
              render={({ field }) => <RichTextEditor key={`tp-${date}-${selectedUserId}`} value={field.value} onChange={field.onChange} onSubmit={handleSubmit(submit)} minHeight={130} />}
            />
          </div>

          <LinkPicker data={linkable.data} selected={selectedLinks} onChange={setSelectedLinks} />

          <div>
            <Label>Blockers</Label>
            <Controller control={control} name="blockers" render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} minHeight={90} />} />
            {blockers?.replace(/<[^>]+>/g, '').trim() && (
              <select className="mt-2 w-full rounded-md border border-border bg-card px-3 py-2 text-body-sm" {...register('blockerCategory', { required: true })}>
                <option value="">Category</option>
                {SCRUM_BLOCKER_CATEGORIES.map((category) => <option key={category} value={category}>{label(category)}</option>)}
              </select>
            )}
          </div>

          {settings.data?.winsEnabled !== false && (
            <div>
              <Label>Wins</Label>
              <Controller control={control} name="wins" render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} minHeight={80} />} />
            </div>
          )}

          {!isProxy && settings.data?.moodEnabled !== false && (
            <div>
              <Label>Mood</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {SCRUM_MOODS.map((mood) => (
                  <button
                    key={mood}
                    type="button"
                    onClick={() => setValue('mood', mood, { shouldDirty: true })}
                    className={cn('rounded-md border px-3 py-2 text-body-sm', watch('mood') === mood ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border bg-card')}
                  >
                    {label(mood)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface-card px-4 py-3">
            <Button type="button" variant="outline" onClick={() => toast.success('Draft kept locally')}><Save className="mr-2 size-4" />Draft</Button>
            <Button type="submit" disabled={save.isPending}><Check className="mr-2 size-4" />Submit</Button>
          </div>
        </form>

        <div className="min-w-0 space-y-4">
          <Toolbar date={date} onToday={() => setDate(todayKey())} onPrev={() => monthStep(-1)} onNext={() => monthStep(1)} filters={filters} setFilters={setFilters} />
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="streak">Streak</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="analytics">Health</TabsTrigger>
            </TabsList>
            <TabsContent value="month"><MonthView data={calendar.data} setSelectedUserId={setSelectedUserId} /></TabsContent>
            <TabsContent value="day"><DayView data={calendar.data} /></TabsContent>
            <TabsContent value="streak"><StreakView data={calendar.data} /></TabsContent>
            <TabsContent value="week"><WeekView data={calendar.data} /></TabsContent>
            <TabsContent value="analytics"><AnalyticsView data={analytics.data} /></TabsContent>
          </Tabs>
        </div>
      </div>

      <Modal open={proxyOpen} onClose={() => setProxyOpen(false)} title="Log for someone else" size="md">
        <div className="space-y-3">
          <Label>Team member</Label>
          <select className="w-full rounded-md border border-border bg-card px-3 py-2" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            <option value="">Select person</option>
            {(proxySubjects.data ?? []).map((user: any) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setSelectedUserId(''); setProxyOpen(false) }}>Cancel</Button>
            <Button onClick={() => setProxyOpen(false)} disabled={!selectedUserId}>Continue</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Toolbar({ date, onToday, onPrev, onNext, filters, setFilters }: any) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-card p-3 shadow-card">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onPrev}><ChevronLeft className="size-4" /></Button>
        <div className="min-w-36 text-center text-body font-medium">{new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
        <Button variant="ghost" size="sm" onClick={onNext}><ChevronRight className="size-4" /></Button>
        <Button variant="outline" size="sm" onClick={onToday}>Today</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={filters.hasBlocker ? 'default' : 'outline'} size="sm" onClick={() => setFilters((f: any) => ({ ...f, hasBlocker: !f.hasBlocker }))}><Filter className="mr-2 size-4" />Blockers</Button>
        <Button type="button" variant={filters.hasWin ? 'default' : 'outline'} size="sm" onClick={() => setFilters((f: any) => ({ ...f, hasWin: !f.hasWin }))}><Trophy className="mr-2 size-4" />Wins</Button>
        <select className="rounded-md border border-border bg-card px-3 py-2 text-body-sm" value={filters.state} onChange={(e) => setFilters((f: any) => ({ ...f, state: e.target.value }))}>
          <option value="">All states</option>
          <option value="late">Late</option>
          <option value="proxy">Proxy</option>
        </select>
      </div>
    </div>
  )
}

function YesterdayPanel({ items, openBlocker, onCarry }: any) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-card border border-border bg-surface-hover p-3">
      <button type="button" className="flex w-full items-center justify-between text-left text-body-sm font-medium" onClick={() => setOpen(!open)}>
        Yesterday's plan <span>{open ? <X className="size-4" /> : <Plus className="size-4" />}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {items.length === 0 ? <p className="text-body-sm text-ink-secondary">No prior plan.</p> : items.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-card px-3 py-2 text-body-sm">
              <span className="truncate">{item.text}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => onCarry(item)}>Carry</Button>
            </div>
          ))}
          {openBlocker && <div className="rounded-md border border-danger-500/30 bg-danger-50 px-3 py-2 text-body-sm text-danger-700"><Flame className="mr-2 inline size-4" />{openBlocker.daysOpen}d open · {label(openBlocker.category ?? 'OTHER')}</div>}
        </div>
      )}
    </div>
  )
}

function mergeSelectedLinks(
  currentLinks: SelectedScrumLink[],
  inheritedLinks: Array<{ objectiveId: string | null; keyResultId: string | null; todoId: string | null; context: SelectedScrumLink['context'] }>,
  carriedText: string,
): SelectedScrumLink[] {
  const byKey = new Map(currentLinks.map((link) => [`${link.entityType}:${link.id}:${link.context}`, link]))
  for (const link of inheritedLinks) {
    const entityType = link.objectiveId ? 'OBJECTIVE' : link.keyResultId ? 'KEY_RESULT' : link.todoId ? 'TODO' : null
    const id = link.objectiveId ?? link.keyResultId ?? link.todoId
    if (!entityType || !id) continue
    const selected = {
      entityType,
      id,
      title: `Carried: ${carriedText.slice(0, 48)}`,
      context: link.context,
    } satisfies SelectedScrumLink
    byKey.set(`${selected.entityType}:${selected.id}:${selected.context}`, selected)
  }
  return [...byKey.values()]
}

function LinkPicker({ data, selected, onChange }: { data: any; selected: SelectedScrumLink[]; onChange: (links: SelectedScrumLink[]) => void }) {
  const items: SelectedScrumLink[] = [
    ...(data?.todos ?? []).map((x: any) => ({ entityType: 'TODO' as const, id: x.id, title: x.title, context: 'TODAY' as const })),
    ...(data?.keyResults ?? []).map((x: any) => ({ entityType: 'KEY_RESULT' as const, id: x.id, title: x.title, context: 'TODAY' as const })),
    ...(data?.objectives ?? []).map((x: any) => ({ entityType: 'OBJECTIVE' as const, id: x.id, title: x.title, context: 'TODAY' as const })),
  ].slice(0, 5)
  if (items.length === 0) return null
  const selectedIds = new Set(selected.map((item) => `${item.entityType}:${item.id}`))
  function toggle(item: SelectedScrumLink) {
    const key = `${item.entityType}:${item.id}`
    onChange(selectedIds.has(key)
      ? selected.filter((link) => `${link.entityType}:${link.id}` !== key)
      : [...selected, item])
  }
  function updateContext(item: SelectedScrumLink, context: SelectedScrumLink['context']) {
    onChange(selected.map((link) => link.entityType === item.entityType && link.id === item.id ? { ...link, context } : link))
  }
  return (
    <div className="rounded-card border border-border p-3">
      <div className="mb-2 flex items-center gap-2 text-body-sm font-medium"><Link2 className="size-4" />Link suggestions</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const key = `${item.entityType}:${item.id}`
          const picked = selected.find((link) => `${link.entityType}:${link.id}` === key)
          return (
            <div key={key} className={cn('flex items-center gap-1 rounded-pill border px-2 py-1 text-body-sm', picked ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border bg-surface-card text-ink-secondary')}>
              <button type="button" onClick={() => toggle(item)} className="max-w-56 truncate">
                {label(item.entityType)}: {item.title}
              </button>
              {picked && (
                <select
                  value={picked.context}
                  onChange={(e) => updateContext(item, e.target.value as SelectedScrumLink['context'])}
                  className="rounded-md border border-primary-200 bg-white px-1 py-0.5 text-[11px]"
                >
                  <option value="TODAY">Today</option>
                  <option value="YESTERDAY">Yesterday</option>
                  <option value="BLOCKER">Blocker</option>
                  <option value="WIN">Win</option>
                </select>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthView({ data, setSelectedUserId }: any) {
  if (!data) return <PanelSkeleton />
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
      {data.days.map((day: any) => (
        <button key={day.date} type="button" className={cn('min-h-32 rounded-card border bg-surface-card p-3 text-left shadow-card', day.redTint && 'border-danger-500/40 bg-danger-50', day.goldTint && 'border-warning-500/40 bg-warning-50')}>
          <div className="mb-3 flex items-center justify-between text-body-sm font-medium"><span>{day.date.slice(5)}</span><span>{day.submittedCount}/{Math.max(1, data.members.length - day.excusedCount)}</span></div>
          <div className="flex flex-wrap gap-1">
            {day.dots.map((dot: any) => (
              <span
                key={`${day.date}-${dot.userId}`}
                onClick={(e) => { e.stopPropagation(); setSelectedUserId(dot.userId) }}
                className={cn('size-3 rounded-full', dotColor(dot.state))}
                title={`${dot.userId} ${dot.state}`}
              />
            ))}
          </div>
          <div className="mt-3 flex gap-2 text-[11px] text-ink-secondary">
            {day.blockerCount > 0 && <span>Blockers {day.blockerCount}</span>}
            {day.winCount > 0 && <span>Wins {day.winCount}</span>}
            {day.absentCount > 0 && <span>Absent {day.absentCount}</span>}
          </div>
        </button>
      ))}
    </div>
  )
}

function DayView({ data }: any) {
  if (!data) return <PanelSkeleton />
  const updates = data.updates ?? []
  const blockers = updates.filter((u: any) => u.hasBlocker)
  const wins = updates.filter((u: any) => u.hasWin)
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => copyStandup(updates)}>
          <Clipboard className="mr-2 size-4" />Copy for standup
        </Button>
      </div>
      <UpdateSection title="Blockers first" icon={AlertCircle} updates={blockers} tone="danger" />
      <UpdateSection title="Wins" icon={Trophy} updates={wins} tone="warning" />
      <UpdateSection title="All updates" icon={Clipboard} updates={updates} tone="neutral" />
    </div>
  )
}

function UpdateSection({ title, icon: Icon, updates, tone }: any) {
  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-section-title"><Icon className="size-4" />{title} ({updates.length})</div>
      {updates.length === 0 ? <EmptyState bare title="No rows" /> : <div className="space-y-2">{updates.map((update: any) => <UpdateCard key={update.id} update={update} tone={tone} />)}</div>}
    </div>
  )
}

function UpdateCard({ update, tone }: any) {
  return (
    <div className={cn('rounded-md border p-3', tone === 'danger' && 'border-danger-500/40 bg-danger-50', tone === 'warning' && 'border-warning-500/40 bg-warning-50')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-body-sm font-medium"><UserRound className="size-4" />{update.userId}</div>
        <div className="flex items-center gap-2 text-[11px] text-ink-secondary">{update.isProxyEntry && <span>Proxy</span>}{update.isLate && <span>Late</span>}{update.mood && <span>{label(update.mood)}</span>}</div>
      </div>
      {update.blockers && <p className="mt-2 text-body-sm text-danger-700" dangerouslySetInnerHTML={{ __html: update.blockers }} />}
      <p className="mt-2 text-body-sm" dangerouslySetInnerHTML={{ __html: update.todayPlan }} />
      {update.wins && <p className="mt-2 text-body-sm text-success-700" dangerouslySetInnerHTML={{ __html: update.wins }} />}
    </div>
  )
}

function StreakView({ data }: any) {
  if (!data) return <PanelSkeleton />
  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="space-y-3">
        {data.members.map((member: any) => {
          const dots = data.days.map((day: any) => day.dots.find((dot: any) => dot.userId === member.id))
          const submitted = dots.filter((dot: any) => dot && dot.state !== 'absent' && dot.state !== 'excused').length
          const rate = dots.length ? Math.round((submitted / dots.length) * 100) : 0
          return (
            <div key={member.id} className="grid gap-2 md:grid-cols-[180px_1fr_120px]">
              <div className="truncate text-body-sm font-medium">{member.name}</div>
              <div className="flex flex-wrap gap-1">{dots.map((dot: any, i: number) => <span key={i} className={cn('size-3 rounded-sm', dotColor(dot?.state ?? 'absent'))} />)}</div>
              <div className={cn('text-body-sm', rate < 75 ? 'text-danger-700' : 'text-ink-secondary')}>{rate}% submitted</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ data }: any) {
  if (!data) return <PanelSkeleton />
  return <MonthView data={{ ...data, days: data.days.slice(-5) }} setSelectedUserId={() => {}} />
}

function AnalyticsView({ data }: any) {
  if (!data) return <PanelSkeleton />
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => downloadHealthPng(data)}>
          <BarChart3 className="mr-2 size-4" />Export PNG
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

async function copyStandup(updates: any[]) {
  const text = buildStandupText(updates)
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Standup summary copied')
  } catch {
    toast.error('Clipboard permission blocked')
  }
}

function buildStandupText(updates: any[]) {
  if (updates.length === 0) return 'Daily Scrum: no submitted updates.'
  return updates.map((update) => {
    const header = `${update.userId}${update.isProxyEntry ? ' (proxy)' : ''}${update.isLate ? ' - late' : ''}`
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

function PanelSkeleton() {
  return <div className="rounded-card bg-surface-card p-8 shadow-card"><EmptyState bare icon={BarChart3} title="Loading scrum data" /></div>
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

function stripHtml(value: string) {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
