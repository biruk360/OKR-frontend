/**
 * Development plan (DEV-1…6) — client-safe JSON contracts.
 *
 * Value sets and labels (kinds, statuses, evidence kinds) live in
 * `types/package.ts`; these are the shapes the API returns and the profile
 * components render. Development items are never `DevelopmentAction`s (DEV-6).
 */
import type { DevelopmentKind, DevelopmentStatus } from '@/types/package'

/** Evidence stored on the item (DEV-1). The link lives inside `evidenceNote` — see services/rules.ts. */
export interface DevelopmentEvidence {
  note: string | null
  url: string | null
}

/** Linked key result, redacted when the viewer may not see it in full (CON-8). */
export interface DevelopmentLinkedKeyResult {
  id: string
  /** `[Private Key Result]` when redacted. */
  title: string
  objectiveId: string | null
  progress: number | null
  isRedacted: boolean
  /** null when redacted. */
  href: string | null
}

export interface DevelopmentItemDTO {
  id: string
  externalRef: string | null
  ownerId: string
  timeframeId: string
  packageId: string | null
  title: string
  kind: DevelopmentKind
  targetText: string
  targetHours: number | null
  hoursLogged: number
  /** ISO, or null. */
  dueDate: string | null
  keyResultId: string | null
  keyResult: DevelopmentLinkedKeyResult | null
  status: DevelopmentStatus
  completedAt: string | null
  evidence: DevelopmentEvidence
  /** Raw stored note (note + link line). */
  evidenceNote: string | null
  dropReason: string | null
  isMandatory: boolean
  /** DEV-4: not DONE / DROPPED and past the due date. */
  overdue: boolean
  /** Due within the next 14 days and still open (NTF DEV_ITEM_DUE window). */
  dueSoon: boolean
  /** CERTIFICATION / COURSE: DONE needs evidence (DEV-2). */
  requiresEvidence: boolean
  createdAt: string
  updatedAt: string
}

/** DEV-3 yearly rule: ≥ itemsRequired certifications/courses done and ≥ hoursRequired training hours. */
export interface DevelopmentRuleProgress {
  itemsDone: number
  itemsRequired: number
  hoursLogged: number
  hoursRequired: number
  itemsMet: boolean
  hoursMet: boolean
  /** 0..100 for the two bars. */
  itemsPercent: number
  hoursPercent: number
}

export interface DevelopmentPermissions {
  canCreate: boolean
  canEdit: boolean
  canChangeStatus: boolean
  canLogHours: boolean
}

export interface DevelopmentListResponse {
  userId: string
  timeframeId: string
  timeframeName: string | null
  /** PRF-3: the timeframe has ended — read-only unless ADMIN / EXECUTIVE. */
  readOnly: boolean
  /** The subject's package for the timeframe, if any (PKG-5: items do not need one). */
  packageId: string | null
  packageStatus: string | null
  rule: DevelopmentRuleProgress
  counts: {
    total: number
    open: number
    done: number
    dropped: number
    overdue: number
  }
  items: DevelopmentItemDTO[]
  permissions: DevelopmentPermissions
}

/** Profile composition contract (PRF-2): Overview "Package summary" card. */
export interface DevelopmentProfileSummary {
  itemsDone: number
  itemsRequired: number
  hoursLogged: number
  hoursRequired: number
  overdue: number
  /** Extras for the card. */
  total: number
  open: number
  rulesMet: boolean
}

export interface AddDevelopmentHoursResult {
  item: DevelopmentItemDTO
  hoursAdded: number
}
