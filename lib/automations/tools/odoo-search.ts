/**
 * `odoo.search` — read Odoo records on a schedule.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §7 (Tier 1), FR-06.
 *
 * Three layers of narrowing, outermost first:
 *   1. lib/odoo/client.ts refuses any non-read method, unconditionally.
 *   2. ODOO_ALLOWED_MODELS is the outer bound of what any automation may touch.
 *   3. The grant's `models` list narrows that per automation.
 * A plan can only ever choose from inside all three.
 *
 * Odoo returns `false` for unset values of every type and `[id, "Label"]` pairs
 * for many2one relations, so normalisation is doing real work here rather than
 * just renaming keys.
 */

import { executeKw, readOdooConfig } from '@/lib/odoo/client'
import {
  ODOO_ALLOWED_MODELS,
  ODOO_MAX_LIMIT,
  type OdooModel,
  type OdooToolGrantParams,
} from '@/types/automations'
import type { AutomationTool, ToolContext, ToolResult, ToolRow } from './types'
import { ToolRefusedError } from './types'

const DEFAULT_LIMIT = 50

/** Fields fetched for every model on top of whatever the plan asks for. */
const BASE_FIELDS = ['id', 'display_name', 'write_date']

/** Per-model hints for turning a record into a ToolRow. */
const MODEL_HINTS: Record<string, { title: string[]; subtitle: string[]; status: string[]; owner: string[] }> = {
  'crm.lead':        { title: ['name'], subtitle: ['partner_id', 'contact_name'], status: ['stage_id'], owner: ['user_id'] },
  'sale.order':      { title: ['name'], subtitle: ['partner_id'], status: ['state'], owner: ['user_id'] },
  'sale.order.line': { title: ['name'], subtitle: ['order_id'], status: ['state'], owner: ['salesman_id'] },
  'account.move':    { title: ['name', 'ref'], subtitle: ['partner_id'], status: ['state'], owner: ['invoice_user_id'] },
  'res.partner':     { title: ['display_name', 'name'], subtitle: ['city'], status: ['type'], owner: ['user_id'] },
  'project.task':    { title: ['name'], subtitle: ['project_id'], status: ['stage_id'], owner: ['user_ids', 'user_id'] },
  'project.project': { title: ['name'], subtitle: ['partner_id'], status: ['stage_id'], owner: ['user_id'] },
}

const DEFAULT_HINT = { title: ['display_name', 'name'], subtitle: [], status: ['state'], owner: ['user_id'] }

export interface OdooSearchParams {
  model: OdooModel
  domain?: unknown[]
  fields?: string[]
  limit?: number
  order?: string
}

/**
 * Odoo domains are arrays of `[field, operator, value]` triples interleaved with
 * the logical operators `&`, `|`, `!`. We validate the shape rather than trust
 * it: a malformed domain is an error in the transcript, not a 500 from the ERP.
 */
export function validateDomain(domain: unknown): unknown[] {
  if (domain === undefined || domain === null) return []
  if (!Array.isArray(domain)) throw new ToolRefusedError('odoo.search', 'domain must be an array')
  if (domain.length > 40) throw new ToolRefusedError('odoo.search', 'domain has too many terms (max 40)')

  for (const term of domain) {
    if (typeof term === 'string') {
      if (!['&', '|', '!'].includes(term)) {
        throw new ToolRefusedError('odoo.search', `unknown domain operator "${term}"`)
      }
      continue
    }
    if (!Array.isArray(term) || term.length !== 3) {
      throw new ToolRefusedError('odoo.search', 'each domain term must be [field, operator, value]')
    }
    const [field, operator] = term
    if (typeof field !== 'string' || field.length === 0) {
      throw new ToolRefusedError('odoo.search', 'domain field must be a non-empty string')
    }
    if (typeof operator !== 'string') {
      throw new ToolRefusedError('odoo.search', 'domain operator must be a string')
    }
  }
  return domain
}

/** Odoo `false` means "unset" for every type; a many2one arrives as [id, label]. */
export function odooValueToString(value: unknown): string | undefined {
  if (value === false || value === null || value === undefined) return undefined
  if (Array.isArray(value)) {
    // many2one pair, or a list of ids.
    if (value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'string') return value[1]
    if (value.length === 0) return undefined
    return value.map((v) => odooValueToString(v) ?? '').filter(Boolean).join(', ') || undefined
  }
  if (typeof value === 'object') return undefined
  const text = String(value)
  return text.length > 0 ? text : undefined
}

function pick(record: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const value = odooValueToString(record[key])
    if (value) return value
  }
  return undefined
}

export function recordUrl(baseUrl: string | undefined, model: string, id: unknown): string | undefined {
  if (!baseUrl || typeof id !== 'number') return undefined
  return `${baseUrl}/web#id=${id}&model=${model}&view_type=form`
}

/** Turn raw Odoo records into normalised ToolRows. Pure — unit-tested directly. */
export function normalizeOdooRows(
  model: string,
  records: Array<Record<string, unknown>>,
  requestedFields: string[],
  baseUrl?: string
): ToolRow[] {
  const hint = MODEL_HINTS[model] ?? DEFAULT_HINT
  // Anything the plan asked for that isn't already carrying the row's identity.
  const consumed = new Set([...hint.title, ...hint.subtitle, ...hint.status, ...hint.owner, 'id', 'write_date', 'display_name'])

  return records.map((record) => {
    const fields: Record<string, string> = {}
    for (const key of requestedFields) {
      if (consumed.has(key)) continue
      const value = odooValueToString(record[key])
      if (value !== undefined) fields[key] = value
    }

    const writeDate = odooValueToString(record.write_date)
    return {
      kind: model,
      id: String(record.id ?? ''),
      title: pick(record, hint.title) ?? `${model} #${record.id ?? '?'}`,
      subtitle: pick(record, hint.subtitle),
      status: pick(record, hint.status),
      owner: pick(record, hint.owner),
      updatedAt: writeDate ? writeDate.replace(' ', 'T') + 'Z' : undefined,
      url: recordUrl(baseUrl, model, record.id),
      ...(Object.keys(fields).length > 0 ? { fields } : {}),
    }
  })
}

/** The model allowlist: outer bound ∩ grant. */
export function resolveAllowedModels(grantParams: OdooToolGrantParams | undefined): readonly OdooModel[] {
  const granted = grantParams?.models
  if (!granted || granted.length === 0) return ODOO_ALLOWED_MODELS
  return ODOO_ALLOWED_MODELS.filter((m) => granted.includes(m))
}

export const odooSearchTool: AutomationTool = {
  id: 'odoo.search',

  async execute(rawParams, ctx: ToolContext): Promise<ToolResult> {
    const params = rawParams as unknown as OdooSearchParams
    const grantParams = (ctx.grant?.params ?? {}) as OdooToolGrantParams

    const allowed = resolveAllowedModels(grantParams)
    if (!params.model || !allowed.includes(params.model)) {
      throw new ToolRefusedError(
        'odoo.search',
        `model "${params.model}" is not permitted by this automation's grant (allowed: ${allowed.join(', ') || 'none'})`
      )
    }

    const domain = validateDomain(params.domain)
    const maxLimit = Math.min(grantParams.maxLimit ?? ODOO_MAX_LIMIT, ODOO_MAX_LIMIT)
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, maxLimit)

    const requestedFields = Array.from(new Set([...(params.fields ?? []), ...BASE_FIELDS])).slice(0, 30)

    const records = await executeKw<Array<Record<string, unknown>>>(
      params.model,
      'search_read',
      [domain as never],
      {
        fields: requestedFields,
        limit,
        ...(params.order ? { order: params.order } : {}),
      },
      { signal: ctx.signal, timeoutMs: 20_000 }
    )

    const rows = normalizeOdooRows(
      params.model,
      Array.isArray(records) ? records : [],
      params.fields ?? [],
      readOdooConfig()?.url
    )

    return {
      rows,
      summary: `${rows.length} ${params.model} record${rows.length === 1 ? '' : 's'}`,
    }
  },
}
