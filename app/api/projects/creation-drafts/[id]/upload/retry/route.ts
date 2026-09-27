import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiConflict, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { canCreateProject } from '@/lib/permissions'
import { runAfterResponse } from '@/lib/background'
import {
  ProjectCreationDraftNotFoundError,
  getProjectCreationDraft,
  toProjectCreationDraftResponse,
} from '@/lib/projects/creation-draft'
import { projectCreationImportErrorResponse } from '@/lib/projects/creation-import-api'
import { resolveProjectCreationImportLimits } from '@/lib/projects/creation-import'
import {
  beginProjectCreationProcessing,
  buildProjectCreationImportStatusView,
  runProjectCreationUploadProcessing,
} from '@/lib/projects/creation-processing'

interface RouteParams {
  id: string
}

const retrySchema = z.object({
  version: z.number().int().min(1),
  sheetName: z.string().trim().min(1).max(100).optional(),
}).strict()

/**
 * Story 2.7: reprocess the retained, already-scanned upload without uploading it again
 * (failed/interrupted processing, or choosing a different sheet). Idempotent: while a
 * fresh job is running this returns that job instead of starting another.
 */
export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  if (!canCreateProject({
    role: session.user.role,
    isProjectManager: session.user.isProjectManager,
  })) {
    return apiForbidden('Insufficient permissions')
  }
  const parsed = retrySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid processing retry', parsed.error.flatten())

  try {
    const draft = await getProjectCreationDraft({
      id: params.id,
      actorUserId: session.user.id,
      actorRole: session.user.role,
    })
    if (draft.ownerUserId !== session.user.id) throw new ProjectCreationDraftNotFoundError()
    if (draft.sourceMethod !== 'FILE_IMPORT' || !draft.sourceRef || !draft.sourceHash) {
      return apiConflict('This draft has no retained file to process. Upload it again.', { reasonCode: 'SOURCE_NOT_AVAILABLE' })
    }
    const { draft: processing, started } = await beginProjectCreationProcessing({
      id: params.id,
      actorUserId: session.user.id,
      expectedVersion: parsed.data.version,
    })
    if (started && processing.sourceRef && processing.sourceHash) {
      const limits = resolveProjectCreationImportLimits()
      runAfterResponse('project-creation-upload-retry', () => runProjectCreationUploadProcessing({
        draftId: processing.id,
        actorUserId: session.user.id,
        jobVersion: processing.version,
        sourceRef: processing.sourceRef!,
        sourceHash: processing.sourceHash!,
        sheetName: parsed.data.sheetName ?? null,
        maxRows: limits.maxRows,
      }))
    }
    return apiSuccess({
      ...buildProjectCreationImportStatusView(processing, null),
      draft: toProjectCreationDraftResponse(processing),
      retryStarted: started,
    }, { status: 202 })
  } catch (error) {
    return projectCreationImportErrorResponse(error)
  }
})
