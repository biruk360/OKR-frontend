import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { canCreateProject } from '@/lib/permissions'
import {
  bulkDecideProjectCreationAiProposals,
  toProjectCreationDraftResponse,
} from '@/lib/projects/creation-draft'
import { ProjectCreationBulkDecisionError } from '@/lib/projects/creation-assumption-decisions'
import { projectCreationImportErrorResponse } from '@/lib/projects/creation-import-api'

interface RouteParams { id: string }

const bodySchema = z.object({
  version: z.number().int().min(1),
  decision: z.enum(['ACCEPT', 'REJECT']),
  scope: z.discriminatedUnion('type', [
    z.object({ type: z.literal('PHASE'), phaseId: z.string().trim().min(1).max(200) }).strict(),
    z.object({ type: z.literal('ALL') }).strict(),
  ]),
  expectedCount: z.number().int().min(1).max(10_000),
}).strict()

/**
 * Bulk review — accept or reject every pending AI/inferred assumption proposal in
 * one phase, or all remaining. An explicit, confirmed PM action (invariant #6);
 * atomic, version-checked, and audited once with counts.
 */
export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  if (!canCreateProject({ role: session.user.role, isProjectManager: session.user.isProjectManager })) {
    return apiForbidden('Insufficient permissions')
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid bulk decision request', parsed.error.flatten())
  try {
    const result = await bulkDecideProjectCreationAiProposals({
      id: params.id,
      actorUserId: session.user.id,
      expectedVersion: parsed.data.version,
      scope: parsed.data.scope,
      decision: parsed.data.decision,
      expectedCount: parsed.data.expectedCount,
    })
    return apiSuccess({ draft: toProjectCreationDraftResponse(result.draft), count: result.count })
  } catch (error) {
    if (error instanceof ProjectCreationBulkDecisionError) {
      return apiError(error.message, {
        status: error.code === 'BULK_SCOPE_INVALID' ? 404 : 409,
        code: error.code,
        details: error.details,
      })
    }
    return projectCreationImportErrorResponse(error)
  }
})
