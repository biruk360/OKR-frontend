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

    // Get OKR rules settings
    const settings = await prisma.systemSettings.findMany({
      where: {
        key: {
          startsWith: 'okr_rules_'
        }
      }
    })

    const rules: any = {
      defaultVisibility: 'PUBLIC',
      gradingScale: 'PERCENTAGE',
      checkInCadence: 'WEEKLY',
      reminderEnabled: true,
      reminderDays: 7
    }

    settings.forEach(setting => {
      const key = setting.key.replace('okr_rules_', '')
      if (key === 'reminderEnabled') {
        rules[key] = setting.value === 'true'
      } else if (key === 'reminderDays') {
        rules[key] = parseInt(setting.value)
      } else {
        rules[key] = setting.value
      }
    })

    return NextResponse.json({
      success: true,
      data: rules
    })
  } catch (error) {
    console.error('Error fetching OKR rules:', error)
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
    const { defaultVisibility, gradingScale, checkInCadence, reminderEnabled, reminderDays } = body

    // Save settings
    await Promise.all([
      prisma.systemSettings.upsert({
        where: { key: 'okr_rules_defaultVisibility' },
        update: { value: defaultVisibility || 'PUBLIC' },
        create: { key: 'okr_rules_defaultVisibility', value: defaultVisibility || 'PUBLIC' }
      }),
      prisma.systemSettings.upsert({
        where: { key: 'okr_rules_gradingScale' },
        update: { value: gradingScale || 'PERCENTAGE' },
        create: { key: 'okr_rules_gradingScale', value: gradingScale || 'PERCENTAGE' }
      }),
      prisma.systemSettings.upsert({
        where: { key: 'okr_rules_checkInCadence' },
        update: { value: checkInCadence || 'WEEKLY' },
        create: { key: 'okr_rules_checkInCadence', value: checkInCadence || 'WEEKLY' }
      }),
      prisma.systemSettings.upsert({
        where: { key: 'okr_rules_reminderEnabled' },
        update: { value: reminderEnabled ? 'true' : 'false' },
        create: { key: 'okr_rules_reminderEnabled', value: reminderEnabled ? 'true' : 'false' }
      }),
      prisma.systemSettings.upsert({
        where: { key: 'okr_rules_reminderDays' },
        update: { value: String(reminderDays || 7) },
        create: { key: 'okr_rules_reminderDays', value: String(reminderDays || 7) }
      })
    ])

    return NextResponse.json({
      success: true,
      message: 'OKR rules updated successfully'
    })
  } catch (error) {
    console.error('Error updating OKR rules:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

