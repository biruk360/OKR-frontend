import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const objectiveId = params.id

    // Get the parent objective first to verify it exists
    const parentObjective = await prisma.objective.findUnique({
      where: { id: objectiveId },
      select: { id: true, title: true, level: true }
    })

    if (!parentObjective) {
      return NextResponse.json(
        { error: 'Parent objective not found' },
        { status: 404 }
      )
    }

    // Get all child objectives
    const childObjectives = await prisma.objective.findMany({
      where: {
        parentObjectiveId: objectiveId,
        status: 'ACTIVE'
      },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true }
        },
        timeframe: true,
        department: {
          select: { id: true, name: true }
        },
        _count: {
          select: { keyResults: true, childObjectives: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })

    return NextResponse.json({
      success: true,
      data: {
        parentObjective,
        childObjectives
      }
    })
  } catch (error) {
    console.error('Error fetching child objectives:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

