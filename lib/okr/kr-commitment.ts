import { z } from 'zod'
import type { OkrOutcome } from './period-close'

/**
 * Key Result extensions (KRX, employee operating package §3.3): commitment type,
 * direction and the free-text definition fields, plus the close-flow outcome
 * suggestion (KRX-2). Pure — no Prisma — so routes, the importer and client code
 * can share it.
 */

export const KR_COMMITMENTS = ['COMMITTED', 'ASPIRATIONAL', 'MIXED'] as const
export type KrCommitment = (typeof KR_COMMITMENTS)[number]

export const KR_DIRECTIONS = ['INCREASE', 'DECREASE'] as const
export type KrDirectionValue = (typeof KR_DIRECTIONS)[number]

/** Grade (0..1) at which an ASPIRATIONAL KR counts as a success ("70% = success"). */
export const ASPIRATIONAL_SUCCESS_GRADE = 0.7
/** Grade at or above which a KR that did not hit its success line is suggested PARTIAL. */
export const PARTIAL_GRADE = 0.3

export function normalizeKrCommitment(raw: unknown): KrCommitment | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toUpperCase()
  return (KR_COMMITMENTS as readonly string[]).includes(v) ? (v as KrCommitment) : null
}

/** The grade at which this KR is considered achieved: 0.7 for ASPIRATIONAL, otherwise 1.0. */
export function successGrade(commitment: unknown): number {
  return normalizeKrCommitment(commitment) === 'ASPIRATIONAL' ? ASPIRATIONAL_SUCCESS_GRADE : 1
}

/**
 * KRX-2 close-flow outcome suggestion.
 *
 * `progress` is a grade/fraction 0..1 (KR.progress / 100). Non-finite values count as 0.
 *   - ASPIRATIONAL: ≥ 0.7 → ACHIEVED
 *   - COMMITTED / MIXED / unset: ≥ 1.0 → ACHIEVED
 *   - otherwise ≥ 0.3 → PARTIAL, else MISSED
 * Never suggests ABANDONED — that is always an explicit human choice.
 */
export function suggestCloseOutcome(
  progress: number,
  commitment: KrCommitment | string | null | undefined,
): Exclude<OkrOutcome, 'ABANDONED'> {
  const p = Number.isFinite(progress) ? progress : 0
  // Tolerate float noise such as 0.7000000000000001 vs 0.69999999.
  const eps = 1e-9
  if (p + eps >= successGrade(commitment)) return 'ACHIEVED'
  if (p + eps >= PARTIAL_GRADE) return 'PARTIAL'
  return 'MISSED'
}

/** Convenience for callers holding the stored 0..100 KR progress. */
export function suggestCloseOutcomeFromPercent(
  percent: number,
  commitment: KrCommitment | string | null | undefined,
): Exclude<OkrOutcome, 'ABANDONED'> {
  return suggestCloseOutcome((Number.isFinite(percent) ? percent : 0) / 100, commitment)
}

// ── Request validation for the KRX fields on KR create / update ──────────────

export const KR_EXTENSION_KEYS = [
  'commitment',
  'direction',
  'baselineText',
  'targetText',
  'measuredBy',
  'dueText',
  'dueDate',
  'externalRef',
] as const

const optionalText = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined
      if (v === null) return null
      const t = v.trim()
      return t === '' ? null : t
    })
    .pipe(z.union([z.string().max(max), z.null()]).optional())

/**
 * KRX fields accepted on POST /api/keyresults and PUT/PATCH /api/keyresults/[id].
 * `undefined` = not sent (leave unchanged); `null` / '' = clear. `direction` cannot be
 * cleared (the column is non-null with default INCREASE).
 */
export const krExtensionFieldsSchema = z.object({
  commitment: z
    .union([z.enum(KR_COMMITMENTS), z.null(), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? null : v)),
  direction: z.enum(KR_DIRECTIONS).optional(),
  baselineText: optionalText(2000),
  targetText: optionalText(2000),
  measuredBy: optionalText(1000),
  dueText: optionalText(500),
  dueDate: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined
      if (v === null || v.trim() === '') return null
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'dueDate must be a valid date' })
        return z.NEVER
      }
      return d
    }),
  externalRef: optionalText(64),
})

export type KrExtensionFields = z.output<typeof krExtensionFieldsSchema>

/**
 * Pick and validate the KRX fields from a raw JSON body. Unknown keys are ignored
 * (routes read the core fields themselves). Returns only the keys that were sent,
 * ready to spread into a Prisma `data` object.
 */
export function parseKrExtensionFields(
  body: unknown,
): { ok: true; data: Partial<NonNullable<KrExtensionFields>> } | { ok: false; message: string } {
  const src = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const picked: Record<string, unknown> = {}
  for (const key of KR_EXTENSION_KEYS) {
    if (key in src && src[key] !== undefined) {
      const v = src[key]
      // Accept lower-case enum values from forms.
      picked[key] = (key === 'commitment' || key === 'direction') && typeof v === 'string' ? v.trim().toUpperCase() : v
    }
  }
  const parsed = krExtensionFieldsSchema.safeParse(picked)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path?.[0]
    return { ok: false, message: field ? `Invalid ${String(field)}: ${issue.message}` : 'Invalid key result fields' }
  }
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) data[k] = v
  }
  return { ok: true, data: data as Partial<NonNullable<KrExtensionFields>> }
}

/** Prisma `select` fragment for returning the KRX fields from KR reads. */
export const KR_EXTENSION_SELECT = {
  commitment: true,
  direction: true,
  baselineText: true,
  targetText: true,
  measuredBy: true,
  dueText: true,
  dueDate: true,
  externalRef: true,
} as const
