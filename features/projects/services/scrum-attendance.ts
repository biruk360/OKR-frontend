import type { Prisma, PrismaClient } from '@prisma/client'
import { toDateKey } from '@/lib/projects/business-days'

type Db = PrismaClient | Prisma.TransactionClient

export interface ScrumAttendancePerson {
  userId: string
  name: string
  email: string | null
}

export interface ScrumAttendanceLogInput {
  scrumDate: Date
  attendeeIds: string[]
  absenteeIds: string[]
  lateIds: string[]
}

export interface ScrumAttendanceRow {
  userId: string
  name: string
  email: string | null
  attended: number
  late: number
  absent: number
  attendanceRate: number
  flagged: boolean
}

export interface ScrumAttendanceSummary {
  totalScrumsHeld: number
  teamAttendanceRate: number
  rows: ScrumAttendanceRow[]
}

export interface ScrumLogNode {
  id: string
  projectId: string
  scrumDate: string
  timeHeld: string
  durationMin: number
  facilitatorId: string
  attendeeIds: string[]
  absenteeIds: string[]
  lateIds: string[]
  blockersRaised: string | null
  notes: string | null
  createdAt: string
}

export interface ScrumLogData {
  logs: ScrumLogNode[]
  people: ScrumAttendancePerson[]
  summary: ScrumAttendanceSummary
}

export function computeScrumAttendance(
  logs: readonly ScrumAttendanceLogInput[],
  people: readonly ScrumAttendancePerson[],
): ScrumAttendanceSummary {
  const totalScrumsHeld = logs.length
  if (totalScrumsHeld === 0 || people.length === 0) {
    return { totalScrumsHeld, teamAttendanceRate: 0, rows: [] }
  }

  let attendedSlots = 0
  const rows = people.map((person) => {
    let attended = 0
    let late = 0
    let absent = 0
    for (const log of logs) {
      if (log.lateIds.includes(person.userId)) {
        late += 1
        attended += 1
        attendedSlots += 1
      } else if (log.attendeeIds.includes(person.userId)) {
        attended += 1
        attendedSlots += 1
      } else if (log.absenteeIds.includes(person.userId)) {
        absent += 1
      } else {
        absent += 1
      }
    }
    const attendanceRate = round1((attended / totalScrumsHeld) * 100)
    return {
      userId: person.userId,
      name: person.name,
      email: person.email,
      attended,
      late,
      absent,
      attendanceRate,
      flagged: attendanceRate < 70,
    }
  })

  return {
    totalScrumsHeld,
    teamAttendanceRate: round1((attendedSlots / (totalScrumsHeld * people.length)) * 100),
    rows: rows.sort((a, b) => a.attendanceRate - b.attendanceRate || a.name.localeCompare(b.name)),
  }
}

export async function getProjectScrumLogData(db: Db, projectId: string): Promise<ScrumLogData> {
  const [project, members, logs] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { projectManagerId: true } }),
    db.projectMember.findMany({ where: { projectId }, select: { userId: true } }),
    db.scrumLog.findMany({ where: { projectId }, orderBy: { scrumDate: 'desc' } }),
  ])
  const userIds = [...new Set([project?.projectManagerId, ...members.map((member) => member.userId)].filter(Boolean) as string[])]
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds }, isActive: true }, select: { id: true, name: true, email: true } })
    : []
  const people = users
    .map((user) => ({ userId: user.id, name: user.name ?? user.email, email: user.email }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    logs: logs.map(serializeScrumLog),
    people,
    summary: computeScrumAttendance(logs, people),
  }
}

export function serializeScrumLog(log: {
  id: string
  projectId: string
  scrumDate: Date
  timeHeld: string
  durationMin: number
  facilitatorId: string
  attendeeIds: string[]
  absenteeIds: string[]
  lateIds: string[]
  blockersRaised: string | null
  notes: string | null
  createdAt: Date
}): ScrumLogNode {
  return {
    id: log.id,
    projectId: log.projectId,
    scrumDate: toDateKey(log.scrumDate),
    timeHeld: log.timeHeld,
    durationMin: log.durationMin,
    facilitatorId: log.facilitatorId,
    attendeeIds: log.attendeeIds,
    absenteeIds: log.absenteeIds,
    lateIds: log.lateIds,
    blockersRaised: log.blockersRaised,
    notes: log.notes,
    createdAt: log.createdAt.toISOString(),
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
