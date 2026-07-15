import { UserRole } from './index'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: UserRole
      avatar?: string | null
      userType?: 'INTERNAL' | 'CLIENT_PORTAL'
      clientName?: string
      projectIds?: string[]
    }
  }

  interface User {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
    role: UserRole
    avatar?: string | null
    userType?: 'INTERNAL' | 'CLIENT_PORTAL'
    clientName?: string
    projectIds?: string[]
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: UserRole
    avatar?: string | null
    userType?: 'INTERNAL' | 'CLIENT_PORTAL'
    clientName?: string
    projectIds?: string[]
  }
}
