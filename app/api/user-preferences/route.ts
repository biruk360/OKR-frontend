import { NextRequest, NextResponse } from 'next/server'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pref = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
  })
  return NextResponse.json({
    success: true,
    preferences: pref || { todoViewMode: 'modal' },
  })
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSessionSafe()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const data: any = {}
  if (body.todoViewMode === 'modal' || body.todoViewMode === 'sidebar') {
    data.todoViewMode = body.todoViewMode
  }

  const pref = await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  })
  return NextResponse.json({ success: true, preferences: pref })
}
