import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@/types'
import { apiSuccess, apiBadRequest, apiConflict, handleApiError } from '@/lib/api'

/** Public endpoint — intentionally does not use withAuth. */
export async function POST(request: NextRequest) {
  try {
    const { name, email, password, role } = await request.json()

    if (!name || !email || !password) {
      return apiBadRequest('Name, email, and password are required')
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return apiConflict('User with this email already exists')
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: (role as UserRole) || 'EMPLOYEE',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    })

    return apiSuccess(user, { status: 201, message: 'User created successfully' })
  } catch (error) {
    return handleApiError(error, 'POST /api/auth/register')
  }
}
