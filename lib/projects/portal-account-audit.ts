import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { portalInviteEmail, portalInvitePath, PORTAL_INVITE_TTL_MS } from './portal-accounts'

/**
 * Shared helpers for the portal-account routes (app/api/projects/[id]/portal-users/**).
 * Kept out of the pure service so portal-accounts.ts stays unit-testable without SMTP.
 */

export function portalAppBaseUrl(): string {
  return (process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

/**
 * Email the invite link. Best-effort: a failed send never rolls the invite back
 * (the PM still gets the link to copy). Returns the delivery status.
 */
export async function sendPortalInviteEmail(input: {
  projectId: string
  to: string
  name: string
  clientName: string
  inviteToken: string
  now?: Date
}): Promise<'SENT' | 'LOGGED_ONLY' | 'FAILED'> {
  try {
    const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { name: true } })
    const expiresAt = new Date((input.now ?? new Date()).getTime() + PORTAL_INVITE_TTL_MS)
    const message = portalInviteEmail({
      name: input.name,
      clientName: input.clientName,
      projectName: project?.name ?? 'your project',
      url: `${portalAppBaseUrl()}${portalInvitePath(input.inviteToken)}`,
      expiresAt,
    })
    const result = await sendMail({ to: input.to, toName: input.name, ...message })
    return result.status
  } catch (error) {
    console.error('[portal-accounts] invite email failed', error instanceof Error ? error.message : error)
    return 'FAILED'
  }
}
