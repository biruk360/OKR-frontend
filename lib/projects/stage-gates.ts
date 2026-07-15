import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export type StageGateStatus = 'NOT_REACHED' | 'PENDING' | 'PASSED' | 'FAILED' | 'WAIVED'

export function stageGateWhere(projectId: string, opts: { report?: boolean } = {}): Prisma.StageGateWhereInput {
  return {
    projectId,
    ...(opts.report ? { status: { in: ['PENDING', 'PASSED', 'FAILED', 'WAIVED'] } } : {}),
  }
}

export function parseChecklistText(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean)
  return (value ?? '')
    .split(/\r?\n|,/)
    .map((v) => v.trim())
    .filter(Boolean)
}

export function validateGateTransition(input: {
  status: StageGateStatus
  exitCriteria: readonly string[]
  waiverReason?: string | null
}): { ok: true } | { ok: false; error: string } {
  if (input.status === 'WAIVED' && !input.waiverReason?.trim()) {
    return { ok: false, error: 'A waiver reason is required' }
  }
  if (input.status === 'PASSED' && input.exitCriteria.length === 0) {
    return { ok: false, error: 'At least one exit criterion is required before passing a gate' }
  }
  return { ok: true }
}

export async function findBlockingStageGateForActivity(db: Db, projectId: string, activityId: string) {
  const activity = await db.activity.findFirst({
    where: { id: activityId, milestone: { phase: { projectId } } },
    select: {
      id: true,
      milestone: { select: { phase: { select: { id: true, position: true, name: true } } } },
    },
  })
  const phase = activity?.milestone.phase
  if (!phase || phase.position <= 0) return null

  const previousPhase = await db.phase.findFirst({
    where: { projectId, position: { lt: phase.position } },
    orderBy: { position: 'desc' },
    select: { id: true, name: true, position: true },
  })
  if (!previousPhase) return null

  const gate = await db.stageGate.findUnique({
    where: { phaseId: previousPhase.id },
  })
  if (!gate || gate.status === 'PASSED' || gate.status === 'WAIVED') return null

  return {
    gateId: gate.id,
    gateName: gate.name,
    gateStatus: gate.status,
    previousPhaseId: previousPhase.id,
    previousPhaseName: previousPhase.name,
    targetPhaseId: phase.id,
    targetPhaseName: phase.name,
  }
}

export function serializeStageGate<T extends {
  gateDate: Date | null
  [key: string]: unknown
}>(gate: T) {
  return {
    ...gate,
    gateDate: gate.gateDate?.toISOString() ?? null,
  }
}
