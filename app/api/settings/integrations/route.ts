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

    const [emailApiKey, slackWebhookUrl, slackApiKey] = await Promise.all([
      prisma.systemSettings.findUnique({ where: { key: 'integration_emailApiKey' } }),
      prisma.systemSettings.findUnique({ where: { key: 'integration_slackWebhookUrl' } }),
      prisma.systemSettings.findUnique({ where: { key: 'integration_slackApiKey' } })
    ])

    return NextResponse.json({
      success: true,
      data: {
        emailApiKey: emailApiKey?.value || '',
        slackWebhookUrl: slackWebhookUrl?.value || '',
        slackApiKey: slackApiKey?.value || ''
      }
    })
  } catch (error) {
    console.error('Error fetching integration settings:', error)
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
    const { emailApiKey, slackWebhookUrl, slackApiKey } = body

    await Promise.all([
      emailApiKey && prisma.systemSettings.upsert({
        where: { key: 'integration_emailApiKey' },
        update: { value: emailApiKey },
        create: { key: 'integration_emailApiKey', value: emailApiKey }
      }),
      slackWebhookUrl && prisma.systemSettings.upsert({
        where: { key: 'integration_slackWebhookUrl' },
        update: { value: slackWebhookUrl },
        create: { key: 'integration_slackWebhookUrl', value: slackWebhookUrl }
      }),
      slackApiKey && prisma.systemSettings.upsert({
        where: { key: 'integration_slackApiKey' },
        update: { value: slackApiKey },
        create: { key: 'integration_slackApiKey', value: slackApiKey }
      })
    ].filter(Boolean))

    return NextResponse.json({
      success: true,
      message: 'Integration settings updated successfully'
    })
  } catch (error) {
    console.error('Error updating integration settings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

