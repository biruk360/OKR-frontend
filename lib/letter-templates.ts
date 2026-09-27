/**
 * Letter body templates — DB-backed (LetterTemplate) with the historical
 * LETTER_TEMPLATES constants as the seed and the last-resort fallback.
 *
 * Spec: docs/letter_management_requirements.md FR-4 (type drives the default
 * template), FR-15 / §12 (template management is a `letter:admin` screen).
 *
 * Every body is stored sanitized with the same allowlist sanitizer the letter
 * body uses (lib/letter-sanitize.ts), so a template can never smuggle markup
 * into a new letter that the letter body itself would not accept.
 */
import { prisma } from './prisma'
import { LETTER_TEMPLATES } from './letters'
import { sanitizeLetterBodyHtml } from './letter-sanitize'
import { LETTER_TYPE_CODE, type LetterType } from '@/types'

export const LETTER_TEMPLATE_LANGUAGES = ['en', 'am'] as const
export type LetterTemplateLanguage = (typeof LETTER_TEMPLATE_LANGUAGES)[number]

const BUILTIN_NAMES: Record<LetterType, string> = {
  COVER: 'Standard cover letter',
  OFFER: 'Standard offer letter',
  GUARANTEE: 'Standard guarantee letter',
}

/** The seed rows derived from the constants. Pure — exported for tests. */
export function builtinTemplateSeeds(): Array<{
  seedKey: string
  name: string
  letterType: string
  language: LetterTemplateLanguage
  bodyHtml: string
}> {
  return (Object.keys(LETTER_TEMPLATES) as LetterType[]).map((type) => {
    const code = LETTER_TYPE_CODE[type]
    return {
      seedKey: `builtin:${code}:en`,
      name: BUILTIN_NAMES[type],
      letterType: code,
      language: 'en' as const,
      bodyHtml: sanitizeLetterBodyHtml(LETTER_TEMPLATES[type]),
    }
  })
}

/**
 * Seed the constants as rows when the table is empty. Idempotent: the
 * `seedKey` unique + `skipDuplicates` make concurrent first reads safe, and a
 * non-empty table (including one where an admin archived the seeds) is never
 * touched again.
 */
export async function ensureLetterTemplatesSeeded(): Promise<void> {
  const count = await prisma.letterTemplate.count()
  if (count > 0) return
  await prisma.letterTemplate.createMany({ data: builtinTemplateSeeds(), skipDuplicates: true })
}

// ---------------------------------------------------------------------------
// Input validation (pure)
// ---------------------------------------------------------------------------

export interface LetterTemplateInput {
  name: string
  letterType: string
  language: LetterTemplateLanguage
  bodyHtml: string
  isActive?: boolean
}

export const MAX_TEMPLATE_BODY_CHARS = 200_000

type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string }

function parseName(v: unknown): ParseResult<string> {
  const name = typeof v === 'string' ? v.trim() : ''
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Name must be 2–120 characters' }
  return { ok: true, data: name }
}

function parseType(v: unknown): ParseResult<string> {
  const code = typeof v === 'string' ? v.trim().toUpperCase() : ''
  if (!/^[A-Z0-9]{2,4}$/.test(code)) return { ok: false, error: 'Letter type code must be 2–4 letters or digits' }
  return { ok: true, data: code }
}

function parseLanguage(v: unknown): ParseResult<LetterTemplateLanguage> {
  const lang = v === undefined || v === null || v === '' ? 'en' : v
  if (!LETTER_TEMPLATE_LANGUAGES.includes(lang as LetterTemplateLanguage)) {
    return { ok: false, error: 'Language must be en or am' }
  }
  return { ok: true, data: lang as LetterTemplateLanguage }
}

function parseBody(v: unknown): ParseResult<string> {
  if (typeof v !== 'string') return { ok: false, error: 'Template body is required' }
  if (v.length > MAX_TEMPLATE_BODY_CHARS) return { ok: false, error: 'Template body is too long' }
  const clean = sanitizeLetterBodyHtml(v)
  if (!clean.replace(/<[^>]*>/g, '').trim()) return { ok: false, error: 'Template body is required' }
  return { ok: true, data: clean }
}

/** Full create payload. The body comes back sanitized. */
export function parseLetterTemplateCreate(raw: unknown): ParseResult<LetterTemplateInput> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = parseName(b.name)
  if (!name.ok) return name
  const type = parseType(b.letterType)
  if (!type.ok) return type
  const language = parseLanguage(b.language)
  if (!language.ok) return language
  const body = parseBody(b.bodyHtml)
  if (!body.ok) return body
  return { ok: true, data: { name: name.data, letterType: type.data, language: language.data, bodyHtml: body.data } }
}

/** Partial update payload — only keys present are validated and returned. */
export function parseLetterTemplateUpdate(raw: unknown): ParseResult<Partial<LetterTemplateInput>> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: Partial<LetterTemplateInput> = {}
  if ('name' in b) {
    const r = parseName(b.name); if (!r.ok) return r; out.name = r.data
  }
  if ('letterType' in b) {
    const r = parseType(b.letterType); if (!r.ok) return r; out.letterType = r.data
  }
  if ('language' in b) {
    const r = parseLanguage(b.language); if (!r.ok) return r; out.language = r.data
  }
  if ('bodyHtml' in b) {
    const r = parseBody(b.bodyHtml); if (!r.ok) return r; out.bodyHtml = r.data
  }
  if ('isActive' in b) {
    if (typeof b.isActive !== 'boolean') return { ok: false, error: 'isActive must be a boolean' }
    out.isActive = b.isActive
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'Nothing to update' }
  return { ok: true, data: out }
}

// ---------------------------------------------------------------------------
// Resolving the body for a new letter
// ---------------------------------------------------------------------------

const CODE_TO_LEGACY: Record<string, LetterType> = Object.fromEntries(
  (Object.entries(LETTER_TYPE_CODE) as Array<[LetterType, string]>).map(([t, c]) => [c, t]),
)

/** Constant fallback for a type code, or null for custom types. Pure. */
export function constantTemplateFor(typeCode: string): string | null {
  const legacy = CODE_TO_LEGACY[typeCode.toUpperCase()]
  return legacy ? LETTER_TEMPLATES[legacy] : null
}

/**
 * The body a new letter starts with:
 *   1. the explicitly chosen active template (must match the letter's type),
 *   2. else the newest active template for the type (English first),
 *   3. else the built-in constant for the type,
 *   4. else `null` (caller writes its generic placeholder).
 * A DB failure (e.g. table not yet pushed) falls through to the constants.
 */
export async function resolveTemplateBodyForNewLetter(args: {
  typeCode: string
  templateId?: string | null
}): Promise<{ body: string | null; templateId: string | null; error?: string }> {
  const typeCode = args.typeCode.toUpperCase()
  try {
    await ensureLetterTemplatesSeeded()
    if (args.templateId) {
      const chosen = await prisma.letterTemplate.findFirst({
        where: { id: args.templateId, isActive: true },
        select: { id: true, letterType: true, bodyHtml: true },
      })
      if (!chosen) return { body: null, templateId: null, error: 'Template not found or archived' }
      if (chosen.letterType !== typeCode) {
        return { body: null, templateId: null, error: 'Template does not match the letter type' }
      }
      return { body: chosen.bodyHtml, templateId: chosen.id }
    }
    const candidates = await prisma.letterTemplate.findMany({
      where: { letterType: typeCode, isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, language: true, bodyHtml: true },
    })
    const pick = candidates.find((c) => c.language === 'en') ?? candidates[0]
    if (pick) return { body: pick.bodyHtml, templateId: pick.id }
  } catch (err) {
    if (args.templateId) throw err
    console.error('[letter-templates] DB lookup failed; using constants', err)
  }
  return { body: constantTemplateFor(typeCode), templateId: null }
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export interface LetterTemplateRow {
  id: string
  name: string
  letterType: string
  language: string
  bodyHtml: string
  isActive: boolean
  isBuiltIn: boolean
  createdAt: Date
  updatedAt: Date
  createdBy: { id: string; name: string } | null
  updatedBy: { id: string; name: string } | null
}

/** Templates with author names attached (no FK — ids are resolved here). */
export async function listLetterTemplates(opts: {
  letterType?: string | null
  includeArchived?: boolean
}): Promise<LetterTemplateRow[]> {
  await ensureLetterTemplatesSeeded()
  const rows = await prisma.letterTemplate.findMany({
    where: {
      ...(opts.letterType ? { letterType: opts.letterType.toUpperCase() } : {}),
      ...(opts.includeArchived ? {} : { isActive: true }),
    },
    orderBy: [{ letterType: 'asc' }, { isActive: 'desc' }, { name: 'asc' }],
  })
  const ids = Array.from(
    new Set(rows.flatMap((r) => [r.createdById, r.updatedById]).filter((v): v is string => !!v)),
  )
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : []
  const byId = new Map(users.map((u) => [u.id, u]))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    letterType: r.letterType,
    language: r.language,
    bodyHtml: r.bodyHtml,
    isActive: r.isActive,
    isBuiltIn: !!r.seedKey,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: (r.createdById && byId.get(r.createdById)) || null,
    updatedBy: (r.updatedById && byId.get(r.updatedById)) || null,
  }))
}
