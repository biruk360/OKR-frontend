import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      where: { id: params.id }
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
        objectiveId: params.id,
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
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
          objectiveId: params.id,
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

