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

    const { id } = await resolveParams(params)
    if (!id) {
      return NextResponse.json({ error: 'Invalid department id' }, { status: 400 })
    }

    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true }
            }
          }
        },
        _count: {
          select: { memberships: true, objectives: true }
        }
      }
    })

    if (!department) {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: department
    })
  } catch (error) {
    console.error('Error fetching department:', error)
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

    // Only admins and executives can update departments
    if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await resolveParams(params)
    if (!id) {
      return NextResponse.json({ error: 'Invalid department id' }, { status: 400 })
    }

    const body = await request.json()
    const { name, description, isActive } = body

    const department = await prisma.department.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(isActive !== undefined && { isActive })
      }
    })

    return NextResponse.json({
      success: true,
      data: department
    })
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      )
    }
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Department with this name already exists' },
        { status: 409 }
      )
    }
    console.error('Error updating department:', error)
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

    // Only admins and executives can delete departments
    if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await resolveParams(params)
    if (!id) {
      return NextResponse.json({ error: 'Invalid department id' }, { status: 400 })
    }

    // Check if department has members or objectives
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: { memberships: true, objectives: true }
        }
      }
    })

    if (!department) {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      )
    }

    // Soft delete by setting isActive to false if there are members or objectives
    if (department._count.memberships > 0 || department._count.objectives > 0) {
      await prisma.department.update({
        where: { id },
        data: { isActive: false }
      })
    } else {
      // Hard delete if no members or objectives
      await prisma.department.delete({
        where: { id }
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Department deleted successfully'
    })
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      )
    }
    console.error('Error deleting department:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

