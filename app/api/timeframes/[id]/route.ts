import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can manage timeframes
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = params
    const body = await request.json()
    const { name, startDate, endDate, isActive } = body

    // If activating a timeframe, deactivate all others
    if (isActive === true) {
      await prisma.timeframe.updateMany({
        where: { isActive: true },
        data: { isActive: false }
      })
    }

    const timeframe = await prisma.timeframe.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(isActive !== undefined && { isActive })
      }
    })

    return NextResponse.json({
      success: true,
      timeframe
    })
  } catch (error) {
    console.error('Error updating timeframe:', error)
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

    // Only admins can manage timeframes
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = params

    // Check if timeframe has objectives
    const objectivesCount = await prisma.objective.count({
      where: { timeframeId: id }
    })

    if (objectivesCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete timeframe with existing objectives' },
        { status: 400 }
      )
    }

    await prisma.timeframe.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      message: 'Timeframe deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting timeframe:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






