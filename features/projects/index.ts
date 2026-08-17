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
export { ProjectWorkspaceClient } from './components/ProjectWorkspaceClient'
export { CreateProjectWizard } from './components/CreateProjectWizard'
export { NewProjectEntry } from './components/creation/NewProjectEntry'
export { CreationDraftShell } from './components/creation/CreationDraftShell'
export { ImportTemplateDownloads } from './components/creation/ImportTemplateDownloads'
export { ImportUploadStep } from './components/creation/ImportUploadStep'
export { ColumnMappingStep } from './components/creation/ColumnMappingStep'
export { ValidationReportPanel } from './components/creation/ValidationReportPanel'
export { DraftReviewWorkspace } from './components/creation/DraftReviewWorkspace'
export { ChangeListPanel } from './components/creation/ChangeListPanel'
export { CommitConfirmDialog } from './components/creation/CommitConfirmDialog'
export { ScheduleTree } from './components/ScheduleTree'
export { DelayLedgerTable } from './components/DelayLedgerTable'
export { GanttChart } from './components/gantt/GanttChart'
export { ProjectViewSwitcher } from './components/views/ProjectViewSwitcher'
export { ActivityDetailPanel } from './components/activity/ActivityDetailPanel'
export { RaidRegister } from './components/registers/RaidRegister'
export { ChangeControlBoard } from './components/registers/ChangeControlBoard'
export { StageGateRegister } from './components/registers/StageGateRegister'
export { ClientObligationsRegister } from './components/registers/ClientObligationsRegister'
export { CorrectionOfErrorsRegister } from './components/registers/CorrectionOfErrorsRegister'
export { PaymentMilestonesRegister } from './components/registers/PaymentMilestonesRegister'
export { JiraIntegrationPanel } from './components/integrations/JiraIntegrationPanel'
export { ScrumLogWidget } from './components/ScrumLogWidget'
export { ChartWrapper } from './components/charts/ChartWrapper'
export { ProjectChartsLibrary } from './components/charts/ProjectChartsLibrary'
export { PortfolioChartsLibrary } from './components/charts/PortfolioChartsLibrary'
export { ClientReportsPanel } from './components/reports/ClientReportsPanel'
export { PortfolioWbrPanel } from './components/reports/PortfolioWbrPanel'
export { PerformanceReportsPanel } from './components/reports/PerformanceReportsPanel'
export { ManagementReportsPanel } from './components/reports/ManagementReportsPanel'
export { AiAssistantPanel } from './components/ai/AiAssistantPanel'
export { ProjectObjectiveLinker } from './components/okr/ProjectObjectiveLinker'
export { MilestoneKeyResultLinker } from './components/okr/MilestoneKeyResultLinker'
export { ObjectiveDeliveryPanel } from './components/okr/ObjectiveDeliveryPanel'
export { PortfolioDashboard } from './components/portfolio/PortfolioDashboard'
export { PortfolioFilters } from './components/portfolio/PortfolioFilters'
export { PortfolioReportPanel } from './components/portfolio/PortfolioReportPanel'
export { RagBadge, ProjectStatusBadge, ActivityStatusBadge } from './components/ProjectBadges'
export { TemplateListClient } from './components/TemplateListClient'
export { TemplateBuilderClient } from './components/TemplateBuilderClient'

// Hooks.
export * from './hooks/useProjects'
export * from './hooks/useProject'
export * from './hooks/useObjectives'
export * from './hooks/usePortfolioDashboard'
