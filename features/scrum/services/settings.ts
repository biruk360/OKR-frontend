import { prisma } from '@/lib/prisma'
import {
  SCRUM_DEFAULT_SETTINGS_ID,
  SCRUM_DEFAULT_TIMEZONE,
  SCRUM_DEFAULT_WORKING_DAYS,
} from '@/types/scrum'

export interface ScrumSettingsShape {
  id: string
  timezone: string
  reminderTime: string
  cutoffTime: string
  absentTime: string
  managerDigestTime: string
  nudgeTime: string
  weeklyDigestDay: number
  weeklyDigestTime: string
  workingDays: number[]
  holidays: string[]
  moodEnabled: boolean
  winsEnabled: boolean
  proxyEntryEnabled: boolean
  telegramEnabled: boolean
  requireTodoLink: boolean
  recurringThresholdDays: number
  escalationThresholdDays: number
  blockerEscalationDays: number
  moodAlertDays: number
  objectiveNeglectDays: number
}

export async function getScrumSettings(): Promise<ScrumSettingsShape> {
  const row = await prisma.scrumSettings.upsert({
    where: { id: SCRUM_DEFAULT_SETTINGS_ID },
    create: {
      id: SCRUM_DEFAULT_SETTINGS_ID,
      timezone: SCRUM_DEFAULT_TIMEZONE,
      reminderTime: '08:00',
      cutoffTime: '08:30',
      absentTime: '09:00',
      managerDigestTime: '09:00',
      nudgeTime: '09:05',
      weeklyDigestDay: 5,
      weeklyDigestTime: '16:00',
      workingDays: [...SCRUM_DEFAULT_WORKING_DAYS],
      holidays: [],
      moodEnabled: true,
      winsEnabled: true,
      proxyEntryEnabled: true,
      telegramEnabled: false,
      requireTodoLink: false,
      recurringThresholdDays: 2,
      escalationThresholdDays: 3,
      blockerEscalationDays: 2,
      moodAlertDays: 10,
      objectiveNeglectDays: 14,
    },
    update: {},
  })
  return normalizeSettings(row)
}

export function normalizeSettings(row: any): ScrumSettingsShape {
  return {
    id: row.id ?? SCRUM_DEFAULT_SETTINGS_ID,
    timezone: row.timezone || SCRUM_DEFAULT_TIMEZONE,
    reminderTime: row.reminderTime || '08:00',
    cutoffTime: row.cutoffTime || '08:30',
    absentTime: row.absentTime || '09:00',
    managerDigestTime: row.managerDigestTime || '09:00',
    nudgeTime: row.nudgeTime || '09:05',
    weeklyDigestDay: row.weeklyDigestDay ?? 5,
    weeklyDigestTime: row.weeklyDigestTime || '16:00',
    workingDays: row.workingDays?.length ? row.workingDays : [...SCRUM_DEFAULT_WORKING_DAYS],
    holidays: row.holidays ?? [],
    moodEnabled: row.moodEnabled !== false,
    winsEnabled: row.winsEnabled !== false,
    proxyEntryEnabled: row.proxyEntryEnabled !== false,
    telegramEnabled: row.telegramEnabled === true,
    requireTodoLink: row.requireTodoLink === true,
    recurringThresholdDays: row.recurringThresholdDays ?? 2,
    escalationThresholdDays: row.escalationThresholdDays ?? 3,
    blockerEscalationDays: row.blockerEscalationDays ?? 2,
    moodAlertDays: row.moodAlertDays ?? 10,
    objectiveNeglectDays: row.objectiveNeglectDays ?? 14,
  }
}
