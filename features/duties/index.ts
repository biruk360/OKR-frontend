/**
 * Feature barrel — recurring duties (DUT-1…8, PRF-13).
 *
 * Client components, hooks and pure helpers only. Server code
 * (services/duties.server.ts, services/profile-summary.server.ts,
 * services/http.server.ts) is imported by direct path from app/.
 */
export * from './types'
export * from './services/schedule'
export * from './services/adherence'
export * from './services/schemas'
export { dutiesApi } from './services/api'
export type { DutyWriteBody, DutyApiError } from './services/api'
export * from './hooks/queries'
export { DutiesProfileTab } from './components/DutiesProfileTab'
export type { DutiesProfileTabProps } from './components/DutiesProfileTab'
export { DutyCard, adherenceTone } from './components/DutyCard'
export type { DutyCardProps, DutyCardAction } from './components/DutyCard'
export { DutyFormModal } from './components/DutyFormModal'
export type { DutyFormModalProps } from './components/DutyFormModal'
export { LogOccurrenceModal } from './components/LogOccurrenceModal'
export type { LogOccurrenceModalProps } from './components/LogOccurrenceModal'
