/**
 * Feature barrel for the Project Management & Delivery Intelligence module.
 * Spec: docs/project_management_module_BUILD_SPEC.md
 * Tracker: docs/PROJECT_MANAGEMENT_MODULE_TRACKER.md
 *
 * Components/hooks are exported here as they are built (phase-gated per spec §6.1).
 * Business logic lives in `lib/projects/*`; shared types/enums live in `./types`.
 */

// Shared types & enums (single source of truth for module value sets).
export * from './types'

// Components (exported as phases land).
export { ProjectsListClient } from './components/ProjectsListClient'
export { ProjectDetailClient } from './components/ProjectDetailClient'
export { CreateProjectWizard } from './components/CreateProjectWizard'
export { ScheduleTree } from './components/ScheduleTree'
export { DelayLedgerTable } from './components/DelayLedgerTable'
export { RagBadge, ProjectStatusBadge, ActivityStatusBadge } from './components/ProjectBadges'

// Hooks.
export * from './hooks/useProjects'
export * from './hooks/useProject'
