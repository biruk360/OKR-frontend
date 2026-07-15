import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiNotFound, apiSuccess, apiValidationError, apiForbidden, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { encryptJiraToken } from '@/lib/projects/jira-crypto'
import {
  JiraConnectionError,
  normalizeJiraProjectKey,
  normalizeJiraSiteUrl,
  serializeJiraConnection,
  testJiraConnection,
} from '@/features/projects/services/jira/connection'

const saveSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  siteUrl: z.string().trim().min(1),
  email: z.string().trim().email(),
  apiToken: z.string().trim().min(1),
  projectKey: z.string().trim().min(2).max(32),
})

export const GET = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      jiraConnection: {
        select: {
          id: true,
          name: true,
          siteUrl: true,
          authType: true,
          email: true,
          projectKey: true,
          isActive: true,
          lastSyncAt: true,
          lastSyncStatus: true,
          createdAt: true,
          syncLogs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { errors: true },
          },
        },
      },
    },
  })
  if (!project) return apiNotFound('Project not found')
  return apiSuccess(project.jiraConnection
    ? serializeJiraConnection(project.jiraConnection, { lastSyncError: project.jiraConnection.syncLogs[0]?.errors ?? null })
    : null)
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = saveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid Jira connection payload', parsed.error.flatten())

  try {
    const siteUrl = normalizeJiraSiteUrl(parsed.data.siteUrl)
    const projectKey = normalizeJiraProjectKey(parsed.data.projectKey)
    const email = parsed.data.email.trim()
    const apiToken = parsed.data.apiToken.trim()
    const testResult = await testJiraConnection({ siteUrl, email, apiToken, projectKey })
    const encryptedToken = encryptJiraToken(apiToken)

    const connection = await prisma.$transaction(async (tx) => {
      const existing = await tx.project.findUnique({
        where: { id: params.id },
        select: { jiraConnectionId: true },
      })
      const name = parsed.data.name?.trim() || `${projectKey} Jira`
      const saved = existing?.jiraConnectionId
        ? await tx.jiraConnection.update({
            where: { id: existing.jiraConnectionId },
            data: {
              name,
              siteUrl,
              authType: 'API_TOKEN',
              email,
              encryptedToken,
              projectKey,
              isActive: true,
              lastSyncStatus: null,
            },
          })
        : await tx.jiraConnection.create({
            data: {
              name,
              siteUrl,
              authType: 'API_TOKEN',
              email,
              encryptedToken,
              projectKey,
              isActive: true,
              createdById: session.user.id,
            },
          })

      await tx.project.update({
        where: { id: params.id },
        data: {
          jiraLinked: true,
          jiraConnectionId: saved.id,
        },
      })
      return saved
    })

    await recordActivity({
      entityType: 'PROJECT',
      projectId: params.id,
      action: 'UPDATED',
      actorId: session.user.id,
      metadata: {
        integration: 'JIRA',
        jiraConnectionId: connection.id,
        projectKey,
        issueCount: testResult.issueCount,
        sprintCount: testResult.sprintCount,
      },
    })

    return apiSuccess({
      connection: serializeJiraConnection(connection),
      test: testResult,
    }, { message: 'Jira connection saved.' })
  } catch (error) {
    if (error instanceof JiraConnectionError) {
      return apiValidationError(error.message, { code: error.code, status: error.status })
    }
    throw error
  }
})
