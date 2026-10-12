/**
 * Work dependencies — zod schemas for the API bodies and query strings.
 * Client-safe (no Prisma); the form modal reuses the limits.
 */
import { z } from 'zod'
import {
  DEPENDENCY_LINK_ENTITY_TYPES,
  DEPENDENCY_STATUSES,
  DEPENDENCY_TYPES,
} from '@/types/package'
import { DEPENDENCY_DUE_WINDOWS } from '../types'

export const DEPENDENCY_TITLE_MAX = 500
export const DEPENDENCY_REF_MAX = 40
export const DEPENDENCY_TEXT_MAX = 2000
export const DEPENDENCY_PARTIES_MAX = 25
export const DEPENDENCY_LINKS_MAX = 50

const id = z.string().trim().min(1).max(64)

/** ISO date (YYYY-MM-DD or full ISO) → Date at UTC midnight of that calendar day; '' / null → null. */
const dateInput = z
  .union([z.string(), z.null()])
  .transform((value, ctx) => {
    if (value === null) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    const day = /^\d{4}-\d{2}-\d{2}/.exec(trimmed)?.[0]
    const date = day ? new Date(`${day}T00:00:00.000Z`) : new Date(trimmed)
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Invalid date' })
      return z.NEVER
    }
    return date
  })

const optionalText = (max: number) =>
  z
    .union([z.string(), z.null()])
    .transform((value) => {
      if (value === null) return null
      const trimmed = value.trim()
      return trimmed ? trimmed : null
    })
    .pipe(z.string().max(max, `Must be at most ${max} characters`).nullable())

const userIds = z
  .array(id)
  .max(DEPENDENCY_PARTIES_MAX, `At most ${DEPENDENCY_PARTIES_MAX} people`)
  .transform((ids) => Array.from(new Set(ids)))

export const dependencyLinkSchema = z.object({
  entityType: z.enum(DEPENDENCY_LINK_ENTITY_TYPES),
  entityId: id,
})

const links = z
  .array(dependencyLinkSchema)
  .max(DEPENDENCY_LINKS_MAX, `At most ${DEPENDENCY_LINKS_MAX} linked items`)
  .transform((rows) => {
    const seen = new Set<string>()
    return rows.filter((row) => {
      const key = `${row.entityType}:${row.entityId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })

const fields = {
  title: z.string().trim().min(1, 'Title is required').max(DEPENDENCY_TITLE_MAX),
  externalRef: optionalText(DEPENDENCY_REF_MAX),
  depType: z.enum(DEPENDENCY_TYPES),
  neededByDate: dateInput,
  unblocksText: optionalText(DEPENDENCY_TEXT_MAX),
  note: optionalText(DEPENDENCY_TEXT_MAX),
  decisionId: z.union([id, z.null()]),
  providerIds: userIds,
  neederIds: userIds,
  links,
}

export const createDependencySchema = z
  .object({
    timeframeId: id.optional(),
    title: fields.title,
    externalRef: fields.externalRef.optional(),
    depType: fields.depType.default('OTHER'),
    neededByDate: fields.neededByDate.optional(),
    unblocksText: fields.unblocksText.optional(),
    note: fields.note.optional(),
    decisionId: fields.decisionId.optional(),
    providerIds: fields.providerIds.default([]),
    neederIds: fields.neederIds.default([]),
    links: fields.links.default([]),
    status: z.enum(DEPENDENCY_STATUSES).default('OPEN'),
    createDeliveryTask: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.providerIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['providerIds'], message: 'Add at least one provider (who delivers)' })
    }
    if (value.neederIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['neederIds'], message: 'Add at least one person who needs it' })
    }
    if (value.createDeliveryTask && !value.neededByDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['neededByDate'],
        message: 'A delivery task needs a needed-by date',
      })
    }
  })
export type CreateDependencyInput = z.output<typeof createDependencySchema>

export const updateDependencySchema = z
  .object({
    title: fields.title.optional(),
    externalRef: fields.externalRef.optional(),
    depType: fields.depType.optional(),
    neededByDate: fields.neededByDate.optional(),
    unblocksText: fields.unblocksText.optional(),
    note: fields.note.optional(),
    decisionId: fields.decisionId.optional(),
    providerIds: fields.providerIds.optional(),
    neederIds: fields.neederIds.optional(),
    links: fields.links.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Nothing to update' })
    }
    if (value.providerIds && value.providerIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['providerIds'], message: 'Keep at least one provider' })
    }
    if (value.neederIds && value.neederIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['neederIds'], message: 'Keep at least one person who needs it' })
    }
  })
export type UpdateDependencyInput = z.output<typeof updateDependencySchema>

export const dependencyStatusSchema = z.object({
  status: z.enum(DEPENDENCY_STATUSES),
  note: optionalText(DEPENDENCY_TEXT_MAX).optional(),
})
export type DependencyStatusInput = z.output<typeof dependencyStatusSchema>

/** Comma-separated or repeated query values → string[]. */
function listParam<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .union([z.string(), z.array(z.string())])
    .transform((raw) =>
      (Array.isArray(raw) ? raw : [raw])
        .flatMap((v) => v.split(','))
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)))
}

const boolParam = z
  .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
  .transform((v) => v === '1' || v === 'true')

export const listDependenciesQuerySchema = z.object({
  timeframeId: id.optional(),
  status: listParam(DEPENDENCY_STATUSES).optional(),
  type: listParam(DEPENDENCY_TYPES).optional(),
  providerId: id.optional(),
  neederId: id.optional(),
  partyId: id.optional(),
  due: z.enum(DEPENDENCY_DUE_WINDOWS).optional(),
  linkedType: z.enum(DEPENDENCY_LINK_ENTITY_TYPES).optional(),
  linkedId: id.optional(),
  deliveryTodoId: id.optional(),
  q: z.string().trim().max(200).optional(),
  scope: z.enum(['company', 'package']).optional(),
  mine: boolParam.optional(),
})
export type ListDependenciesQuery = z.output<typeof listDependenciesQuerySchema>

export const personDependenciesQuerySchema = z.object({
  timeframeId: id.optional(),
  includeClosed: boolParam.optional(),
})
export type PersonDependenciesQuery = z.output<typeof personDependenciesQuerySchema>

/** Reads the list query from URLSearchParams (repeated keys allowed for status / type). */
export function readListQuery(params: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of ['timeframeId', 'providerId', 'neederId', 'partyId', 'due', 'linkedType', 'linkedId', 'deliveryTodoId', 'q', 'scope', 'mine']) {
    const value = params.get(key)
    if (value) out[key] = value
  }
  for (const key of ['status', 'type']) {
    const values = params.getAll(key).filter(Boolean)
    if (values.length) out[key] = values
  }
  return out
}

/** First issue as a human sentence for the error envelope. */
export function firstDependencyIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid request'
  const path = issue.path.join('.')
  return path && issue.message === 'Required' ? `${path} is required` : issue.message
}
