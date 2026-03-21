import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessSettings } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canAccessSettings(session.user.role as any)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const [workspaceName, logoUrl] = await Promise.all([
      prisma.systemSettings.findUnique({ where: { key: 'branding_workspaceName' } }),
      prisma.systemSettings.findUnique({ where: { key: 'branding_logoUrl' } })
    ])

    return NextResponse.json({
      success: true,
      data: {
        workspaceName: workspaceName?.value || 'OKR System',
        logoUrl: logoUrl?.value || ''
      }
    })
  } catch (error) {
    console.error('Error fetching branding settings:', error)
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

    if (!canAccessSettings(session.user.role as any)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { workspaceName, logoUrl } = body

    if (!workspaceName) {
      return NextResponse.json(
        { error: 'Workspace name is required' },
        { status: 400 }
      )
    }

    await Promise.all([
      prisma.systemSettings.upsert({
        where: { key: 'branding_workspaceName' },
        update: { value: workspaceName },
        create: { key: 'branding_workspaceName', value: workspaceName }
      }),
      prisma.systemSettings.upsert({
        where: { key: 'branding_logoUrl' },
        update: { value: logoUrl || '' },
        create: { key: 'branding_logoUrl', value: logoUrl || '' }
      })
    ])

    return NextResponse.json({
      success: true,
      message: 'Branding settings updated successfully'
    })
  } catch (error) {
    console.error('Error updating branding settings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

