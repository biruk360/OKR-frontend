import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { recalcProjectRollup } from '@/lib/projects/rollup'
import { wouldCreateDependencyCycle } from '@/lib/projects/scheduling'
import { parseScheduleRows, type ScheduleImportRecord } from '@/lib/projects/schedule-import'
import { apiBadRequest, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'

const MAX_FILE_SIZE = 5 * 1024 * 1024

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { baselineCommittedAt: true } })
  if (!project) return apiForbidden()
  if (project.baselineCommittedAt) return apiBadRequest('Schedule import is disabled after the project baseline is committed.')

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const mode = form?.get('mode') === 'replace' ? 'replace' : 'append'
  const validateOnly = form?.get('validateOnly') === 'true'
  if (!(file instanceof File)) return apiBadRequest('Choose a CSV, XLS, or XLSX schedule file.')
  if (file.size > MAX_FILE_SIZE) return apiBadRequest('Schedule files must be 5 MB or smaller.')
  if (!/\.(csv|xls|xlsx)$/i.test(file.name)) return apiBadRequest('Only CSV, XLS, and XLSX files are supported.')

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  } catch {
    return apiBadRequest('The schedule file could not be read. Download a fresh template and try again.')
  }
  const sheet = workbook.Sheets.Schedule ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return apiBadRequest('The workbook does not contain a readable schedule sheet.')
  const records = XLSX.utils.sheet_to_json<ScheduleImportRecord>(sheet, { defval: '' })
  const parsed = parseScheduleRows(records)

  const assigneeEmails = [...new Set(parsed.rows.map((row) => row.assigneeEmail).filter((email): email is string => Boolean(email)))]
  const users = assigneeEmails.length
    ? await prisma.user.findMany({ where: { email: { in: assigneeEmails, mode: 'insensitive' }, isActive: true }, select: { id: true, email: true } })
    : []
  const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user.id]))
  for (const email of assigneeEmails) {
    if (!userByEmail.has(email)) parsed.errors.push(`Assignee email "${email}" does not match an active system user.`)
  }

  const dependencyEdges: { predecessorId: string; successorId: string }[] = []
  for (const row of parsed.rows) {
    for (const dependency of row.dependencies) {
      const edge = { predecessorId: dependency.predecessorRowId, successorId: row.rowId }
      if (wouldCreateDependencyCycle(dependencyEdges, edge)) parsed.errors.push(`Row ${row.sourceRow}: dependency on "${dependency.predecessorRowId}" creates a circular dependency.`)
      else dependencyEdges.push(edge)
    }
  }

  const summary = {
    phases: new Set(parsed.rows.map((row) => row.phase)).size,
    milestones: new Set(parsed.rows.map((row) => `${row.phase}\u0000${row.milestone}`)).size,
    activities: parsed.rows.length,
    dependencies: parsed.rows.reduce((count, row) => count + row.dependencies.length, 0),
    blockedActivities: parsed.rows.filter((row) => row.isBlocked).length,
  }
  if (parsed.errors.length) return apiValidationError('Schedule validation failed', { errors: parsed.errors.slice(0, 100), summary })
  if (validateOnly) return apiSuccess({ valid: true, summary })

  await prisma.$transaction(async (tx) => {
    if (mode === 'replace') await tx.phase.deleteMany({ where: { projectId: params.id } })
    const phasePosition = await tx.phase.aggregate({ where: { projectId: params.id }, _max: { position: true } })
    let nextPhasePosition = (phasePosition._max.position ?? -1) + 1
    const phaseIds = new Map<string, string>()
    const milestoneIds = new Map<string, string>()
    const activityIds = new Map<string, string>()

    for (const row of parsed.rows) {
      if (!phaseIds.has(row.phase)) {
        const phase = await tx.phase.create({ data: { projectId: params.id, name: row.phase, weight: row.phaseWeight, position: nextPhasePosition++ }, select: { id: true } })
        phaseIds.set(row.phase, phase.id)
      }
      const milestoneKey = `${row.phase}\u0000${row.milestone}`
      if (!milestoneIds.has(milestoneKey)) {
        const milestoneRows = parsed.rows.filter((candidate) => candidate.phase === row.phase && candidate.milestone === row.milestone)
        const namedDeliverable = milestoneRows.find((candidate) => candidate.deliverableName)?.deliverableName
        const milestone = await tx.milestone.create({
          data: { phaseId: phaseIds.get(row.phase)!, name: namedDeliverable ?? row.milestone, weight: row.milestoneWeight, isKeyMilestone: milestoneRows.some((candidate) => candidate.keyMilestone || Boolean(candidate.deliverableName)), position: [...milestoneIds.keys()].filter((key) => key.startsWith(`${row.phase}\u0000`)).length },
          select: { id: true },
        })
        milestoneIds.set(milestoneKey, milestone.id)
      }
      const blockerNote = row.blockerDetails ? `Blocker: ${row.blockerDetails}` : null
      const assumptionsNote = row.assumptionsOrSourceNotes ? `Assumptions / source notes: ${row.assumptionsOrSourceNotes}` : null
      const description = [row.description, blockerNote, assumptionsNote].filter(Boolean).join('\n\n') || null
      const activity = await tx.activity.create({
        data: {
          milestoneId: milestoneIds.get(milestoneKey)!,
          position: parsed.rows.filter((candidate) => candidate.phase === row.phase && candidate.milestone === row.milestone).findIndex((candidate) => candidate.rowId === row.rowId),
          title: row.activity,
          description,
          assigneeId: row.assigneeEmail ? userByEmail.get(row.assigneeEmail) ?? null : null,
          ownerParty: row.ownerParty,
          currentStart: row.startDate,
          currentEnd: row.endDate,
          weight: row.activityWeight,
          estimatedHours: row.estimatedHours,
          priority: row.priority,
          risk: row.risk,
          isBlocked: row.isBlocked,
          blockedSince: row.isBlocked ? new Date() : null,
          status: 'NOT_STARTED',
        },
        select: { id: true },
      })
      activityIds.set(row.rowId, activity.id)
    }

    for (const row of parsed.rows.filter((item) => item.parentRowId)) {
      await tx.activity.update({ where: { id: activityIds.get(row.rowId)! }, data: { parentActivityId: activityIds.get(row.parentRowId!)! } })
    }
    for (const row of parsed.rows) {
      for (const dependency of row.dependencies) {
        await tx.activityDependency.create({
          data: { predecessorId: activityIds.get(dependency.predecessorRowId)!, successorId: activityIds.get(row.rowId)!, type: dependency.type, lagDays: dependency.lagDays },
        })
      }
    }
    await recalcProjectRollup(tx, params.id)
  })

  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { kind: 'SCHEDULE_IMPORTED', fileName: file.name, mode, ...summary },
  })
  return apiSuccess({ imported: true, mode, summary })
})
