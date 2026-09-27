import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiConflict, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { getWritableProject } from '@/lib/projects/access'
import {
  grantPortalAccess,
  grantPortalAccessSchema,
  listProjectPortalAccounts,
  PortalAccountError,
  portalInvitePath,
  type PortalAccountDb,
} from '@/lib/projects/portal-accounts'
import { sendPortalInviteEmail } from '@/lib/projects/portal-account-audit'

/**
 * GET  /api/projects/[id]/portal-users — portal toggle + client accounts scoped to this project.
 * POST /api/projects/[id]/portal-users — invite a client contact (invite link or temporary password).
 *
 * Project write access (PM, ADMIN/EXECUTIVE, department lead — lib/projects/access.ts)
 * is required for both: client contact details are managed data, not project content.
 * Every mutation is audited in the same transaction (invariant #10). The raw invite
 * token is returned once to the PM and never logged (only its hash is stored).
 */

export const GET = withAuth<{ id: string }>(async (_req, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  const [project, accounts] = await Promise.all([
    prisma.project.findUnique({ where: { id: params.id }, select: { portalEnabled: true, clientName: true } }),
    listProjectPortalAccounts(prisma as unknown as PortalAccountDb, params.id),
  ])
  return apiSuccess({ portalEnabled: project?.portalEnabled ?? false, clientName: project?.clientName ?? '', accounts })
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  const parsed = grantPortalAccessSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid portal invite', parsed.error.flatten())
  const input = parsed.data

  let result
  try {
    result = await prisma.$transaction(async (tx) => {
      const granted = await grantPortalAccess(tx as unknown as PortalAccountDb, {
        projectId: params.id,
        email: input.email,
        name: input.name,
        clientName: input.clientName,
        credential: input.credential,
        actorId: session.user.id,
      })
      await recordActivity({
        entityType: 'PROJECT',
        projectId: params.id,
        action: granted.created ? 'CREATED' : 'UPDATED',
        actorId: session.user.id,
        metadata: {
          kind: 'PORTAL_ACCESS_GRANTED',
          portalUserId: granted.account.id,
          email: granted.account.email,
          credentialMode: granted.credentialChanged ? input.credential.mode : 'UNCHANGED',
          createdAccount: granted.created,
        },
      }, { client: tx, required: true })
      return granted
    })
  } catch (error) {
    if (error instanceof PortalAccountError && error.code === 'CONFLICT') return apiConflict(error.message)
    throw error
  }

  let emailStatus: string | null = null
  if (result.inviteToken && input.credential.mode === 'INVITE' && input.credential.sendEmail) {
    emailStatus = await sendPortalInviteEmail({
      projectId: params.id,
      to: result.account.email,
      name: result.account.name,
      clientName: result.account.clientName,
      inviteToken: result.inviteToken,
    })
  }

  return apiSuccess({
    account: result.account,
    created: result.created,
    credentialChanged: result.credentialChanged,
    invitePath: result.inviteToken ? portalInvitePath(result.inviteToken) : null,
    emailStatus,
  }, { status: 201, message: result.credentialChanged ? 'Portal access granted.' : 'Existing portal account added to this project.' })
})
