'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import {
  AlertCircle,
  CalendarCheck,
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  HardDrive,
  Save,
  Settings,
  Trophy,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Button,
  FilterSelect,
  Input,
  Label,
  Modal,
  PageHeader,
  StatCard,
  StatGrid,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import RichTextEditor from '@/components/shared/RichTextEditor'
import { cn } from '@/lib/utils'
import { SCRUM_BLOCKER_CATEGORIES, SCRUM_MOODS, SCRUM_PROXY_REASONS } from '@/types/scrum'
import {
  useLinkableEntities,
  useDiscardScrumDraft,
  useProxySubjects,
  useSaveScrumDraft,
  useSaveScrumUpdate,
  useScrumAnalytics,
  useScrumCalendar,
  useScrumPrefill,
  useScrumSettings,
  useScrumUpdate,
} from '../hooks/queries'
import { ScrumItemList } from './ScrumItemList'
import { ScrumYesterdayPanel } from './ScrumYesterdayPanel'
import { ScrumAbsenceModal } from './ScrumAbsenceModal'
import { ScrumSavedViewsMenu } from './ScrumSavedViewsMenu'
import {
  ScrumAnalyticsView,
  ScrumDayView,
  ScrumMonthView,
  ScrumStreakView,
  ScrumWeekView,
} from './ScrumCalendarViews'
import type { ScrumMemberMap } from './ScrumUpdateCard'
import { emptyContentJson, type ScrumContentJson } from '../services/items'
import { shouldPromptSameBlocker } from '../services/blocker-lifecycle'
import {
  DEFAULT_SCRUM_FILTERS,
  SCRUM_HOME_VIEWS,
  calendarFetchRange,
  isInRange,
  isoWeekBounds,
  monthBounds,
  parseScrumDeepLink,
  scrumDateKeyOf,
  scrumDraftStorageKey,
  stepDateKey,
  type ScrumCalendarFilters,
  type ScrumHomeView,
  type ScrumSavedViewFilters,
} from '../services/view-state'

type FormValues = {
  userId?: string
  scrumDate: string
  contentJson: ScrumContentJson
  blockerCategory: string
  mood: string
  projectId: string
  projectActivityId: string
  proxyReason: string
  proxyReasonDetail: string
  remarks: string
}

export interface ScrumHomeProps {
  currentUserId: string
  /** Server-computed (canReadScrumSettings): only then is the Settings button shown. */
  canReadSettings?: boolean
}

const todayKey = () => new Date().toISOString().slice(0, 10)

// Device-local draft buffer (10s autosave). "Save draft" also stores a server
// draft (status DRAFT — no attendance, To-do sync or notifications until
// submitted); this local copy stays as the fallback, and the newer one wins.
type LocalDraft = Partial<FormValues> & { savedAt?: number }
type ServerDraft = {
  id: string
  contentJson: ScrumContentJson
  blockerCategory: string | null
  mood: string | null
  projectId: string | null
  projectActivityId: string | null
  remarks: string | null
  updatedAt: string
}
function readDraft(key: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as LocalDraft) : null
  } catch {
    return null
  }
}
function writeDraft(key: string, values: FormValues): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...values, savedAt: Date.now() }))
    return true
  } catch {
    return false
  }
}
function clearDraft(key: string) {
  try { window.localStorage.removeItem(key) } catch { /* storage unavailable */ }
}

export function ScrumHome({ currentUserId, canReadSettings = false }: ScrumHomeProps) {
  const searchParams = useSearchParams()
  const [view, setView] = useState<ScrumHomeView>('month')
  const [viewDate, setViewDate] = useState(todayKey())
  const [formDate, setFormDate] = useState(todayKey())
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [proxyOpen, setProxyOpen] = useState(false)
  const [absenceOpen, setAbsenceOpen] = useState(false)
  const [restoredDraft, setRestoredDraft] = useState<'server' | 'device' | null>(null)
  const [serverDraftId, setServerDraftId] = useState<string | null>(null)
  const [sameBlockerPrompt, setSameBlockerPrompt] = useState<FormValues | null>(null)
  const [filters, setFilters] = useState<ScrumCalendarFilters>(DEFAULT_SCRUM_FILTERS)
  const settings = useScrumSettings()
  const prefill = useScrumPrefill(selectedUserId || undefined, formDate)
  const save = useSaveScrumUpdate()
  const saveServerDraft = useSaveScrumDraft()
  const discardServerDraft = useDiscardScrumDraft()
  const linkable = useLinkableEntities(selectedUserId || undefined)
  const proxySubjects = useProxySubjects()

  // ── Deep links: ?date= selects a day, ?update= opens + highlights that update, ?view= picks a tab.
  const deepLink = useMemo(() => parseScrumDeepLink(searchParams), [searchParams])
  const linkedUpdate = useScrumUpdate(deepLink.updateId)
  useEffect(() => {
    if (deepLink.view) setView(deepLink.view)
    // Selects the day being viewed; the submit form keeps its own date (today by default).
    if (deepLink.date) setViewDate(deepLink.date)
    setHighlightId(deepLink.updateId ?? null)
  }, [deepLink])
  useEffect(() => {
    if (linkedUpdate.data?.scrumDate) {
      setViewDate(scrumDateKeyOf(linkedUpdate.data.scrumDate))
      setView('day')
    }
  }, [linkedUpdate.data])
  useEffect(() => {
    if (linkedUpdate.error) toast.error('That scrum update is not available to you')
  }, [linkedUpdate.error])

  const fetchRange = useMemo(() => calendarFetchRange(viewDate), [viewDate])
  const month = useMemo(() => monthBounds(viewDate), [viewDate])
  const week = useMemo(() => isoWeekBounds(viewDate), [viewDate])
  const calendar = useScrumCalendar({
    from: fetchRange.from,
    to: fetchRange.to,
    userId: selectedUserId || undefined,
    hasBlocker: filters.hasBlocker || undefined,
    hasWin: filters.hasWin || undefined,
    state: filters.state || undefined,
  })
  const analytics = useScrumAnalytics(month)
  const monthDays = useMemo(() => (calendar.data?.days ?? []).filter((d: any) => isInRange(d.date, month)), [calendar.data, month])
  const weekDays = useMemo(() => (calendar.data?.days ?? []).filter((d: any) => isInRange(d.date, week)), [calendar.data, week])

  const form = useForm<FormValues>({
    defaultValues: {
      scrumDate: formDate,
      contentJson: emptyContentJson(),
      blockerCategory: '',
      mood: '',
      projectId: '',
      projectActivityId: '',
      proxyReason: '',
      proxyReasonDetail: '',
      remarks: '',
    },
  })
  const { control, register, handleSubmit, reset, watch, setValue, getValues, formState } = form
  const contentJson = watch('contentJson')
  const isProxy = !!selectedUserId
  const draftKey = scrumDraftStorageKey(selectedUserId || undefined, formDate)

  useEffect(() => {
    if (!prefill.data) return
    const base: FormValues = {
      ...getValues(),
      userId: selectedUserId || undefined,
      scrumDate: formDate,
      contentJson: prefill.data.contentJson || emptyContentJson(),
      blockerCategory: '',
      mood: '',
      remarks: '',
    }
    // Server drafts are only returned for your own update (never in proxy mode).
    const server: ServerDraft | null = selectedUserId ? null : prefill.data.serverDraft ?? null
    setServerDraftId(server?.id ?? null)
    const { savedAt, ...local } = readDraft(draftKey) ?? {}
    const serverIsNewer = !!server && (!savedAt || Date.parse(server.updatedAt) >= savedAt)
    if (server && (serverIsNewer || !local.contentJson)) {
      reset({
        ...base,
        contentJson: server.contentJson,
        blockerCategory: server.blockerCategory ?? '',
        mood: server.mood ?? '',
        projectId: server.projectId ?? '',
        projectActivityId: server.projectActivityId ?? '',
        remarks: server.remarks ?? '',
      }, { keepDefaultValues: true })
      setRestoredDraft('server')
    } else if (local.contentJson) {
      reset({ ...base, ...local, userId: selectedUserId || undefined, scrumDate: formDate }, { keepDefaultValues: true })
      setRestoredDraft('device')
    } else {
      reset(base)
      setRestoredDraft(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill.data, formDate, selectedUserId])

  // Autosave (spec S1.1: every 10s) — to this device only; see readDraft().
  useEffect(() => {
    if (!formState.isDirty) return
    const timer = window.setInterval(() => writeDraft(draftKey, getValues()), 10_000)
    return () => window.clearInterval(timer)
  }, [formState.isDirty, getValues, draftKey])

  function saveDraftNow() {
    const values = getValues()
    const savedLocally = writeDraft(draftKey, values)
    // Proxy entries stay device-only: a server draft is always the owner's own.
    if (isProxy) {
      if (savedLocally) toast.success('Draft saved on this device only — submit to share it with your team')
      else toast.error('This browser blocked local storage, so the draft could not be kept')
      return
    }
    saveServerDraft.mutate({
      scrumDate: formDate,
      contentJson: values.contentJson,
      blockerCategory: values.blockerCategory || null,
      mood: values.mood || null,
      projectId: values.projectId || null,
      projectActivityId: values.projectActivityId || null,
      remarks: values.remarks || null,
    }, {
      onSuccess: (update: { id?: string } | undefined) => {
        setServerDraftId(update?.id ?? null)
        toast.success('Draft saved — only you can see it until you submit')
      },
      onError: (err: Error) => {
        toast.error(savedLocally
          ? `${err.message}. Your draft is kept on this device.`
          : err.message)
      },
    })
  }

  function discardDraft() {
    clearDraft(draftKey)
    if (serverDraftId) discardServerDraft.mutate(serverDraftId)
    setServerDraftId(null)
    setRestoredDraft(null)
    reset({
      ...getValues(),
      contentJson: prefill.data?.contentJson || emptyContentJson(),
      blockerCategory: '',
      mood: '',
      remarks: '',
    })
  }

  function submit(values: FormValues, sameBlockerConfirmed?: boolean) {
    const yesterdayItems = (values.contentJson.yesterdayItems ?? []).map((item) => {
      if (item.status !== 'DONE' && item.status !== 'NOT_DONE') {
        return { ...item, status: 'CARRIED' as const }
      }
      return item
    })
    const autoCarried = yesterdayItems
      .filter((item) => item.status === 'CARRIED')
      .map((item) => ({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: item.text,
        todoId: item.todoId,
        objectiveId: item.objectiveId,
        keyResultId: item.keyResultId,
        status: 'PENDING' as const,
      }))
    const nextContent: ScrumContentJson = {
      ...values.contentJson,
      yesterdayItems,
      todayItems: [...(values.contentJson.todayItems ?? []), ...autoCarried],
    }
    if ((nextContent.todayItems?.length ?? 0) === 0) {
      toast.error('Add at least one task for today')
      return
    }
    const blockerItems = nextContent.blockerItems ?? []
    if (blockerItems.length > 0 && !values.blockerCategory) {
      toast.error('Pick a blocker category')
      return
    }
    // Spec S5.1: "Is this the same blocker as yesterday?" before the lifecycle decides RECURRING.
    const openBlocker = prefill.data?.openBlocker
    if (sameBlockerConfirmed === undefined && blockerItems.length > 0 && openBlocker && shouldPromptSameBlocker({
      previousText: openBlocker.text,
      previousCategory: openBlocker.category,
      text: blockerItems.map((item) => item.text).join('\n'),
      category: values.blockerCategory,
    })) {
      setSameBlockerPrompt(values)
      return
    }
    save.mutate({
      ...values,
      userId: selectedUserId || undefined,
      contentJson: nextContent,
      blockerCategory: blockerItems.length > 0 ? values.blockerCategory : null,
      mood: isProxy ? null : values.mood || null,
      projectId: values.projectId || null,
      projectActivityId: values.projectActivityId || null,
      proxyReason: isProxy ? values.proxyReason : null,
      proxyReasonDetail: isProxy ? values.proxyReasonDetail : null,
      remarks: values.remarks || null,
      sameBlockerConfirmed: sameBlockerConfirmed ?? null,
      links: [],
    }, {
      onSuccess: () => {
        // The stored draft (if any) is now the submitted update.
        clearDraft(draftKey)
        setServerDraftId(null)
        setRestoredDraft(null)
      },
    })
  }

  function answerSameBlocker(same: boolean) {
    const values = sameBlockerPrompt
    setSameBlockerPrompt(null)
    if (values) submit(values, same)
  }

  const openDay = useCallback((dateKey: string) => {
    setViewDate(dateKey)
    setHighlightId(null)
    setView('day')
  }, [])
  const openUpdate = useCallback((dateKey: string, updateId: string) => {
    setViewDate(dateKey)
    setHighlightId(updateId)
    setView('day')
  }, [])

  function applySavedView(saved: ScrumSavedViewFilters) {
    setFilters({ hasBlocker: saved.hasBlocker, hasWin: saved.hasWin, state: saved.state })
    if (saved.view) setView(saved.view)
  }

  const counts = useMemo(() => monthDays.reduce(
    (acc: { updates: number; blockers: number; wins: number; absences: number }, day: any) => ({
      updates: acc.updates + day.submittedCount,
      blockers: acc.blockers + day.blockerCount,
      wins: acc.wins + day.winCount,
      absences: acc.absences + day.excusedCount,
    }),
    { updates: 0, blockers: 0, wins: 0, absences: 0 },
  ), [monthDays])
  const memberMap: ScrumMemberMap = useMemo(() => {
    const map: ScrumMemberMap = new Map()
    for (const m of calendar.data?.members ?? []) map.set(m.id, m)
    return map
  }, [calendar.data])
  const linkableOptions = useMemo(() => {
    const options: { id: string; title: string; type: 'OBJECTIVE' | 'KEY_RESULT'; subtitle?: string }[] = []
    for (const obj of linkable.data?.objectives ?? []) options.push({ id: obj.id, title: obj.title, type: 'OBJECTIVE' })
    for (const kr of linkable.data?.keyResults ?? []) options.push({ id: kr.id, title: kr.title, type: 'KEY_RESULT', subtitle: kr.objective?.title })
    return options
  }, [linkable.data])
  const subjects = proxySubjects.data ?? []
  const canProxy = settings.data?.proxyEntryEnabled !== false && subjects.length > 0

  return (
    <div className="mx-auto max-w-content px-6 py-6">
      <PageHeader
        title="Daily Scrum"
        description="Submit updates, scan blockers, and review team rhythm."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild><Link href="/dashboard/scrum/wins"><Trophy className="mr-2 size-4" />Wins</Link></Button>
            <Button variant="outline" size="sm" onClick={() => setAbsenceOpen(true)}><CalendarOff className="mr-2 size-4" />Absence</Button>
            {canReadSettings && (
              <Button variant="outline" size="sm" asChild><Link href="/dashboard/scrum/settings"><Settings className="mr-2 size-4" />Settings</Link></Button>
            )}
            {canProxy && <Button size="sm" onClick={() => setProxyOpen(true)}><Users className="mr-2 size-4" />Proxy</Button>}
          </div>
        }
      />

      <StatGrid columns={4}>
        <StatCard label="Updates this month" value={String(counts.updates)} icon={CalendarCheck} tone="blue" />
        <StatCard label="Blockers" value={String(counts.blockers)} icon={AlertCircle} tone={counts.blockers ? 'red' : 'gray'} />
        <StatCard label="Wins" value={String(counts.wins)} icon={Trophy} tone="green" />
        <StatCard label="Excused" value={String(counts.absences)} icon={Clock} tone="gray" />
      </StatGrid>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(360px,480px)_1fr]">
        <form
          onSubmit={handleSubmit((values) => submit(values))}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void handleSubmit((values) => submit(values))() } }}
          className="space-y-4 rounded-card bg-surface-card p-4 shadow-card"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-section-title text-ink-primary">{isProxy ? 'Proxy Update' : 'My Update'}</h2>
              <p className="text-body-sm text-ink-secondary">{formDate} · cutoff {settings.data?.cutoffTime ?? '08:30'}</p>
            </div>
            <Input
              type="date"
              aria-label="Update date"
              className="w-40"
              {...register('scrumDate')}
              value={formDate}
              onChange={(e) => { if (e.target.value) setFormDate(e.target.value) }}
            />
          </div>

          {restoredDraft && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary-500/30 bg-primary-50 px-3 py-2 text-body-sm">
              <span>
                {restoredDraft === 'server'
                  ? 'Restored your saved draft. Only you can see it until you submit.'
                  : 'Restored your unsent draft from this device.'}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>Discard draft</Button>
            </div>
          )}

          {isProxy && (
            <div className="space-y-2 rounded-card border border-warning-500/30 bg-warning-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-sm font-medium">Logging for {subjects.find((s: any) => s.id === selectedUserId)?.name ?? 'a team member'}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedUserId('')}>Back to my update</Button>
              </div>
              <Controller
                control={control}
                name="proxyReason"
                rules={{ required: isProxy }}
                render={({ field }) => (
                  <FilterSelect
                    label="Proxy reason"
                    placeholder="Select reason"
                    value={field.value || undefined}
                    onValueChange={(value) => field.onChange(value ?? '')}
                    options={SCRUM_PROXY_REASONS.map((reason) => ({ value: reason, label: label(reason) }))}
                    className="w-full"
                    menuWidth={260}
                  />
                )}
              />
              {formState.errors.proxyReason && <p className="text-body-sm text-danger-700">A proxy reason is required.</p>}
              <Input placeholder="Detail" aria-label="Proxy reason detail" {...register('proxyReasonDetail')} />
            </div>
          )}

          <Controller
            control={control}
            name="contentJson"
            render={({ field }) => (
              <div className="space-y-4">
                <ScrumYesterdayPanel
                  yesterdayItems={field.value.yesterdayItems ?? []}
                  todayItems={field.value.todayItems ?? []}
                  openBlocker={prefill.data?.openBlocker}
                  onChangeYesterday={(items) => field.onChange({ ...field.value, yesterdayItems: items })}
                  onChangeToday={(items) => field.onChange({ ...field.value, todayItems: items })}
                />

                <ScrumItemList
                  items={field.value.todayItems ?? []}
                  onChange={(items) => field.onChange({ ...field.value, todayItems: items })}
                  mode="today"
                  label="What I'll do today"
                  placeholder="Today's task"
                  linkableOptions={linkableOptions}
                  linkHeader="Link today's task with your OKR"
                />

                <div>
                  <ScrumItemList
                    items={field.value.blockerItems ?? []}
                    onChange={(items) => field.onChange({ ...field.value, blockerItems: items })}
                    mode="blocker"
                    label="Blockers"
                    placeholder="Blocker or impediment"
                    linkableOptions={linkableOptions}
                  />
                  {(contentJson.blockerItems?.length ?? 0) > 0 && (
                    <Controller
                      control={control}
                      name="blockerCategory"
                      render={({ field: categoryField }) => (
                        <FilterSelect
                          label="Blocker category"
                          placeholder="Required"
                          value={categoryField.value || undefined}
                          onValueChange={(value) => categoryField.onChange(value ?? '')}
                          options={SCRUM_BLOCKER_CATEGORIES.map((category) => ({ value: category, label: label(category) }))}
                          className="mt-2 w-full"
                          menuWidth={260}
                        />
                      )}
                    />
                  )}
                </div>

                {settings.data?.winsEnabled !== false && (
                  <ScrumItemList
                    items={field.value.winItems ?? []}
                    onChange={(items) => field.onChange({ ...field.value, winItems: items })}
                    mode="win"
                    label="Wins"
                    placeholder="Win or accomplishment"
                  />
                )}
              </div>
            )}
          />

          <div>
            <Label>Remarks / Notes</Label>
            <Controller
              control={control}
              name="remarks"
              render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} minHeight={100} />}
            />
          </div>

          {!isProxy && settings.data?.moodEnabled !== false && (
            <div>
              <Label>Mood</Label>
              <p className="text-body-sm text-ink-secondary">Optional. Only you and your direct manager see it.</p>
              <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Mood">
                {SCRUM_MOODS.map((mood) => (
                  <button
                    key={mood}
                    type="button"
                    role="radio"
                    aria-checked={watch('mood') === mood}
                    onClick={() => setValue('mood', watch('mood') === mood ? '' : mood, { shouldDirty: true })}
                    className={cn('rounded-md border px-3 py-2 text-body-sm', watch('mood') === mood ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border bg-card')}
                  >
                    {label(mood)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-card px-4 py-3">
            <span className="mr-auto text-body-sm text-ink-secondary">Autosaves to this device every 10s</span>
            <Button type="button" variant="outline" onClick={saveDraftNow} disabled={saveServerDraft.isPending}>
              {isProxy
                ? <><HardDrive className="mr-2 size-4" />Save on this device</>
                : <><Save className="mr-2 size-4" />{saveServerDraft.isPending ? 'Saving…' : 'Save draft'}</>}
            </Button>
            <Button type="submit" disabled={save.isPending}><Check className="mr-2 size-4" />Submit</Button>
          </div>
        </form>

        <div className="min-w-0 space-y-4">
          <Toolbar
            view={view}
            viewDate={viewDate}
            week={week}
            onToday={() => { setViewDate(todayKey()); setHighlightId(null) }}
            onStep={(delta) => setViewDate((d) => stepDateKey(d, view, delta))}
            filters={filters}
            setFilters={setFilters}
            onApplySavedView={applySavedView}
          />
          <Tabs value={view} onValueChange={(v) => { if ((SCRUM_HOME_VIEWS as readonly string[]).includes(v)) setView(v as ScrumHomeView) }}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="streak">Streak</TabsTrigger>
              <TabsTrigger value="analytics">Health</TabsTrigger>
            </TabsList>
            <TabsContent value="month"><ScrumMonthView data={calendar.data} days={monthDays} memberMap={memberMap} onOpenDay={openDay} onOpenUpdate={openUpdate} /></TabsContent>
            <TabsContent value="week"><ScrumWeekView data={calendar.data} days={weekDays} memberMap={memberMap} onOpenDay={openDay} onOpenUpdate={openUpdate} /></TabsContent>
            <TabsContent value="day"><ScrumDayView data={calendar.data} dateKey={viewDate} memberMap={memberMap} currentUserId={currentUserId} highlightId={highlightId} /></TabsContent>
            <TabsContent value="streak"><ScrumStreakView data={calendar.data} days={monthDays} /></TabsContent>
            <TabsContent value="analytics"><ScrumAnalyticsView data={analytics.data} error={analytics.error} /></TabsContent>
          </Tabs>
        </div>
      </div>

      <ProxyPicker
        open={proxyOpen}
        onClose={() => setProxyOpen(false)}
        subjects={subjects}
        onConfirm={(userId) => { setSelectedUserId(userId); setProxyOpen(false) }}
      />

      <ScrumAbsenceModal
        open={absenceOpen}
        onClose={() => setAbsenceOpen(false)}
        currentUserId={currentUserId}
        subjects={subjects}
        defaultDate={formDate}
      />

      <Modal open={!!sameBlockerPrompt} onClose={() => setSameBlockerPrompt(null)} title="Same blocker as yesterday?" icon={AlertCircle} size="md">
        <div className="space-y-3">
          <p className="text-body-sm text-ink-secondary">
            Your last update had an open {label(prefill.data?.openBlocker?.category ?? 'other').toLowerCase()} blocker that looks similar.
            If it is the same one, its day count continues and a recurring blocker notifies your department lead.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => answerSameBlocker(false)}>No, it&apos;s new</Button>
            <Button type="button" onClick={() => answerSameBlocker(true)}>Yes, same blocker</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function ProxyPicker({ open, onClose, subjects, onConfirm }: {
  open: boolean
  onClose: () => void
  subjects: Array<{ id: string; name?: string | null; email?: string | null }>
  onConfirm: (userId: string) => void
}) {
  const { control, handleSubmit, reset, watch } = useForm<{ userId?: string }>({ defaultValues: {} })
  useEffect(() => { if (open) reset({}) }, [open, reset])
  const userId = watch('userId')
  return (
    <Modal open={open} onClose={onClose} title="Log for someone else" icon={Users} size="md">
      <form onSubmit={handleSubmit((values) => { if (values.userId) onConfirm(values.userId) })} className="space-y-3">
        <Controller
          control={control}
          name="userId"
          render={({ field }) => (
            <FilterSelect
              label="Team member"
              placeholder="Select person"
              value={field.value}
              onValueChange={field.onChange}
              options={subjects.map((user) => ({ value: user.id, label: user.name || user.email || 'Team member' }))}
              className="w-full"
              menuWidth={280}
            />
          )}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!userId}>Continue</Button>
        </div>
      </form>
    </Modal>
  )
}

function Toolbar({ view, viewDate, week, onToday, onStep, filters, setFilters, onApplySavedView }: {
  view: ScrumHomeView
  viewDate: string
  week: { from: string; to: string }
  onToday: () => void
  onStep: (delta: number) => void
  filters: ScrumCalendarFilters
  setFilters: (updater: (f: ScrumCalendarFilters) => ScrumCalendarFilters) => void
  onApplySavedView: (saved: ScrumSavedViewFilters) => void
}) {
  const unit = view === 'week' ? 'week' : view === 'day' ? 'day' : 'month'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-card p-3 shadow-card">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => onStep(-1)} aria-label={`Previous ${unit}`}><ChevronLeft className="size-4" /></Button>
        <div className="min-w-36 text-center text-body font-medium">{rangeTitle(view, viewDate, week)}</div>
        <Button variant="ghost" size="sm" onClick={() => onStep(1)} aria-label={`Next ${unit}`}><ChevronRight className="size-4" /></Button>
        <Button variant="outline" size="sm" onClick={onToday}>Today</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={filters.hasBlocker ? 'default' : 'outline'} size="sm" aria-pressed={filters.hasBlocker} onClick={() => setFilters((f) => ({ ...f, hasBlocker: !f.hasBlocker }))}><Filter className="mr-2 size-4" />Blockers</Button>
        <Button type="button" variant={filters.hasWin ? 'default' : 'outline'} size="sm" aria-pressed={filters.hasWin} onClick={() => setFilters((f) => ({ ...f, hasWin: !f.hasWin }))}><Trophy className="mr-2 size-4" />Wins</Button>
        <FilterSelect
          label="State"
          placeholder="All states"
          value={filters.state || undefined}
          onValueChange={(value) => setFilters((f) => ({ ...f, state: value === 'late' || value === 'proxy' ? value : '' }))}
          options={[{ value: 'late', label: 'Late' }, { value: 'proxy', label: 'Proxy' }]}
        />
        <ScrumSavedViewsMenu current={{ ...filters, view }} onApply={onApplySavedView} />
      </div>
    </div>
  )
}

function rangeTitle(view: ScrumHomeView, viewDate: string, week: { from: string; to: string }) {
  const d = (key: string) => new Date(`${key}T00:00:00`)
  if (view === 'week') {
    return `${d(week.from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${d(week.to).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  if (view === 'day') return d(viewDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return d(viewDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
