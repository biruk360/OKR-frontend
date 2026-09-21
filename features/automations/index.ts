/** Barrel export for the AI Automations feature module. */

export { AutomationList } from './components/AutomationList'
export { AutomationDetail } from './components/AutomationDetail'
export { AutomationEditPage } from './components/AutomationEditPage'
export { AutomationForm } from './components/AutomationForm'
export { AutomationSettingsForm } from './components/AutomationSettingsForm'
export { BriefingList } from './components/BriefingList'
export { BriefingView } from './components/BriefingView'
export { PlanDiffView } from './components/PlanDiffView'
export { PromoteFindingModal } from './components/PromoteFindingModal'
export { RunTranscript } from './components/RunTranscript'
export { TestRunPanel } from './components/TestRunPanel'
export { ModeBadge, StatusBadge, RunStatusBadge } from './components/AutomationStatusBadges'
export {
  useAutomation,
  useAutomations,
  useAutomationRuns,
  useAutomationTools,
  useApproveBriefing,
  useBriefing,
  useBriefings,
  useCompileInstruction,
  useCreateAutomation,
  useDeleteAutomation,
  usePromoteFinding,
  useRunAutomationNow,
  useRunDetail,
  useSetMode,
  useSetStatus,
  useUpdateAutomation,
  useUpdateAutomationSettings,
} from './hooks/useAutomations'
export { automationsApi } from './services/api'
export type {
  AutomationDetail as AutomationDetailData,
  AutomationSummary,
  BriefingDetail,
  BriefingSummary,
  RunDetail,
  RunSummary,
} from './types'
