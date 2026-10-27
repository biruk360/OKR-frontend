/**
 * Letter print & delete policy (pure — safe for tests and client imports).
 *
 * Security rule: a letter that can leave the system as an official printout
 * must never be deletable by its author.
 *   - Only a submitted letter (SUBMITTED onwards) prints clean. Every DRAFT
 *     render — preview, browser print, PDF — carries a DRAFT watermark.
 *   - Submitting locks the record: once a letter has ever been submitted, only
 *     a letter admin may delete it — even if it was later returned to DRAFT,
 *     because it may already have been printed clean while submitted.
 *   - A preparer may delete only their own never-submitted DRAFT, which has
 *     only ever been printable with the watermark.
 */

/**
 * Audit actions proving a letter left DRAFT at least once. A rejection is
 * included because it can only follow a submission.
 */
export const LETTER_EVER_SUBMITTED_ACTIONS = ['LETTER_SUBMITTED', 'LETTER_REJECTED'] as const

export function isLetterDraft(status: string | null | undefined): boolean {
  return status === 'DRAFT'
}

export interface LetterDeleteContext {
  isLetterAdmin: boolean
  isPreparer: boolean
  status: string
  /** True when the audit log shows the letter was submitted at least once. */
  everSubmitted: boolean
}

export function canDeleteLetter(ctx: LetterDeleteContext): boolean {
  if (ctx.isLetterAdmin) return true
  return ctx.isPreparer && isLetterDraft(ctx.status) && !ctx.everSubmitted
}

/** Download filename; drafts are suffixed so a watermarked copy is obvious on disk too. */
export function letterPdfFilename(letter: { id: string; referenceNumber: string | null; status: string }): string {
  const base = (letter.referenceNumber || letter.id).replace(/[^A-Za-z0-9._-]+/g, '_')
  return `${base}${isLetterDraft(letter.status) ? '_DRAFT' : ''}.pdf`
}
