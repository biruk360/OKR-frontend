import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessSettings } from '@/lib/permissions'
import { apiSuccess, apiForbidden, withAuth } from '@/lib/api'

export const GET = withAuth(async (_request, { session }) => {
  if (!canAccessSettings(session.user.role as any)) {
    return apiForbidden('Insufficient permissions')
  }

  const settings = await prisma.systemSettings.findMany({
    where: { key: { startsWith: 'okr_rules_' } },
  })

  const rules: any = {
    defaultVisibility: 'PUBLIC',
    gradingScale: 'PERCENTAGE',
    checkInCadence: 'WEEKLY',
    reminderEnabled: true,
    reminderDays: 7,
  }

  settings.forEach((setting) => {
    const key = setting.key.replace('okr_rules_', '')
    if (key === 'reminderEnabled') {
      rules[key] = setting.value === 'true'
    } else if (key === 'reminderDays') {
      rules[key] = parseInt(setting.value)
    } else {
      rules[key] = setting.value
    }
  })

  return apiSuccess(rules)
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  if (!canAccessSettings(session.user.role as any)) {
    return apiForbidden('Insufficient permissions')
  }

  const body = await request.json()
  const { defaultVisibility, gradingScale, checkInCadence, reminderEnabled, reminderDays } = body

  await Promise.all([
    prisma.systemSettings.upsert({
      where: { key: 'okr_rules_defaultVisibility' },
      update: { value: defaultVisibility || 'PUBLIC' },
      create: { key: 'okr_rules_defaultVisibility', value: defaultVisibility || 'PUBLIC' },
    }),
    prisma.systemSettings.upsert({
      where: { key: 'okr_rules_gradingScale' },
      update: { value: gradingScale || 'PERCENTAGE' },
      create: { key: 'okr_rules_gradingScale', value: gradingScale || 'PERCENTAGE' },
    }),
    prisma.systemSettings.upsert({
      where: { key: 'okr_rules_checkInCadence' },
      update: { value: checkInCadence || 'WEEKLY' },
      create: { key: 'okr_rules_checkInCadence', value: checkInCadence || 'WEEKLY' },
    }),
    prisma.systemSettings.upsert({
      where: { key: 'okr_rules_reminderEnabled' },
      update: { value: reminderEnabled ? 'true' : 'false' },
      create: { key: 'okr_rules_reminderEnabled', value: reminderEnabled ? 'true' : 'false' },
    }),
    prisma.systemSettings.upsert({
      where: { key: 'okr_rules_reminderDays' },
      update: { value: String(reminderDays || 7) },
      create: { key: 'okr_rules_reminderDays', value: String(reminderDays || 7) },
    }),
  ])

  return apiSuccess(null, { message: 'OKR rules updated successfully' })
})
