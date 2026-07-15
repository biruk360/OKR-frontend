import type { Prisma } from '@prisma/client'

export type ClientObligationType = 'APPROVAL' | 'AVAILABILITY' | 'DATA' | 'ACCESS' | 'DECISION' | 'ENVIRONMENT'

export function computeComplianceRate(total: number, breaches: number): number | null {
  if (total <= 0) return null
  const withinSla = Math.max(0, total - Math.max(0, breaches))
  return Math.round((withinSla / total) * 100)
}

export function clientHealthScore(rates: readonly (number | null | undefined)[]): number {
  const known = rates.filter((rate): rate is number => typeof rate === 'number')
  if (known.length === 0) return 100
  return Math.round(known.reduce((sum, rate) => sum + rate, 0) / known.length)
}

export function clientHealthTone(score: number): 'GREEN' | 'AMBER' | 'RED' {
  if (score >= 80) return 'GREEN'
  if (score >= 60) return 'AMBER'
  return 'RED'
}

export function clientObligationWhere(projectId: string, opts: { report?: boolean } = {}): Prisma.ClientObligationWhereInput {
  return {
    projectId,
    ...(opts.report ? { isContractual: true } : {}),
  }
}

export async function updateApprovalObligationCompliance(
  tx: Prisma.TransactionClient,
  projectId: string,
  obligationId: string,
): Promise<{ breachCount: number; complianceRate: number | null }> {
  const [totalApprovals, breachCount] = await Promise.all([
    tx.delayEvent.count({ where: { projectId, eventType: 'APPROVAL_WAIT' } }),
    tx.approvalSlaBreach.count({ where: { projectId, obligationId } }),
  ])
  const complianceRate = computeComplianceRate(totalApprovals, breachCount)
  await tx.clientObligation.update({
    where: { id: obligationId },
    data: { breachCount, complianceRate },
  })
  return { breachCount, complianceRate }
}

export function serializeClientObligation<T extends {
  complianceRate: number | null
  [key: string]: unknown
}>(obligation: T) {
  return {
    ...obligation,
    healthTone: obligation.complianceRate == null ? 'GREEN' : clientHealthTone(obligation.complianceRate),
    ceoWarning: obligation.complianceRate != null && obligation.complianceRate < 60,
  }
}
