/**
 * Odoo sales sync — CRM reader (server only).
 *
 * Reads crm.stage, res.users and crm.lead through the shared read-only client
 * (lib/odoo/client.ts — `fields_get` and `search_read` only) and aggregates the
 * leads with the pure rules in ./deals.ts. Leads are read in pages of 500,
 * ordered by id (keyset on `id > last`), with `active_test: false` so won
 * deals are found whatever their archive state.
 *
 * `x_support_ids` may not exist yet: its presence is checked once with
 * `fields_get` and it is treated as empty when absent.
 */
import { executeKw, readOdooConfig, OdooNotConfiguredError, type OdooConfig, type XmlValue } from '@/lib/odoo/client'
import { dateKeyInZone } from '@/lib/kpi/periods'
import { aggregateDeals, type PersonDeals, type SalesLead, type SalesStage } from './deals'

export const ODOO_PAGE_SIZE = 500
const ALL = { active_test: false } as const

type Many2one = [number, string] | false
interface RawLead {
  id: number
  name: string | false
  active: boolean
  user_id: Many2one
  x_coassignee_ids?: number[]
  x_support_ids?: number[]
  expected_revenue: number | false
  stage_id: Many2one
  date_closed: string | false
  is_rotting?: boolean
}

export interface OdooSalesSnapshot {
  /** Lowercased Odoo login → that person's credited deals (only people who own a counted deal). */
  byLogin: Map<string, PersonDeals>
  /** Lowercased logins of internal (non-share) Odoo users. */
  logins: Set<string>
  companyWon: number
  companyWonCount: number
  companyMissingAmountCount: number
  leadCount: number
  supportFieldPresent: boolean
}

function m2oId(value: Many2one | undefined): number | null {
  return Array.isArray(value) && typeof value[0] === 'number' ? value[0] : null
}

function ids(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : []
}

/** Odoo datetimes are UTC "YYYY-MM-DD HH:MM:SS". */
export function odooDateTimeKey(value: string | false | null | undefined, timeZone: string): string | null {
  if (!value) return null
  const date = new Date(`${value.trim().replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? null : dateKeyInZone(date, timeZone)
}

export function normalizeLead(raw: RawLead, timeZone: string): SalesLead {
  return {
    id: raw.id,
    name: raw.name || `Opportunity ${raw.id}`,
    active: raw.active !== false,
    userId: m2oId(raw.user_id),
    coOwnerIds: ids(raw.x_coassignee_ids),
    supportIds: ids(raw.x_support_ids),
    expectedRevenue: typeof raw.expected_revenue === 'number' ? raw.expected_revenue : 0,
    stageId: m2oId(raw.stage_id),
    closedKey: odooDateTimeKey(raw.date_closed, timeZone),
    isRotting: raw.is_rotting === true,
  }
}

export interface ReadOdooSalesOptions {
  fy: { startKey: string; endKey: string }
  timeZone: string
  config?: OdooConfig
}

export async function readOdooSales(opts: ReadOdooSalesOptions): Promise<OdooSalesSnapshot> {
  const config = opts.config ?? readOdooConfig()
  if (!config) throw new OdooNotConfiguredError()
  const call = <T>(model: string, method: string, args: XmlValue[], kwargs: Record<string, XmlValue> = {}) =>
    executeKw<T>(model, method, args, kwargs, { config, timeoutMs: 30_000 })

  const fieldInfo = await call<Record<string, unknown>>('crm.lead', 'fields_get', [['x_coassignee_ids', 'x_support_ids', 'is_rotting']], {
    attributes: ['type'],
  })
  const hasCoOwners = Boolean(fieldInfo?.x_coassignee_ids)
  const supportFieldPresent = Boolean(fieldInfo?.x_support_ids)
  const hasRotting = Boolean(fieldInfo?.is_rotting)

  const [stageRows, userRows] = await Promise.all([
    call<Array<{ id: number; name: string; is_won: boolean }>>('crm.stage', 'search_read', [[]], {
      fields: ['name', 'is_won'],
      context: ALL,
    }),
    call<Array<{ id: number; login: string | false }>>('res.users', 'search_read', [[['share', '=', false]]], {
      fields: ['login'],
      context: ALL,
    }),
  ])
  const stages = new Map<number, SalesStage>(stageRows.map((s) => [s.id, { name: String(s.name ?? ''), isWon: s.is_won === true }]))
  const loginById = new Map<number, string>()
  for (const u of userRows) if (u.login) loginById.set(u.id, String(u.login).trim().toLowerCase())

  const fields = [
    'id',
    'name',
    'active',
    'user_id',
    'expected_revenue',
    'stage_id',
    'date_closed',
    ...(hasCoOwners ? ['x_coassignee_ids'] : []),
    ...(supportFieldPresent ? ['x_support_ids'] : []),
    ...(hasRotting ? ['is_rotting'] : []),
  ]
  const leads: SalesLead[] = []
  let lastId = 0
  for (;;) {
    const page = await call<RawLead[]>(
      'crm.lead',
      'search_read',
      [[['type', '=', 'opportunity'], ['id', '>', lastId], '|', ['active', '=', true], ['stage_id.is_won', '=', true]]],
      { fields, limit: ODOO_PAGE_SIZE, order: 'id asc', context: ALL },
    )
    for (const raw of page) leads.push(normalizeLead(raw, opts.timeZone))
    if (page.length < ODOO_PAGE_SIZE) break
    lastId = page[page.length - 1].id
  }

  const agg = aggregateDeals(leads, stages, opts.fy)
  const byLogin = new Map<string, PersonDeals>()
  for (const [userId, deals] of agg.byUser) {
    const login = loginById.get(userId)
    if (login) byLogin.set(login, deals)
  }
  return {
    byLogin,
    logins: new Set(loginById.values()),
    companyWon: agg.companyWon,
    companyWonCount: agg.companyWonCount,
    companyMissingAmountCount: agg.companyMissingAmountCount,
    leadCount: leads.length,
    supportFieldPresent,
  }
}
