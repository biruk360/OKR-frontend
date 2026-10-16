/**
 * Odoo sales sync — the daily job (server only). Called by
 * `app/api/cron/odoo-sales-sync/route.ts` at 03:30 UTC (06:30 EAT), before
 * Odoo's 07:30 "Bid & sales brief".
 *
 *   1. load the Odoo-linked KPIs of the active timeframe (./context.server.ts)
 *   2. read Odoo CRM (./odoo.ts) and match OKR users by lowercased email = Odoo login
 *   3. upsert one `source = 'ODOO'` reading per synced KPI for the current period
 *      (quota: cumulative credited won; coverage: pipeline ÷ remaining quota;
 *      company: won ÷ pace-expected in %). A manager's RAG override is kept.
 *   4. POST the full-state payload to Odoo's webhook (one retry on 5xx / network)
 *
 * Idempotent: a second run the same day rewrites the same rows (only the note's
 * sync time changes). It never touches KeyResult values and sends no
 * notifications. `dryRun` computes everything and writes / pushes nothing.
 *
 * TODO(v2): behind ODOO_SYNC_UPDATE_KRS=1, mirror won values into the linked
 * sales KRs through a system check-in that suppresses notifications.
 */
import { prisma } from '@/lib/prisma'
import { recordPackageActivity, recordPackageUpdateIfChanged } from '@/lib/package/audit'
import { absoluteUrl } from '@/lib/notifications/deep-link'
import { computeKpiRag, isPeriodScored } from '@/lib/kpi/rag'
import { periodEndDate, periodStartDate, type KpiPeriod } from '@/lib/kpi/periods'
import { isKpiRag, type KpiRag } from '@/types/package'
import { isOdooConfigured } from '@/lib/odoo/client'
import { currentPeriodFor, loadSalesSyncContext, type QuotaContext, type SalesSyncContext, type SyncedKpi } from './context.server'
import type { PersonDeals } from './deals'
import { readOdooSales, type OdooSalesSnapshot } from './odoo'
import { loadOkrActionItems } from './okr-items.server'
import { expectedBy, fromEtb } from './pace'
import { buildSalesTargetsPayload, roundMoney, roundRatio, type SalesTargetEntry, type SalesTargetsPayload } from './payload'
import { computeStanding, coverageRag, type Standing } from './standing'
import { pushSalesTargets } from './webhook'

export interface SyncPersonSummary {
  email: string
  kpiRef: string
  coverageKpiRef: string | null
  won: number
  expected: number
  gap: number
  coverage: number | null
  rag: KpiRag | null
  ragCoverage: KpiRag | null
  wonDeals: number
  openDeals: number
  missingAmountCount: number
  staleCount: number
  okrItems: number
}

export interface OdooSalesSyncResult {
  ok: boolean
  dryRun: boolean
  todayKey: string | null
  fiscalYear: { name: string; start: string; end: string } | null
  company: { kpiRef: string; won: number; wonDeals: number; missingAmountCount: number; expected: number; pctOfPace: number | null; rag: KpiRag | null } | null
  people: SyncPersonSummary[]
  unmatched: string[]
  readings: { created: number; updated: number; unchanged: number }
  pushed: boolean
  errors: string[]
  durationMs: number
}

export class OdooSalesNotConfiguredError extends Error {
  readonly code = 'ODOO_NOT_CONFIGURED'
  constructor() {
    super('Odoo not configured — set ODOO_URL, ODOO_DB, ODOO_USER and ODOO_KEY')
    this.name = 'OdooSalesNotConfiguredError'
  }
}

export interface RunOdooSalesSyncOptions {
  now?: Date
  dryRun?: boolean
  /** Test seams. */
  readOdoo?: typeof readOdooSales
  fetchImpl?: typeof fetch
}

const EMPTY_DEALS: PersonDeals = { wonDeals: [], openDeals: [], won: 0, openPipeline: 0, missingAmountCount: 0, staleCount: 0 }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

interface ReadingWrite {
  kpi: SyncedKpi
  period: KpiPeriod
  value: number | null
  valueText: string | null
  rag: KpiRag | null
  note: string
}

type WriteOutcome = 'created' | 'updated' | 'unchanged'

/** Fields whose change is audited (the note carries the sync time and changes every run). */
const AUDITED_FIELDS = ['value', 'valueText', 'rag', 'source'] as const

async function upsertSyncedReading(w: ReadingWrite): Promise<WriteOutcome> {
  const periodStart = periodStartDate(w.period.startKey)
  const periodEnd = periodEndDate(w.period.endKey)
  const scored = isPeriodScored(w.kpi.scoredFrom, periodEnd)

  return prisma.$transaction(async (tx) => {
    const existing = await tx.kpiReading.findUnique({ where: { kpiId_periodStart: { kpiId: w.kpi.id, periodStart } } })
    // A manager's override stands until they clear it (KPI RAG override rule).
    const keepOverride = Boolean(existing?.ragOverridden)
    const values = {
      value: w.value,
      valueText: w.valueText,
      rag: keepOverride ? existing!.rag : scored ? w.rag : null,
      ragOverridden: keepOverride,
      note: w.note,
      source: 'ODOO',
      enteredById: null,
    }
    const saved = await tx.kpiReading.upsert({
      where: { kpiId_periodStart: { kpiId: w.kpi.id, periodStart } },
      create: { kpiId: w.kpi.id, periodStart, periodEnd, ...values },
      update: values,
      select: { id: true },
    })
    const metadata = { kpiId: w.kpi.id, period: w.period.label, periodStart: w.period.startKey, source: 'odoo-sales-sync' }
    if (!existing) {
      await recordPackageActivity(
        {
          entityType: 'KPI_READING',
          action: 'READING_ENTERED',
          entityId: saved.id,
          subjectUserId: w.kpi.ownerId,
          timeframeId: w.kpi.timeframeId,
          packageId: w.kpi.packageId,
          actorId: null,
          changes: { value: { from: null, to: values.value }, ...(values.rag ? { rag: { from: null, to: values.rag } } : {}) },
          metadata,
        },
        { client: tx },
      )
      return 'created'
    }
    const changed = AUDITED_FIELDS.some((f) => (existing as Record<string, unknown>)[f] !== (values as Record<string, unknown>)[f])
    if (!changed) return 'unchanged'
    await recordPackageUpdateIfChanged(
      {
        entityType: 'KPI_READING',
        entityId: saved.id,
        subjectUserId: w.kpi.ownerId,
        timeframeId: w.kpi.timeframeId,
        packageId: w.kpi.packageId,
        actorId: null,
        metadata,
        before: existing as unknown as Record<string, unknown>,
        after: { ...existing, ...values } as unknown as Record<string, unknown>,
        fields: AUDITED_FIELDS,
      },
      { client: tx },
    )
    return 'updated'
  })
}

function syncNote(won: number, missing: number, syncedAt: Date): string {
  return `Odoo CRM: ${won} won deal${won === 1 ? '' : 's'} (${missing} without amount) · synced ${syncedAt.toISOString()}`
}

// ---------------------------------------------------------------------------
// Standing per person
// ---------------------------------------------------------------------------

interface PersonResult {
  quota: QuotaContext
  deals: PersonDeals
  standing: Standing
  ragCoverage: KpiRag | null
}

function standingFor(quota: QuotaContext, deals: PersonDeals, ctx: SalesSyncContext): PersonResult {
  const standing = computeStanding({
    target: quota.target,
    pace: quota.pace,
    fyStartKey: ctx.fiscalYear.startKey,
    fyEndKey: ctx.fiscalYear.endKey,
    won: deals.won,
    openPipeline: deals.openPipeline,
    coverageTarget: quota.coverageTarget,
    thresholdAmber: quota.kpi.thresholdAmber,
    todayKey: ctx.todayKey,
  })
  const ragCoverage = coverageRag(standing.coverage, quota.coverageTarget, quota.coverageKpi?.thresholdAmber)
  return { quota, deals, standing, ragCoverage }
}

function targetEntry(p: PersonResult, items: SalesTargetEntry['okr']['items']): SalesTargetEntry {
  return {
    email: p.quota.email,
    kpiRef: p.quota.kpiRef,
    kpiName: p.quota.kpi.name,
    target: p.quota.target,
    unit: 'ETB',
    pace: p.quota.pace,
    coverageTarget: p.quota.coverageTarget,
    coverageKpiRef: p.quota.coverageKpi?.externalRef ?? null,
    okr: {
      won: p.standing.won,
      expected: p.standing.expected,
      rag: p.standing.ragQuota,
      coverage: p.standing.coverage,
      items,
    },
    okrUrl: absoluteUrl('/dashboard'),
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function isSyncDryRunForced(): boolean {
  return process.env.ODOO_SALES_SYNC_DRY_RUN === '1'
}

export async function runOdooSalesSync(opts: RunOdooSalesSyncOptions = {}): Promise<OdooSalesSyncResult> {
  const started = Date.now()
  const now = opts.now ?? new Date()
  const dryRun = Boolean(opts.dryRun) || isSyncDryRunForced()
  const readOdoo = opts.readOdoo ?? readOdooSales
  if (!opts.readOdoo && !isOdooConfigured()) throw new OdooSalesNotConfiguredError()

  const result: OdooSalesSyncResult = {
    ok: false,
    dryRun,
    todayKey: null,
    fiscalYear: null,
    company: null,
    people: [],
    unmatched: [],
    readings: { created: 0, updated: 0, unchanged: 0 },
    pushed: false,
    errors: [],
    durationMs: 0,
  }
  const finish = () => {
    result.durationMs = Date.now() - started
    return result
  }

  const ctx = await loadSalesSyncContext(now)
  if (!ctx) {
    result.errors.push('No active timeframe')
    return finish()
  }
  result.todayKey = ctx.todayKey
  result.fiscalYear = { name: ctx.fiscalYear.name, start: ctx.fiscalYear.startKey, end: ctx.fiscalYear.endKey }
  result.errors.push(...ctx.errors)
  if (ctx.quotas.length === 0 && !ctx.company) {
    result.errors.push('No KPIs are linked to Odoo (run scripts/link-odoo-sales-kpis.ts --apply)')
    return finish()
  }

  let snapshot: OdooSalesSnapshot
  try {
    snapshot = await readOdoo({ fy: ctx.fiscalYear, timeZone: ctx.timeZone })
  } catch (error) {
    result.errors.push(`Odoo read failed: ${errorMessage(error)}`)
    return finish()
  }

  // Match OKR people to Odoo users (lowercased email = Odoo login).
  const matched: PersonResult[] = []
  for (const quota of ctx.quotas) {
    if (!snapshot.logins.has(quota.email)) {
      result.unmatched.push(quota.email)
      continue
    }
    matched.push(standingFor(quota, snapshot.byLogin.get(quota.email) ?? EMPTY_DEALS, ctx))
  }

  // A manager's RAG override on this period's quota reading wins in the summary and the payload.
  const overrides = await prisma.kpiReading
    .findMany({
      where: {
        ragOverridden: true,
        OR: matched.map((p) => ({ kpiId: p.quota.kpi.id, periodStart: periodStartDate(currentPeriodFor(p.quota.kpi, ctx).startKey) })),
      },
      select: { kpiId: true, rag: true },
    })
    .then((rows) => new Map(rows.filter((r) => isKpiRag(r.rag)).map((r) => [r.kpiId, r.rag as KpiRag])))
  for (const p of matched) {
    const override = overrides.get(p.quota.kpi.id)
    if (override) p.standing = { ...p.standing, ragQuota: override }
  }

  const itemsByUser = await loadOkrActionItems(
    matched.map((p) => p.quota.kpi.ownerId),
    ctx.todayKey,
    ctx.timeZone,
    ctx.fiscalYear.startKey,
  ).catch((error) => {
    result.errors.push(`OKR action items failed: ${errorMessage(error)}`)
    return new Map<string, SalesTargetEntry['okr']['items']>()
  })

  const writes: ReadingWrite[] = []
  for (const p of matched) {
    const items = itemsByUser.get(p.quota.kpi.ownerId) ?? []
    result.people.push({
      email: p.quota.email,
      kpiRef: p.quota.kpiRef,
      coverageKpiRef: p.quota.coverageKpi?.externalRef ?? null,
      won: roundMoney(p.standing.won),
      expected: Math.round(p.standing.expected),
      gap: roundMoney(p.standing.gap),
      coverage: roundRatio(p.standing.coverage),
      rag: p.standing.ragQuota,
      ragCoverage: p.ragCoverage,
      wonDeals: p.deals.wonDeals.length,
      openDeals: p.deals.openDeals.length,
      missingAmountCount: p.deals.missingAmountCount,
      staleCount: p.deals.staleCount,
      okrItems: items.length,
    })
    const note = syncNote(p.deals.wonDeals.length, p.deals.wonDeals.filter((d) => d.amount <= 0).length, now)
    try {
      writes.push({
        kpi: p.quota.kpi,
        period: currentPeriodFor(p.quota.kpi, ctx),
        value: fromEtb(p.standing.won, p.quota.kpi.unit),
        valueText: null,
        rag: p.standing.ragQuota,
        note,
      })
    } catch (error) {
      result.errors.push(`${p.quota.kpiRef}: ${errorMessage(error)}`)
    }
    if (p.quota.coverageKpi) {
      writes.push({
        kpi: p.quota.coverageKpi,
        period: currentPeriodFor(p.quota.coverageKpi, ctx),
        value: p.standing.coverage === null ? null : roundRatio(p.standing.coverage),
        valueText: p.standing.coverage === null ? 'Quota met' : null,
        rag: p.ragCoverage,
        note: `Odoo CRM: ${p.deals.openDeals.length} open deals (${p.deals.openDeals.filter((d) => d.amount <= 0).length} without amount) ÷ remaining quota · synced ${now.toISOString()}`,
      })
    }
  }

  // Company: won (full amounts, each deal once) against the company pace, in %.
  if (ctx.company) {
    const expected = expectedBy(ctx.company.pace, ctx.fiscalYear.startKey, ctx.todayKey)
    const pct = expected > 0 ? (snapshot.companyWon / expected) * 100 : null
    const kpi = ctx.company.kpi
    const rag = pct === null ? null : computeKpiRag(kpi, pct)
    result.company = {
      kpiRef: ctx.company.kpiRef,
      won: roundMoney(snapshot.companyWon),
      wonDeals: snapshot.companyWonCount,
      missingAmountCount: snapshot.companyMissingAmountCount,
      expected: Math.round(expected),
      pctOfPace: pct === null ? null : Math.round(pct * 10) / 10,
      rag,
    }
    writes.push({
      kpi,
      period: currentPeriodFor(kpi, ctx),
      value: pct === null ? null : Math.round(pct * 10) / 10,
      valueText: pct === null ? 'No pace expected yet' : null,
      rag,
      note: syncNote(snapshot.companyWonCount, snapshot.companyMissingAmountCount, now),
    })
  }

  if (!dryRun) {
    for (const w of writes) {
      try {
        result.readings[await upsertSyncedReading(w)] += 1
      } catch (error) {
        result.errors.push(`${w.kpi.externalRef ?? w.kpi.id}: reading not saved — ${errorMessage(error)}`)
      }
    }
  }

  const payload = buildSalesTargetsPayload(
    {
      sentAt: now,
      fiscalYear: ctx.fiscalYear,
      company: ctx.company,
      targets: matched.map((p) => targetEntry(p, itemsByUser.get(p.quota.kpi.ownerId) ?? [])),
    },
    process.env.ODOO_SALES_WEBHOOK_SECRET || undefined,
  )

  if (!dryRun) {
    const url = process.env.ODOO_SALES_WEBHOOK_URL
    if (!url || !process.env.ODOO_SALES_WEBHOOK_SECRET) {
      result.errors.push('Odoo webhook not configured (ODOO_SALES_WEBHOOK_URL / ODOO_SALES_WEBHOOK_SECRET) — readings saved, nothing pushed')
    } else {
      const push = await pushSalesTargets(payload, { url, fetchImpl: opts.fetchImpl })
      result.pushed = push.ok
      if (!push.ok) result.errors.push(push.error)
    }
  }

  result.ok = result.errors.length === 0
  return finish()
}

/** The payload without the secret — exposed for tests and the read-only endpoint. */
export type { SalesTargetsPayload }
