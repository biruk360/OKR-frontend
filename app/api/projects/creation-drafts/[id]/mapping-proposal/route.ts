import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiConflict, apiError, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { getAiProviderAdminSettings } from '@/lib/ai/admin-settings'
import { AI_FEATURE_KEYS, ProjectCreationAiDisabledError, requireProjectCreationAiEnabled } from '@/lib/ai/config'
import { resolveProjectCreationAiCredential } from '@/lib/ai/credentials'
import { recordGenerationLog } from '@/lib/ai/generation-log'
import { ProviderCallError } from '@/lib/ai/providers/types'
import { prisma } from '@/lib/prisma'
import { canCreateProject } from '@/lib/permissions'
import { generateProjectCreationAiMapping } from '@/lib/projects/creation-ai-mapping'
import {
  ProjectCreationDraftNotFoundError,
  ProjectCreationDraftVersionConflictError,
  getProjectCreationDraft,
  toProjectCreationDraftResponse,
} from '@/lib/projects/creation-draft'
import { inspectProjectCreationSpreadsheet, toPublicProjectCreationSpreadsheetInspection } from '@/lib/projects/creation-import'
import { projectCreationImportErrorResponse } from '@/lib/projects/creation-import-api'
import { readSecureProjectCreationUpload } from '@/lib/projects/creation-upload-security'

interface RouteParams { id: string }

const bodySchema = z.object({
  version: z.number().int().min(1),
  sheetName: z.string().trim().min(1).max(100),
}).strict()

export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  if (!canCreateProject({ role: session.user.role, isProjectManager: session.user.isProjectManager })) {
    return apiForbidden('Insufficient permissions')
  }

  try {
    await requireProjectCreationAiEnabled()
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiValidationError('Invalid mapping proposal request', parsed.error.flatten())

    const draft = await getProjectCreationDraft({
      id: params.id,
      actorUserId: session.user.id,
      actorRole: session.user.role,
    })
    if (draft.ownerUserId !== session.user.id) throw new ProjectCreationDraftNotFoundError()
    if (draft.sourceMethod !== 'FILE_IMPORT' || !draft.sourceRef || !draft.sourceHash) {
      return apiConflict('This draft does not have a retained spreadsheet to map.', { reasonCode: 'SOURCE_NOT_AVAILABLE' })
    }
    if (draft.version !== parsed.data.version) {
      throw new ProjectCreationDraftVersionConflictError(parsed.data.version, draft.version)
    }

    const settings = await getAiProviderAdminSettings()
    if (!settings.available) {
      return apiError('AI mapping is temporarily unavailable. Continue with manual mapping.', {
        status: 503,
        code: 'AI_PROVIDER_UNAVAILABLE',
      })
    }

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const [dailyUsed, latestUserCall] = await Promise.all([
      prisma.aiGenerationLog.count({
        where: { feature: AI_FEATURE_KEYS.PROJECT_CREATION_AI, status: 'OK', createdAt: { gte: startOfDay } },
      }),
      prisma.aiGenerationLog.findFirst({
        where: { feature: AI_FEATURE_KEYS.PROJECT_CREATION_AI, userId: session.user.id, status: 'OK' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])
    if (dailyUsed >= settings.dailyGenerationCap) {
      return apiError('The daily AI project-creation limit has been reached. Continue with manual mapping.', {
        status: 429,
        code: 'AI_DAILY_CAP_REACHED',
      })
    }
    const cooldownMs = settings.perUserCooldownMinutes * 60_000
    if (latestUserCall && Date.now() - latestUserCall.createdAt.getTime() < cooldownMs) {
      const retryAfterSeconds = Math.ceil((cooldownMs - (Date.now() - latestUserCall.createdAt.getTime())) / 1000)
      return apiError('AI mapping is cooling down. You can continue with manual mapping.', {
        status: 429,
        code: 'AI_USER_COOLDOWN',
        details: { retryAfterSeconds },
      })
    }

    const credential = await resolveProjectCreationAiCredential()
    if (!credential) {
      return apiError('AI mapping is temporarily unavailable. Continue with manual mapping.', {
        status: 503,
        code: 'AI_PROVIDER_UNAVAILABLE',
      })
    }

    const bytes = await readSecureProjectCreationUpload(draft.sourceRef)
    const retainedHash = createHash('sha256').update(bytes).digest('hex')
    if (retainedHash !== draft.sourceHash) {
      return apiConflict('The retained source file failed its integrity check. Upload it again.', {
        reasonCode: 'SOURCE_FILE_CHANGED',
      })
    }
    const inspection = toPublicProjectCreationSpreadsheetInspection(
      inspectProjectCreationSpreadsheet(bytes, { sheetName: parsed.data.sheetName }),
    )

    await recordActivity({
      entityType: 'PROJECT_CREATION_DRAFT',
      action: 'AI_MAPPING_REQUESTED',
      actorId: session.user.id,
      metadata: { draftId: draft.id, version: draft.version, provider: 'openai', modelId: settings.model },
    }, { required: true })

    const startedAt = Date.now()
    try {
      const result = await generateProjectCreationAiMapping({
        inspection,
        apiKey: credential.apiKey,
        modelId: settings.model,
        signal: request.signal,
      })
      const latencyMs = Date.now() - startedAt
      await recordGenerationLog({
        userId: session.user.id,
        feature: AI_FEATURE_KEYS.PROJECT_CREATION_AI,
        provider: 'openai',
        modelId: result.modelId,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cachedTokens: result.usage.cachedTokens,
        latencyMs,
        status: 'OK',
      })
      await recordActivity({
        entityType: 'PROJECT_CREATION_DRAFT',
        action: 'AI_MAPPING_PROPOSED',
        actorId: session.user.id,
        metadata: {
          draftId: draft.id,
          version: draft.version,
          provider: 'openai',
          modelId: result.modelId,
          promptVersion: result.promptVersion,
          proposedCount: result.inspection.mapping.filter((row) => row.match === 'AI').length,
          applied: false,
        },
      }, { required: true })
      return apiSuccess({
        stage: 'MAPPING' as const,
        draft: toProjectCreationDraftResponse(draft),
        inspection: result.inspection,
        summary: null,
        aiUsed: true,
        mappingAccepted: false,
        commitBlocked: true,
      })
    } catch (error) {
      const latencyMs = Date.now() - startedAt
      await recordGenerationLog({
        userId: session.user.id,
        feature: AI_FEATURE_KEYS.PROJECT_CREATION_AI,
        provider: 'openai',
        modelId: settings.model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        status: 'ERROR',
        errorMessage: 'COLUMN_MAPPING_PROPOSAL_FAILED',
      })
      await recordActivity({
        entityType: 'PROJECT_CREATION_DRAFT',
        action: 'AI_MAPPING_FAILED',
        actorId: session.user.id,
        metadata: { draftId: draft.id, version: draft.version, provider: 'openai', modelId: settings.model },
      }, { required: true })
      if (error instanceof ProviderCallError) {
        return apiError('AI could not propose a valid mapping. Review the columns manually and try again later.', {
          status: 502,
          code: 'AI_MAPPING_FAILED',
        })
      }
      throw error
    }
  } catch (error) {
    if (error instanceof ProjectCreationAiDisabledError) return apiNotFound(error.message)
    return projectCreationImportErrorResponse(error)
  }
})
