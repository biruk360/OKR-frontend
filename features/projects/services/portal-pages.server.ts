// Server-only: imports Prisma. Do not re-export from the features/projects
// barrel, which client components import. (The `server-only` package is not
// installed; this comment is the marker.)
/**
 * Data loaders for the client portal pages under app/portal/**.
 * Moved verbatim from the pages (CLAUDE.md: routes are thin composition) —
 * the same session checks, the same portalEnabled/archivedAt scoping, the same
 * SQL visibility filters (PM Invariant #5) and the same serializer calls with
 * forbiddenEmployeeNames from loadPortalForbiddenNames (PM Invariant #4).
 *
 * Like the sprint loaders these call redirect()/notFound() themselves: no
 * session goes to /portal/signin and an out-of-scope project renders the
 * not-found page, exactly as before.
 * lib/projects/portal-route-guards.test.ts and portal-routes-invariant.test.ts
 * and lib/attachments/*.test.ts assert on this file.
 */

import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { canPortalUserAccessProject, getPortalSessionSafe } from '@/lib/portal-auth'
import { prisma } from '@/lib/prisma'
import {
  loadPortalForbiddenNames,
  portalActivityAttachmentWhere,
  portalChangeRequestWhere,
  portalProjectWhere,
  portalRaidItemWhere,
  portalReportWhere,
  scrubPortalPayload,
  serializeChangeRequestForClient,
  serializeDelayForClient,
  serializeProjectAttachmentForClient,
  serializeProjectForClient,
  serializeRaidItemForClient,
  serializePlannedVsActualForClient,
  serializeReportForClient,
} from '@/features/projects/services/portal-serializer'
import {
  awaitingClientActions,
  flattenClientActivities,
  portalDelayRows,
} from '@/features/projects/services/portal-dashboard'
import { projectPortalInclude } from '@/features/projects/services/portal-project-query'

// ─── /portal ───

export type PortalProjectRow = { id: string; code: string; name: string; ragStatus: string; percentComplete: number }

export type PortalHomePageData =
  | { mode: 'portal'; clientName: string; projects: PortalProjectRow[] }
  | { mode: 'preview'; projects: PortalProjectRow[] }

/**
 * A portal client sees its scoped, portal-enabled projects; an internal user
 * sees the "viewing as client" preview. No session of either kind redirects.
 */
export async function loadPortalHomePage(): Promise<PortalHomePageData> {
  const [portalSession, internalSession] = await Promise.all([
    getPortalSessionSafe(),
    getServerSessionSafe(),
  ])

  if (!portalSession && !internalSession) redirect('/portal/signin')

  if (portalSession) {
    const [projects, forbiddenEmployeeNames] = await Promise.all([
      prisma.project.findMany({
        where: portalProjectWhere(portalSession.user.projectIds),
        select: { id: true, code: true, name: true, ragStatus: true, percentComplete: true },
        orderBy: { name: 'asc' },
      }),
      loadPortalForbiddenNames(prisma),
    ])
    return {
      mode: 'portal',
      clientName: portalSession.user.clientName,
      projects: scrubPortalPayload(projects, { forbiddenEmployeeNames }) as PortalProjectRow[],
    }
  }

  const [previewProjects, forbiddenEmployeeNames] = await Promise.all([
    prisma.project.findMany({
      where: internalPreviewWhere(internalSession!.user),
      select: { id: true, code: true, name: true, ragStatus: true, percentComplete: true },
      orderBy: { name: 'asc' },
      take: 12,
    }),
    loadPortalForbiddenNames(prisma),
  ])
  return {
    mode: 'preview',
    projects: scrubPortalPayload(previewProjects, { forbiddenEmployeeNames }) as PortalProjectRow[],
  }
}

function internalPreviewWhere(user: { id: string; role: string; departmentId?: string | null }) {
  if (user.role === 'ADMIN' || user.role === 'EXECUTIVE') {
    return { portalEnabled: true, archivedAt: null }
  }
  return { portalEnabled: true, archivedAt: null, projectManagerId: user.id }
}

// ─── /portal/projects/[id] ───

/**
 * Everything the portal project page renders, already serialized for the
 * client. `tab` gates the per-tab queries (documents, planned-vs-actual,
 * change requests) exactly as the page did.
 */
export async function loadPortalProjectPage(params: { id: string }, tab: string) {
  const [portalSession, internalSession] = await Promise.all([
    getPortalSessionSafe(),
    getServerSessionSafe(),
  ])
  if (!portalSession && !internalSession) redirect('/portal/signin')
  if (portalSession && !canPortalUserAccessProject(portalSession, params.id)) notFound()

  const projectWhere = portalSession
    ? { ...portalProjectWhere(portalSession.user.projectIds), id: params.id }
    : {
        id: params.id,
        portalEnabled: true,
        archivedAt: null,
        ...(internalSession && internalSession.user.role !== 'ADMIN' && internalSession.user.role !== 'EXECUTIVE'
          ? { projectManagerId: internalSession.user.id }
          : {}),
      }

  const [project, forbiddenEmployeeNames, delays, reports, raidItems, scopeProjects] = await Promise.all([
    prisma.project.findFirst({
      where: projectWhere,
      include: projectPortalInclude,
    }),
    loadPortalForbiddenNames(prisma),
    prisma.delayEvent.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.projectReport.findMany({
      where: portalReportWhere(params.id),
      orderBy: { periodEnd: 'desc' },
    }),
    prisma.raidItem.findMany({
      where: portalRaidItemWhere(params.id),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    portalSession
      ? prisma.project.findMany({
          where: portalProjectWhere(portalSession.user.projectIds),
          select: { id: true, code: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([] as Array<{ id: string; code: string; name: string }>),
  ])
  if (!project) notFound()

  const projectDto = serializeProjectForClient(project, { forbiddenEmployeeNames })
  const delayDtos = delays.map((delay) => serializeDelayForClient(delay, { forbiddenEmployeeNames }))
  const awaitingActions = awaitingClientActions(projectDto)
  const delayRows = portalDelayRows(projectDto, delayDtos)
  const reportDtos = reports.map((report) => serializeReportForClient(report, { forbiddenEmployeeNames }))
  const raidDtos = raidItems.map((item) => serializeRaidItemForClient(item, { forbiddenEmployeeNames }))
  const ganttRows = flattenClientActivities(projectDto)
  const switcherProjects = scrubPortalPayload(scopeProjects, { forbiddenEmployeeNames }) as Array<{ id: string; code: string; name: string }>

  // Client-visible files: the activity ids come from the project tree loaded
  // above with the scoped `projectWhere`; the visibility filter is in SQL (invariant 5).
  const attachmentRows = tab === 'documents' && ganttRows.length > 0
    ? await prisma.activityAttachment.findMany({
        where: portalActivityAttachmentWhere(ganttRows.map((row) => row.activity.id)),
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { id: true, activityId: true, fileName: true, fileSize: true, mimeType: true, visibility: true, createdAt: true, activity: { select: { title: true } } },
      })
    : []
  const documents = attachmentRows.map((attachment) => serializeProjectAttachmentForClient(attachment, { forbiddenEmployeeNames }))
  // Same scoped project tree as the Milestones/Schedule tabs, so no extra rows reach the client.
  const plannedVsActual = tab === 'planned-vs-actual'
    ? serializePlannedVsActualForClient(project, { forbiddenEmployeeNames })
    : null
  // Only change requests the PM shared: projectId comes from the scoped project
  // loaded above and CLIENT_VISIBLE is filtered in SQL (invariant 5).
  const changeRequestRows = tab === 'change-requests'
    ? await prisma.changeRequest.findMany({
        where: portalChangeRequestWhere(project.id),
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { id: true, crCode: true, title: true, description: true, type: true, requestedByParty: true, requestDate: true, scheduleImpactDays: true, affectedActivityIds: true, status: true, ccbDecisionDate: true, clientSignOff: true, clientSignOffAt: true, rejectionReason: true, visibility: true, createdAt: true },
      })
    : []
  const changeRequests = changeRequestRows.map((cr) => serializeChangeRequestForClient(cr, { forbiddenEmployeeNames }))
  const milestoneRows = projectDto.phases.flatMap((phase) => phase.milestones.map((milestone) => ({ phaseName: phase.name, milestone })))

  return {
    portalSession,
    internalSession,
    projectDto,
    awaitingActions,
    delayRows,
    reportDtos,
    raidDtos,
    ganttRows,
    switcherProjects,
    documents,
    plannedVsActual,
    changeRequests,
    milestoneRows,
  }
}
