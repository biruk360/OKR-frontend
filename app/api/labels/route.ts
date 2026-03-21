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

    const labels = await prisma.label.findMany({
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({
      success: true,
      data: labels
    })
  } catch (error: any) {
    console.error('Error fetching labels:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error', details: error.toString() },
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

    // Only admins can create labels
    if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, color, description } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Label name is required' },
        { status: 400 }
      )
    }

    const label = await prisma.label.create({
      data: {
        name,
        color: color || '#3B82F6',
        description: description || null
      }
    })

    return NextResponse.json({
      success: true,
      data: label
    }, { status: 201 })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Label with this name already exists' },
        { status: 409 }
      )
    }
    console.error('Error creating label:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

