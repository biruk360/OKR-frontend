/**
 * Tool registry. The runner resolves tools only through here, and only after
 * confirming the automation holds a grant for them — spec §7.
 */

import { AVAILABLE_TOOL_IDS, type ToolGrant, type ToolId } from '@/types/automations'
import { odooSearchTool } from './odoo-search'
import { okrQueryTool } from './okr-query'
import { ToolRefusedError, ToolUnavailableError, type AutomationTool } from './types'

const REGISTRY: Partial<Record<ToolId, AutomationTool>> = {
  'okr.query': okrQueryTool,
  'odoo.search': odooSearchTool,
}

/**
 * Resolve a tool for execution. Throws rather than returning null so a step can
 * never silently do nothing — a refusal belongs in the transcript.
 */
export function resolveTool(tool: ToolId, grants: ToolGrant[]): AutomationTool {
  if (!AVAILABLE_TOOL_IDS.includes(tool)) throw new ToolUnavailableError(tool)
  if (!grants.some((g) => g.tool === tool)) {
    throw new ToolRefusedError(tool, 'not granted to this automation')
  }
  const impl = REGISTRY[tool]
  if (!impl) throw new ToolUnavailableError(tool)
  return impl
}

export function isToolAvailable(tool: ToolId): boolean {
  return AVAILABLE_TOOL_IDS.includes(tool) && Boolean(REGISTRY[tool])
}

export { ToolRefusedError, ToolUnavailableError }
export type { AutomationTool, ToolActor, ToolContext, ToolResult, ToolRow } from './types'
