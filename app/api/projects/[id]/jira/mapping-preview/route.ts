import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { getReadableProject } from '@/lib/projects/access'
import { buildJiraMappingKeys, previewJiraRollup, type JiraMappingType } from '@/features/projects/services/jira/rollup'

const TYPES = new Set(['MANUAL', 'EPIC', 'LABEL', 'COMPONENT', 'SPRINT'])

export const GET = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const url = new URL(req.url)
  const rawType = url.searchParams.get('type') ?? 'MANUAL'
  const type = (TYPES.has(rawType) ? rawType : 'MANUAL') as JiraMappingType
  const values = (url.searchParams.get('values') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const keys = buildJiraMappingKeys(type, values)
  return apiSuccess(await previewJiraRollup(prisma, params.id, keys))
})
