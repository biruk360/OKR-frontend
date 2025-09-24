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

    // Get user's departments
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      include: {
        department: {
          select: { id: true, name: true }
        }
      }
    })

    const departments = userDepartments.map(membership => membership.department)

    return NextResponse.json({
      success: true,
      data: departments
    })
  } catch (error) {
    console.error('Error fetching user departments:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






