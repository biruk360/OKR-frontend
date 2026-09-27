/**
 * Write-side normalisation for OKR retrospectives (PUT /api/objectives/[id]/retrospective
 * and PUT /api/keyresults/[id]/retrospective).
 *
 * The four reflection fields come from the Tiptap editor as HTML and are later
 * rendered on the lineage banner and the period-close report. They used to be
 * stored verbatim, so a crafted PUT could plant script-bearing markup (stored
 * XSS). Every rich field is now rebuilt through the strict allowlist sanitizer
 * (the one the letters module uses — pure, no DOM needed server-side) and
 * capped; renderers additionally go through `RichTextContent` (DOMPurify), so
 * rows written before this change are neutralised too.
 *
 * Pure — unit-tested in retrospective-input.test.ts.
 */

import { sanitizeLetterBodyHtml } from '@/lib/letter-sanitize'
import { RECOMMENDED_ACTIONS } from './period-close'

/** Upper bound for one rich reflection field (raw input, before sanitising). */
export const RETRO_RICH_TEXT_MAX = 20_000
/** Upper bound for the plain-text grade rationale. */
export const RETRO_PLAIN_TEXT_MAX = 2_000

export const RETRO_RICH_FIELDS = ['whatWasAchieved', 'whatWentWell', 'whatBlockedUs', 'whatWeLearned'] as const
type RichField = (typeof RETRO_RICH_FIELDS)[number]

export interface RetrospectiveInput {
  whatWasAchieved: string
  whatWentWell: string | null
  whatBlockedUs: string | null
  whatWeLearned: string
  primaryBlocker: string | null
  wouldSetAgain: boolean | null
  wasAmbitious: boolean | null
  recommendedAction: string
  gradeRationale: string | null
}

export type ParseResult =
  | { ok: true; data: RetrospectiveInput }
  | { ok: false; error: string }

const LABELS: Record<RichField, string> = {
  whatWasAchieved: 'What was achieved',
  whatWentWell: 'What went well',
  whatBlockedUs: 'What blocked us',
  whatWeLearned: 'What we learned',
}

/** Sanitised HTML for a rich field; '' for anything that is not a string. */
export function sanitizeRetroRichText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return sanitizeLetterBodyHtml(value).trim()
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/**
 * Validates and normalises a retrospective draft body. Drafts may be partial
 * (the commit-time completeness check is `validateRetrospectiveForCommit`), so
 * missing fields become '' / null rather than errors; wrong types, unknown
 * enum values and oversize fields are errors.
 */
export function parseRetrospectiveInput(body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid retrospective payload' }
  }
  const raw = body as Record<string, unknown>

  const rich = {} as Record<RichField, string>
  for (const field of RETRO_RICH_FIELDS) {
    const value = raw[field]
    if (value != null && typeof value !== 'string') return { ok: false, error: `${LABELS[field]} must be text` }
    if (typeof value === 'string' && value.length > RETRO_RICH_TEXT_MAX) {
      return { ok: false, error: `${LABELS[field]} is too long (max ${RETRO_RICH_TEXT_MAX} characters)` }
    }
    rich[field] = sanitizeRetroRichText(value)
  }

  const recommendedAction = raw.recommendedAction ?? ''
  if (typeof recommendedAction !== 'string') return { ok: false, error: 'Choose a valid recommended action' }
  if (recommendedAction && !(RECOMMENDED_ACTIONS as readonly string[]).includes(recommendedAction)) {
    return { ok: false, error: 'Choose a valid recommended action' }
  }

  const primaryBlocker = raw.primaryBlocker
  if (primaryBlocker != null && primaryBlocker !== '' &&
      (typeof primaryBlocker !== 'string' || !/^[A-Z][A-Z_]{0,39}$/.test(primaryBlocker))) {
    return { ok: false, error: 'Invalid primary blocker' }
  }

  const gradeRationale = raw.gradeRationale
  if (gradeRationale != null && typeof gradeRationale !== 'string') {
    return { ok: false, error: 'Grade rationale must be text' }
  }
  const rationale = typeof gradeRationale === 'string' ? gradeRationale.trim() : ''
  if (rationale.length > RETRO_PLAIN_TEXT_MAX) {
    return { ok: false, error: `Grade rationale is too long (max ${RETRO_PLAIN_TEXT_MAX} characters)` }
  }

  return {
    ok: true,
    data: {
      whatWasAchieved: rich.whatWasAchieved,
      whatWentWell: rich.whatWentWell || null,
      whatBlockedUs: rich.whatBlockedUs || null,
      whatWeLearned: rich.whatWeLearned,
      primaryBlocker: typeof primaryBlocker === 'string' && primaryBlocker ? primaryBlocker : null,
      wouldSetAgain: optionalBoolean(raw.wouldSetAgain),
      wasAmbitious: optionalBoolean(raw.wasAmbitious),
      recommendedAction,
      gradeRationale: rationale || null,
    },
  }
}
