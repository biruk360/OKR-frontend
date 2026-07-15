import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { getWritableProject } from '@/lib/projects/access'
import { decryptJiraToken } from '@/lib/projects/jira-crypto'
import {
  JiraConnectionError,
  normalizeJiraProjectKey,
  normalizeJiraSiteUrl,
  testJiraConnection,
} from '@/features/projects/services/jira/connection'

const testSchema = z.object({
  siteUrl: z.string().trim().min(1),
  email: z.string().trim().email(),
  apiToken: z.string().trim().optional(),
  projectKey: z.string().trim().min(2).max(32),
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = testSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid Jira connection payload', parsed.error.flatten())

  try {
    const siteUrl = normalizeJiraSiteUrl(parsed.data.siteUrl)
    const projectKey = normalizeJiraProjectKey(parsed.data.projectKey)
    const email = parsed.data.email.trim()
    let apiToken = parsed.data.apiToken?.trim() ?? ''
    if (!apiToken) {
      const project = await prisma.project.findUnique({
        where: { id: params.id },
        select: { jiraConnection: { select: { encryptedToken: true } } },
      })
      if (!project?.jiraConnection) {
        return apiValidationError('API token is required before the connection is saved.', { code: 'JIRA_TOKEN_REQUIRED' })
      }
      apiToken = decryptJiraToken(project.jiraConnection.encryptedToken)
    }

    const result = await testJiraConnection({ siteUrl, email, apiToken, projectKey })
    return apiSuccess(result, { message: 'Connection successful.' })
  } catch (error) {
    if (error instanceof JiraConnectionError) {
      return apiValidationError(error.message, { code: error.code, status: error.status })
    }
    throw error
  }
})
