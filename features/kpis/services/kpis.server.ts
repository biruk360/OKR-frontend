/**
 * KPI service (KPI-1 … KPI-7) — server only. Import by direct path from app/.
 *
 * Every read/write resolves the §8 matrix through lib/package/access.ts:
 *   - list/read     area 'kpis'; sensitive KPIs additionally 'kpis_sensitive' (KPI-7)
 *                   and are left out entirely for viewers without it
 *   - define/edit   'kpis' edit (manager chain, department lead, ADMIN/EXEC — never
 *                   self); sensitive KPIs need 'kpis_sensitive' edit (manager chain,
 *                   ADMIN/EXEC)
 *   - readings      canEnterKpiReading (self, manager chain, ADMIN/EXEC; department
 *                   lead for non-sensitive). A RAG override of a computed RAG is a
 *                   manager action (not the owner's).
 * Every mutation writes an ActivityLog row (lib/package/audit.ts), flagged
 * `editedAfterApproval` when the owner's package for the timeframe is APPROVED (PKG-3).
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  getPackageAccessFacts,
  loadPackageViewer,
  type PackageAccessFacts,
  type PackageViewer,
  type PackageViewerInput,
} from '@/lib/package/access'
import { recordPackageActivity, recordPackageUpdateIfChanged } from '@/lib/package/audit'
import { resolveDefaultTimeframe } from '@/lib/okr/active-timeframe'
import { canViewKeyResultInMemory, canViewObjectiveInMemory, makeViewerContext, REDACTED_KEY_RESULT_TITLE, type ViewerContext } from '@/lib/okr/visibility-scope'
import {
  KPI_DEFAULT_TIMEZONE,
  dateKeyInZone,
  fiscalStartMonthOf,
  isDateKey,
  kpiPeriodForKey,
  periodEndDate,
  periodStartDate,
  timeframeWindowKeys,
} from '@/lib/kpi/periods'
import { isPeriodScored, hasNumericTarget, normalizeThresholdAmber, resolveReadingRag } from '@/lib/kpi/rag'
import { syncedReadingRag } from '@/lib/integrations/odoo-sales/standing'
import { isKpiFrequency, isKpiRag, type KpiFrequency } from '@/types/package'
import { KpiError } from './errors'
import {
  canSetManualRag,
  canViewKpi,
  enterableKpiPeriods,
  isEnterablePeriod,
  isSyncedKpi,
  isTimeframeEnded,
  kpiItemPermissions,
  kpiListPermissions,
  toKpiReadingView,
  toKpiView,
  type KpiCalendar,
  type KpiReadingRow,
  type KpiRow,
  type KpiTimeframeWindow,
} from './kpi-view'
import type { KpiCreateInput, KpiReadingUpsertInput, KpiUpdateInput } from './schemas'
import type { KpiListResponse, KpiReadingView, KpiReadingsResponse, KpiView } from '../types'

// ---------------------------------------------------------------------------
// Selects + loaders
// ---------------------------------------------------------------------------

const READING_SELECT = {
  id: true,
  kpiId: true,
  periodStart: true,
  periodEnd: true,
  value: true,
  valueText: true,
  rag: true,
  ragOverridden: true,
  note: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  enteredBy: { select: { id: true, name: true } },
} satisfies Prisma.KpiReadingSelect

const KEY_RESULT_SELECT = {
  id: true,
  title: true,
  ownerId: true,
  isPrivate: true,
  status: true,
  objective: { select: { ownerId: true, isPrivate: true, level: true, departmentId: true } },
} satisfies Prisma.KeyResultSelect

const TIMEFRAME_SELECT = { id: true, name: true, startDate: true, endDate: true } satisfies Prisma.TimeframeSelect

type KeyResultRow = Prisma.KeyResultGetPayload<{ select: typeof KEY_RESULT_SELECT }>
type TimeframeRow = Prisma.TimeframeGetPayload<{ select: typeof TIMEFRAME_SELECT }>

/** Fields a KPI definition edit is diffed on (ActivityLog). */
const KPI_AUDIT_FIELDS = [
  'externalRef',
  'name',
  'kpiType',
  'definition',
  'formula',
  'dataSource',
  'unit',
  'direction',
  'baselineText',
  'baselineValue',
  'targetText',
  'targetValue',
  'targetMin',
  'targetMax',
  'thresholdAmber',
  'frequency',
  'scoredFrom',
  'keyResultId',
  'isSensitive',
  'status',
  'note',
] as const

const READING_AUDIT_FIELDS = ['value', 'valueText', 'rag', 'ragOverridden', 'note', 'source'] as const

/** Fields whose change can move a reading's computed RAG. */
const RAG_FIELDS = ['direction', 'targetValue', 'targetMin', 'targetMax', 'thresholdAmber', 'scoredFrom'] as const

/** Org working calendar: today in the org timezone + holidays (Scrum settings are the org calendar). */
export async function loadKpiCalendar(now: Date = new Date()): Promise<KpiCalendar> {
  const settings = await prisma.scrumSettings
    .findUnique({ where: { id: 'default' }, select: { timezone: true, holidays: true } })
    .catch(() => null)
  const timeZone = settings?.timezone || KPI_DEFAULT_TIMEZONE
  return { todayKey: dateKeyInZone(now, timeZone), timeZone, holidays: new Set(settings?.holidays ?? []) }
}

function windowOf(tf: Pick<TimeframeRow, 'startDate' | 'endDate'>): KpiTimeframeWindow {
  const { startKey, endKey } = timeframeWindowKeys(tf.startDate, tf.endDate)
  return { fiscalStartMonth: fiscalStartMonthOf(tf.startDate), startKey, endKey }
}

function viewerContextOf(viewer: PackageViewer): ViewerContext {
  return makeViewerContext(
    { id: viewer.userId, role: viewer.role },
    { directReportIds: viewer.directReportIds, departmentIds: viewer.departmentIds },
  )
}

/** Linked KR as the viewer may see it (CON-8 redaction), or null when not visible. */
function keyResultForViewer(ctx: ViewerContext, kr: KeyResultRow | null | undefined) {
  if (!kr || kr.status === 'DELETED') return null
  const verdict = canViewKeyResultInMemory(ctx, kr, canViewObjectiveInMemory(ctx, kr.objective))
  if (!verdict.canView) return null
  return verdict.isRedacted
    ? { id: kr.id, title: REDACTED_KEY_RESULT_TITLE, isRedacted: true }
    : { id: kr.id, title: kr.title, isRedacted: false }
}

async function resolveViewer(input: PackageViewerInput | PackageViewer): Promise<PackageViewer> {
  if (typeof input === 'object' && input && 'managedUserIds' in input) return input as PackageViewer
  return loadPackageViewer(input as PackageViewerInput)
}

async function isPackageApproved(ownerId: string, timeframeId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const pkg = await db.operatingPackage.findUnique({
    where: { userId_timeframeId: { userId: ownerId, timeframeId } },
    select: { id: true, status: true },
  })
  return { packageId: pkg?.id ?? null, approved: pkg?.status === 'APPROVED' }
}

interface LoadedKpi {
  kpi: KpiRow
  readings: KpiReadingRow[]
  keyResult: KeyResultRow | null
  timeframe: TimeframeRow
}

async function loadKpiWithContext(id: string): Promise<LoadedKpi> {
  const row = await prisma.kpi.findUnique({
    where: { id },
    include: {
      readings: { select: READING_SELECT, orderBy: { periodStart: 'asc' } },
      keyResult: { select: KEY_RESULT_SELECT },
      timeframe: { select: TIMEFRAME_SELECT },
    },
  })
  if (!row) throw new KpiError(404, 'KPI not found')
  const { readings, keyResult, timeframe, ...kpi } = row
  return { kpi, readings, keyResult, timeframe }
}

function buildView(
  loaded: LoadedKpi,
  facts: PackageAccessFacts,
  ctx: ViewerContext,
  calendar: KpiCalendar,
): KpiView {
  const window = windowOf(loaded.timeframe)
  const timeframeEnded = isTimeframeEnded(window, calendar.todayKey)
  return toKpiView({
    kpi: loaded.kpi,
    readings: loaded.readings,
    window,
    calendar,
    permissions: kpiItemPermissions(facts, loaded.kpi, { timeframeEnded }),
    keyResult: keyResultForViewer(ctx, loaded.keyResult),
  })
}

/** Load one KPI the viewer may see; 404 (not 403) when it is hidden, so sensitive KPIs are not disclosed. */
async function loadVisibleKpi(viewer: PackageViewer, id: string) {
  const loaded = await loadKpiWithContext(id)
  const facts = await getPackageAccessFacts(viewer, loaded.kpi.ownerId)
  if (!canViewKpi(facts, loaded.kpi)) throw new KpiError(404, 'KPI not found')
  return { loaded, facts }
}

/** The linked KR must exist and be fully visible to the editor. */
async function assertLinkableKeyResult(viewer: PackageViewer, keyResultId: string | null | undefined) {
  if (!keyResultId) return
  const kr = await prisma.keyResult.findUnique({ where: { id: keyResultId }, select: KEY_RESULT_SELECT })
  const visible = keyResultForViewer(viewerContextOf(viewer), kr)
  if (!visible || visible.isRedacted) throw new KpiError(422, 'Linked key result not found', 'INVALID_KEY_RESULT')
}

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null
  return isDateKey(value) ? periodStartDate(value) : new Date(value)
}

function validateTargets(spec: {
  direction: string
  targetValue: number | null
  targetMin: number | null
  targetMax: number | null
}) {
  if (spec.direction === 'RANGE' && spec.targetMin != null && spec.targetMax != null && spec.targetMin > spec.targetMax) {
    throw new KpiError(422, 'Range minimum must not exceed the maximum')
  }
}

/** Audit diff input (interfaces have no index signature). */
function snapshot(row: object): Record<string, unknown> {
  return row as Record<string, unknown>
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002'
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface ListKpisParams {
  userId: string
  timeframeId?: string | null
  includeRetired?: boolean
}

/** GET /api/package/kpis — the person's KPIs for a timeframe, with card figures and permissions. */
export async function listKpis(viewerInput: PackageViewerInput | PackageViewer, params: ListKpisParams): Promise<KpiListResponse> {
  const viewer = await resolveViewer(viewerInput)
  const facts = await getPackageAccessFacts(viewer, params.userId)
  if (!canViewKpi(facts, { isSensitive: false })) throw new KpiError(403, 'You cannot view this person’s KPIs')

  const timeframe = params.timeframeId
    ? await prisma.timeframe.findUnique({ where: { id: params.timeframeId }, select: TIMEFRAME_SELECT })
    : await resolveDefaultTimeframe()
  if (params.timeframeId && !timeframe) throw new KpiError(404, 'Timeframe not found')

  const calendar = await loadKpiCalendar()
  if (!timeframe) {
    return {
      data: [],
      permissions: kpiListPermissions(facts, { timeframeEnded: false }),
      timeframe: null,
    }
  }
  const window = windowOf(timeframe)
  const timeframeEnded = isTimeframeEnded(window, calendar.todayKey)
  const permissions = kpiListPermissions(facts, { timeframeEnded })

  const where: Prisma.KpiWhereInput = {
    ownerId: params.userId,
    timeframeId: timeframe.id,
    ...(params.includeRetired ? {} : { status: 'ACTIVE' }),
    // KPI-7: sensitive KPIs never leave the server for viewers without the area.
    ...(permissions.canViewSensitive ? {} : { isSensitive: false }),
  }
  const rows = await prisma.kpi.findMany({
    where,
    include: {
      readings: { select: READING_SELECT, orderBy: { periodStart: 'asc' } },
      keyResult: { select: KEY_RESULT_SELECT },
    },
    orderBy: [{ kpiType: 'asc' }, { externalRef: 'asc' }, { name: 'asc' }],
  })

  const ctx = viewerContextOf(viewer)
  const data = rows
    .filter((row) => canViewKpi(facts, row))
    .map(({ readings, keyResult, ...kpi }) =>
      buildView({ kpi, readings, keyResult, timeframe }, facts, ctx, calendar),
    )

  return {
    data,
    permissions,
    timeframe: {
      id: timeframe.id,
      name: timeframe.name,
      startDate: timeframe.startDate.toISOString(),
      endDate: timeframe.endDate.toISOString(),
    },
  }
}

/** One KPI as the viewer sees it. */
export async function getKpi(viewerInput: PackageViewerInput | PackageViewer, id: string): Promise<KpiView> {
  const viewer = await resolveViewer(viewerInput)
  const { loaded, facts } = await loadVisibleKpi(viewer, id)
  return buildView(loaded, facts, viewerContextOf(viewer), await loadKpiCalendar())
}

// ---------------------------------------------------------------------------
// Create / update / retire
// ---------------------------------------------------------------------------

/** POST /api/package/kpis */
export async function createKpi(viewerInput: PackageViewerInput | PackageViewer, input: KpiCreateInput): Promise<KpiView> {
  const viewer = await resolveViewer(viewerInput)
  const [owner, timeframe] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.ownerId }, select: { id: true } }),
    prisma.timeframe.findUnique({ where: { id: input.timeframeId }, select: TIMEFRAME_SELECT }),
  ])
  if (!owner) throw new KpiError(404, 'Owner not found')
  if (!timeframe) throw new KpiError(404, 'Timeframe not found')

  const facts = await getPackageAccessFacts(viewer, input.ownerId)
  const calendar = await loadKpiCalendar()
  const timeframeEnded = isTimeframeEnded(windowOf(timeframe), calendar.todayKey)
  const permissions = kpiListPermissions(facts, { timeframeEnded })
  if (input.isSensitive ? !permissions.canManageSensitive : !permissions.canCreate) {
    throw new KpiError(403, timeframeEnded ? 'This timeframe has ended; its KPIs are read-only' : 'You cannot define KPIs for this person')
  }
  validateTargets(input)
  await assertLinkableKeyResult(viewer, input.keyResultId)

  const { packageId, approved } = await isPackageApproved(input.ownerId, input.timeframeId)
  let created: { id: string }
  try {
    created = await prisma.kpi.create({
      data: {
        ownerId: input.ownerId,
        timeframeId: input.timeframeId,
        packageId,
        externalRef: input.externalRef,
        name: input.name,
        kpiType: input.kpiType,
        definition: input.definition,
        formula: input.formula,
        dataSource: input.dataSource,
        unit: input.unit,
        direction: input.direction,
        baselineText: input.baselineText,
        baselineValue: input.baselineValue,
        targetText: input.targetText,
        targetValue: input.targetValue,
        targetMin: input.direction === 'RANGE' ? input.targetMin : null,
        targetMax: input.direction === 'RANGE' ? input.targetMax : null,
        thresholdAmber: normalizeThresholdAmber(input.thresholdAmber),
        frequency: input.frequency,
        scoredFrom: toDateOrNull(input.scoredFrom),
        keyResultId: input.keyResultId,
        isSensitive: input.isSensitive,
        note: input.note,
      },
      select: { id: true },
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new KpiError(409, `A KPI with reference ${input.externalRef} already exists for this person and timeframe`)
    throw error
  }

  await recordPackageActivity({
    entityType: 'KPI',
    action: 'CREATED',
    entityId: created.id,
    subjectUserId: input.ownerId,
    timeframeId: input.timeframeId,
    packageId,
    actorId: viewer.userId,
    keyResultId: input.keyResultId,
    editedAfterApproval: approved,
    metadata: { name: input.name, isSensitive: input.isSensitive },
  })

  return getKpi(viewer, created.id)
}

/** PATCH /api/package/kpis/[id] */
export async function updateKpi(
  viewerInput: PackageViewerInput | PackageViewer,
  id: string,
  input: KpiUpdateInput,
): Promise<KpiView> {
  const viewer = await resolveViewer(viewerInput)
  const { loaded, facts } = await loadVisibleKpi(viewer, id)
  const before = loaded.kpi
  const calendar = await loadKpiCalendar()
  const timeframeEnded = isTimeframeEnded(windowOf(loaded.timeframe), calendar.todayKey)

  // Must be allowed to edit both the current and (when it changes) the new sensitivity.
  const nextSensitive = input.isSensitive ?? before.isSensitive
  const canEditNow = kpiItemPermissions(facts, before, { timeframeEnded }).canEdit
  const canEditNext = kpiItemPermissions(facts, { ...before, isSensitive: nextSensitive }, { timeframeEnded }).canEdit
  if (!canEditNow || !canEditNext) throw new KpiError(403, 'You cannot edit this KPI')

  if (input.frequency && input.frequency !== before.frequency && loaded.readings.length > 0) {
    throw new KpiError(409, 'The frequency cannot change once readings exist', 'FREQUENCY_LOCKED')
  }
  if (input.keyResultId !== undefined && input.keyResultId !== before.keyResultId) {
    await assertLinkableKeyResult(viewer, input.keyResultId)
  }

  const direction = input.direction ?? before.direction
  const data: Prisma.KpiUncheckedUpdateInput = {}
  const assign = <K extends keyof KpiUpdateInput>(key: K, value: unknown) => {
    if (input[key] !== undefined) (data as Record<string, unknown>)[key] = value
  }
  assign('externalRef', input.externalRef)
  assign('name', input.name)
  assign('kpiType', input.kpiType)
  assign('definition', input.definition)
  assign('formula', input.formula)
  assign('dataSource', input.dataSource)
  assign('unit', input.unit)
  assign('direction', input.direction)
  assign('baselineText', input.baselineText)
  assign('baselineValue', input.baselineValue)
  assign('targetText', input.targetText)
  assign('targetValue', input.targetValue)
  assign('targetMin', input.targetMin)
  assign('targetMax', input.targetMax)
  assign('thresholdAmber', input.thresholdAmber === undefined ? undefined : normalizeThresholdAmber(input.thresholdAmber))
  assign('frequency', input.frequency)
  assign('scoredFrom', input.scoredFrom === undefined ? undefined : toDateOrNull(input.scoredFrom))
  assign('keyResultId', input.keyResultId)
  assign('isSensitive', input.isSensitive)
  assign('status', input.status)
  assign('note', input.note)
  if (direction !== 'RANGE' && (input.direction !== undefined || input.targetMin !== undefined || input.targetMax !== undefined)) {
    data.targetMin = null
    data.targetMax = null
  }

  const next = { ...before, ...(data as Partial<KpiRow>) } as KpiRow
  validateTargets(next)
  if (Object.keys(data).length === 0) return buildView(loaded, facts, viewerContextOf(viewer), calendar)

  const { approved } = await isPackageApproved(before.ownerId, before.timeframeId)
  // Synced KPIs: the integration computes the RAG (e.g. against the quota pace) on its next run.
  const ragChanged = !isSyncedKpi(before) && RAG_FIELDS.some((f) => (data as Record<string, unknown>)[f] !== undefined)

  try {
    await prisma.$transaction(async (tx) => {
      const after = await tx.kpi.update({ where: { id }, data })
      // Keep stored RAGs in step with the new target (overridden readings keep the manager's call).
      if (ragChanged) {
        for (const reading of loaded.readings) {
          if (reading.ragOverridden) continue
          const scored = isPeriodScored(after.scoredFrom, reading.periodEnd)
          const { rag } = resolveReadingRag({ spec: after, value: reading.value, scored })
          if (rag !== reading.rag) await tx.kpiReading.update({ where: { id: reading.id }, data: { rag } })
        }
      }
      await recordPackageUpdateIfChanged(
        {
          entityType: 'KPI',
          entityId: id,
          subjectUserId: before.ownerId,
          timeframeId: before.timeframeId,
          packageId: before.packageId,
          actorId: viewer.userId,
          keyResultId: after.keyResultId,
          editedAfterApproval: approved,
          before: snapshot(before),
          after: snapshot(after),
          fields: KPI_AUDIT_FIELDS,
        },
        { client: tx },
      )
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new KpiError(409, 'Another KPI already uses this reference')
    throw error
  }

  return getKpi(viewer, id)
}

/** DELETE /api/package/kpis/[id] — retire (KPIs are never hard-deleted; readings stay for history). */
export async function retireKpi(viewerInput: PackageViewerInput | PackageViewer, id: string): Promise<KpiView> {
  const viewer = await resolveViewer(viewerInput)
  const { loaded, facts } = await loadVisibleKpi(viewer, id)
  const calendar = await loadKpiCalendar()
  const timeframeEnded = isTimeframeEnded(windowOf(loaded.timeframe), calendar.todayKey)
  if (!kpiItemPermissions(facts, loaded.kpi, { timeframeEnded }).canEdit) throw new KpiError(403, 'You cannot retire this KPI')
  if (loaded.kpi.status === 'RETIRED') return buildView(loaded, facts, viewerContextOf(viewer), calendar)

  const { approved } = await isPackageApproved(loaded.kpi.ownerId, loaded.kpi.timeframeId)
  await prisma.$transaction(async (tx) => {
    await tx.kpi.update({ where: { id }, data: { status: 'RETIRED' } })
    await recordPackageActivity(
      {
        entityType: 'KPI',
        action: 'RETIRED',
        entityId: id,
        subjectUserId: loaded.kpi.ownerId,
        timeframeId: loaded.kpi.timeframeId,
        packageId: loaded.kpi.packageId,
        actorId: viewer.userId,
        changes: { status: { from: loaded.kpi.status, to: 'RETIRED' } },
        editedAfterApproval: approved,
        metadata: { name: loaded.kpi.name },
      },
      { client: tx },
    )
  })
  return getKpi(viewer, id)
}

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

/** GET /api/package/kpis/[id]/readings — full history, newest first. */
export async function listKpiReadings(
  viewerInput: PackageViewerInput | PackageViewer,
  id: string,
): Promise<KpiReadingsResponse> {
  const viewer = await resolveViewer(viewerInput)
  const { loaded, facts } = await loadVisibleKpi(viewer, id)
  const calendar = await loadKpiCalendar()
  const view = buildView(loaded, facts, viewerContextOf(viewer), calendar)
  const window = windowOf(loaded.timeframe)
  const opts = { fiscalStartMonth: window.fiscalStartMonth }
  const data = [...loaded.readings]
    .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())
    .map((r) => toKpiReadingView(loaded.kpi, r, opts))
  const toPeriod = (p: { startKey: string; endKey: string; label: string }) => ({ startKey: p.startKey, endKey: p.endKey, label: p.label })
  // Synced KPIs: only periods that already have a reading, and only for a RAG override.
  const enterablePeriods = isSyncedKpi(loaded.kpi)
    ? view.permissions.canOverrideRag
      ? data.map((r) => r.period)
      : []
    : view.permissions.canEnterReading
      ? enterableKpiPeriods(loaded.kpi, window, calendar.todayKey).map(toPeriod)
      : []
  return { kpi: view, data, enterablePeriods }
}

export interface UpsertKpiReadingResult {
  reading: KpiReadingView
  kpi: KpiView
  created: boolean
}

/**
 * PUT /api/package/kpis/[id]/readings — one reading per period (KPI-1): creates
 * it or edits it in place (logged). `period` is any date inside the period.
 */
export async function upsertKpiReading(
  viewerInput: PackageViewerInput | PackageViewer,
  id: string,
  input: KpiReadingUpsertInput,
): Promise<UpsertKpiReadingResult> {
  const viewer = await resolveViewer(viewerInput)
  const { loaded, facts } = await loadVisibleKpi(viewer, id)
  const { kpi } = loaded
  const calendar = await loadKpiCalendar()
  const window = windowOf(loaded.timeframe)
  const timeframeEnded = isTimeframeEnded(window, calendar.todayKey)
  const perms = kpiItemPermissions(facts, kpi, { timeframeEnded })
  if (isSyncedKpi(kpi)) return overrideSyncedReadingRag({ viewer, loaded, facts, perms, input, calendar, window })
  if (!perms.canEnterReading) {
    throw new KpiError(403, kpi.status === 'ACTIVE' ? 'You cannot enter readings for this KPI' : 'This KPI is retired')
  }

  const frequency: KpiFrequency = isKpiFrequency(kpi.frequency) ? kpi.frequency : 'MONTHLY'
  const dateKey = isDateKey(input.period) ? input.period : dateKeyInZone(new Date(input.period), calendar.timeZone)
  const period = kpiPeriodForKey(frequency, dateKey, { fiscalStartMonth: window.fiscalStartMonth })
  if (!isEnterablePeriod(kpi, window, calendar.todayKey, period.startKey)) {
    throw new KpiError(422, 'Readings can only be entered for periods of this timeframe that have started', 'INVALID_PERIOD')
  }

  const periodStart = periodStartDate(period.startKey)
  const existing = loaded.readings.find((r) => r.periodStart.getTime() === periodStart.getTime()) ?? null

  // Manual RAG: overrides need a manager; text-only KPIs take the entrant's RAG (KPI-6).
  const numericTarget = hasNumericTarget(kpi)
  const mayManual = canSetManualRag(perms, numericTarget)
  const existingOverride = existing?.ragOverridden && isKpiRag(existing.rag) ? existing.rag : null
  let manualRag: string | null = existingOverride
  if (input.rag !== undefined && input.rag !== existingOverride) {
    if (!mayManual) {
      throw new KpiError(403, numericTarget ? 'Only a manager can override the computed RAG' : 'You cannot set the RAG for this KPI')
    }
    manualRag = input.rag
  }

  const scored = isPeriodScored(kpi.scoredFrom, periodEndDate(period.endKey))
  const resolved = resolveReadingRag({ spec: kpi, value: input.value, scored, manualRag })
  const values = {
    value: input.value,
    valueText: input.valueText,
    rag: resolved.rag,
    ragOverridden: resolved.overridden,
    note: input.note,
    source: 'MANUAL',
    enteredById: viewer.userId,
  }

  const { approved } = await isPackageApproved(kpi.ownerId, kpi.timeframeId)
  const readingId = await prisma.$transaction(async (tx) => {
    const saved = await tx.kpiReading.upsert({
      where: { kpiId_periodStart: { kpiId: id, periodStart } },
      create: { kpiId: id, periodStart, periodEnd: periodEndDate(period.endKey), ...values },
      update: values,
      select: { id: true },
    })
    const metadata = { kpiId: id, period: period.label, periodStart: period.startKey }
    if (existing) {
      await recordPackageUpdateIfChanged(
        {
          entityType: 'KPI_READING',
          entityId: saved.id,
          subjectUserId: kpi.ownerId,
          timeframeId: kpi.timeframeId,
          packageId: kpi.packageId,
          actorId: viewer.userId,
          editedAfterApproval: approved,
          metadata,
          before: snapshot(existing),
          after: snapshot({ ...existing, ...values }),
          fields: READING_AUDIT_FIELDS,
        },
        { client: tx },
      )
    } else {
      await recordPackageActivity(
        {
          entityType: 'KPI_READING',
          action: 'READING_ENTERED',
          entityId: saved.id,
          subjectUserId: kpi.ownerId,
          timeframeId: kpi.timeframeId,
          packageId: kpi.packageId,
          actorId: viewer.userId,
          editedAfterApproval: approved,
          changes: {
            value: { from: null, to: values.value },
            ...(values.valueText ? { valueText: { from: null, to: values.valueText } } : {}),
            ...(values.rag ? { rag: { from: null, to: values.rag } } : {}),
          },
          metadata,
        },
        { client: tx },
      )
    }
    return saved.id
  })

  const fresh = await loadKpiWithContext(id)
  const view = buildView(fresh, facts, viewerContextOf(viewer), calendar)
  const readingRow = fresh.readings.find((r) => r.id === readingId)
  if (!readingRow) throw new KpiError(404, 'Reading not found')
  return {
    reading: toKpiReadingView(fresh.kpi, readingRow, { fiscalStartMonth: window.fiscalStartMonth }),
    kpi: view,
    created: !existing,
  }
}

export const KPI_SYNCED_FROM_ODOO = 'KPI_SYNCED_FROM_ODOO'

/**
 * Synced KPIs (Kpi.externalSource): readings come from the integration, so a PUT
 * is accepted only as a manager's RAG override (or clearing one) on an existing
 * reading, with the stored value unchanged. Anything else → 409 KPI_SYNCED_FROM_ODOO.
 */
async function overrideSyncedReadingRag(args: {
  viewer: PackageViewer
  loaded: LoadedKpi
  facts: PackageAccessFacts
  perms: ReturnType<typeof kpiItemPermissions>
  input: KpiReadingUpsertInput
  calendar: KpiCalendar
  window: KpiTimeframeWindow
}): Promise<UpsertKpiReadingResult> {
  const { viewer, loaded, facts, perms, input, calendar, window } = args
  const { kpi } = loaded
  const frequency: KpiFrequency = isKpiFrequency(kpi.frequency) ? kpi.frequency : 'MONTHLY'
  const dateKey = isDateKey(input.period) ? input.period : dateKeyInZone(new Date(input.period), calendar.timeZone)
  const period = kpiPeriodForKey(frequency, dateKey, { fiscalStartMonth: window.fiscalStartMonth })
  const periodStart = periodStartDate(period.startKey)
  const existing = loaded.readings.find((r) => r.periodStart.getTime() === periodStart.getTime()) ?? null

  const sameValue = existing && (input.value ?? null) === existing.value && (input.valueText ?? null) === (existing.valueText ?? null)
  if (!existing || !sameValue || input.rag === undefined || !perms.canOverrideRag) {
    throw new KpiError(
      409,
      'This KPI is synced from Odoo CRM: readings cannot be entered by hand. A manager may only override the RAG of a synced reading.',
      KPI_SYNCED_FROM_ODOO,
    )
  }

  const scored = isPeriodScored(kpi.scoredFrom, periodEndDate(period.endKey))
  const atKey = calendar.todayKey < period.endKey ? calendar.todayKey : period.endKey
  const computed = scored ? syncedReadingRag(kpi, existing.value, window, atKey) : null
  const values =
    input.rag === null
      ? { rag: computed, ragOverridden: false }
      : { rag: scored ? input.rag : null, ragOverridden: scored && input.rag !== computed }

  const { approved } = await isPackageApproved(kpi.ownerId, kpi.timeframeId)
  await prisma.$transaction(async (tx) => {
    await tx.kpiReading.update({ where: { id: existing.id }, data: values })
    await recordPackageUpdateIfChanged(
      {
        entityType: 'KPI_READING',
        entityId: existing.id,
        subjectUserId: kpi.ownerId,
        timeframeId: kpi.timeframeId,
        packageId: kpi.packageId,
        actorId: viewer.userId,
        editedAfterApproval: approved,
        metadata: { kpiId: kpi.id, period: period.label, periodStart: period.startKey },
        before: snapshot(existing),
        after: snapshot({ ...existing, ...values }),
        fields: READING_AUDIT_FIELDS,
      },
      { client: tx },
    )
  })

  const fresh = await loadKpiWithContext(kpi.id)
  const readingRow = fresh.readings.find((r) => r.id === existing.id)
  if (!readingRow) throw new KpiError(404, 'Reading not found')
  return {
    reading: toKpiReadingView(fresh.kpi, readingRow, { fiscalStartMonth: window.fiscalStartMonth }),
    kpi: buildView(fresh, facts, viewerContextOf(viewer), calendar),
    created: false,
  }
}
