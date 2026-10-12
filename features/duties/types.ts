/**
 * Recurring duties — JSON contract of /api/package/duties (client-safe).
 * Value sets and labels (DutyCadence, DutyStatus, …) live in types/package.ts.
 */
import type { DutyCadence, DutyStatus } from '@/types/package'
import type { AdherenceWindow } from './services/adherence'

export interface DutyPerson {
  id: string
  name: string
  avatar: string | null
}

export interface DutyOkrRef {
  id: string
  title: string
  /** Private item the viewer may not read: the title is a placeholder. */
  isRedacted: boolean
}

export interface DutyKeyResultRef extends DutyOkrRef {
  objectiveId: string
}

export interface DutyDTO {
  id: string
  externalRef: string | null
  ownerId: string
  owner: DutyPerson | null
  timeframeId: string
  packageId: string | null
  title: string
  cadence: DutyCadence
  eventLabel: string | null
  timingText: string | null
  durationMin: number | null
  outputText: string | null
  keyResult: DutyKeyResultRef | null
  objective: DutyOkrRef | null
  autoTask: boolean
  /** The Todo recurrence head (null for EVENT cadence, autoTask=false or no future date). */
  todoHeadId: string | null
  status: DutyStatus
  /** "YYYY-MM-DD" (local) */
  startsOn: string | null
  endsOn: string | null
  retiredAt: string | null
  collaborators: DutyPerson[]
  /** "YYYY-MM-DD" — next date due on or after today, or null. */
  nextDue: string | null
  overdue: number
  adherence: { d30: AdherenceWindow; d90: AdherenceWindow }
  /** DUT-6: > 0 means the duty can only be retired. */
  completedCount: number
  /** Per-duty verdicts for the viewer. */
  canEdit: boolean
  canDelete: boolean
  canLog: boolean
  createdAt: string
  updatedAt: string
}

export interface DutyListPermissions {
  canView: boolean
  canCreate: boolean
  canEdit: boolean
  canLog: boolean
  /** True when the timeframe has ended (read-only for everyone but ADMIN/EXEC). */
  readOnly: boolean
}

export interface DutyListPayload {
  duties: DutyDTO[]
  permissions: DutyListPermissions
}

export interface DutyLogResult {
  todoId: string
  duty: DutyDTO
}

/** Overview "Package summary" card (build-plan profile composition contract). */
export interface DutiesProfileSummary {
  dueThisWeek: number
  doneThisWeek: number
  /** Whole percent over all the person's duties, or null when nothing was due. */
  adherence30d: number | null
  activeCount: number
}
