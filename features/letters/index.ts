/**
 * Feature barrel for Letter Management.
 * Spec: docs/letter_management_requirements.md
 */

export { default as LettersPageClient } from './components/LettersPageClient'
export { default as LetterFormClient } from './components/LetterFormClient'
export { default as LettersTable } from './components/LettersTable'
export { default as CreateLetterModal } from './components/CreateLetterModal'
export { default as LetterStatusBadge } from './components/LetterStatusBadge'
export { default as LetterStatusBar } from './components/LetterStatusBar'
export { default as CustomerLookup } from './components/CustomerLookup'
export { default as LetterTypeSelect } from './components/LetterTypeSelect'
export { default as SuperDocEditorClient } from './components/SuperDocEditorClient'
export { default as EnclosuresPanel } from './components/EnclosuresPanel'
export { default as PdfPreviewPanel } from './components/PdfPreviewPanel'
export { default as MarkAsSentModal } from './components/MarkAsSentModal'
export { default as RejectLetterModal } from './components/RejectLetterModal'

export type { LetterDetail, LetterListItem, LetterEnclosureWithUploader, OdooContact } from './types'
