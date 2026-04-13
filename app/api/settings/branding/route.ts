import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessSettings } from '@/lib/permissions'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  withAuth,
} from '@/lib/api'

export const GET = withAuth(async (_request, { session }) => {
  if (!canAccessSettings(session.user.role as any)) {
    return apiForbidden('Insufficient permissions')
  }

  const [workspaceName, logoUrl] = await Promise.all([
    prisma.systemSettings.findUnique({ where: { key: 'branding_workspaceName' } }),
    prisma.systemSettings.findUnique({ where: { key: 'branding_logoUrl' } }),
  ])

  return apiSuccess({
    workspaceName: workspaceName?.value || 'OKR System',
    logoUrl: logoUrl?.value || '',
  })
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  if (!canAccessSettings(session.user.role as any)) {
    return apiForbidden('Insufficient permissions')
  }

  const body = await request.json()
  const { workspaceName, logoUrl } = body

  if (!workspaceName) return apiBadRequest('Workspace name is required')

  await Promise.all([
    prisma.systemSettings.upsert({
      where: { key: 'branding_workspaceName' },
      update: { value: workspaceName },
      create: { key: 'branding_workspaceName', value: workspaceName },
    }),
    prisma.systemSettings.upsert({
      where: { key: 'branding_logoUrl' },
      update: { value: logoUrl || '' },
      create: { key: 'branding_logoUrl', value: logoUrl || '' },
    }),
  ])

  return apiSuccess(null, { message: 'Branding settings updated successfully' })
})
