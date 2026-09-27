import { getServerSession, type NextAuthOptions, type Session } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { AUTH_RATE_LIMITS, clientIp, emailKey, hitRateLimit, peekRateLimit } from './security/rate-limit'
import { isPendingInviteCredential, portalCredentialFingerprint } from './projects/portal-accounts'
import { INTERNAL_SESSION_COOKIES, PORTAL_SESSION_COOKIE, shouldBlockDashboardForPortalOnly } from './portal-auth-edge'

export { INTERNAL_SESSION_COOKIES, PORTAL_SESSION_COOKIE, shouldBlockDashboardForPortalOnly }

const portalAuthSecret =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production'
    ? 'local-dev-nextauth-secret-not-for-production'
    : undefined)

export interface PortalSession extends Session {
  user: Session['user'] & {
    userType: 'CLIENT_PORTAL'
    clientName: string
    projectIds: string[]
    /** Fingerprint of the credential the session was issued for (see getPortalSessionSafe). */
    credentialVersion?: string
  }
}

export const portalAuthOptions: NextAuthOptions = {
  secret: portalAuthSecret,
  providers: [
    CredentialsProvider({
      id: 'client-portal-credentials',
      name: 'Client Portal',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null
        const email = credentials.email.toLowerCase().trim()
        // Same limits as the internal sign-in (lib/auth.ts), in a portal namespace.
        const ip = clientIp(req?.headers as Record<string, string | string[] | undefined> | undefined)
        if (!hitRateLimit(`portal-login:ip:${ip}`, AUTH_RATE_LIMITS.loginIp).allowed) return null
        const accountKey = `portal-login:email:${emailKey(email)}`
        if (!peekRateLimit(accountKey, AUTH_RATE_LIMITS.loginEmailFailures).allowed) return null

        const client = await prisma.clientPortalUser.findUnique({ where: { email } })
        // A pending invite stores `invite:<hash>:<expiry>` in passwordHash and has
        // no password yet — it can never sign in (bcrypt would also refuse it).
        const ok = !!client?.isActive
          && !isPendingInviteCredential(client.passwordHash)
          && await bcrypt.compare(credentials.password, client.passwordHash)
        if (!ok || !client) {
          hitRateLimit(accountKey, AUTH_RATE_LIMITS.loginEmailFailures)
          return null
        }
        await prisma.clientPortalUser.update({
          where: { id: client.id },
          data: { lastLoginAt: new Date() },
        })
        return {
          id: client.id,
          email: client.email,
          name: client.name,
          role: 'EMPLOYEE',
          isProjectManager: false,
          avatar: null,
          userType: 'CLIENT_PORTAL',
          clientName: client.clientName,
          projectIds: client.projectIds,
          credentialVersion: portalCredentialFingerprint(client.passwordHash),
        } as any
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  cookies: {
    sessionToken: {
      name: PORTAL_SESSION_COOKIE,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-portal-next-auth.callback-url' : 'portal-next-auth.callback-url',
      options: {
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === 'production' ? '__Host-portal-next-auth.csrf-token' : 'portal-next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = 'EMPLOYEE'
        token.isProjectManager = false
        token.avatar = null
        token.userType = 'CLIENT_PORTAL'
        token.clientName = (user as any).clientName
        token.projectIds = (user as any).projectIds ?? []
        token.credentialVersion = (user as any).credentialVersion ?? null
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.sub!
      session.user.role = 'EMPLOYEE'
      session.user.isProjectManager = false
      session.user.avatar = null
      session.user.userType = 'CLIENT_PORTAL'
      session.user.clientName = String(token.clientName ?? '')
      session.user.projectIds = Array.isArray(token.projectIds) ? token.projectIds as string[] : []
      ;(session.user as PortalSession['user']).credentialVersion =
        typeof token.credentialVersion === 'string' ? token.credentialVersion : undefined
      return session
    },
  },
  pages: {
    signIn: '/portal/signin',
  },
}

type PortalSessionResolver = () => Promise<Session | null>

let resolvePortalSession: PortalSessionResolver = () => getServerSession(portalAuthOptions)

/**
 * Test seam for route-level tests (lib/projects/portal-routes-invariant.test.ts):
 * replaces the NextAuth cookie read, which needs a live Next request context.
 * Refused in production so it can never become a bypass.
 */
export function setPortalSessionResolverForTesting(resolver: PortalSessionResolver | null): void {
  if (process.env.NODE_ENV === 'production') throw new Error('Portal session resolver override is test-only')
  resolvePortalSession = resolver ?? (() => getServerSession(portalAuthOptions))
}

/**
 * The portal session, re-validated against the database on every call:
 * - the account must still exist and be active (deactivation is immediate,
 *   not after the 8-hour JWT expires);
 * - the credential fingerprint must match the one the session was issued for,
 *   so a password reset or re-invite ends every existing session;
 * - `projectIds` is replaced by the account's *current* scope, so revoking a
 *   project from Project settings → Client portal takes effect at once.
 */
export async function getPortalSessionSafe(): Promise<PortalSession | null> {
  try {
    const session = await resolvePortalSession()
    if (session?.user?.userType !== 'CLIENT_PORTAL' || !session.user.id) return null
    const account = await prisma.clientPortalUser.findUnique({
      where: { id: session.user.id },
      select: { isActive: true, projectIds: true, passwordHash: true, clientName: true },
    })
    if (!account?.isActive || isPendingInviteCredential(account.passwordHash)) return null
    const issuedFor = (session.user as PortalSession['user']).credentialVersion
    if (!issuedFor || issuedFor !== portalCredentialFingerprint(account.passwordHash)) return null
    return {
      ...session,
      user: { ...session.user, clientName: account.clientName, projectIds: [...account.projectIds] },
    } as PortalSession
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[portal-auth] getPortalSession failed:', msg)
    return null
  }
}

export function canPortalUserAccessProject(session: Pick<PortalSession, 'user'> | null | undefined, projectId: string): boolean {
  return !!session?.user.projectIds.includes(projectId)
}
