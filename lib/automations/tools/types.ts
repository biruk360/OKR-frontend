/**
 * Tool contract for AI Automations.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §7.
 *
 * Tools are *granted*, never ambient. The runner resolves a tool from the
 * registry only after checking the automation's grant list, so a plan can never
 * reach a capability an admin didn't hand it.
 */

import type { ToolGrant, ToolId } from '@/types/automations'
import type { UserRole } from '@/types'

/**
 * The identity every tool runs as. An automation executes as its owner — all
 * reads are scoped to what that user could already see (spec §3.4).
 */
export interface ToolActor {
  userId: string
  role: UserRole
  departmentIds: string[]
  name?: string
}

export interface ToolContext {
  actor: ToolActor
  now: Date
  signal?: AbortSignal
  /**
   * The grant this step is running under. Tools that accept parameters in their
   * grant (e.g. `odoo.search` model allowlists) read them from here — the plan
   * can never widen what the grant permits.
   */
  grant?: ToolGrant
}

/**
 * Normalised row shape. Tools flatten their native payloads into this so the
 * synthesis prompt stays compact and stable across entity types, and so no
 * unexpected column can leak into the model's context.
 */
export interface ToolRow {
  kind: string
  id: string
  title: string
  subtitle?: string
  status?: string
  owner?: string
  updatedAt?: string
  url?: string
  fields?: Record<string, string>
}

export interface ToolResult {
  rows: ToolRow[]
  /** Short line rendered into the run transcript preview. */
  summary: string
}

export interface AutomationTool {
  id: ToolId
  /** Params are already template-resolved and schema-validated by the plan layer. */
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}

/** Thrown when a step asks for something its grant does not cover. */
export class ToolRefusedError extends Error {
  readonly code = 'TOOL_REFUSED'
  constructor(readonly tool: string, reason: string) {
    super(`Tool "${tool}" refused: ${reason}`)
    this.name = 'ToolRefusedError'
  }
}

export class ToolUnavailableError extends Error {
  readonly code = 'TOOL_UNAVAILABLE'
  constructor(readonly tool: string) {
    super(`Tool "${tool}" is not available in this phase`)
    this.name = 'ToolUnavailableError'
  }
}
