import { getServerSession, type NextAuthOptions, type Session } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

const portalAuthSecret =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production'
    ? 'local-dev-nextauth-secret-not-for-production'
    : undefined)

export const PORTAL_SESSION_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Secure-portal-next-auth.session-token'
  : 'portal-next-auth.session-token'

export const INTERNAL_SESSION_COOKIES = [
  process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
]

export interface PortalSession extends Session {
  user: Session['user'] & {
    userType: 'CLIENT_PORTAL'
    clientName: string
    projectIds: string[]
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const client = await prisma.clientPortalUser.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        })
        if (!client?.isActive) return null

        const ok = await bcrypt.compare(credentials.password, client.passwordHash)
        if (!ok) return null
        await prisma.clientPortalUser.update({
          where: { id: client.id },
          data: { lastLoginAt: new Date() },
        })
        return {
          id: client.id,
          email: client.email,
          name: client.name,
          role: 'EMPLOYEE',
          avatar: null,
          userType: 'CLIENT_PORTAL',
          clientName: client.clientName,
          projectIds: client.projectIds,
        }
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
        token.avatar = null
        token.userType = 'CLIENT_PORTAL'
        token.clientName = (user as any).clientName
        token.projectIds = (user as any).projectIds ?? []
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.sub!
      session.user.role = 'EMPLOYEE'
      session.user.avatar = null
      session.user.userType = 'CLIENT_PORTAL'
      session.user.clientName = String(token.clientName ?? '')
      session.user.projectIds = Array.isArray(token.projectIds) ? token.projectIds as string[] : []
      return session
    },
  },
  pages: {
    signIn: '/portal/signin',
  },
}

export async function getPortalSessionSafe(): Promise<PortalSession | null> {
  try {
    const session = await getServerSession(portalAuthOptions)
    if (session?.user?.userType === 'CLIENT_PORTAL') return session as PortalSession
    return null
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[portal-auth] getPortalSession failed:', msg)
    return null
  }
}

export function canPortalUserAccessProject(session: Pick<PortalSession, 'user'> | null | undefined, projectId: string): boolean {
  return !!session?.user.projectIds.includes(projectId)
}

export function shouldBlockDashboardForPortalOnly(input: {
  pathname: string
  hasPortalSessionCookie: boolean
  hasInternalSessionCookie: boolean
}): boolean {
  return input.pathname.startsWith('/dashboard') && input.hasPortalSessionCookie && !input.hasInternalSessionCookie
}
