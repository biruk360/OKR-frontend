/**
 * Client-side view types for the Automations module.
 * Server contracts live in types/automations.ts — these are the shapes the API
 * actually returns, kept separate so a UI change never edits a server union.
 */

import type {
  BriefingBlock,
  DistributionMode,
  PlanSpec,
  StepTrace,
  ToolGrant,
  AutomationRecipient,
} from '@/types/automations'

export interface AutomationSummary {
  id: string
  name: string
  description: string | null
  ownerId: string
  mode: DistributionMode
  status: string
  scheduleKind: string
  scheduleSummary: string
  timezone: string
  nextRunAt: string | null
  lastRunAt: string | null
  consecutiveFailures: number
  runCount: number
  planVersion: number
  updatedAt: string
}

export interface AutomationDetail extends AutomationSummary {
  monthToDateSpendUsd: number
  instructionText: string
  plan: PlanSpec
  toolGrants: ToolGrant[]
  recipients: AutomationRecipient[]
  maxCostUsdPerRun: number
  maxCostUsdMonth: number
  timeoutSeconds: number
}

export interface RunSummary {
  id: string
  scheduledFor: string
  startedAt: string | null
  finishedAt: string | null
  status: string
  trigger: string
  attempt: number
  costUsd: number
  errorMessage: string | null
  planVersion: number
  durationMs: number | null
  briefing: {
    id: string
    title: string
    newCount: number
    changedCount: number
    unchangedCount: number
    status: string
  } | null
}

export interface RunDetail extends Omit<RunSummary, 'briefing' | 'durationMs'> {
  automationId: string
  automationName: string
  inputTokens: number
  outputTokens: number
  steps: StepTrace[]
  findingCount: number
  briefing: { id: string; title: string; summary: string; status: string } | null
}

export interface BriefingSummary {
  id: string
  automationId: string
  automationName: string
  mode: DistributionMode
  title: string
  summary: string
  status: string
  newCount: number
  changedCount: number
  unchangedCount: number
  resolvedCount: number
  publishedAt: string | null
  createdAt: string
}

export interface BriefingDetail extends BriefingSummary {
  html: string
  blocks: BriefingBlock[]
  promoted: string[]
  approvedAt: string | null
  canApprove?: boolean
  run?: { id: string; scheduledFor: string; trigger: string; status: string }
}
