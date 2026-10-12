#!/usr/bin/env -S npx tsx
/**
 * LOCAL rehearsal fixture for scripts/close-fy2526-okrs.ts (I1).
 *
 * Creates, idempotently, on a LOCAL database only:
 *   - timeframe "FY Aug 2025 – Jul 30, 2026" (YEARLY, 2025-08-01 .. 2026-07-30)
 *   - fixture users for the FY26/27 people (<first>.<last>.fixture@example.test)
 *   - the 9 objectives + 41 KRs of the "FY25-26 Carry-Forward" sheet, with explicit ids
 *     'cfx' + padding + code.toLowerCase() so that upper(right(id, 6)) equals the sheet's system ID,
 *     ACTIVE / OPEN, progress roughly matching the final score.
 *   - one open objective + KR in that timeframe that the sheet does NOT list (ids 'cfxother…'),
 *     to exercise the "other open OKRs" report and --include-others.
 *   - OrganizationSettings.companyCeoUserId → the Biruk fixture user, only when it is unset.
 *
 * Re-running leaves existing rows untouched (so a closed fixture stays closed). `--reset` deletes the
 * fixture objectives (KRs, retrospectives and activity rows cascade) and recreates them OPEN.
 *
 * Refuses to run unless DATABASE_URL points at localhost / 127.0.0.1.
 *
 * Usage: npx tsx scripts/dev/seed-fy2526-fixture.ts [--workbook <path>] [--reset]
 */

import * as fs from 'fs'
import { PrismaClient } from '@prisma/client'
import { readCarryForwardWorkbook, resolveWorkbookPath, statusToConfidence, type CarryForwardRow } from '../close-fy2526-okrs'

export const FIXTURE_TIMEFRAME = {
  name: 'FY Aug 2025 – Jul 30, 2026',
  type: 'YEARLY',
  startDate: new Date('2025-08-01T00:00:00.000Z'),
  endDate: new Date('2026-07-30T00:00:00.000Z'),
}

const FIXTURE_USERS = [
  { key: 'BIRUK', name: 'Biruk Hailu', email: 'biruk.hailu.fixture@example.test', role: 'EXECUTIVE', designation: 'CEO' },
  { key: 'BETTY', name: 'Bethlehem Tadesse', email: 'bethlehem.tadesse.fixture@example.test', role: 'DEPARTMENT_LEAD', designation: 'Finance Lead' },
  { key: 'EDEN', name: 'Eden Tsega', email: 'eden.tsega.fixture@example.test', role: 'DEPARTMENT_LEAD', designation: 'Business Development Lead' },
  { key: 'EYOEL', name: 'Eyoel Haile', email: 'eyoel.haile.fixture@example.test', role: 'DEPARTMENT_LEAD', designation: 'Engineering Lead' },
  { key: 'MEKLIT', name: 'Meklit Gobeze', email: 'meklit.gobeze.fixture@example.test', role: 'DEPARTMENT_LEAD', designation: 'Operations Lead' },
  { key: 'YARED', name: 'Yared Bekele', email: 'yared.bekele.fixture@example.test', role: 'DEPARTMENT_LEAD', designation: 'Sales & Marketing Lead' },
  { key: 'YOHANNES_G', name: 'Yohannes Getachew', email: 'yohannes.getachew.fixture@example.test', role: 'DEPARTMENT_LEAD', designation: 'Partnerships Lead' },
  { key: 'YOHANNES_T', name: 'Yohannes Taye', email: 'yohannes.taye.fixture@example.test', role: 'EMPLOYEE', designation: 'Mobile & Banking Lead' },
  { key: 'MUKUKEN', name: 'Mukuken Alemu', email: 'mukuken.alemu.fixture@example.test', role: 'EMPLOYEE', designation: 'ERP & Business Automation Lead' },
] as const

/** FY25/26 owner initials → fixture user. YT matches Yohannes Taye's initials; UU (unassigned) → Biruk. */
const OWNER_BY_INITIALS: Record<string, (typeof FIXTURE_USERS)[number]['key']> = {
  BH: 'BIRUK',
  MG: 'MEKLIT',
  EH: 'EYOEL',
  YT: 'YOHANNES_T',
  UU: 'BIRUK',
}

/**
 * A few rows get a progress that deliberately diverges from the final score by more than 0.15,
 * so the rehearsal exercises the grade-rationale path of the close.
 */
const PROGRESS_OVERRIDES: Record<string, number> = {
  '7Q8JBJ': 55, // scored 75% — "the A-Player standard was never written"
  MEJSDS: 80, // scored 100% — "calculation unverified"
}

export function fixtureId(type: 'OBJECTIVE' | 'KEY_RESULT', code: string): string {
  const prefix = `cfx${type === 'OBJECTIVE' ? 'o' : 'k'}`
  return `${prefix}${'0'.repeat(25 - prefix.length - code.length)}${code.toLowerCase()}`
}

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    host = ''
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    console.error(`Refusing to run: DATABASE_URL host is "${host || 'unparseable'}", not localhost. This fixture is for LOCAL rehearsal only.`)
    process.exit(1)
  }
}

async function main() {
  // tsx does not load .env; PrismaClient falls back to ./.env when DATABASE_URL is unset. Resolve the
  // same URL here so the localhost guard checks the database Prisma will actually use.
  if (!process.env.DATABASE_URL && fs.existsSync('.env')) {
    const line = fs
      .readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\s*DATABASE_URL\s*=/.test(l))
    if (line) process.env.DATABASE_URL = line.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^["']|["']$/g, '')
  }
  assertLocalDatabase()
  const argv = process.argv.slice(2)
  const reset = argv.includes('--reset')
  const wbIdx = argv.indexOf('--workbook')
  const workbookPath = resolveWorkbookPath(wbIdx >= 0 ? argv[wbIdx + 1] ?? null : null)
  const { rows, errors } = readCarryForwardWorkbook(workbookPath)
  if (errors.length) throw new Error(`Sheet errors:\n${errors.join('\n')}`)

  const prisma = new PrismaClient()
  try {
    // Timeframe
    const timeframe = await prisma.timeframe.upsert({
      where: { name: FIXTURE_TIMEFRAME.name },
      create: FIXTURE_TIMEFRAME,
      update: {},
    })

    // Users
    const userIds = new Map<string, string>()
    for (const u of FIXTURE_USERS) {
      const user = await prisma.user.upsert({
        where: { email: u.email },
        create: { email: u.email, name: u.name, role: u.role, designation: u.designation, isActive: true },
        update: {},
        select: { id: true },
      })
      userIds.set(u.key, user.id)
    }
    const ownerFor = (row: CarryForwardRow) => userIds.get(OWNER_BY_INITIALS[row.ownerInitials] ?? 'BIRUK')!

    const settings = await prisma.organizationSettings.findUnique({ where: { id: 'singleton' } })
    if (!settings) {
      await prisma.organizationSettings.create({ data: { id: 'singleton', companyCeoUserId: userIds.get('BIRUK')! } })
    } else if (!settings.companyCeoUserId) {
      await prisma.organizationSettings.update({ where: { id: 'singleton' }, data: { companyCeoUserId: userIds.get('BIRUK')! } })
    }

    const objectiveRows = rows.filter((r) => r.type === 'OBJECTIVE')
    if (reset) {
      const deleted = await prisma.objective.deleteMany({
        where: { id: { in: [...objectiveRows.map((r) => fixtureId('OBJECTIVE', r.code)), 'cfxother00000000000000obj'] } },
      })
      console.log(`--reset: deleted ${deleted.count} fixture objectives (KRs, retrospectives and activity cascade)`)
    }

    let createdObjectives = 0
    let createdKrs = 0
    for (const objRow of objectiveRows) {
      const objectiveId = fixtureId('OBJECTIVE', objRow.code)
      const existing = await prisma.objective.findUnique({ where: { id: objectiveId }, select: { id: true } })
      if (!existing) {
        await prisma.objective.create({
          data: {
            id: objectiveId,
            title: objRow.title,
            description: `FY25/26 company objective (fixture for the carry-forward close rehearsal).`,
            level: 'COMPANY',
            status: 'ACTIVE',
            goalStatus: statusToConfidence(objRow.finalStatus),
            progress: Math.round((PROGRESS_OVERRIDES[objRow.code] ?? objRow.finalScore * 100) * 100) / 100,
            confidence: statusToConfidence(objRow.finalStatus) === 'ON_TRACK' ? 80 : statusToConfidence(objRow.finalStatus) === 'AT_RISK' ? 50 : 20,
            ownerId: ownerFor(objRow),
            timeframeId: timeframe.id,
            startDate: FIXTURE_TIMEFRAME.startDate,
            endDate: FIXTURE_TIMEFRAME.endDate,
          },
        })
        createdObjectives += 1
      }
      for (const krRow of rows.filter((r) => r.type === 'KEY_RESULT' && r.parentCode === objRow.code)) {
        const krId = fixtureId('KEY_RESULT', krRow.code)
        const krExisting = await prisma.keyResult.findUnique({ where: { id: krId }, select: { id: true } })
        if (krExisting) continue
        const progress = PROGRESS_OVERRIDES[krRow.code] ?? Math.round(krRow.finalScore * 100)
        await prisma.keyResult.create({
          data: {
            id: krId,
            title: krRow.title,
            startValue: 0,
            targetValue: 100,
            currentValue: progress,
            unit: '%',
            confidence: statusToConfidence(krRow.finalStatus),
            progress,
            status: 'ACTIVE',
            ownerId: ownerFor(krRow),
            objectiveId,
          },
        })
        createdKrs += 1
      }
    }

    // One open objective + KR in the timeframe that the sheet does NOT list — exercises the
    // "other open OKRs" report and --include-others.
    const otherObjectiveId = 'cfxother00000000000000obj'
    if (!(await prisma.objective.findUnique({ where: { id: otherObjectiveId }, select: { id: true } }))) {
      await prisma.objective.create({
        data: {
          id: otherObjectiveId,
          title: 'Fixture: department objective not in the carry-forward sheet',
          level: 'DEPARTMENT',
          status: 'ACTIVE',
          goalStatus: 'AT_RISK',
          progress: 40,
          ownerId: userIds.get('EDEN')!,
          timeframeId: timeframe.id,
          keyResults: {
            create: {
              id: 'cfxother000000000000000kr',
              title: 'Fixture: KR not in the carry-forward sheet',
              startValue: 0,
              targetValue: 10,
              currentValue: 4,
              unit: 'deals',
              confidence: 'AT_RISK',
              progress: 40,
              ownerId: userIds.get('EDEN')!,
            },
          },
        },
      })
      console.log('Created the "not in sheet" fixture objective + KR')
    }

    // Verify the code ↔ id contract.
    const codes = rows.map((r) => r.code)
    const objCount = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM objectives WHERE upper(right(id, 6)) = ANY(${codes}::text[]) AND id LIKE 'cfx%'`
    const krCount = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM key_results WHERE upper(right(id, 6)) = ANY(${codes}::text[]) AND id LIKE 'cfx%'`
    console.log(`Timeframe: ${timeframe.name} (${timeframe.id})`)
    console.log(`Users: ${FIXTURE_USERS.length} fixture users ensured`)
    console.log(`Created: ${createdObjectives} objectives, ${createdKrs} KRs (existing rows left untouched)`)
    console.log(`Fixture rows matching sheet codes: ${objCount[0].n} objectives, ${krCount[0].n} KRs (sheet: ${objectiveRows.length} / ${rows.length - objectiveRows.length})`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
