import { getServerSession, NextAuthOptions } from 'next-auth'
import type { Session } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import { UserRole } from '@/types'

/**
 * JWT signing secret. In production you must set NEXTAUTH_SECRET (e.g. openssl rand -base64 32).
 * A dev-only fallback avoids opaque 500s when .env.local is missing locally.
 */
const nextAuthSecret =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production'
    ? 'local-dev-nextauth-secret-not-for-production'
    : undefined)

if (process.env.NODE_ENV === 'production' && !process.env.NEXTAUTH_SECRET) {
  console.error(
    '[auth] NEXTAUTH_SECRET is not set. Sessions may fail; set NEXTAUTH_SECRET in your environment.'
  )
}

export const authOptions: NextAuthOptions = {
  secret: nextAuthSecret,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          }
        })

        if (!user || !user.isActive) {
          return null
        }

        // Check if user has a password (for demo, we'll allow empty passwords)
        if (user.password) {
          const isPasswordValid = await bcrypt.compare(credentials.password, user.password)
          if (!isPasswordValid) {
            return null
          }
        } else {
          // For demo purposes, allow login with any password if no password is set
          // In production, you should always require a password
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
          avatar: user.avatar
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 4 * 60 * 60, // 4 hours — matches client-side idle timeout
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.avatar = user.avatar
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!
        session.user.role = token.role as UserRole
        session.user.avatar = token.avatar as string
      }
      return session
    }
  },
  pages: {
    signIn: '/auth/signin',
  }
}

/**
 * next-auth's getServerSession() throws on some bad session responses (see next-auth RSC path).
 * That surfaces as HTTP 500 for the whole route. This wrapper returns null instead.
 */
export async function getServerSessionSafe(): Promise<Session | null> {
  try {
    return await getServerSession(authOptions)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[auth] getServerSession failed:', msg)
    return null
  }
}
