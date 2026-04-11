import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreateObjectiveForm } from '@/types'
import { canCreateObjective, canViewObjective, redactObjective } from '@/lib/permissions'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { recordActivity } from '@/lib/activity-log'
import { normalizeCadence } from '@/lib/check-in-cadence'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSessionSafe()
    
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
      // Postgres supports case-insensitive search via mode: 'insensitive'
      const searchConditions = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
      
      // If there's already an OR condition (from role-based filtering), combine it properly
      if (where.OR && Array.isArray(where.OR)) {
        // Combine existing OR with search OR using AND
        const existingConditions = { OR: where.OR }
        where.AND = [
          existingConditions,
          { OR: searchConditions }
        ]
        delete where.OR
      } else {
        // No existing OR, just add search OR
        where.OR = searchConditions
      }
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
            select: { id: true, title: true, level: true }
          },
          objectiveLabels: {
            include: {
              label: true
            }
          },
          childObjectives: {
            where: { status: 'ACTIVE' },
            include: {
              owner: {
                select: { id: true, name: true, avatar: true }
              },
              department: {
                select: { id: true, name: true }
              },
              _count: {
                select: { keyResults: true, childObjectives: true }
              }
            },
            orderBy: { level: 'asc' }
          },
          keyResults: {
            orderBy: { createdAt: 'asc' },
            include: {
              owner: {
                select: { id: true, name: true, avatar: true }
              },
              objective: {
                select: { id: true, ownerId: true }
              }
            }
          },
          _count: {
            select: { keyResults: true, childObjectives: true }
          }
        },
        orderBy: [
          { level: 'asc' }, // COMPANY first, then DEPARTMENT, then INDIVIDUAL
          { updatedAt: 'desc' }
        ],
        skip,
        take: limit
      }),
      prisma.objective.count({ where })
    ])

    // Apply visibility filtering - redact private objectives for users who shouldn't see full details
    const processedObjectives = await Promise.all(
      objectives.map(async (objective: any) => {
        try {
          const visibility = await canViewObjective(
            session.user.role as any,
            session.user.id,
            {
              level: objective.level,
              ownerId: objective.ownerId,
              departmentId: objective.departmentId,
              isPrivate: objective.isPrivate || false
            }
          )

          if (!visibility.canView) {
            return null // Filter out objectives user can't view
          }

          if (visibility.isRedacted) {
            return redactObjective(objective)
          }

          return objective
        } catch (error) {
          console.error('Error processing objective visibility:', error)
          return objective // Return as-is if visibility check fails
        }
      })
    )

    // Filter out null values (objectives user can't view)
    const filteredObjectives = processedObjectives.filter(obj => obj !== null)

    return NextResponse.json({
      success: true,
      data: filteredObjectives,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    console.error('Error fetching objectives:', error)
    console.error('Error stack:', error.stack)
    return NextResponse.json(
      { 
        error: error.message || 'Internal server error',
        details: error.toString(),
        code: error.code
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: CreateObjectiveForm = await request.json()
    const {
      title,
      description,
      level,
      ownerId,
      timeframeId,
      departmentId,
      parentObjectiveId,
      isPrivate,
      goalStatus,
      startDate,
      endDate,
      alignmentType: rawAlign,
      rollupCalculation: rawRollup,
      checkInCadence: rawCadence,
    } = body as CreateObjectiveForm & { checkInCadence?: string }
    const checkInCadence = normalizeCadence(rawCadence)
    const sanitizedDepartmentId = departmentId || null
    const sanitizedParentObjectiveId = parentObjectiveId || null
    const normalizedDescription = description?.trim() ? description.trim() : null
    
    // Ensure isPrivate is a boolean
    const normalizedIsPrivate = typeof isPrivate === 'boolean' ? isPrivate : isPrivate === 'true' || isPrivate === true

    let alignmentType = rawAlign === 'STRICT_DEPENDENCY' ? 'STRICT_DEPENDENCY' : 'LOOSE'
    let rollupCalculation: 'NONE' | 'AVERAGE' | 'SUM' = 'NONE'
    if (rawRollup === 'AVERAGE' || rawRollup === 'SUM') rollupCalculation = rawRollup
    if (alignmentType === 'LOOSE') rollupCalculation = 'NONE'

    // Validate required fields
    if (!title || !level || !ownerId || !timeframeId) {
      return NextResponse.json(
        { error: 'Title, level, owner, and timeframe are required' },
        { status: 400 }
      )
    }

    // Check permissions using permission utility
    if (!canCreateObjective(session.user.role as any, level as any)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create objectives at this level' },
        { status: 403 }
      )
    }

    // Additional check: DEPARTMENT_LEAD can only create objectives for their department or direct reports
    if (level === 'DEPARTMENT' && session.user.role === 'DEPARTMENT_LEAD' && departmentId) {
      const userDepartments = await prisma.departmentMembership.findMany({
        where: { userId: session.user.id },
        select: { departmentId: true }
      })
      const departmentIds = userDepartments.map(d => d.departmentId)
      if (!departmentIds.includes(departmentId)) {
        return NextResponse.json(
          { error: 'You can only create objectives for your own department' },
          { status: 403 }
        )
      }
    }

    // Additional check: DEPARTMENT_LEAD can create individual objectives for their direct reports
    if (level === 'INDIVIDUAL' && session.user.role === 'DEPARTMENT_LEAD' && ownerId !== session.user.id) {
      const isDirectReport = await prisma.managerRelationship.findFirst({
        where: {
          managerId: session.user.id,
          directReportId: ownerId,
          endedAt: null
        }
      })
      if (!isDirectReport) {
        return NextResponse.json(
          { error: 'You can only create objectives for yourself or your direct reports' },
          { status: 403 }
        )
      }
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

    // Validate parent objective if provided (same cycle, timeframe, active)
    if (sanitizedParentObjectiveId) {
      const parentObjective = await prisma.objective.findUnique({
        where: { id: sanitizedParentObjectiveId },
      })

      if (!parentObjective) {
        return NextResponse.json(
          { error: 'Invalid parent objective' },
          { status: 400 }
        )
      }
      if (parentObjective.status !== 'ACTIVE') {
        return NextResponse.json(
          { error: 'Parent objective must be active (not archived)' },
          { status: 400 }
        )
      }
      if (parentObjective.timeframeId !== timeframeId) {
        return NextResponse.json(
          { error: 'Parent objective must be in the same timeframe' },
          { status: 400 }
        )
      }
    }

    // Parse dates safely
    let parsedStartDate: Date | null = null
    let parsedEndDate: Date | null = null
    
    if (startDate) {
      try {
        parsedStartDate = new Date(startDate)
        if (isNaN(parsedStartDate.getTime())) {
          parsedStartDate = null
        }
      } catch (e) {
        parsedStartDate = null
      }
    }
    
    if (endDate) {
      try {
        parsedEndDate = new Date(endDate)
        if (isNaN(parsedEndDate.getTime())) {
          parsedEndDate = null
        }
      } catch (e) {
        parsedEndDate = null
      }
    }

    const objective = await prisma.$transaction(async (tx) => {
      const created = await tx.objective.create({
        data: {
          title,
          description: normalizedDescription,
          level,
          ownerId,
          timeframeId,
          departmentId: sanitizedDepartmentId,
          parentObjectiveId: sanitizedParentObjectiveId,
          alignmentType,
          rollupCalculation,
          checkInCadence,
          isPrivate: normalizedIsPrivate,
          goalStatus: goalStatus || 'ON_TRACK',
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        },
        include: {
          owner: {
            select: { id: true, name: true, avatar: true },
          },
          timeframe: true,
          department: {
            select: { id: true, name: true },
          },
          parentObjective: {
            select: { id: true, title: true },
          },
        },
      })
      await recalcNodeAndAncestors(tx, created.id)
      return created
    })

    await recordActivity({
      entityType: 'OBJECTIVE',
      objectiveId: objective.id,
      action: 'CREATED',
      actorId: session.user.id,
      metadata: { title: objective.title, level: objective.level },
    })

    return NextResponse.json({
      success: true,
      data: objective,
      message: 'Objective created successfully'
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating objective:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error', details: error.toString(), code: error.code },
      { status: 500 }
    )
  }
}
