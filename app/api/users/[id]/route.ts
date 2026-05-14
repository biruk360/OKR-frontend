import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiConflict,
  withRole,
} from '@/lib/api'

export const GET = withRole<RouteIdParams>('ADMIN', async (_request, { params }) => {
  const { id: userId } = await resolveParams(params)
  if (!userId) return apiBadRequest('Invalid user id')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
  })

  if (!user) return apiNotFound('User not found')
  return apiSuccess(user)
})

export const PATCH = withRole<RouteIdParams>('ADMIN', async (request: NextRequest, { params }) => {
  const { id: userId } = await resolveParams(params)
  if (!userId) return apiBadRequest('Invalid user id')

  const body = await request.json()
  const { name, email, role, isActive, designation } = body

  const existingUser = await prisma.user.findUnique({ where: { id: userId } })
  if (!existingUser) return apiNotFound('User not found')

  if (email && email !== existingUser.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return apiBadRequest('A valid email address is required')
    }

    const emailTaken = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (emailTaken && emailTaken.id !== userId) {
      return apiConflict('Email address is already in use')
    }
  }

  if (role) {
    const validRoles = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE']
    if (!validRoles.includes(role)) {
      return apiBadRequest('Invalid role. Must be ADMIN, EXECUTIVE, DEPARTMENT_LEAD, or EMPLOYEE')
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name && { name }),
      ...(email && { email }),
      ...(role && { role }),
      ...(isActive !== undefined && { isActive }),
      designation: designation !== undefined ? (designation?.trim() || null) : undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
  })

  return apiSuccess(updatedUser, { message: 'User updated successfully' })
})

export const DELETE = withRole<RouteIdParams>('ADMIN', async (_request, { session, params }) => {
  const { id: userId } = await resolveParams(params)
  if (!userId) return apiBadRequest('Invalid user id')

  if (userId === session.user.id) {
    return apiBadRequest('You cannot delete your own account')
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return apiNotFound('User not found')

  // Manual cascade — delete relations whose User FK defaults to RESTRICT.
  // Wrapped in a transaction so a missed relation surfaces as one rollback
  // instead of half-deleting the user. If a new model gets a non-cascading
  // User FK, add it here (and watch for `Foreign key constraint violated` in
  // the response error).
  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { authorId: userId } }),
    prisma.todo.deleteMany({
      where: { OR: [{ assigneeId: userId }, { creatorId: userId }] },
    }),
    prisma.sprintActivity.deleteMany({ where: { ownerId: userId } }),
    prisma.sprint.deleteMany({ where: { ownerId: userId } }),
    prisma.risk.deleteMany({ where: { reporterId: userId } }),
    prisma.keyResult.deleteMany({ where: { ownerId: userId } }),
    prisma.objective.deleteMany({ where: { ownerId: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ])

  return apiSuccess(null, { message: 'User deleted successfully' })
})
