import type { Prisma } from '@prisma/client'

export type CoeRootCauseClass = 'PLANNING' | 'REQUIREMENTS' | 'APPROVAL' | 'IMPLEMENTATION' | 'ESTIMATION' | 'EXTERNAL'
export type CoeFixStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE'

export interface CoeWhy {
  why: string
  answer: string
}

export interface CoeTrigger {
  kind: 'MILESTONE_SLIP' | 'PROJECT_RED'
  trigger: string
  daysLost: number
  milestoneId?: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const ROOT_CAUSES: CoeRootCauseClass[] = ['PLANNING', 'REQUIREMENTS', 'APPROVAL', 'IMPLEMENTATION', 'ESTIMATION', 'EXTERNAL']

export function nextCoeCode(existingCount: number): string {
  return `COE-${String(existingCount + 1).padStart(3, '0')}`
}

export function parseWhys(value: unknown): CoeWhy[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      return {
        why: String(row.why ?? '').trim(),
        answer: String(row.answer ?? '').trim(),
      }
    })
    .filter((item): item is CoeWhy => !!item && (!!item.why || !!item.answer))
}

export function hasFiveCompleteWhys(whys: readonly CoeWhy[]): boolean {
  return whys.filter((item) => item.why.trim() && item.answer.trim()).length >= 5
}

export function validateCoeClosure(input: {
  fixStatus: CoeFixStatus
  whys: readonly CoeWhy[]
  systemicFix?: string | null
}): { ok: true } | { ok: false; error: string } {
  if (input.fixStatus !== 'DONE') return { ok: true }
  if (!hasFiveCompleteWhys(input.whys)) return { ok: false, error: 'Five complete Why/Answer entries are required before closing a COE' }
  if (!input.systemicFix?.trim()) return { ok: false, error: 'A systemic fix is required before closing a COE' }
  return { ok: true }
}

export function milestoneSlipDays(baselineDate: Date | string | null | undefined, currentDate: Date | string | null | undefined): number {
  if (!baselineDate || !currentDate) return 0
  const baseline = startOfUtcDay(new Date(baselineDate))
  const current = startOfUtcDay(new Date(currentDate))
  if (Number.isNaN(baseline.getTime()) || Number.isNaN(current.getTime())) return 0
  return Math.max(0, Math.round((current.getTime() - baseline.getTime()) / DAY_MS))
}

export function detectCoeTriggers(input: {
  projectRagStatus: string
  milestones: readonly { id: string; name: string; baselineDate: Date | string | null; currentDate: Date | string | null }[]
  existingTriggers?: readonly string[]
}): CoeTrigger[] {
  const existing = new Set(input.existingTriggers ?? [])
  const triggers: CoeTrigger[] = []
  for (const milestone of input.milestones) {
    const daysLost = milestoneSlipDays(milestone.baselineDate, milestone.currentDate)
    if (daysLost <= 10) continue
    const trigger = milestoneSlipTrigger(milestone.name, daysLost)
    if (!existing.has(trigger)) triggers.push({ kind: 'MILESTONE_SLIP', trigger, daysLost, milestoneId: milestone.id })
  }
  if (input.projectRagStatus === 'RED' && !existing.has(PROJECT_RED_TRIGGER)) {
    triggers.push({ kind: 'PROJECT_RED', trigger: PROJECT_RED_TRIGGER, daysLost: 0 })
  }
  return triggers
}

export function coeWhere(projectId: string, opts: { overdue?: boolean; report?: boolean; now?: Date } = {}): Prisma.CorrectionOfErrorWhereInput {
  const where: Prisma.CorrectionOfErrorWhereInput = { projectId }
  if (opts.overdue) {
    where.fixStatus = { not: 'DONE' }
    where.fixDueDate = { lt: opts.now ?? new Date() }
  } else if (opts.report) {
    where.OR = [{ fixStatus: { not: 'DONE' } }, { fedIntoTemplate: true }]
  }
  return where
}

export function rootCausePareto(rows: readonly { rootCauseClass: string }[]): { rootCauseClass: CoeRootCauseClass; count: number }[] {
  const counts = new Map<CoeRootCauseClass, number>(ROOT_CAUSES.map((rootCauseClass) => [rootCauseClass, 0]))
  for (const row of rows) {
    if (ROOT_CAUSES.includes(row.rootCauseClass as CoeRootCauseClass)) {
      const key = row.rootCauseClass as CoeRootCauseClass
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return ROOT_CAUSES.map((rootCauseClass) => ({ rootCauseClass, count: counts.get(rootCauseClass) ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.rootCauseClass.localeCompare(b.rootCauseClass))
}

export function isOverdueCoe(row: { fixStatus: string; fixDueDate: Date | string }, now = new Date()): boolean {
  return row.fixStatus !== 'DONE' && new Date(row.fixDueDate).getTime() < now.getTime()
}

export function serializeCoe<T extends {
  whys: unknown
  fixDueDate: Date
  closedAt: Date | null
  createdAt: Date
  fixStatus: string
  [key: string]: unknown
}>(coe: T, now = new Date()) {
  const whys = parseWhys(coe.whys)
  return {
    ...coe,
    whys,
    fixDueDate: coe.fixDueDate.toISOString(),
    closedAt: coe.closedAt?.toISOString() ?? null,
    createdAt: coe.createdAt.toISOString(),
    whysComplete: hasFiveCompleteWhys(whys),
    isOverdue: isOverdueCoe(coe, now),
    lessonLearned: coe.fedIntoTemplate && typeof coe.systemicFix === 'string' && coe.systemicFix.trim()
      ? coe.systemicFix.trim()
      : null,
  }
}

export const PROJECT_RED_TRIGGER = 'Project is RED'

export function milestoneSlipTrigger(name: string, daysLost: number): string {
  return `Milestone "${name}" slipped ${daysLost} days`
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}
