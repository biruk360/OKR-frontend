/**
 * GET /api/dtp/settings — read DTP org-wide settings + per-department approvals.
 * PUT /api/dtp/settings — admin-only update.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { getDtpSettings, updateDtpSettings } from '@/lib/dtp/settings'
import { readJson } from '@/lib/dtp/api-helpers'
import type { DtpSettings } from '@prisma/client'

export const GET = withAuth(async (_req, { session }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') {
    return apiForbidden('Only admins can read DTP settings')
  }
  const [settings, approvals] = await Promise.all([
    getDtpSettings(),
    prisma.dtpDepartmentApproval.findMany(),
  ])
  return apiSuccess({ settings, approvals })
})

interface PutBody {
  settings?: Partial<DtpSettings>
  approvals?: Array<{
    departmentId: string | null
    primaryCoordinatorId: string | null
    alternateCoordinatorId: string | null
    failoverHours?: number
    managerEndorsementMode?: 'OFF' | 'ADVISORY' | 'REQUIRED'
  }>
}

export const PUT = withAuth(async (req: NextRequest, { session }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') {
    return apiForbidden('Only admins can edit DTP settings')
  }
  const body = (await readJson<PutBody>(req)) ?? {}
  if (body.settings) await updateDtpSettings(body.settings)
  if (Array.isArray(body.approvals)) {
    for (const a of body.approvals) {
      // Per-department row: upsert keyed by departmentId (or "ORG_DEFAULT" for null).
      const existing = await prisma.dtpDepartmentApproval.findFirst({
        where: { departmentId: a.departmentId },
      })
      if (existing) {
        await prisma.dtpDepartmentApproval.update({
          where: { id: existing.id },
          data: {
            primaryCoordinatorId: a.primaryCoordinatorId,
            alternateCoordinatorId: a.alternateCoordinatorId,
            failoverHours: a.failoverHours ?? 4,
            managerEndorsementMode: a.managerEndorsementMode ?? 'OFF',
          },
        })
      } else {
        await prisma.dtpDepartmentApproval.create({
          data: {
            departmentId: a.departmentId,
            primaryCoordinatorId: a.primaryCoordinatorId,
            alternateCoordinatorId: a.alternateCoordinatorId,
            failoverHours: a.failoverHours ?? 4,
            managerEndorsementMode: a.managerEndorsementMode ?? 'OFF',
          },
        })
      }
    }
  }
  const [settings, approvals] = await Promise.all([
    getDtpSettings(),
    prisma.dtpDepartmentApproval.findMany(),
  ])
  return apiSuccess({ settings, approvals })
})
