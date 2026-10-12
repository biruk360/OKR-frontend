# Employee Operating Package — Build Plan (agent contract)

Spec: `docs/employee_operating_package_REQUIREMENTS.md` (requirement IDs referenced below).
Branch / worktree: `feat/employee-operating-package` at `/Users/birukhailu/Cursor/OKR_Mgt/.worktrees/operating-package`.

## Ground rules for every build agent

1. **Schema is frozen.** `prisma/schema.prisma` already contains every model and field (OkrLink, KeyResultCheckpoint,
   RecurringDuty(+Collaborator), RoleDefinition(+Item), Kpi, KpiReading, DevelopmentItem, WorkDependency(+Party, +Link),
   Decision(+Link), OperatingPackage, PackageItemReview; new fields on Objective/KeyResult/Todo/OrganizationSettings/
   MetricSourceMapping). The local DB is pushed and the client is generated. **Do not edit the schema, do not run
   `prisma db push` or `prisma generate`.** If you truly need a schema change, stop and report it in your output.
2. **Own only your files.** Each agent below lists the paths it owns. Creating new files inside your owned paths is fine.
   Editing a file owned by someone else, or a shared file not listed for you, is not allowed — report the needed change
   in your output (`followUps`) instead. Never edit: `package.json`, `types/index.ts`, `docs/*` (except your own
   section in this plan is not needed either), `prisma/*`.
3. **Typecheck with the lock.** Run `scripts/dev/tsc-locked.sh '<regex of your paths>'` (it serialises tsc across agents;
   ~1–3 min). Fix every error in your paths. Errors in other agents' in-progress paths are not yours. Run your unit tests
   with `npx tsx --test <files>`. Do **not** run `next build` or `npm run lint` on the whole repo.
4. **Conventions (CLAUDE.md applies in full):** routes thin; `withAuth`/`withFeature` from `lib/api/withAuth.ts`;
   envelope via `apiSuccess`/`apiError`/… from `lib/api/apiResponse.ts`; zod validation; `recordActivity()` on every
   mutation (`lib/activity-log.ts`); notifications only through `emit()`/`emitNow()` (`lib/notifications`);
   react-hook-form + zod for forms; `components/ui/*` primitives (Modal, ConfirmDialog, EmptyState, StatCard, …);
   design tokens only (no hex), `cn()`, Lucide icons; TanStack Query hooks in `features/<x>/hooks/`.
5. **Access:** every read/write of package data goes through `lib/package/access.ts` (built in Phase 1). OKR items also
   respect `lib/okr/visibility-scope.ts` (redaction).
6. **Server vs client:** page loaders and Prisma-touching services live in `features/<x>/services/*.server.ts` and are
   imported by direct path from `app/` only. Client components, hooks and pure helpers are exported from
   `features/<x>/index.ts`. Features never import other features — only `components/`, `hooks/`, `lib/`, `types/`.
7. **Shared types/labels** for the new entities live in `types/package.ts` (Phase 1). Import, don't redeclare.
8. **Return** a short structured report: files created/changed, requirement IDs done, tests run, anything left
   (`followUps`) — including doc lines for CHANGELOG_AI / FEATURE_STATUS / SITEMAP / COMPONENT_CATALOG.

## Profile composition contract (Phase 2 → Phase 3)

Each vertical exports, for the employee profile (`/dashboard/org/users/[id]`):
- **Client tab component** from its barrel: `<XxxProfileTab userId={string} timeframeId={string} />` — fetches through
  its own hooks/API, handles its own empty/loading/error states, shows actions only when the API says the viewer may act
  (every list API returns `permissions: { canCreate, canEdit, … }` alongside data).
- **Server summary** in `features/<x>/services/profile-summary.server.ts`:
  `export async function get<Xxx>ProfileSummary(viewerId: string, userId: string, timeframeId: string)` returning a
  small JSON-serialisable object (or `null` when the viewer may not see it), used by the Overview "Package summary" card.

| Vertical | Barrel tab component | Summary function |
|---|---|---|
| duties | `DutiesProfileTab` | `getDutiesProfileSummary` → `{ dueThisWeek, doneThisWeek, adherence30d, activeCount }` |
| role-definition | `RoleDefinitionProfileTab`, `RoleDefinitionSidebarCard` | `getRoleDefinitionProfileSummary` → `{ seatTitle, reportsTo, purpose, topAccountabilities[] , status }` |
| kpis | `KpisProfileTab` | `getKpisProfileSummary` → `{ green, amber, red, notScored, overdueReadings }` |
| development-plan | `DevelopmentProfileTab` | `getDevelopmentProfileSummary` → `{ itemsDone, itemsRequired, hoursLogged, hoursRequired, overdue }` |
| dependencies | `DependenciesProfileTab` | `getDependenciesProfileSummary` → `{ inboundLate, inboundOpen, outboundDueSoon, outboundOpen, topInbound[] }` |
| decisions | `DecisionsProfileTab` | `getDecisionsProfileSummary` → `{ openAffecting, awaitingMyDecision }` |
| operating-package | `PackageHeaderCard`, `PackageReviewControls` | `getPackageProfileSummary` → `{ status, version, reviewed, total, disputesOpen }` |

Connections (`components/shared/connections/`): `ConnectionChips` (`{ entityType, entityId, compact? }`) and
`ConnectionsPanel` (`{ entityType, entityId }`), both reading `GET /api/connections?type=&id=`.

## Agents and ownership

### Phase 1 — Foundations (parallel)
| Agent | Owns | Delivers |
|---|---|---|
| **F1 registries & access** | `lib/package/**`, `types/package.ts`, `lib/activity-log.ts` (append unions only), `lib/notifications/events.ts`, `lib/notifications/dispatcher.ts` (recipient cases), `lib/notifications/deep-link.ts`, `lib/email/templates/**` (new templates), `scripts/seed-package-permissions.ts`, `scripts/seed-permissions.ts` (feature keys block), `components/settings/permissions/FeaturesNavTab.tsx`, `lib/dashboard-navigation.ts` | `lib/package/access.ts` (§8 matrix; `loadPackageViewer`, `canViewPackageArea(viewer, subjectUserId, area)`, `canEditPackageArea`, `isManagerChainOf`, `listManagedUserIds`), tests; AUD-1/2 unions; all §9 events registered (category `PACKAGE`) with recipients/deep links/templates; doctypes + feature keys seeding; nav entries `Dependency Map` → `/dashboard/okrs-all/dependencies` and `Decisions` → `/dashboard/decisions`; `types/package.ts` string unions + label maps for every new enum |
| **F2 KR rules** | `lib/keyResultNumbers.ts`, `lib/objectiveProgress.ts`, `app/api/keyresults/route.ts`, `app/api/keyresults/[id]/route.ts`, `app/api/objectives/route.ts` (create guard only), `features/key-results/services/**` (validation only) | FND-2 lock guards, FND-3, KRX-1 (DECREASE), KRX-2 outcome suggestion helper, accept/return KRX fields on KR create/update; tests |
| **F3 recurrence** | `lib/todos/recurrence.ts`, `lib/todos/recurrence-generator.ts`, `lib/todos/*.test.ts` | FND-5 QUARTERLY + SEMIANNUAL (all switch arms, anchor logic, labels), FND-6 progressValue rule; tests |
| **F4 links & connections services** | `lib/okr-links/**`, `lib/connections/**`, `app/api/okr-links/**`, `app/api/connections/**` | LNK-1…4 service (create/delete with lineage mirroring, validation), `GET /api/connections` aggregator for CON-1/2 (alignment up/down incl. CONTRIBUTES_TO, SUCCEEDS both ways, dependencies in/out + late/blocked, decisions, KPI↔KR, duties, project milestones for KRs) with redaction (CON-8); tests |

### Phase 2 — Verticals (parallel)
| Agent | Owns | Delivers |
|---|---|---|
| **V1 connections UI** | `components/shared/connections/**`, `features/okr-links/**` | `ConnectionChips`, `ConnectionsPanel` (CON-1/2/8), `LinkManagerModal` (add/remove OkrLink, pick target via `/api/objectives/alignment-search` + KR search), `AlignmentTrail` (CON-5), `LineagePopover` (CON-6) |
| **V2 KR checkpoints** | `features/key-results/components/checkpoints/**`, `features/key-results/components/definition/**`, `app/api/keyresults/[id]/checkpoints/**` | KRX-3/4 components (`CheckpointStrip`, `CheckpointEditor`, `KrDefinitionSection`) + API; exported from `features/key-results/index.ts` (append exports only) |
| **V3 duties** | `features/duties/**`, `app/api/package/duties/**` | DUT-1…8 service (owns the Todo head lifecycle), API, `DutiesProfileTab`, summary |
| **V4 role definition** | `features/role-definition/**`, `app/api/package/role-definitions/**` | ROL-1…4, `RoleDefinitionProfileTab`, `RoleDefinitionSidebarCard`, `RoleDefinitionEditor` (used by admin later), summary |
| **V5 KPIs** | `features/kpis/**`, `app/api/package/kpis/**`, `lib/kpi/**` | KPI-1…7 (pure RAG/period lib with tests in `lib/kpi`), API incl. readings, `KpisProfileTab`, summary |
| **V6 development plan** | `features/development-plan/**`, `app/api/package/development/**` | DEV-1…6, `DevelopmentProfileTab`, summary |
| **V7 dependencies** | `features/dependencies/**`, `app/api/dependencies/**` | DEP-1…5, DEP-7 service + API (incl. person in/out, delivery task, status), `DependenciesProfileTab` (list view; graph comes in P3), summary |
| **V8 decisions** | `features/decisions/**`, `app/api/decisions/**` | DEC-1…4 service + API, `DecisionsProfileTab`, `AwaitingMyDecisionList`, summary |
| **V9 package & review** | `features/operating-package/**`, `app/api/package/packages/**` | PKG-1…5 service + API, `PackageHeaderCard`, `PackageReviewControls` (Agree/Dispute on any item: `{ packageId, entityType, entityId }`), summary |
| **V10 performance KPI source** | `lib/performance/metric-resolver.ts`, `app/api/performance/metric-mappings/**`, `features/performance/components/**` (mapping picker only) | KPI-9: `sourceType='KPI'` mappings + resolver (quarter average of readings) + picker option; tests |
| **V11 package cron** | `lib/package-cron/**`, `app/api/cron/package-daily/**`, `scripts/install-crontab.sh` (append one line) | KPI-3 auto-fill, KPI-5, DEP-2 due-soon/late, DEV-4, KR_CHECKPOINT_DUE emits (`emitNow`), idempotent per day; tests |
| **V12 explorer & filters** | `lib/okr/explorer-params.ts`, `app/dashboard/okrs-all/okrs-all-utils.ts`, `components/hierarchy/OkrHierarchyTable.tsx` (owner param only), `features/filters/segments.ts`, `features/filters/hooks/useFiltersData.ts`, `components/dashboard/MyOKRsPage.tsx` (link only) | Explorer `?owner=` (list + tree), Analyze multi-owner fix, KPI-8 repoint "Tagged as KPI" → KRs linked to a KPI, "My OKR profile" link |

### Phase 3 — Composition (parallel, after Phase 2)
| Agent | Owns | Delivers |
|---|---|---|
| **P1 profile shell** | `app/dashboard/org/users/[id]/**`, `features/admin-org/**`, `app/api/users/[id]/profile-tab/**`, `features/employee-profile/**` | PRF-1…5: LinkTabs, timeframe switcher, Overview package summary card (calls every `get*ProfileSummary`), sidebar role card, mounts each vertical's tab |
| **P2 OKR profile tab** | `features/employee-profile/components/okr-profile/**` (P1 mounts it), `app/api/users/[id]/okr-profile/**` | PRF-7…11: tree Objective→KR→milestones→tasks + duty rows, filters, past OKRs with successors, connection chips on every node |
| **P3 dependency map & decisions pages** | `app/dashboard/okrs-all/dependencies/**`, `app/dashboard/decisions/**`, `components/shared/dependency-graph/**` | DEP-6 page + CSV, CON-4 graph (React Flow; person-centred and company), Decisions page (DEC-1 list for decider, log) |
| **P4 OKR surfaces integration** | `components/objective-detail/**`, `app/dashboard/objectives/**`, `app/dashboard/key-results/**`, `components/key-result-detail/**` (if present), `features/filters/components/*DetailModal*.tsx`, `features/filters/components/quick-view-parts.tsx`, `components/shared/RolledFromBanner.tsx`, `components/shared/OkrBreadcrumb*`, `app/dashboard/okrs-all/OkrsAllRows.tsx` | Mount `ConnectionChips`/`ConnectionsPanel`, `CheckpointStrip`, `KrDefinitionSection`, `AlignmentTrail`, n:m `RolledFromBanner` (CON-6), KR detail project milestones (CON-3), company KR "Lands in" (CON-7), Explorer row chips |
| **P5 admin & settings** | `components/settings/UserDetail.tsx`, `app/dashboard/settings/users/[id]/**`, organization settings UI for `devMinItems/devMinHours` | PRF-6 (View profile link fix + Role definition section), DEV-3 settings |

### Phase 4 — Data scripts
| Agent | Owns | Delivers |
|---|---|---|
| **I1 close FY25/26** | `scripts/close-fy2526-okrs.ts` | Dry-run/apply close of the 50 carry-forward items exactly like the close routes (KRs before objectives, grade, outcome, retrospective, lock), report of other open OKRs in the old timeframe |
| **I2 importer** | `scripts/import-operating-packages.ts`, `scripts/lib/operating-package-import/**` | IMP-1…6 incl. review workbook and the SUCCEEDS links from the carry-forward sheet |

### Phase 5/6 — Review, fix, integrate
Reviewers (security/RBAC, correctness/data, UI/conventions, spec coverage) → fixers → integrator (full tsc, lint, all
`test:*` suites, `next build`, package.json test script, docs: CHANGELOG_AI, FEATURE_STATUS, SITEMAP,
COMPONENT_CATALOG, MASTER_REFERENCE, NOTIFICATIONS, CRON).
