// Server-only: imports Prisma. Do not re-export from the features/admin-org
// barrel, which client components import. (The `server-only` package is not
// installed; this comment is the marker.)
/**
 * Data loaders for the Org directory pages under app/dashboard/org/**.
 * Moved verbatim from the pages (CLAUDE.md: routes are thin composition) —
 * the same queries, the same visibility / redaction rules
 * (lib/okr/visibility-scope.ts + redactKeyResult), the same derived values.
 * Detail loaders return `null` when the user / team is missing or inactive;
 * the page turns that into notFound().
 */

import { prisma } from '@/lib/prisma'
import { canManageUsers, redactKeyResult, type UserRole } from '@/lib/permissions'
import {
  buildKeyResultVisibilityWhere,
  canViewKeyResultInMemory,
  canViewObjectiveInMemory,
  loadViewerContext,
  REDACTED_OBJECTIVE_TITLE,
} from '@/lib/okr/visibility-scope'
import { computeProfilePlanMetrics } from '@/lib/profileMetrics'
import { getKrDisplayStatus, type KrDisplayStatus } from '@/lib/reportDashboard'

interface OrgViewer {
  id: string
  role: string
}

/** Pending / not-measurable first, then at-risk, then the rest (stable). */
function krAttentionOrder(s: KrDisplayStatus) {
  return s === 'pending' || s === 'not_measurable' ? 0 : s === 'at_risk' ? 1 : 2
}

// ─── /dashboard/org/users ───

export async function loadUsersDirectory(viewer: OrgViewer) {
  // Get all users
  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: {
      departmentMemberships: {
        include: {
          department: {
            select: { id: true, name: true },
          },
        },
      },
      _count: {
        select: { ownedObjectives: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  const canManage = canManageUsers(viewer.role as any)
  return { users, canManage }
}

// ─── /dashboard/org/teams ───

export async function loadTeamsDirectory() {
  // Get all departments (teams)
  return prisma.department.findMany({
    where: { isActive: true },
    include: {
      memberships: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true, role: true },
          },
        },
      },
      _count: {
        select: { memberships: true, objectives: true },
      },
    },
    orderBy: { name: 'asc' },
  })
}

// ─── /dashboard/org/teams/:id ───

export async function loadTeamProfile(viewer: OrgViewer, id: string) {
  const department = await prisma.department.findFirst({
    where: { id, isActive: true },
    include: {
      memberships: {
        where: { endedAt: null },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
        },
      },
    },
  })

  if (!department) return null

  const memberIds = department.memberships.map((m) => m.userId)

  const objectivesRaw = await prisma.objective.findMany({
    where: { departmentId: department.id, status: 'ACTIVE' },
    include: {
      keyResults: {
        where: { status: 'ACTIVE' },
        include: {
          todos: { select: { status: true } },
          owner: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const visibleKeyResults: {
    id: string
    title: string
    unit: string
    currentValue: number
    startValue: number
    targetValue: number
    progress: number
    confidence: string
    objective: { id: string; title: string }
    owner: { id: string; name: string; avatar: string | null }
    todos: { status: string }[]
  }[] = []

  // One viewer-context load for the whole page (was 1–2 queries per objective/to-do).
  const viewerCtx = await loadViewerContext({ id: viewer.id, role: viewer.role })

  for (const obj of objectivesRaw) {
    const objVerdict = canViewObjectiveInMemory(viewerCtx, obj)
    if (!objVerdict.canView) continue
    const objectiveTitle = objVerdict.isRedacted ? REDACTED_OBJECTIVE_TITLE : obj.title
    for (const kr of obj.keyResults) {
      const krVerdict = canViewKeyResultInMemory(viewerCtx, kr, objVerdict)
      if (!krVerdict.canView) continue
      visibleKeyResults.push({
        ...(krVerdict.isRedacted ? redactKeyResult(kr) : kr),
        objective: { id: obj.id, title: objectiveTitle },
      })
    }
  }

  const metrics = computeProfilePlanMetrics(visibleKeyResults)

  const teamTodosRaw =
    memberIds.length === 0
      ? []
      : await prisma.todo.findMany({
          where: {
            assigneeId: { in: memberIds },
            status: { not: 'CANCELLED' },
          },
          include: {
            assignee: { select: { id: true, name: true } },
            keyResult: {
              include: {
                objective: {
                  select: {
                    id: true,
                    title: true,
                    level: true,
                    ownerId: true,
                    departmentId: true,
                    isPrivate: true,
                  },
                },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 80,
        })

  const visibleTodos: typeof teamTodosRaw = []
  for (const t of teamTodosRaw) {
    // Team view only surfaces KR-linked todos scoped to the team's department.
    if (!t.keyResult) continue
    const obj = t.keyResult.objective
    if (obj.departmentId !== department.id) continue
    const objVerdict = canViewObjectiveInMemory(viewerCtx, obj)
    const krVerdict = canViewKeyResultInMemory(viewerCtx, t.keyResult, objVerdict)
    if (!krVerdict.canView) continue
    // Cards on a KR the viewer only sees redacted are left to their participants.
    const isParticipant = viewer.id === t.assigneeId || viewer.id === t.creatorId
    if (krVerdict.isRedacted && !isParticipant) continue
    visibleTodos.push(
      objVerdict.isRedacted
        ? { ...t, keyResult: { ...t.keyResult, objective: { ...obj, title: REDACTED_OBJECTIVE_TITLE } } }
        : t,
    )
  }

  const latestStandup =
    memberIds.length > 0
      ? await prisma.keyResultCheckIn.findFirst({
          where: {
            createdById: { in: memberIds },
            // Only check-ins on KRs the viewer sees in full — the card shows the KR title.
            keyResult: {
              AND: [
                { objective: { departmentId: department.id } },
                buildKeyResultVisibilityWhere(viewerCtx, { includeRedacted: false }),
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            keyResult: { select: { id: true, title: true } },
            createdBy: { select: { id: true, name: true } },
          },
        })
      : null

  const canManage = canManageUsers(viewer.role as UserRole)
  const manageHref = canManage ? '/dashboard/settings/teams' : undefined

  const krsWithStatus = visibleKeyResults.map((kr) => {
    const displayStatus = getKrDisplayStatus({
      unit: kr.unit,
      targetValue: kr.targetValue,
      startValue: kr.startValue,
      currentValue: kr.currentValue,
      progress: kr.progress,
      confidence: kr.confidence,
    })
    return { kr, displayStatus }
  })

  krsWithStatus.sort((a, b) => krAttentionOrder(a.displayStatus) - krAttentionOrder(b.displayStatus))

  const pendingCount = krsWithStatus.filter(
    (x) => x.displayStatus === 'pending' || x.displayStatus === 'not_measurable'
  ).length

  const minimapMembers = department.memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    avatar: m.user.avatar,
  }))

  return {
    department,
    metrics,
    visibleTodos,
    latestStandup,
    manageHref,
    krsWithStatus,
    pendingCount,
    minimapMembers,
  }
}

// ─── /dashboard/org/users/:id ───

function weekKey(d: Date) {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = copy.getUTCDay() || 7
  copy.setUTCDate(copy.getUTCDate() - day + 1)
  return copy.toISOString().slice(0, 10)
}

export async function loadUserProfile(viewer: OrgViewer, id: string) {
  const profileUser = await prisma.user.findUnique({
    where: { id, isActive: true },
    include: {
      departmentMemberships: {
        where: { endedAt: null },
        include: { department: { select: { id: true, name: true } } },
      },
    },
  })

  if (!profileUser) return null

  const [managerRels, directReportRels] = await Promise.all([
    prisma.managerRelationship.findMany({
      where: { directReportId: profileUser.id, endedAt: null },
      include: {
        manager: { select: { id: true, name: true, email: true, avatar: true } },
      },
      take: 1,
    }),
    prisma.managerRelationship.findMany({
      where: { managerId: profileUser.id, endedAt: null },
      include: {
        directReport: { select: { id: true, name: true, email: true, avatar: true } },
      },
    }),
  ])

  const manager = managerRels[0]?.manager ?? null
  const directReports = directReportRels.map((r) => r.directReport)

  const ownedKeyResultsRaw = await prisma.keyResult.findMany({
    where: { ownerId: profileUser.id, status: 'ACTIVE' },
    include: {
      objective: {
        select: {
          id: true,
          title: true,
          level: true,
          ownerId: true,
          departmentId: true,
          isPrivate: true,
          timeframe: { select: { startDate: true, endDate: true } },
        },
      },
      todos: { select: { status: true } },
      _count: { select: { checkIns: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  // One viewer-context load for the whole page (was 1–2 queries per KR/to-do).
  const viewerCtx = await loadViewerContext({ id: viewer.id, role: viewer.role })

  const visibleKeyResults: typeof ownedKeyResultsRaw = []
  for (const kr of ownedKeyResultsRaw) {
    const objVerdict = canViewObjectiveInMemory(viewerCtx, kr.objective)
    const krVerdict = canViewKeyResultInMemory(viewerCtx, kr, objVerdict)
    if (!krVerdict.canView) continue
    visibleKeyResults.push({
      ...(krVerdict.isRedacted ? redactKeyResult(kr) : kr),
      objective: objVerdict.isRedacted
        ? { ...kr.objective, title: REDACTED_OBJECTIVE_TITLE }
        : kr.objective,
    })
  }

  const metrics = computeProfilePlanMetrics(visibleKeyResults)

  const assignedTodosRaw = await prisma.todo.findMany({
    where: {
      assigneeId: profileUser.id,
      status: { not: 'CANCELLED' },
    },
    include: {
      keyResult: {
        include: {
          objective: {
            select: {
              id: true,
              level: true,
              ownerId: true,
              departmentId: true,
              isPrivate: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  const visibleTodos: typeof assignedTodosRaw = []
  for (const t of assignedTodosRaw) {
    const isParticipant = viewer.id === t.assigneeId || viewer.id === t.creatorId
    // Standalone todos (no KR link) are only visible to the assignee/creator on
    // their own profile page — viewing someone else's profile filters them out.
    if (!t.keyResult) {
      if (isParticipant) visibleTodos.push(t)
      continue
    }
    const obj = t.keyResult.objective
    const objVerdict = canViewObjectiveInMemory(viewerCtx, obj)
    const krVerdict = canViewKeyResultInMemory(viewerCtx, t.keyResult, objVerdict)
    if (!krVerdict.canView) continue
    // A card on a KR the viewer only sees redacted is shown to its participants
    // only (the card read rule opens non-participant cards via an unredacted OKR).
    if (krVerdict.isRedacted && !isParticipant) continue
    visibleTodos.push(
      objVerdict.isRedacted
        ? { ...t, keyResult: { ...t.keyResult, objective: { ...obj, title: REDACTED_OBJECTIVE_TITLE } } }
        : t,
    )
  }

  // Check-in feeds carry KR titles, values and free-text analysis that cannot be
  // meaningfully redacted, so they only include check-ins on key results the
  // viewer sees in full (lib/okr/visibility-scope.ts).
  const fullyVisibleKr = buildKeyResultVisibilityWhere(viewerCtx, { includeRedacted: false })
  const latestStandup = await prisma.keyResultCheckIn.findFirst({
    where: { createdById: profileUser.id, keyResult: fullyVisibleKr },
    orderBy: { createdAt: 'desc' },
    include: {
      keyResult: { select: { id: true, title: true } },
    },
  })

  // Full check-in / KR update feed for the bottom section of the profile.
  const recentCheckIns = await prisma.keyResultCheckIn.findMany({
    where: { createdById: profileUser.id, keyResult: fullyVisibleKr },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      keyResult: {
        select: {
          id: true,
          title: true,
          unit: true,
          targetValue: true,
          objective: { select: { id: true, title: true } },
        },
      },
    },
  })

  const isOwnProfile = viewer.id === profileUser.id
  const canManage = canManageUsers(viewer.role as UserRole)
  const manageOrgHref =
    isOwnProfile || canManage
      ? isOwnProfile
        ? '/dashboard/settings/profile'
        : '/dashboard/settings/users'
      : undefined
  const addReportsHref = canManage ? '/dashboard/settings/users' : undefined

  // Group KRs by their parent objective for the nested view.
  const krsByObjective = new Map<
    string,
    { objectiveTitle: string; objectiveId: string; krs: typeof visibleKeyResults }
  >()
  for (const kr of visibleKeyResults) {
    const key = kr.objectiveId
    const bucket = krsByObjective.get(key)
    if (bucket) bucket.krs.push(kr)
    else
      krsByObjective.set(key, {
        objectiveTitle: kr.objective.title,
        objectiveId: kr.objectiveId,
        krs: [kr],
      })
  }

  const krsWithStatus = visibleKeyResults.map((kr) => {
    const displayStatus = getKrDisplayStatus({
      unit: kr.unit,
      targetValue: kr.targetValue,
      startValue: kr.startValue,
      currentValue: kr.currentValue,
      progress: kr.progress,
      confidence: kr.confidence,
    })
    return { kr, displayStatus }
  })

  krsWithStatus.sort((a, b) => krAttentionOrder(a.displayStatus) - krAttentionOrder(b.displayStatus))

  const pendingCount = krsWithStatus.filter(
    (x) => x.displayStatus === 'pending' || x.displayStatus === 'not_measurable'
  ).length

  // Timeline: bucket user's KR check-ins by ISO week and average per-checkin progress.
  const krIds = visibleKeyResults.map((kr) => kr.id)
  const timelineCheckIns =
    krIds.length > 0
      ? await prisma.keyResultCheckIn.findMany({
          where: { keyResultId: { in: krIds } },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, value: true, keyResultId: true },
        })
      : []
  const krMeta = new Map(
    visibleKeyResults.map((kr) => [kr.id, { start: kr.startValue, target: kr.targetValue }]),
  )
  const byWeek = new Map<string, { sum: number; n: number }>()
  for (const ci of timelineCheckIns) {
    const meta = krMeta.get(ci.keyResultId)
    if (!meta) continue
    const span = meta.target - meta.start
    if (span <= 0) continue
    const pct = Math.max(0, Math.min(100, ((ci.value - meta.start) / span) * 100))
    const key = weekKey(ci.createdAt)
    const bucket = byWeek.get(key) ?? { sum: 0, n: 0 }
    bucket.sum += pct
    bucket.n += 1
    byWeek.set(key, bucket)
  }
  const timelineSnapshots = Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodStart, v]) => ({ periodStart, score: v.sum / v.n }))

  // Pick widest timeframe among owned KRs' objectives; fall back to last 90 days.
  const tfBounds = visibleKeyResults
    .map((kr) => kr.objective.timeframe)
    .filter((t): t is { startDate: Date; endDate: Date } => Boolean(t?.startDate && t?.endDate))
  let tfStart: Date
  let tfEnd: Date
  if (tfBounds.length > 0) {
    tfStart = new Date(Math.min(...tfBounds.map((t) => t.startDate.getTime())))
    tfEnd = new Date(Math.max(...tfBounds.map((t) => t.endDate.getTime())))
  } else {
    tfEnd = new Date()
    tfStart = new Date(Date.now() - 90 * 24 * 3600 * 1000)
  }

  return {
    profileUser,
    manager,
    directReports,
    metrics,
    visibleTodos,
    latestStandup,
    recentCheckIns,
    manageOrgHref,
    addReportsHref,
    krsByObjective,
    pendingCount,
    timelineSnapshots,
    tfStart,
    tfEnd,
  }
}
