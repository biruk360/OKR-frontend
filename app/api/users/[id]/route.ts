import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export async function GET(
  request: NextRequest,
  { params }: { params: RouteIdParams }
) {
  try {
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can view user details
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: userId } = await resolveParams(params)
    if (!userId) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      user
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: RouteIdParams }
) {
  try {
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can update users
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: userId } = await resolveParams(params)
    if (!userId) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
    }
    const body = await request.json()
    const { name, email, role, isActive } = body

    // Find the user
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Validate email format if provided
    if (email && email !== existingUser.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'A valid email address is required' },
          { status: 400 }
        )
      }

      // Check if email is already taken by another user
      const emailTaken = await prisma.user.findUnique({
        where: { email },
        select: { id: true }
      })

      if (emailTaken && emailTaken.id !== userId) {
        return NextResponse.json(
          { error: 'Email address is already in use' },
          { status: 400 }
        )
      }
    }

    // Validate role if provided
    if (role) {
      const validRoles = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE']
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role. Must be ADMIN, EXECUTIVE, DEPARTMENT_LEAD, or EMPLOYEE' },
          { status: 400 }
        )
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(role && { role }),
        ...(isActive !== undefined && { isActive })
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true
      }
    })

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'User updated successfully'
    })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: RouteIdParams }
) {
  try {
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can delete users
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: userId } = await resolveParams(params)
    if (!userId) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
    }

    // Prevent deleting yourself
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 400 }
      )
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Delete related records first (manual cascade for relationships without onDelete: Cascade)
    // Order matters: delete child records before parent records
    
    // 1. Delete comments by this user
    await prisma.comment.deleteMany({
      where: { authorId: userId }
    })

    // 2. Delete todos assigned to or created by this user
    await prisma.todo.deleteMany({
      where: {
        OR: [
          { assigneeId: userId },
          { creatorId: userId }
        ]
      }
    })

    // 3. Delete key results owned by this user
    // Note: This must happen before deleting objectives to avoid FK constraint issues
    await prisma.keyResult.deleteMany({
      where: { ownerId: userId }
    })

    // 4. Delete objectives owned by this user
    // Note: Deleting objectives will cascade delete their key results (if any remain),
    // but we've already deleted key results owned by this user above
    await prisma.objective.deleteMany({
      where: { ownerId: userId }
    })

    // 5. Delete user
    // Cascade will automatically handle: departmentMemberships, managerRelationships, notifications
    await prisma.user.delete({
      where: { id: userId }
    })

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting user:', error)
    
    // Provide more specific error messages
    if (error.code === 'P2003') {
      return NextResponse.json(
        { error: 'Cannot delete user: User has related records that cannot be automatically removed' },
        { status: 400 }
      )
    }
    
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

