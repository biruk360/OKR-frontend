/**
 * Idempotent default settings seed for Daily Scrum.
 *
 * Run after `prisma db push` and `prisma generate`:
 * `npm run db:seed:scrum-settings`
 */

import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { prisma } from '../lib/prisma'
import {
  SCRUM_DEFAULT_SETTINGS_ID,
  SCRUM_DEFAULT_TIMEZONE,
  SCRUM_DEFAULT_WORKING_DAYS,
} from '../types/scrum'

interface KenatHoliday {
  gregorian?: { year: number; month: number; day: number }
}

interface KenatModule {
  default: new () => { getEthiopian(): { year: number } }
  HolidayTags: { PUBLIC: string }
  getHolidaysForYear: (year: number, options?: { filter?: string }) => unknown[]
}

async function loadKenat(): Promise<KenatModule> {
  const entrypoint = pathToFileURL(path.join(process.cwd(), 'node_modules/kenat/src/index.js')).href
  return import(entrypoint) as Promise<KenatModule>
}

function dateKey(gregorian: { year: number; month: number; day: number }): string {
  const month = String(gregorian.month).padStart(2, '0')
  const day = String(gregorian.day).padStart(2, '0')
  return `${gregorian.year}-${month}-${day}`
}

async function defaultEthiopianPublicHolidays(): Promise<string[]> {
  const { default: Kenat, HolidayTags, getHolidaysForYear } = await loadKenat()
  const today = new Kenat()
  const currentYear = today.getEthiopian().year
  const years = [currentYear, currentYear + 1]
  const holidays = new Set<string>()

  for (const year of years) {
    const rows = getHolidaysForYear(year, { filter: HolidayTags.PUBLIC }) as KenatHoliday[]
    for (const row of rows) {
      if (row.gregorian) holidays.add(dateKey(row.gregorian))
    }
  }

  return [...holidays].sort()
}

async function main(): Promise<void> {
  const holidays = await defaultEthiopianPublicHolidays()
  await prisma.scrumSettings.upsert({
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
      holidays,
      moodEnabled: true,
      winsEnabled: true,
      proxyEntryEnabled: true,
      telegramEnabled: false,
      requireTodoLink: false,
      recurringThresholdDays: 2,
      escalationThresholdDays: 3,
    },
    update: {},
  })

  console.log(`[scrum-settings] Seeded ${SCRUM_DEFAULT_SETTINGS_ID} settings row with ${holidays.length} public holidays`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
