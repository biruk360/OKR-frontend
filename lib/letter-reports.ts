/**
 * FR-16 Letters reporting — breakdowns by status, type, customer, preparer,
 * signatory and month, plus workflow turnaround (submitted → approved → sent).
 *
 * Scope: exactly the letters the viewer can read in the list
 * (buildLetterReadWhere — `letter.read` + RecordScopeRules + own/signatory).
 * Turnaround comes from the append-only ActivityLog transition entries
 * (LETTER_SUBMITTED / LETTER_APPROVED / LETTER_SENT), not from mutable
 * columns, so a reject → resubmit cycle is measured from the submission that
 * was actually approved.
 *
 * `aggregateLetterReport` is pure and unit-tested; `buildLetterReport` does
 * the scoped reads.
 */
import { prisma } from './prisma'
import { buildLetterReadWhere } from './letter-access'

export const LETTER_REPORT_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'ARCHIVED'] as const
export type LetterReportStatus = (typeof LETTER_REPORT_STATUSES)[number]

/** Hard cap on letters aggregated per request; the response says when it bit. */
export const LETTER_REPORT_MAX_ROWS = 20_000

export interface LetterReportFilters {
  from?: Date | null
  to?: Date | null
  letterTypeId?: string | null
}

export interface ReportLetterRow {
  id: string
  status: string
  date: Date
  customerName: string
  letterType: string
  letterTypeId: string | null
  typeName: string | null
  typeCode: string | null
  preparedById: string
  preparedByName: string
  signatoryId: string | null
  signatoryName: string | null
}

export interface ReportTransitionEvent {
  letterId: string
  action: 'LETTER_SUBMITTED' | 'LETTER_APPROVED' | 'LETTER_SENT'
  createdAt: Date
}

export interface DurationStats {
  count: number
  avgHours: number | null
  medianHours: number | null
}

export interface LetterReport {
  filters: { from: string | null; to: string | null; letterTypeId: string | null }
  total: number
  truncated: boolean
  byStatus: Array<{ status: LetterReportStatus; count: number }>
  byType: Array<{ key: string; code: string | null; name: string; count: number }>
  byMonth: Array<{ month: string; total: number; sent: number }>
  byCustomer: Array<{ customer: string; count: number }>
  preparers: Array<{
    userId: string
    name: string
    total: number
    draft: number
    submitted: number
    approved: number
    sent: number
    archived: number
  }>
  signatories: Array<{
    userId: string
    name: string
    total: number
    approvedOrLater: number
    sent: number
    avgSubmitToApproveHours: number | null
  }>
  turnaround: {
    submitToApprove: DurationStats
    approveToSend: DurationStats
    submitToSend: DurationStats
  }
}

const HOUR = 3_600_000

function stats(hours: number[]): DurationStats {
  if (hours.length === 0) return { count: 0, avgHours: null, medianHours: null }
  const sorted = [...hours].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const avg = sorted.reduce((s, h) => s + h, 0) / sorted.length
  return { count: sorted.length, avgHours: round1(avg), medianHours: round1(median) }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Per-letter milestone times. Approved = first approval; submitted = the last
 * submission at or before it (the one that was approved); sent = first send
 * at or after approval. Letters never approved contribute nothing.
 */
export function letterMilestones(events: ReportTransitionEvent[]): Map<
  string,
  { submittedAt: Date | null; approvedAt: Date | null; sentAt: Date | null }
> {
  const byLetter = new Map<string, ReportTransitionEvent[]>()
  for (const e of events) {
    const list = byLetter.get(e.letterId)
    if (list) list.push(e)
    else byLetter.set(e.letterId, [e])
  }
  const out = new Map<string, { submittedAt: Date | null; approvedAt: Date | null; sentAt: Date | null }>()
  byLetter.forEach((list, letterId) => {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const approved = list.find((e) => e.action === 'LETTER_APPROVED') ?? null
    const approvedAt = approved?.createdAt ?? null
    let submittedAt: Date | null = null
    for (const e of list) {
      if (e.action !== 'LETTER_SUBMITTED') continue
      if (approvedAt && e.createdAt.getTime() > approvedAt.getTime()) break
      submittedAt = e.createdAt
    }
    const sent = list.find(
      (e) => e.action === 'LETTER_SENT' && (!approvedAt || e.createdAt.getTime() >= approvedAt.getTime()),
    )
    out.set(letterId, { submittedAt, approvedAt, sentAt: sent?.createdAt ?? null })
  })
  return out
}

/** Pure aggregation over already-scoped rows. */
export function aggregateLetterReport(
  letters: ReportLetterRow[],
  events: ReportTransitionEvent[],
  meta: { filters: LetterReport['filters']; truncated: boolean },
): LetterReport {
  const statusCounts = new Map<string, number>()
  const typeCounts = new Map<string, { code: string | null; name: string; count: number }>()
  const monthCounts = new Map<string, { total: number; sent: number }>()
  const customerCounts = new Map<string, number>()
  const preparers = new Map<string, LetterReport['preparers'][number]>()
  const signatories = new Map<string, LetterReport['signatories'][number] & { _approveHours: number[] }>()

  const milestones = letterMilestones(events)
  const submitToApprove: number[] = []
  const approveToSend: number[] = []
  const submitToSend: number[] = []

  for (const l of letters) {
    const status = l.status
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1)

    const typeKey = l.letterTypeId ?? `legacy:${l.letterType}`
    const t = typeCounts.get(typeKey) ?? { code: l.typeCode ?? l.letterType, name: l.typeName ?? l.letterType, count: 0 }
    t.count++
    typeCounts.set(typeKey, t)

    const mk = monthKey(l.date)
    const m = monthCounts.get(mk) ?? { total: 0, sent: 0 }
    m.total++
    if (status === 'SENT' || status === 'ARCHIVED') m.sent++
    monthCounts.set(mk, m)

    const customer = l.customerName?.trim() || '(No customer)'
    customerCounts.set(customer, (customerCounts.get(customer) ?? 0) + 1)

    const p = preparers.get(l.preparedById) ?? {
      userId: l.preparedById, name: l.preparedByName, total: 0,
      draft: 0, submitted: 0, approved: 0, sent: 0, archived: 0,
    }
    p.total++
    if (status === 'DRAFT') p.draft++
    else if (status === 'SUBMITTED') p.submitted++
    else if (status === 'APPROVED') p.approved++
    else if (status === 'SENT') p.sent++
    else if (status === 'ARCHIVED') p.archived++
    preparers.set(l.preparedById, p)

    const ms = milestones.get(l.id)
    let approveHours: number | null = null
    if (ms?.submittedAt && ms.approvedAt) {
      approveHours = (ms.approvedAt.getTime() - ms.submittedAt.getTime()) / HOUR
      submitToApprove.push(approveHours)
    }
    if (ms?.approvedAt && ms.sentAt) approveToSend.push((ms.sentAt.getTime() - ms.approvedAt.getTime()) / HOUR)
    if (ms?.submittedAt && ms.sentAt) submitToSend.push((ms.sentAt.getTime() - ms.submittedAt.getTime()) / HOUR)

    if (l.signatoryId) {
      const s = signatories.get(l.signatoryId) ?? {
        userId: l.signatoryId, name: l.signatoryName ?? 'Unknown', total: 0,
        approvedOrLater: 0, sent: 0, avgSubmitToApproveHours: null, _approveHours: [],
      }
      s.total++
      if (status === 'APPROVED' || status === 'SENT' || status === 'ARCHIVED') s.approvedOrLater++
      if (status === 'SENT' || status === 'ARCHIVED') s.sent++
      if (approveHours !== null) s._approveHours.push(approveHours)
      signatories.set(l.signatoryId, s)
    }
  }

  return {
    filters: meta.filters,
    total: letters.length,
    truncated: meta.truncated,
    byStatus: LETTER_REPORT_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
    byType: Array.from(typeCounts.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    byMonth: Array.from(monthCounts.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    byCustomer: Array.from(customerCounts.entries())
      .map(([customer, count]) => ({ customer, count }))
      .sort((a, b) => b.count - a.count || a.customer.localeCompare(b.customer))
      .slice(0, 25),
    preparers: Array.from(preparers.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    signatories: Array.from(signatories.values())
      .map(({ _approveHours, ...rest }) => ({ ...rest, avgSubmitToApproveHours: stats(_approveHours).avgHours }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    turnaround: {
      submitToApprove: stats(submitToApprove),
      approveToSend: stats(approveToSend),
      submitToSend: stats(submitToSend),
    },
  }
}

/** Parse `from` / `to` (YYYY-MM-DD, inclusive) query values. Pure. */
export function parseReportFilters(params: URLSearchParams): LetterReportFilters | { error: string } {
  const parse = (raw: string | null, endOfDay: boolean): Date | null | 'invalid' => {
    if (!raw) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'invalid'
    const d = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    return Number.isNaN(d.getTime()) ? 'invalid' : d
  }
  const from = parse(params.get('from'), false)
  const to = parse(params.get('to'), true)
  if (from === 'invalid' || to === 'invalid') return { error: 'Dates must be YYYY-MM-DD' }
  if (from && to && from.getTime() > to.getTime()) return { error: '"from" must be on or before "to"' }
  const letterTypeId = params.get('letterTypeId')
  return { from, to, letterTypeId: letterTypeId || null }
}

/**
 * Scoped report for `userId`, or `null` when they lack `letter.read`.
 * Filters apply to the letter date (the date printed on the letter).
 */
export async function buildLetterReport(userId: string, filters: LetterReportFilters): Promise<LetterReport | null> {
  const readWhere = await buildLetterReadWhere(userId)
  if (!readWhere) return null

  const where: Record<string, unknown> = {}
  if (filters.from || filters.to) {
    where.date = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }
  if (filters.letterTypeId) where.letterTypeId = filters.letterTypeId
  const scopedWhere = { AND: [where, readWhere] }

  const rows = await prisma.letter.findMany({
    where: scopedWhere,
    orderBy: { date: 'desc' },
    take: LETTER_REPORT_MAX_ROWS + 1,
    select: {
      id: true,
      status: true,
      date: true,
      customerName: true,
      letterType: true,
      letterTypeId: true,
      preparedById: true,
      signatoryId: true,
      preparedBy: { select: { name: true } },
      signatory: { select: { name: true } },
      letterTypeDef: { select: { code: true, name: true } },
    },
  })
  const truncated = rows.length > LETTER_REPORT_MAX_ROWS
  const letters: ReportLetterRow[] = rows.slice(0, LETTER_REPORT_MAX_ROWS).map((r) => ({
    id: r.id,
    status: r.status,
    date: r.date,
    customerName: r.customerName,
    letterType: r.letterType,
    letterTypeId: r.letterTypeId,
    typeName: r.letterTypeDef?.name ?? null,
    typeCode: r.letterTypeDef?.code ?? null,
    preparedById: r.preparedById,
    preparedByName: r.preparedBy?.name ?? 'Unknown',
    signatoryId: r.signatoryId,
    signatoryName: r.signatory?.name ?? null,
  }))

  const ids = letters.map((l) => l.id)
  const events: ReportTransitionEvent[] = []
  // Chunked so a large report never builds an unbounded IN list.
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000)
    const logs = await prisma.activityLog.findMany({
      where: {
        letterId: { in: chunk },
        action: { in: ['LETTER_SUBMITTED', 'LETTER_APPROVED', 'LETTER_SENT'] },
      },
      select: { letterId: true, action: true, createdAt: true },
    })
    for (const log of logs) {
      if (!log.letterId) continue
      events.push({
        letterId: log.letterId,
        action: log.action as ReportTransitionEvent['action'],
        createdAt: log.createdAt,
      })
    }
  }

  return aggregateLetterReport(letters, events, {
    filters: {
      from: filters.from ? filters.from.toISOString().slice(0, 10) : null,
      to: filters.to ? filters.to.toISOString().slice(0, 10) : null,
      letterTypeId: filters.letterTypeId ?? null,
    },
    truncated,
  })
}
