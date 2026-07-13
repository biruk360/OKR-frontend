/**
 * Project creation & code-generation service (Epic A1).
 *
 * - `generateProjectCode` produces a transaction-safe `PRJ-{YYYY}-{NNN}` sequence per
 *   year. Called inside the create transaction with a row lock scope so concurrent
 *   creates never collide (A1 DoD).
 * - `createProjectWithTemplate` creates the project, adds the PM as a ProjectMember,
 *   and instantiates the chosen template's full tree — all in one transaction.
 *
 * Audit + notifications are the caller's responsibility (route), keeping this service
 * pure-ish and unit-friendly.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { instantiateTemplateStructure, type TemplateStructure } from './templates'

const CODE_PREFIX = 'PRJ'

/**
 * Generate the next unique project code for the given year. Uses the max existing
 * sequence for that year's prefix and increments. Must run inside a transaction (the
 * caller wraps create + code-gen together) so two concurrent creates serialize.
 */
export async function generateProjectCode(
  tx: Prisma.TransactionClient,
  year: number = new Date().getUTCFullYear()
): Promise<string> {
  const prefix = `${CODE_PREFIX}-${year}-`
  const latest = await tx.project.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  })
  let next = 1
  if (latest) {
    const n = parseInt(latest.code.slice(prefix.length), 10)
    if (!Number.isNaN(n)) next = n + 1
  }
  return `${prefix}${String(next).padStart(3, '0')}`
}

export interface CreateProjectInput {
  name: string
  code?: string // optional override; must stay unique
  clientName: string
  description?: string | null
  projectManagerId: string
  departmentId?: string | null
  contractValue?: number | null
  currency?: string
  plannedStart: Date
  plannedEnd: Date
  templateId?: string | null
  createdById: string
}

/**
 * Create a project (in PLANNING, unbaselined), add the PM as a ProjectMember(PM), and —
 * if a template is chosen — instantiate its full phase/milestone/activity tree. All in
 * one transaction (A1 DoD: template instantiation is all-or-nothing).
 * Returns the created project id and its code.
 */
export async function createProjectWithTemplate(
  prisma: PrismaClient,
  input: CreateProjectInput
): Promise<{ id: string; code: string }> {
  return prisma.$transaction(async (tx) => {
    const code = input.code?.trim() || (await generateProjectCode(tx, input.plannedStart.getUTCFullYear()))

    const project = await tx.project.create({
      data: {
        code,
        name: input.name,
        description: input.description ?? null,
        clientName: input.clientName,
        projectManagerId: input.projectManagerId,
        departmentId: input.departmentId ?? null,
        templateId: input.templateId ?? null,
        contractValue: input.contractValue ?? null,
        currency: input.currency ?? 'ETB',
        plannedStart: input.plannedStart,
        plannedEnd: input.plannedEnd,
        status: 'PLANNING',
        createdById: input.createdById,
      },
      select: { id: true, code: true },
    })

    // PM auto-added as a project member (A1).
    await tx.projectMember.create({
      data: { projectId: project.id, userId: input.projectManagerId, role: 'PM', allocationPct: 100 },
    })

    // Template instantiation (copy, not reference).
    if (input.templateId) {
      const template = await tx.projectTemplate.findUnique({
        where: { id: input.templateId },
        select: { structureJson: true },
      })
      if (template?.structureJson) {
        const structure = template.structureJson as unknown as TemplateStructure
        if (Array.isArray(structure.phases)) {
          await instantiateTemplateStructure(tx, project.id, structure)
        }
      }
    }

    return project
  })
}
