/**
 * Odoo sales sync — deal credit and aggregation. Pure and client-safe.
 *
 * Credit rules (CEO decision, FY2026/27):
 *   - owners = Salesperson (`user_id`) ∪ Co-owners (`x_coassignee_ids`), deduplicated;
 *     each owner gets an equal share of `expected_revenue`
 *   - Support team (`x_support_ids`) gets no credit. A person listed both as an
 *     owner and as support is an owner (support never adds or removes anyone).
 *   - achievement = Won opportunities whose `date_closed` falls inside the fiscal year
 *   - open pipeline = active, not Won, and not in a closed-type stage
 *   - a deal without an amount counts 0 and is reported as "missing amount"
 */
import { compareDateKeys } from '@/lib/kpi/periods'

/** A crm.lead opportunity, normalised from the XML-RPC shape (see ./odoo.ts). */
export interface SalesLead {
  id: number
  name: string
  active: boolean
  /** Salesperson (res.users id) or null. */
  userId: number | null
  coOwnerIds: readonly number[]
  supportIds: readonly number[]
  /** ETB; 0 when Odoo has no amount. */
  expectedRevenue: number
  stageId: number | null
  /** `YYYY-MM-DD` (org timezone) or null. */
  closedKey: string | null
  isRotting: boolean
}

export interface SalesStage {
  name: string
  isWon: boolean
}

/** Stages whose deals are not open pipeline (compared case-insensitively). */
export const CLOSED_STAGE_NAMES: readonly string[] = [
  'won',
  'lost',
  'closed',
  'missed',
  'dropped',
  'canceled',
  'cancelled',
  'on hold',
  'unknown (90 days & older)',
]

/** Owners of a lead: Salesperson plus Co-owners, deduplicated, in that order. */
export function leadOwners(lead: Pick<SalesLead, 'userId' | 'coOwnerIds'>): number[] {
  const owners: number[] = []
  for (const id of [lead.userId, ...lead.coOwnerIds]) {
    if (typeof id === 'number' && id > 0 && !owners.includes(id)) owners.push(id)
  }
  return owners
}

/** Equal split of the lead's amount between its owners (support people get nothing). */
export function creditSplit(lead: Pick<SalesLead, 'userId' | 'coOwnerIds' | 'expectedRevenue'>): Map<number, number> {
  const owners = leadOwners(lead)
  const out = new Map<number, number>()
  if (owners.length === 0) return out
  const amount = hasAmount(lead) ? lead.expectedRevenue : 0
  const share = amount / owners.length
  for (const id of owners) out.set(id, share)
  return out
}

export function hasAmount(lead: Pick<SalesLead, 'expectedRevenue'>): boolean {
  return Number.isFinite(lead.expectedRevenue) && lead.expectedRevenue > 0
}

export type DealClass = 'WON' | 'OPEN' | 'OTHER'

/** Won inside the fiscal year, open pipeline, or neither. */
export function classifyLead(
  lead: Pick<SalesLead, 'active' | 'stageId' | 'closedKey'>,
  stages: ReadonlyMap<number, SalesStage>,
  fy: { startKey: string; endKey: string },
): DealClass {
  const stage = lead.stageId != null ? stages.get(lead.stageId) : undefined
  if (stage?.isWon) {
    if (!lead.closedKey) return 'OTHER'
    const inFy = compareDateKeys(lead.closedKey, fy.startKey) >= 0 && compareDateKeys(lead.closedKey, fy.endKey) <= 0
    return inFy && lead.active ? 'WON' : 'OTHER'
  }
  if (!lead.active) return 'OTHER'
  const name = stage?.name.trim().toLowerCase() ?? ''
  return CLOSED_STAGE_NAMES.includes(name) ? 'OTHER' : 'OPEN'
}

export interface CreditedDeal {
  leadId: number
  name: string
  /** This person's credited share (ETB). */
  share: number
  /** The deal's full amount (ETB). */
  amount: number
  stage: string | null
  closedKey: string | null
}

export interface PersonDeals {
  wonDeals: CreditedDeal[]
  openDeals: CreditedDeal[]
  /** Sum of credited won shares (ETB). */
  won: number
  /** Sum of credited open shares (ETB). */
  openPipeline: number
  /** Won-in-FY and open deals this person owns that have no amount. */
  missingAmountCount: number
  /** Open deals this person owns that Odoo flags as rotting. */
  staleCount: number
}

export interface DealsAggregate {
  /** Keyed by res.users id. */
  byUser: Map<number, PersonDeals>
  /** Company won total: full amounts, not split (each deal once). */
  companyWon: number
  companyWonCount: number
  companyMissingAmountCount: number
}

function emptyPerson(): PersonDeals {
  return { wonDeals: [], openDeals: [], won: 0, openPipeline: 0, missingAmountCount: 0, staleCount: 0 }
}

/** Per-owner credited won / open figures plus the company won total. */
export function aggregateDeals(
  leads: readonly SalesLead[],
  stages: ReadonlyMap<number, SalesStage>,
  fy: { startKey: string; endKey: string },
): DealsAggregate {
  const byUser = new Map<number, PersonDeals>()
  let companyWon = 0
  let companyWonCount = 0
  let companyMissingAmountCount = 0

  for (const lead of leads) {
    const cls = classifyLead(lead, stages, fy)
    if (cls === 'OTHER') continue
    const missing = !hasAmount(lead)
    const amount = missing ? 0 : lead.expectedRevenue
    if (cls === 'WON') {
      companyWon += amount
      companyWonCount += 1
      if (missing) companyMissingAmountCount += 1
    }
    const stageName = lead.stageId != null ? stages.get(lead.stageId)?.name ?? null : null
    for (const [userId, share] of creditSplit(lead)) {
      const person = byUser.get(userId) ?? emptyPerson()
      byUser.set(userId, person)
      const deal: CreditedDeal = { leadId: lead.id, name: lead.name, share, amount, stage: stageName, closedKey: lead.closedKey }
      if (missing) person.missingAmountCount += 1
      if (cls === 'WON') {
        person.wonDeals.push(deal)
        person.won += share
      } else {
        person.openDeals.push(deal)
        person.openPipeline += share
        if (lead.isRotting) person.staleCount += 1
      }
    }
  }
  return { byUser, companyWon, companyWonCount, companyMissingAmountCount }
}
