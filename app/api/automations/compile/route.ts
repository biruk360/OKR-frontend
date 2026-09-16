import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { canAuthorAutomations } from '@/lib/automations/access'
import {
  CompilerFailedError,
  CompilerNotConfiguredError,
  compileInstruction,
} from '@/lib/automations/compiler'
import { diffPlans } from '@/lib/automations/plan-diff'
import { isToolAvailable } from '@/lib/automations/tools'
import { isOdooConfigured } from '@/lib/odoo/client'
import { ProviderCallError } from '@/lib/ai/providers/types'
import { DEFAULT_TIMEZONE, TOOL_IDS, type PlanSpec, type ToolId } from '@/types/automations'
import type { UserRole } from '@/types'

/**
 * Compile an instruction into a PlanSpec (FR-01). Does NOT save — the user
 * reviews and edits the result in the form first, which is the entire point of
 * compiling once rather than re-prompting on every run.
 *
 * When `previousPlan` is supplied the response also carries a grouped diff, so
 * editing an existing automation shows what will actually change (FR-03).
 */
const bodySchema = z.object({
  instruction: z.string().trim().min(10).max(4000),
  timezone: z.string().min(1).max(64).optional(),
  previousPlan: z.unknown().optional(),
}).strict()

/** Only tools that are both implemented and credentialed are offered to the model. */
async function usableTools(): Promise<ToolId[]> {
  const odooReady = isOdooConfigured()
  return TOOL_IDS.filter((tool) => {
    if (!isToolAvailable(tool)) return false
    if (tool === 'odoo.search') return odooReady
    return true
  })
}

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canAuthorAutomations(principal))) {
    return apiForbidden('You do not have permission to create automations')
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid compile request', parsed.error.flatten())

  try {
    const result = await compileInstruction({
      instruction: parsed.data.instruction,
      ownerUserId: session.user.id,
      timezone: parsed.data.timezone || DEFAULT_TIMEZONE,
      availableTools: await usableTools(),
    })

    // A diff is only meaningful against a plan that already exists.
    const previous = parsed.data.previousPlan as PlanSpec | undefined
    const diff = previous ? diffPlans(previous, result.plan) : { changes: [], hasChanges: false }

    return apiSuccess({
      plan: result.plan,
      grants: result.grants,
      suggestedName: result.suggestedName,
      notes: result.notes,
      repaired: result.repaired,
      costUsd: result.costUsd,
      modelId: result.modelId,
      diff,
    })
  } catch (error) {
    if (error instanceof CompilerNotConfiguredError) {
      return apiError(error.message, { status: 503, code: error.code })
    }
    if (error instanceof CompilerFailedError) {
      return apiError(error.message, { status: 422, code: error.code, details: { issues: error.issues } })
    }
    if (error instanceof ProviderCallError) {
      return apiError('The AI provider could not be reached. Try again in a moment.', { status: 502, code: 'PROVIDER_ERROR' })
    }
    throw error
  }
})
