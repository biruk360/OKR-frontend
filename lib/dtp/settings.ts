/**
 * DTP settings access. The org-wide row is keyed by id="default" and lazily
 * created on first read. Per-department approval routing lives in a separate
 * table (one row per department, or null department for the org default).
 */

import { prisma } from '@/lib/prisma'
import type { DtpSettings, DtpDepartmentApproval } from '@prisma/client'

export async function getDtpSettings(): Promise<DtpSettings> {
  const existing = await prisma.dtpSettings.findUnique({ where: { id: 'default' } })
  if (existing) return existing
  return prisma.dtpSettings.create({ data: { id: 'default' } })
}

export async function updateDtpSettings(patch: Partial<DtpSettings>): Promise<DtpSettings> {
  await getDtpSettings() // ensure row exists
  // Strip immutable / managed fields.
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = patch
  void _id
  void _c
  void _u
  return prisma.dtpSettings.update({ where: { id: 'default' }, data: rest })
}

/** Resolve which Travel Coordinator + Alternate apply to a department.
 * Falls back to the org default (departmentId = null) if no per-department row. */
export async function resolveApprovalRouting(departmentId: string | null): Promise<{
  primaryCoordinatorId: string | null
  alternateCoordinatorId: string | null
  failoverHours: number
  managerEndorsementMode: 'OFF' | 'ADVISORY' | 'REQUIRED'
}> {
  const rows = await prisma.dtpDepartmentApproval.findMany({
    where: departmentId
      ? { OR: [{ departmentId }, { departmentId: null }] }
      : { departmentId: null },
  })
  // Prefer department-specific row over org default.
  const specific = rows.find((r: DtpDepartmentApproval) => r.departmentId === departmentId)
  const fallback = rows.find((r: DtpDepartmentApproval) => r.departmentId === null)
  const row = specific ?? fallback
  return {
    primaryCoordinatorId: row?.primaryCoordinatorId ?? null,
    alternateCoordinatorId: row?.alternateCoordinatorId ?? null,
    failoverHours: row?.failoverHours ?? 4,
    managerEndorsementMode:
      ((row?.managerEndorsementMode as 'OFF' | 'ADVISORY' | 'REQUIRED' | undefined) ?? 'OFF'),
  }
}

export function parseCsvIds(csv: string | null | undefined): string[] {
  if (!csv) return []
  return csv.split(',').map((s) => s.trim()).filter(Boolean)
}
