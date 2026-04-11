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

    const { id: objectiveId } = await resolveParams(params)
    if (!objectiveId) {
      return NextResponse.json({ error: 'Invalid objective id' }, { status: 400 })
    }

    const body = await request.json()
    const { labelId } = body

    if (!labelId) {
      return NextResponse.json(
        { error: 'Label ID is required' },
        { status: 400 }
      )
    }

    // Check if objective exists and user has permission
    const objective = await prisma.objective.findUnique({
      where: { id: objectiveId }
    })

    if (!objective) {
      return NextResponse.json(
        { error: 'Objective not found' },
        { status: 404 }
      )
    }

    // Check if label exists
    const label = await prisma.label.findUnique({
      where: { id: labelId }
    })

    if (!label) {
      return NextResponse.json(
        { error: 'Label not found' },
        { status: 404 }
      )
    }

    // Add label to objective
    const objectiveLabel = await prisma.objectiveLabel.create({
      data: {
        objectiveId,
        labelId: labelId
      },
      include: {
        label: true
      }
    })

    return NextResponse.json({
      success: true,
      data: objectiveLabel
    })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Label already assigned to this objective' },
        { status: 409 }
      )
    }
    console.error('Error adding label to objective:', error)
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

    const { id: objectiveId } = await resolveParams(params)
    if (!objectiveId) {
      return NextResponse.json({ error: 'Invalid objective id' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const labelId = searchParams.get('labelId')

    if (!labelId) {
      return NextResponse.json(
        { error: 'Label ID is required' },
        { status: 400 }
      )
    }

    await prisma.objectiveLabel.delete({
      where: {
        objectiveId_labelId: {
          objectiveId,
          labelId: labelId
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Label removed from objective'
    })
  } catch (error) {
    console.error('Error removing label from objective:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

