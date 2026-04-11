import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if we should return only active timeframes or all
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('activeOnly') === 'true'

    const timeframes = await prisma.timeframe.findMany({
      where: activeOnly ? { isActive: true } : undefined,
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
    const session = await getServerSessionSafe()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can create timeframes
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { name, type, startDate, endDate } = body

    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Name, start date, and end date are required' },
        { status: 400 }
      )
    }

    // Validate timeframe type
    const validTypes = ['MONTHLY', 'QUARTERLY', 'SIX_MONTH', 'YEARLY']
    const timeframeType = type || 'QUARTERLY'
    if (!validTypes.includes(timeframeType)) {
      return NextResponse.json(
        { error: 'Invalid timeframe type. Must be MONTHLY, QUARTERLY, SIX_MONTH, or YEARLY' },
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

    // Validate dates
    const start = new Date(startDate)
    const end = new Date(endDate)
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      )
    }

    if (start >= end) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      )
    }

    const timeframe = await prisma.timeframe.create({
      data: {
        name,
        type: timeframeType,
        startDate: start,
        endDate: end,
        isActive
      }
    })

    return NextResponse.json({
      success: true,
      timeframe
    })
  } catch (error: any) {
    console.error('Error creating timeframe:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error', details: error?.code },
      { status: 500 }
    )
  }
}
