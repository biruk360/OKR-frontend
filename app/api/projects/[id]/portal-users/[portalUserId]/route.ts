import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { getWritableProject } from '@/lib/projects/access'
import {
  PortalAccountError,
  portalInvitePath,
  resetPortalCredential,
  revokePortalAccess,
  updatePortalAccountSchema,
  type PortalAccountDb,
} from '@/lib/projects/portal-accounts'
import { sendPortalInviteEmail } from '@/lib/projects/portal-account-audit'

type Params = { id: string; portalUserId: string }

/**
 * PATCH  — re-issue credentials for a portal account in this project's scope:
 *          { action: 'RESEND_INVITE', sendEmail? } | { action: 'SET_PASSWORD', password }.
 *          Either one ends the account's existing portal sessions (credential
 *          fingerprint check in lib/portal-auth.ts).
 * DELETE — revoke this project from the account; with no projects left the
 *          account is deactivated. Takes effect on the client's next request.
 */

export const PATCH = withAuth<Params>(async (req: NextRequest, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  const parsed = updatePortalAccountSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid portal account update', parsed.error.flatten())
  const input = parsed.data
  const credential = input.action === 'SET_PASSWORD' ? { mode: 'PASSWORD' as const, password: input.password } : { mode: 'INVITE' as const }

  let result
  try {
    result = await prisma.$transaction(async (tx) => {
      const updated = await resetPortalCredential(tx as unknown as PortalAccountDb, {
        projectId: params.id,
        accountId: params.portalUserId,
        credential,
      })
      await recordActivity({
        entityType: 'PROJECT',
        projectId: params.id,
        action: 'UPDATED',
        actorId: session.user.id,
        metadata: { kind: 'PORTAL_CREDENTIAL_RESET', portalUserId: updated.account.id, email: updated.account.email, credentialMode: credential.mode },
      }, { client: tx, required: true })
      return updated
    })
  } catch (error) {
    if (error instanceof PortalAccountError && error.code === 'NOT_FOUND') return apiNotFound(error.message)
    throw error
  }

  let emailStatus: string | null = null
  if (result.inviteToken && input.action === 'RESEND_INVITE' && input.sendEmail) {
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
    invitePath: result.inviteToken ? portalInvitePath(result.inviteToken) : null,
    emailStatus,
  }, { message: input.action === 'SET_PASSWORD' ? 'Temporary password set.' : 'New invite link issued.' })
})

export const DELETE = withAuth<Params>(async (_req, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  try {
    const result = await prisma.$transaction(async (tx) => {
      const revoked = await revokePortalAccess(tx as unknown as PortalAccountDb, {
        projectId: params.id,
        accountId: params.portalUserId,
      })
      await recordActivity({
        entityType: 'PROJECT',
        projectId: params.id,
        action: revoked.deactivated ? 'DELETED' : 'UPDATED',
        actorId: session.user.id,
        metadata: { kind: 'PORTAL_ACCESS_REVOKED', portalUserId: revoked.account.id, email: revoked.account.email, deactivated: revoked.deactivated },
      }, { client: tx, required: true })
      return revoked
    })
    return apiSuccess({ id: result.account.id, deactivated: result.deactivated }, { message: 'Portal access revoked.' })
  } catch (error) {
    if (error instanceof PortalAccountError && error.code === 'NOT_FOUND') return apiNotFound(error.message)
    throw error
  }
})
