import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export async function POST(
  request: NextRequest,
  { params }: { params: RouteIdParams }
) {
  try {
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user can create objectives
    if (!['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to clone objectives' },
        { status: 403 }
      )
    }

    const { id: objectiveId } = await resolveParams(params)
    if (!objectiveId) {
      return NextResponse.json({ error: 'Invalid objective id' }, { status: 400 })
    }
    const { title, timeframeId, includeKeyResults } = await request.json()

    // Validate required fields
    if (!title || !timeframeId) {
      return NextResponse.json(
        { error: 'Title and timeframe are required' },
        { status: 400 }
      )
    }

    // Check if original objective exists
    const originalObjective = await prisma.objective.findUnique({
      where: { id: objectiveId },
      include: {
        keyResults: {
          where: { status: 'ACTIVE' }
        },
        owner: {
          select: { id: true, name: true }
        },
        department: {
          select: { id: true, name: true }
        }
      }
    })

    if (!originalObjective) {
      return NextResponse.json(
        { error: 'Original objective not found' },
        { status: 404 }
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

    // Check if objective with same title already exists in the timeframe
    const existingObjective = await prisma.objective.findFirst({
      where: {
        title,
        timeframeId,
        status: 'ACTIVE'
      }
    })

    if (existingObjective) {
      return NextResponse.json(
        { error: 'An objective with this title already exists in the selected timeframe' },
        { status: 400 }
      )
    }

    // Create the cloned objective with key results
    const result = await prisma.$transaction(async (tx) => {
      // Create the new objective
      const clonedObjective = await tx.objective.create({
        data: {
          title,
          description: originalObjective.description,
          level: originalObjective.level,
          ownerId: originalObjective.ownerId,
          timeframeId,
          departmentId: originalObjective.departmentId,
          status: 'ACTIVE'
        },
        include: {
          owner: {
            select: { id: true, name: true, avatar: true }
          },
          timeframe: true,
          department: {
            select: { id: true, name: true }
          }
        }
      })

      // Clone key results if requested
      if (includeKeyResults && originalObjective.keyResults.length > 0) {
        const keyResultsToCreate = originalObjective.keyResults.map(kr => ({
          title: kr.title,
          description: kr.description,
          targetValue: kr.targetValue,
          currentValue: 0, // Reset progress to 0
          unit: kr.unit,
          objectiveId: clonedObjective.id,
          ownerId: kr.ownerId,
          status: 'ACTIVE'
        }))

        await tx.keyResult.createMany({
          data: keyResultsToCreate
        })
      }

      return clonedObjective
    })

    // Fetch the complete cloned objective with key results
    const completeClonedObjective = await prisma.objective.findUnique({
      where: { id: result.id },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true }
        },
        timeframe: true,
        department: {
          select: { id: true, name: true }
        },
        keyResults: {
          include: {
            owner: {
              select: { id: true, name: true, avatar: true }
            }
          }
        },
        _count: {
          select: { keyResults: true, childObjectives: true }
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Objective cloned successfully.',
      objective: completeClonedObjective
    })
  } catch (error) {
    console.error('Error cloning objective:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






