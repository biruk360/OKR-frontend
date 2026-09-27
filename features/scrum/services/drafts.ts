/**
 * Server-side scrum drafts.
 *
 * A draft is a `ScrumUpdate` row with `status = 'DRAFT'`. It holds the user's
 * unsent form content only: saving one never syncs To-dos, writes OKR links,
 * raises notifications or counts as attendance. Submitting it (POST/PATCH
 * without `asDraft`) runs those side-effects exactly once, as a first submit.
 *
 * Every read that counts attendance, submissions, metrics, wins, analytics or
 * the calendar MUST exclude drafts — spread `SUBMITTED_SCRUM_UPDATE_WHERE`
 * (or wrap the where with `excludeScrumDrafts`). `drafts.test.ts` enforces it.
 */

export const SCRUM_DRAFT_STATUS = 'DRAFT' as const

/** Statuses a real (non-draft) update can carry. */
export const SUBMITTED_SCRUM_STATUSES = ['SUBMITTED', 'LATE', 'CONFIRMED', 'AMENDED'] as const

/** Prisma where-fragment that keeps drafts out of a `scrumUpdate` read. */
export const SUBMITTED_SCRUM_UPDATE_WHERE = { status: { not: SCRUM_DRAFT_STATUS } } as const

export function excludeScrumDrafts<T extends Record<string, unknown>>(where: T): T & typeof SUBMITTED_SCRUM_UPDATE_WHERE {
  return { ...where, ...SUBMITTED_SCRUM_UPDATE_WHERE }
}

export function isScrumDraft(status: string | null | undefined): boolean {
  return status === SCRUM_DRAFT_STATUS
}

export type ScrumDraftSaveDecision =
  | { ok: true }
  | { ok: false; reason: 'proxy' | 'already_submitted'; message: string }

/**
 * May a draft be written? Drafts are personal working state: only the owner
 * saves one, and never over an update that has already been submitted.
 */
export function decideScrumDraftSave(input: { isProxy: boolean; existingStatus: string | null | undefined }): ScrumDraftSaveDecision {
  if (input.isProxy) {
    return { ok: false, reason: 'proxy', message: 'Drafts can only be saved for your own update' }
  }
  if (input.existingStatus && !isScrumDraft(input.existingStatus)) {
    return { ok: false, reason: 'already_submitted', message: 'This update was already submitted — edit and resubmit it instead of saving a draft' }
  }
  return { ok: true }
}

/**
 * How a submit treats the row already stored for that user/day. A draft never
 * synced To-dos or links, so submitting it is a first submit: no previous
 * content to diff against, no amend stamp, audit action CREATED.
 */
export function scrumSubmitBaseline(existingStatus: string | null | undefined) {
  const fromDraft = isScrumDraft(existingStatus)
  return {
    fromDraft,
    /** True when the stored row is a real submission being amended. */
    isAmend: !!existingStatus && !fromDraft,
  }
}
