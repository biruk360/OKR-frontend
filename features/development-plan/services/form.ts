/**
 * Development plan — client form schemas and form ↔ API body mapping.
 * Pure and client-safe; the API re-validates with ./schemas.
 */
import { z } from 'zod'
import { DEVELOPMENT_KINDS, type DevelopmentKind } from '@/types/package'
import type { DevelopmentItemDTO } from '../types'
import type { DevelopmentItemWriteBody } from './api'
import {
  DROP_REASON_MAX,
  DROP_REASON_MIN,
  EVIDENCE_NOTE_MAX,
  EVIDENCE_URL_MAX,
  MAX_HOURS_PER_ENTRY,
  isHttpUrl,
  kindRequiresEvidence,
} from './rules'
import { DEV_EXTERNAL_REF_MAX, DEV_HOURS_NOTE_MAX, DEV_MAX_TOTAL_HOURS, DEV_TARGET_TEXT_MAX, DEV_TITLE_MAX } from './schemas'

/** '' or a number within [min, max]. */
const numberText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), `${label} must be 0 or more`)
    .refine((v) => v === '' || Number(v) <= max, `${label} must be ${max} or less`)

const urlText = z
  .string()
  .trim()
  .max(EVIDENCE_URL_MAX, `Link must be ${EVIDENCE_URL_MAX} characters or fewer`)
  .refine((v) => v === '' || isHttpUrl(v), 'Link must start with http:// or https://')

export const developmentItemFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(DEV_TITLE_MAX),
  kind: z.enum(DEVELOPMENT_KINDS),
  targetText: z.string().trim().min(1, 'Target is required, e.g. “Certified” or “40 hours”').max(DEV_TARGET_TEXT_MAX),
  targetHours: numberText('Target hours', DEV_MAX_TOTAL_HOURS),
  hoursLogged: numberText('Hours logged', DEV_MAX_TOTAL_HOURS),
  dueDate: z.string(),
  keyResultId: z.string(),
  isMandatory: z.boolean(),
  evidenceNote: z.string().trim().max(EVIDENCE_NOTE_MAX),
  evidenceUrl: urlText,
  externalRef: z.string().trim().max(DEV_EXTERNAL_REF_MAX),
})
export type DevelopmentItemFormValues = z.infer<typeof developmentItemFormSchema>

/** Suggested target text per kind (prefilled when the field is still empty). */
export const DEVELOPMENT_TARGET_HINTS: Record<DevelopmentKind, string> = {
  CERTIFICATION: 'Certified',
  COURSE: 'Completed',
  TRAINING_HOURS: '40 hours',
  MENTORING: 'Monthly sessions held',
  OTHER: 'Done',
}

export function toDevelopmentFormValues(item: DevelopmentItemDTO | null | undefined): DevelopmentItemFormValues {
  return {
    title: item?.title ?? '',
    kind: item?.kind ?? 'CERTIFICATION',
    targetText: item?.targetText ?? '',
    targetHours: item?.targetHours != null ? String(item.targetHours) : '',
    hoursLogged: item ? String(item.hoursLogged) : '',
    dueDate: item?.dueDate ? item.dueDate.slice(0, 10) : '',
    keyResultId: item?.keyResultId ?? '',
    isMandatory: item?.isMandatory ?? false,
    evidenceNote: item?.evidence.note ?? '',
    evidenceUrl: item?.evidence.url ?? '',
    externalRef: item?.externalRef ?? '',
  }
}

function numberOrNull(value: string): number | null {
  const v = value.trim()
  return v === '' ? null : Number(v)
}

/** Form → POST / PATCH body. On edit only changed fields are sent, so evidence is untouched unless edited. */
export function toDevelopmentWriteBody(
  values: DevelopmentItemFormValues,
  original?: DevelopmentItemDTO | null,
): DevelopmentItemWriteBody {
  const body: DevelopmentItemWriteBody = {
    title: values.title.trim(),
    kind: values.kind,
    targetText: values.targetText.trim(),
    targetHours: numberOrNull(values.targetHours),
    dueDate: values.dueDate || null,
    keyResultId: values.keyResultId || null,
    isMandatory: values.isMandatory,
    externalRef: values.externalRef.trim() || null,
  }
  const hours = numberOrNull(values.hoursLogged)
  const note = values.evidenceNote.trim() || null
  const url = values.evidenceUrl.trim() || null
  if (!original) {
    body.hoursLogged = hours ?? 0
    body.evidenceNote = note
    body.evidenceUrl = url
    return body
  }
  if (hours !== null && hours !== original.hoursLogged) body.hoursLogged = hours
  if (note !== (original.evidence.note ?? null)) body.evidenceNote = note
  if (url !== (original.evidence.url ?? null)) body.evidenceUrl = url
  return body
}

// ---------------------------------------------------------------------------
// Status dialogs
// ---------------------------------------------------------------------------

/** Mark done (DEV-2). `requiresEvidence` is checked by the dialog's resolver. */
export const markDoneFormSchema = z.object({
  evidenceNote: z.string().trim().max(EVIDENCE_NOTE_MAX),
  evidenceUrl: urlText,
  completedAt: z.string(),
})
export type MarkDoneFormValues = z.infer<typeof markDoneFormSchema>

/** Error message when a CERTIFICATION / COURSE would be marked done without evidence, else null. */
export function markDoneEvidenceError(kind: string, values: Pick<MarkDoneFormValues, 'evidenceNote' | 'evidenceUrl'>): string | null {
  if (!kindRequiresEvidence(kind)) return null
  if (values.evidenceNote.trim() || values.evidenceUrl.trim()) return null
  return 'Certifications and courses need an evidence note or link before they are marked done'
}

/** Drop (DEV-5). */
export const dropFormSchema = z.object({
  dropReason: z
    .string()
    .trim()
    .min(DROP_REASON_MIN, `Give a reason of at least ${DROP_REASON_MIN} characters`)
    .max(DROP_REASON_MAX, `Reason must be ${DROP_REASON_MAX} characters or fewer`),
})
export type DropFormValues = z.infer<typeof dropFormSchema>

/** Log hours. */
export const logHoursFormSchema = z.object({
  hours: z
    .string()
    .trim()
    .refine((v) => v !== '' && Number.isFinite(Number(v)) && Number(v) > 0, 'Enter the hours spent (more than 0)')
    .refine((v) => Number(v) <= MAX_HOURS_PER_ENTRY, `At most ${MAX_HOURS_PER_ENTRY} hours per entry`),
  date: z.string(),
  note: z.string().trim().max(DEV_HOURS_NOTE_MAX, `Note must be ${DEV_HOURS_NOTE_MAX} characters or fewer`),
})
export type LogHoursFormValues = z.infer<typeof logHoursFormSchema>

/** Flat zod → react-hook-form errors (first issue per top-level field). */
export function flatZodErrors(error: z.ZodError): Record<string, { type: string; message: string }> {
  const errors: Record<string, { type: string; message: string }> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'root')
    if (!errors[key]) errors[key] = { type: issue.code, message: issue.message }
  }
  return errors
}
