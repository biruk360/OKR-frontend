/**
 * Work dependencies (DEP) — JSON contract shared by the API routes, the client
 * hooks and the profile tab. Plain JSON: dates are ISO strings.
 *
 * Two row shapes:
 *   - `detail: true`  — the viewer is a party, the creator, or may see a party's
 *     dependencies area (§8): parties, links, note and actions are included.
 *   - `detail: false` — company Dependency Map summary (DEP-6, §8 "titles +
 *     status" for every employee): no parties, links or note.
 */
import type { DependencyLinkEntityType, DependencyStatus, DependencyType } from '@/types/package'

export interface DependencyPerson {
  id: string
  name: string | null
  avatar: string | null
}

/** One WorkDependencyLink, resolved for the viewer (CON-8 redaction). */
export interface DependencyLinkedItem {
  entityType: DependencyLinkEntityType
  entityId: string
  /** True when the viewer may not see the linked item: no title / href. */
  redacted: boolean
  title: string | null
  ref: string | null
  href: string | null
}

/** Per-row verdicts (lib/package/access.ts → getDependencyAccess). */
export interface DependencyRowPermissions {
  /** Edit fields, parties and links. Creator, managers of a party, Exec / Admin. */
  canEdit: boolean
  /** Change status. Editors, plus providers (DEP: "mark own provided dependencies DONE"). */
  canChangeStatus: boolean
  /** DROPPED is an editor decision, not a provider one. */
  canDrop: boolean
  /** DEP-4: create the delivery Todo (editors and providers, when none exists and a provider is set). */
  canCreateDeliveryTask: boolean
}

export interface DependencyTimingFlags {
  /** DEP-2: open and neededByDate before today. */
  late: boolean
  /** DEP-2: open, not late, due within 7 days. */
  dueSoon: boolean
  /** status ∉ {DONE, DROPPED}. */
  open: boolean
}

interface DependencyBase extends DependencyTimingFlags {
  id: string
  /** Workbook id (DEP14, X03). DEP-7: an `X` prefix marks a package-specific link. */
  ref: string | null
  title: string
  depType: DependencyType
  status: DependencyStatus
  neededByDate: string | null
  timeframe: { id: string; name: string } | null
  href: string
}

export interface DependencySummaryRow extends DependencyBase {
  detail: false
}

export interface DependencyDetailRow extends DependencyBase {
  detail: true
  unblocksText: string | null
  note: string | null
  doneAt: string | null
  decisionId: string | null
  deliveryTodoId: string | null
  /** DEP-7: true when `ref` starts with X (package-specific link). */
  isPackageLink: boolean
  providers: DependencyPerson[]
  needers: DependencyPerson[]
  links: DependencyLinkedItem[]
  createdBy: DependencyPerson | null
  createdAt: string
  updatedAt: string
  permissions: DependencyRowPermissions
  /** Viewer's own role on this dependency. */
  viewerIsProvider: boolean
  viewerIsNeeder: boolean
}

export type DependencyRow = DependencySummaryRow | DependencyDetailRow

export interface DependencyListPermissions {
  /** Any employee may raise a dependency (module.package). */
  canCreate: boolean
  canExport: boolean
}

export interface DependencyListResponse {
  dependencies: DependencyRow[]
  total: number
  permissions: DependencyListPermissions
}

/** DEP-1 person view: Inbound (NEEDER, clear first) / Outbound (PROVIDER, others wait on you). */
export interface PersonDependenciesResponse {
  userId: string
  timeframeId: string | null
  inbound: DependencyRow[]
  outbound: DependencyRow[]
  counts: {
    inboundLate: number
    inboundOpen: number
    outboundLate: number
    outboundDueSoon: number
    outboundOpen: number
  }
  /**
   * True when the viewer may not see this person's dependencies area (§8) and
   * the lists only hold dependencies the viewer is a party to / created.
   */
  restricted: boolean
  permissions: {
    canCreate: boolean
    /** Viewer may raise a dependency with this person as a party (prefills the form). */
    canCreateForPerson: boolean
  }
}

/** `getDependenciesProfileSummary` (Overview package summary card, PRF-2). */
export interface DependenciesProfileSummary {
  inboundLate: number
  inboundOpen: number
  outboundDueSoon: number
  outboundOpen: number
  topInbound: Array<{
    id: string
    ref: string | null
    title: string
    status: DependencyStatus
    neededByDate: string | null
    late: boolean
    dueSoon: boolean
    href: string
  }>
}

export interface DependencyLinkInput {
  entityType: DependencyLinkEntityType
  entityId: string
}

/** Body of POST /api/dependencies and PATCH /api/dependencies/[id]. */
export interface DependencyWriteBody {
  timeframeId?: string
  title?: string
  externalRef?: string | null
  depType?: DependencyType
  neededByDate?: string | null
  unblocksText?: string | null
  note?: string | null
  decisionId?: string | null
  providerIds?: string[]
  neederIds?: string[]
  links?: DependencyLinkInput[]
  /** POST only: initial status (default OPEN). */
  status?: DependencyStatus
  /** POST only (DEP-4): also create the delivery Todo for the first provider. */
  createDeliveryTask?: boolean
}

export interface DependencyStatusBody {
  status: DependencyStatus
  note?: string | null
}

export interface DependencyStatusResult {
  dependency: DependencyDetailRow
  changed: boolean
  /** DEP-5: needers were notified (transition into DONE). */
  notifiedNeeders: boolean
}

export interface DeliveryTaskResult {
  dependency: DependencyDetailRow
  todo: { id: string; title: string; assigneeId: string | null; dueDate: string | null; href: string }
  created: boolean
}

/** List filters (GET /api/dependencies, GET /api/dependencies/export). */
export interface DependencyListFilters {
  timeframeId?: string
  status?: DependencyStatus[]
  type?: DependencyType[]
  providerId?: string
  neederId?: string
  /** Any party (provider or needer). */
  partyId?: string
  /** late | due_soon (≤7 days) | next_30 | no_date */
  due?: DependencyDueWindow
  linkedType?: DependencyLinkEntityType
  linkedId?: string
  /** DEP-4: the dependency whose delivery Todo this is (todo completion flow). */
  deliveryTodoId?: string
  /** Free-text match on title / ref. */
  q?: string
  /** DEP-7: company (no X prefix) | package (X prefix) */
  scope?: 'company' | 'package'
  /** Only dependencies the viewer is a party to. */
  mine?: boolean
}

export const DEPENDENCY_DUE_WINDOWS = ['late', 'due_soon', 'next_30', 'no_date'] as const
export type DependencyDueWindow = (typeof DEPENDENCY_DUE_WINDOWS)[number]
export const DEPENDENCY_DUE_WINDOW_LABELS: Record<DependencyDueWindow, string> = {
  late: 'Late',
  due_soon: 'Due within 7 days',
  next_30: 'Due within 30 days',
  no_date: 'No needed-by date',
}
