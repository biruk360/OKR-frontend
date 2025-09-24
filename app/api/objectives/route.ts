import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreateObjectiveForm } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const level = searchParams.get('level')
    const status = searchParams.get('status')
    const ownerId = searchParams.get('ownerId')
    const departmentId = searchParams.get('departmentId')
    const timeframeId = searchParams.get('timeframeId')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    // Build where clause based on user role and filters
    let where: any = {}

    // Role-based filtering
    const isEmployee = session.user.role === 'EMPLOYEE'
    const requestingHigherLevel = level === 'COMPANY' || level === 'DEPARTMENT'
    const hasOwnerFilter = Boolean(ownerId)

    if (isEmployee && !hasOwnerFilter && !requestingHigherLevel) {
      where.ownerId = session.user.id
    } else if (session.user.role === 'DEPARTMENT_LEAD') {
      // Get user's departments
      const userDepartments = await prisma.departmentMembership.findMany({
        where: { userId: session.user.id },
        select: { departmentId: true }
      })
      const departmentIds = userDepartments.map(d => d.departmentId)
      
      where.OR = [
        { ownerId: session.user.id },
        { departmentId: { in: departmentIds } }
      ]
    }
    // ADMIN and EXECUTIVE can see all objectives

    // Apply filters
    if (level) {
      where.level = level
    }
    if (status) {
      where.status = status
    } else {
      where.status = 'ACTIVE' // Default to active objectives
    }
    if (ownerId) {
      where.ownerId = ownerId
    }
    if (departmentId) {
      where.departmentId = departmentId
    }
    if (timeframeId) {
      where.timeframeId = timeframeId
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    }

    const skip = (page - 1) * limit

    const [objectives, total] = await Promise.all([
      prisma.objective.findMany({
        where,
        include: {
          owner: {
            select: { id: true, name: true, avatar: true }
          },
          timeframe: true,
          department: {
            select: { id: true, name: true }
          },
          parentObjective: {
            select: { id: true, title: true }
          },
          _count: {
            select: { keyResults: true, childObjectives: true }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.objective.count({ where })
    ])

    return NextResponse.json({
      success: true,
      data: objectives,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching objectives:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: CreateObjectiveForm = await request.json()
    const { title, description, level, ownerId, timeframeId, departmentId, parentObjectiveId } = body
    const sanitizedDepartmentId = departmentId || null
    const sanitizedParentObjectiveId = parentObjectiveId || null
    const normalizedDescription = description?.trim() ? description.trim() : null

    // Validate required fields
    if (!title || !level || !ownerId || !timeframeId) {
      return NextResponse.json(
        { error: 'Title, level, owner, and timeframe are required' },
        { status: 400 }
      )
    }

    // Check permissions based on level
    if (level === 'COMPANY' && !['ADMIN', 'EXECUTIVE'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create company-level objectives' },
        { status: 403 }
      )
    }

    if (level === 'DEPARTMENT' && !['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create department-level objectives' },
        { status: 403 }
      )
    }

    // Validate timeframe exists
    const timeframe = await prisma.timeframe.findUnique({
      where: { id: timeframeId }
    })

    if (!timeframe) {
      return NextResponse.json(
        { error: 'Invalid timeframe' },
        { status: 400 }
      )
    }

    // Validate owner exists
    const owner = await prisma.user.findUnique({
      where: { id: ownerId }
    })

    if (!owner) {
      return NextResponse.json(
        { error: 'Invalid owner' },
        { status: 400 }
      )
    }

    // Validate parent objective if provided
    if (sanitizedParentObjectiveId) {
      const parentObjective = await prisma.objective.findUnique({
        where: { id: sanitizedParentObjectiveId }
      })

      if (!parentObjective) {
        return NextResponse.json(
          { error: 'Invalid parent objective' },
          { status: 400 }
        )
      }
    }

    // Create objective
    const objective = await prisma.objective.create({
      data: {
        title,
        description: normalizedDescription,
        level,
        ownerId,
        timeframeId,
        departmentId: sanitizedDepartmentId,
        parentObjectiveId: sanitizedParentObjectiveId,
      },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true }
        },
        timeframe: true,
        department: {
          select: { id: true, name: true }
        },
        parentObjective: {
          select: { id: true, title: true }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: objective,
      message: 'Objective created successfully'
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating objective:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
