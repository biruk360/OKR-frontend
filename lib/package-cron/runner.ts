/**
 * Package daily cron — runner (server only). Called by
 * `app/api/cron/package-daily/route.ts` at 02:00 UTC (05:00 EAT).
 *
 * Order matters: KPI-3 auto-fill runs first, so a period it fills is never
 * reported as overdue by KPI-5 in the same run.
 *
 * Every notification goes through `emitNow` (lib/notifications/dispatcher) with
 * the package record as entityType + entityId, so the dispatcher resolves the
 * recipients (§9) and the deep link. Before emitting, the runner looks up what
 * was already sent for the same event + entity (in-app Notification rows and
 * EmailDigestQueue rows, which both carry `entityId` in their metadata) and
 * skips anything inside its window — see `since` in ./selection.ts. Re-running
 * the job on the same day therefore sends nothing new.
 *
 * PKG-1: the last job archives APPROVED packages whose timeframe has ended
 * (APPROVED → ARCHIVED "when the timeframe closes").
 *
 * Jobs are independent: one failing is recorded in `errors` and the others
 * still run.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { emitNow } from '@/lib/notifications/dispatcher'
import type { EventKey, EventPayload } from '@/lib/notifications/events'
import { recordPackageActivity } from '@/lib/package/audit'
import {
  addDaysToKey,
  dateKeyInZone,
  fiscalStartMonthOf,
  KPI_DEFAULT_TIMEZONE,
  periodEndDate,
  periodStartDate,
  storedDateKey,
  timeframeWindowKeys,
} from '@/lib/kpi'
import { DEVELOPMENT_KIND_LABELS, isDevelopmentKind } from '@/types/package'
import {
  DEV_ITEM_DUE_DAYS,
  earliestSince,
  joinNames,
  keyStart,
  KPI_AUTOFILL_MAX_LAG_DAYS,
  KPI_DUE_MAX_AGE_DAYS,
  KR_CHECKPOINT_DUE_DAYS,
  latestSentByEntity,
  partitionUnsent,
  planCheckpointDue,
  planDependencyDueSoon,
  planDependencyLate,
  planDevItemDue,
  planKpiAutoFill,
  planKpiReadingDue,
  type EmitCandidate,
  type KpiCronInput,
} from './selection'

export type PackageCronEventKey = Extract<
  EventKey,
  'KPI_READING_DUE' | 'DEPENDENCY_DUE_SOON' | 'DEPENDENCY_LATE' | 'DEV_ITEM_DUE' | 'KR_CHECKPOINT_DUE'
>

export interface PackageCronEventStats {
  /** Entities the rule selected today. */
  candidates: number
  /** Emitted this run (or would be, in a dry run). */
  sent: number
  /** Already notified inside their window. */
  alreadySent: number
}

export interface PackageDailyResult {
  todayKey: string
  timeZone: string
  dryRun: boolean
  autoFill: { scanned: number; filled: number; failed: number }
  events: Record<PackageCronEventKey, PackageCronEventStats>
  /** PKG-1: APPROVED packages whose timeframe ended before today. */
  archive: { candidates: number; archived: number; failed: number }
  errors: Array<{ job: string; message: string }>
  durationMs: number
}

export interface PackageDailyOptions {
  now?: Date
  /** Select and dedupe, but write nothing and emit nothing. */
  dryRun?: boolean
  /** Injectable for tests; defaults to the dispatcher's emitNow. */
  emit?: (eventKey: EventKey, payload: EventPayload) => Promise<void>
}

interface Calendar {
  todayKey: string
  timeZone: string
  holidays: ReadonlySet<string>
}

/** Org working calendar — the same source the KPI API uses (Scrum settings). */
async function loadCalendar(now: Date): Promise<Calendar> {
  const settings = await prisma.scrumSettings
    .findUnique({ where: { id: 'default' }, select: { timezone: true, holidays: true } })
    .catch(() => null)
  const timeZone = settings?.timezone || KPI_DEFAULT_TIMEZONE
  return { todayKey: dateKeyInZone(now, timeZone), timeZone, holidays: new Set(settings?.holidays ?? []) }
}

function emptyStats(): PackageCronEventStats {
  return { candidates: 0, sent: 0, alreadySent: 0 }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Latest send per entity for `eventKey` since `since`: in-app rows plus digest
 * rows (a recipient with in-app off still leaves a digest row).
 */
async function loadLastSent(eventKey: EventKey, since: Date): Promise<Map<string, Date>> {
  const [notifications, queued] = await Promise.all([
    prisma.notification.findMany({
      where: { eventKey, createdAt: { gte: since } },
      select: { metadata: true, createdAt: true },
    }),
    prisma.emailDigestQueue.findMany({
      where: { eventKey, queuedAt: { gte: since } },
      select: { metadata: true, queuedAt: true },
    }),
  ])
  return latestSentByEntity([
    ...notifications.map((n) => ({ metadata: n.metadata, at: n.createdAt })),
    ...queued.map((q) => ({ metadata: q.metadata, at: q.queuedAt })),
  ])
}

/**
 * Dedupe, then emit sequentially (keeps a burst inside the Prisma pool, like
 * lib/notifications/jobs.ts).
 */
async function dispatch<T extends EmitCandidate>(
  eventKey: PackageCronEventKey,
  candidates: readonly T[],
  toPayload: (candidate: T) => EventPayload,
  ctx: { dryRun: boolean; emit: NonNullable<PackageDailyOptions['emit']> },
): Promise<PackageCronEventStats> {
  const stats = emptyStats()
  stats.candidates = candidates.length
  const since = earliestSince(candidates)
  if (!since) return stats
  const lastSent = await loadLastSent(eventKey, since)
  const { send, skipped } = partitionUnsent(candidates, lastSent)
  stats.alreadySent = skipped.length
  for (const candidate of send) {
    if (!ctx.dryRun) await ctx.emit(eventKey, toPayload(candidate))
    stats.sent += 1
  }
  return stats
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

type KpiRow = Awaited<ReturnType<typeof loadKpis>>[number]

async function loadKpis(todayKey: string) {
  // Timeframes that ended long ago have nothing left to fill or remind about.
  const horizon = keyStart(addDaysToKey(todayKey, -(Math.max(KPI_DUE_MAX_AGE_DAYS, KPI_AUTOFILL_MAX_LAG_DAYS) + 1)))
  return prisma.kpi.findMany({
    where: { status: 'ACTIVE', timeframe: { endDate: { gte: horizon } } },
    select: {
      id: true,
      name: true,
      ownerId: true,
      timeframeId: true,
      packageId: true,
      status: true,
      frequency: true,
      direction: true,
      targetValue: true,
      targetMin: true,
      targetMax: true,
      thresholdAmber: true,
      unit: true,
      scoredFrom: true,
      isSensitive: true,
      keyResultId: true,
      createdAt: true,
      timeframe: { select: { startDate: true, endDate: true } },
      keyResult: { select: { currentValue: true, status: true } },
      readings: { select: { periodStart: true } },
    },
  })
}

function toKpiInput(kpi: KpiRow, calendar: Calendar, extraReadingKeys?: ReadonlySet<string>): KpiCronInput {
  const window = timeframeWindowKeys(kpi.timeframe.startDate, kpi.timeframe.endDate)
  const readingStartKeys = new Set(kpi.readings.map((r) => storedDateKey(r.periodStart)))
  if (extraReadingKeys) for (const key of extraReadingKeys) readingStartKeys.add(key)
  return {
    id: kpi.id,
    status: kpi.status,
    frequency: kpi.frequency,
    direction: kpi.direction,
    targetValue: kpi.targetValue,
    targetMin: kpi.targetMin,
    targetMax: kpi.targetMax,
    thresholdAmber: kpi.thresholdAmber,
    scoredFrom: kpi.scoredFrom,
    createdKey: dateKeyInZone(kpi.createdAt, calendar.timeZone),
    windowStartKey: window.startKey,
    windowEndKey: window.endKey,
    fiscalStartMonth: fiscalStartMonthOf(kpi.timeframe.startDate),
    readingStartKeys,
  }
}

/** PKG-3: owners whose package for the timeframe is APPROVED, as `${userId}:${timeframeId}`. */
async function loadApprovedPackages(pairs: ReadonlyArray<{ ownerId: string; timeframeId: string }>): Promise<Set<string>> {
  if (pairs.length === 0) return new Set()
  const rows = await prisma.operatingPackage.findMany({
    where: { status: 'APPROVED', OR: pairs.map((p) => ({ userId: p.ownerId, timeframeId: p.timeframeId })) },
    select: { userId: true, timeframeId: true },
  })
  return new Set(rows.map((r) => `${r.userId}:${r.timeframeId}`))
}

/**
 * KPI-3: write `source = KR` readings for the period that just ended. Returns
 * the period keys filled per KPI so KPI-5 does not flag them in the same run.
 */
async function runKpiAutoFill(
  kpis: readonly KpiRow[],
  calendar: Calendar,
  dryRun: boolean,
): Promise<{ scanned: number; filled: number; failed: number; filledKeys: Map<string, Set<string>> }> {
  const filledKeys = new Map<string, Set<string>>()
  const linked = kpis.filter((k) => k.keyResultId && k.keyResult)
  const plans = linked
    .map((kpi) => ({
      kpi,
      plan: planKpiAutoFill(
        {
          ...toKpiInput(kpi, calendar),
          krValue: kpi.keyResult?.currentValue ?? null,
          krActive: kpi.keyResult?.status === 'ACTIVE',
        },
        calendar.todayKey,
      ),
    }))
    .filter((p): p is { kpi: KpiRow; plan: NonNullable<typeof p.plan> } => p.plan !== null)

  let filled = 0
  let failed = 0
  if (dryRun) {
    for (const { kpi, plan } of plans) filledKeys.set(kpi.id, new Set([plan.period.startKey]))
    return { scanned: linked.length, filled: plans.length, failed, filledKeys }
  }

  const approved = await loadApprovedPackages(plans.map(({ kpi }) => kpi))
  for (const { kpi, plan } of plans) {
    try {
      await prisma.$transaction(async (tx) => {
        // `create`, not upsert: an existing reading (e.g. entered since the
        // load) wins. The unique (kpiId, periodStart) turns a race into P2002.
        const reading = await tx.kpiReading.create({
          data: {
            kpiId: kpi.id,
            periodStart: periodStartDate(plan.period.startKey),
            periodEnd: periodEndDate(plan.period.endKey),
            value: plan.value,
            rag: plan.rag,
            ragOverridden: false,
            source: 'KR',
            enteredById: null,
            note: null,
          },
          select: { id: true },
        })
        await recordPackageActivity(
          {
            entityType: 'KPI_READING',
            action: 'READING_ENTERED',
            entityId: reading.id,
            subjectUserId: kpi.ownerId,
            timeframeId: kpi.timeframeId,
            packageId: kpi.packageId,
            actorId: null,
            editedAfterApproval: approved.has(`${kpi.ownerId}:${kpi.timeframeId}`),
            changes: {
              value: { from: null, to: plan.value },
              source: { from: null, to: 'KR' },
              ...(plan.rag ? { rag: { from: null, to: plan.rag } } : {}),
            },
            metadata: {
              kpiId: kpi.id,
              keyResultId: kpi.keyResultId ?? undefined,
              period: plan.period.label,
              periodStart: plan.period.startKey,
              source: 'KR',
              automated: true,
            },
          },
          { client: tx, required: true },
        )
      })
      filled += 1
      filledKeys.set(kpi.id, new Set([plan.period.startKey]))
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // A reading for the period appeared after the load — nothing to fill.
        filledKeys.set(kpi.id, new Set([plan.period.startKey]))
        continue
      }
      failed += 1
      console.error('[package-cron] KPI auto-fill failed', kpi.id, err)
    }
  }
  return { scanned: linked.length, filled, failed, filledKeys }
}

async function runKpiReadingDue(
  kpis: readonly KpiRow[],
  calendar: Calendar,
  filledKeys: ReadonlyMap<string, ReadonlySet<string>>,
  ctx: { dryRun: boolean; emit: NonNullable<PackageDailyOptions['emit']> },
): Promise<PackageCronEventStats> {
  const byId = new Map(kpis.map((k) => [k.id, k]))
  const candidates = kpis
    .map((kpi) => planKpiReadingDue(toKpiInput(kpi, calendar, filledKeys.get(kpi.id)), calendar.todayKey, calendar.holidays))
    .filter((c): c is NonNullable<typeof c> => c !== null)
  return dispatch('KPI_READING_DUE', candidates, (c) => {
    const kpi = byId.get(c.entityId)!
    const showTarget = !kpi.isSensitive && typeof kpi.targetValue === 'number'
    return {
      entityType: 'KPI',
      entityId: kpi.id,
      entityTitle: kpi.name,
      // KPI-7: sensitive KPIs are redacted for anyone but the owner chain.
      isPrivate: kpi.isSensitive,
      data: {
        ...c.data,
        ownerId: kpi.ownerId,
        timeframeId: kpi.timeframeId,
        ...(showTarget ? { targetValue: kpi.targetValue, unit: kpi.unit } : {}),
      },
    }
  }, ctx)
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

async function runDependencies(
  now: Date,
  calendar: Calendar,
  ctx: { dryRun: boolean; emit: NonNullable<PackageDailyOptions['emit']> },
): Promise<{ dueSoon: PackageCronEventStats; late: PackageCronEventStats }> {
  const deps = await prisma.workDependency.findMany({
    where: {
      status: { notIn: ['DONE', 'DROPPED'] },
      neededByDate: { not: null, lt: keyStart(addDaysToKey(calendar.todayKey, 8)) },
    },
    select: {
      id: true,
      externalRef: true,
      title: true,
      status: true,
      neededByDate: true,
      unblocksText: true,
      parties: { select: { role: true, user: { select: { name: true } } } },
    },
  })
  const byId = new Map(deps.map((d) => [d.id, d]))
  const payload = (c: EmitCandidate): EventPayload => {
    const dep = byId.get(c.entityId)!
    const names = (role: string) => joinNames(dep.parties.filter((p) => p.role === role).map((p) => p.user.name))
    return {
      entityType: 'WORK_DEPENDENCY',
      entityId: dep.id,
      entityTitle: dep.title,
      data: {
        ...c.data,
        dependencyId: dep.id,
        externalRef: dep.externalRef ?? undefined,
        providerNames: names('PROVIDER'),
        neederNames: names('NEEDER'),
        unblocksText: dep.unblocksText ?? undefined,
      },
    }
  }
  const dueSoon = deps.map((d) => planDependencyDueSoon(d, calendar.todayKey, now)).filter((c): c is NonNullable<typeof c> => c !== null)
  const late = deps.map((d) => planDependencyLate(d, calendar.todayKey, now)).filter((c): c is NonNullable<typeof c> => c !== null)
  return {
    dueSoon: await dispatch('DEPENDENCY_DUE_SOON', dueSoon, payload, ctx),
    late: await dispatch('DEPENDENCY_LATE', late, payload, ctx),
  }
}

// ---------------------------------------------------------------------------
// Development items and KR checkpoints
// ---------------------------------------------------------------------------

async function runDevItemsDue(
  calendar: Calendar,
  ctx: { dryRun: boolean; emit: NonNullable<PackageDailyOptions['emit']> },
): Promise<PackageCronEventStats> {
  const items = await prisma.developmentItem.findMany({
    where: {
      status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      dueDate: {
        gte: keyStart(addDaysToKey(calendar.todayKey, -1)),
        lt: keyStart(addDaysToKey(calendar.todayKey, DEV_ITEM_DUE_DAYS + 2)),
      },
    },
    select: { id: true, title: true, kind: true, status: true, dueDate: true, ownerId: true, timeframeId: true },
  })
  const byId = new Map(items.map((i) => [i.id, i]))
  const candidates = items.map((i) => planDevItemDue(i, calendar.todayKey)).filter((c): c is NonNullable<typeof c> => c !== null)
  return dispatch('DEV_ITEM_DUE', candidates, (c) => {
    const item = byId.get(c.entityId)!
    return {
      entityType: 'DEVELOPMENT_ITEM',
      entityId: item.id,
      entityTitle: item.title,
      data: {
        ...c.data,
        ownerId: item.ownerId,
        timeframeId: item.timeframeId,
        kindLabel: isDevelopmentKind(item.kind) ? DEVELOPMENT_KIND_LABELS[item.kind] : 'Development',
      },
    }
  }, ctx)
}

async function runCheckpointsDue(
  calendar: Calendar,
  ctx: { dryRun: boolean; emit: NonNullable<PackageDailyOptions['emit']> },
): Promise<PackageCronEventStats> {
  const checkpoints = await prisma.keyResultCheckpoint.findMany({
    where: {
      status: 'PENDING',
      dueDate: {
        gte: keyStart(addDaysToKey(calendar.todayKey, -1)),
        lt: keyStart(addDaysToKey(calendar.todayKey, KR_CHECKPOINT_DUE_DAYS + 2)),
      },
      keyResult: { status: 'ACTIVE' },
    },
    select: {
      id: true,
      label: true,
      status: true,
      dueDate: true,
      targetText: true,
      keyResult: { select: { id: true, title: true, ownerId: true, isPrivate: true, status: true } },
    },
  })
  const byId = new Map(checkpoints.map((c) => [c.id, c]))
  const candidates = checkpoints
    .map((c) => planCheckpointDue({ id: c.id, status: c.status, dueDate: c.dueDate, krStatus: c.keyResult.status }, calendar.todayKey))
    .filter((c): c is NonNullable<typeof c> => c !== null)
  return dispatch('KR_CHECKPOINT_DUE', candidates, (c) => {
    const cp = byId.get(c.entityId)!
    return {
      entityType: 'KR_CHECKPOINT',
      entityId: cp.id,
      entityTitle: cp.keyResult.title,
      isPrivate: cp.keyResult.isPrivate,
      data: {
        ...c.data,
        checkpointLabel: cp.label,
        targetValue: cp.targetText,
        keyResultId: cp.keyResult.id,
        ownerId: cp.keyResult.ownerId,
      },
    }
  }, ctx)
}

// ---------------------------------------------------------------------------
// Package lifecycle (PKG-1)
// ---------------------------------------------------------------------------

/**
 * PKG-1: APPROVED → ARCHIVED once the package's timeframe has ended (its end
 * date is before today in the org calendar). Each move is a status-guarded
 * update plus a STATUS_CHANGED audit row in one transaction, so a package
 * reopened or archived by hand in the meantime is left alone and a re-run
 * finds nothing to do. DRAFT / IN_REVIEW packages are not touched: they were
 * never agreed, and a person may still finish them for the record.
 */
async function runPackageArchive(
  calendar: Calendar,
  dryRun: boolean,
): Promise<{ candidates: number; archived: number; failed: number }> {
  const packages = await prisma.operatingPackage.findMany({
    where: { status: 'APPROVED', timeframe: { endDate: { lt: keyStart(calendar.todayKey) } } },
    select: { id: true, userId: true, timeframeId: true, version: true, timeframe: { select: { name: true } } },
  })
  const stats = { candidates: packages.length, archived: 0, failed: 0 }
  if (dryRun) {
    stats.archived = packages.length
    return stats
  }
  for (const pkg of packages) {
    try {
      const moved = await prisma.$transaction(async (tx) => {
        const { count } = await tx.operatingPackage.updateMany({
          where: { id: pkg.id, status: 'APPROVED' },
          data: { status: 'ARCHIVED' },
        })
        if (count === 0) return false
        await recordPackageActivity(
          {
            entityType: 'OPERATING_PACKAGE',
            action: 'STATUS_CHANGED',
            entityId: pkg.id,
            subjectUserId: pkg.userId,
            timeframeId: pkg.timeframeId,
            packageId: pkg.id,
            actorId: null,
            changes: { status: { from: 'APPROVED', to: 'ARCHIVED' } },
            metadata: { version: pkg.version, timeframeName: pkg.timeframe.name, reason: 'TIMEFRAME_ENDED', automated: true },
          },
          { client: tx, required: true },
        )
        return true
      })
      if (moved) stats.archived += 1
    } catch (err) {
      stats.failed += 1
      console.error('[package-cron] package archive failed', pkg.id, err)
    }
  }
  return stats
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

let inFlight: Promise<PackageDailyResult> | null = null

/**
 * Run every package daily job. Concurrent calls in one process share the run
 * in flight instead of starting a second one (which could double-send before
 * either has written its notification rows).
 */
export function runPackageDaily(options: PackageDailyOptions = {}): Promise<PackageDailyResult> {
  if (inFlight) return inFlight
  inFlight = execute(options).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function execute(options: PackageDailyOptions): Promise<PackageDailyResult> {
  const started = Date.now()
  const now = options.now ?? new Date()
  const dryRun = options.dryRun === true
  const ctx = { dryRun, emit: options.emit ?? emitNow }
  const calendar = await loadCalendar(now)
  const result: PackageDailyResult = {
    todayKey: calendar.todayKey,
    timeZone: calendar.timeZone,
    dryRun,
    autoFill: { scanned: 0, filled: 0, failed: 0 },
    events: {
      KPI_READING_DUE: emptyStats(),
      DEPENDENCY_DUE_SOON: emptyStats(),
      DEPENDENCY_LATE: emptyStats(),
      DEV_ITEM_DUE: emptyStats(),
      KR_CHECKPOINT_DUE: emptyStats(),
    },
    archive: { candidates: 0, archived: 0, failed: 0 },
    errors: [],
    durationMs: 0,
  }
  const guard = async (job: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      console.error(`[package-cron] ${job} failed`, err)
      result.errors.push({ job, message: errorMessage(err) })
    }
  }

  await guard('kpis', async () => {
    const kpis = await loadKpis(calendar.todayKey)
    let filledKeys = new Map<string, Set<string>>()
    await guard('kpi-autofill', async () => {
      const fill = await runKpiAutoFill(kpis, calendar, dryRun)
      result.autoFill = { scanned: fill.scanned, filled: fill.filled, failed: fill.failed }
      filledKeys = fill.filledKeys
    })
    result.events.KPI_READING_DUE = await runKpiReadingDue(kpis, calendar, filledKeys, ctx)
  })
  await guard('dependencies', async () => {
    const { dueSoon, late } = await runDependencies(now, calendar, ctx)
    result.events.DEPENDENCY_DUE_SOON = dueSoon
    result.events.DEPENDENCY_LATE = late
  })
  await guard('development', async () => {
    result.events.DEV_ITEM_DUE = await runDevItemsDue(calendar, ctx)
  })
  await guard('checkpoints', async () => {
    result.events.KR_CHECKPOINT_DUE = await runCheckpointsDue(calendar, ctx)
  })
  // Last: the reminder jobs above still see packages whose timeframe just ended.
  await guard('package-archive', async () => {
    result.archive = await runPackageArchive(calendar, dryRun)
  })

  result.durationMs = Date.now() - started
  return result
}
