import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const timeframes = await prisma.timeframe.findMany({
      where: { isActive: true },
      orderBy: { startDate: 'desc' }
    })

    return NextResponse.json({
      success: true,
      data: timeframes
    })
  } catch (error) {
    console.error('Error fetching timeframes:', error)
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

    // Only admins can create timeframes
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { name, startDate, endDate } = body

    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Name, start date, and end date are required' },
        { status: 400 }
      )
    }

    // Check if timeframe name already exists
    const existingTimeframe = await prisma.timeframe.findUnique({
      where: { name }
    })

    if (existingTimeframe) {
      return NextResponse.json(
        { error: 'Timeframe with this name already exists' },
        { status: 400 }
      )
    }

    // If this is the first timeframe, make it active
    const timeframesCount = await prisma.timeframe.count()
    const isActive = timeframesCount === 0

    // If activating this timeframe, deactivate all others
    if (isActive) {
      await prisma.timeframe.updateMany({
        where: { isActive: true },
        data: { isActive: false }
      })
    }

    const timeframe = await prisma.timeframe.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive
      }
    })

    return NextResponse.json({
      success: true,
      timeframe
    })
  } catch (error) {
    console.error('Error creating timeframe:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
