import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

/**
 * GET /api/projects/templates — list available project templates (system + custom).
 * Returns lightweight metadata for the create-project wizard's template step (A1/A2).
 */
export const GET = withAuth(async (_request: NextRequest) => {
  const templates = await prisma.projectTemplate.findMany({
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, description: true, isSystem: true, version: true, structureJson: true },
  })

  // Return a phase-count summary rather than the full tree for the picker.
  const data = templates.map((t) => {
    const structure = t.structureJson as any
    const phases = Array.isArray(structure?.phases) ? structure.phases : []
    const milestoneCount = phases.reduce((s: number, p: any) => s + (p.milestones?.length ?? 0), 0)
    const activityCount = phases.reduce(
      (s: number, p: any) => s + (p.milestones?.reduce((ms: number, m: any) => ms + (m.activities?.length ?? 0), 0) ?? 0),
      0
    )
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      isSystem: t.isSystem,
      version: t.version,
      phaseCount: phases.length,
      milestoneCount,
      activityCount,
    }
  })

  return apiSuccess(data)
})
