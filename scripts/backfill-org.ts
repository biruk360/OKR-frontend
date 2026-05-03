/**
 * Idempotent backfill for the org structure refactor (Phase 1).
 *
 * Usage:
 *   tsx scripts/backfill-org.ts [--ceo=<user-email-or-id>]
 *
 * Steps (each safely re-runnable):
 *   1. Ensure singleton OrganizationSettings row exists.
 *   2. Set CEO from --ceo flag, or prompt-skip if already set.
 *   3. For each DepartmentMembership where role is null/legacy, copy old value
 *      into legacyRole and translate into the new enum:
 *        "Lead" / "Head" / "HEAD"  -> HEAD
 *        anything else / null      -> MEMBER
 *   4. For each user with at least one membership, ensure exactly one row has
 *      isPrimary=true (oldest joinedAt wins).
 */

import { prisma } from '../lib/prisma'

function parseFlag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : undefined
}

async function ensureSettings() {
  const existing = await prisma.organizationSettings.findUnique({ where: { id: 'singleton' } })
  if (existing) return existing
  return prisma.organizationSettings.create({ data: { id: 'singleton' } })
}

async function setCeo(emailOrId: string) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: emailOrId }, { id: emailOrId }] },
    select: { id: true, email: true, role: true },
  })
  if (!user) throw new Error(`No user matches "${emailOrId}"`)
  if (user.role !== 'ADMIN' && user.role !== 'EXECUTIVE') {
    throw new Error(`CEO must be ADMIN or EXECUTIVE, "${user.email}" is ${user.role}`)
  }
  await prisma.organizationSettings.update({
    where: { id: 'singleton' },
    data: { companyCeoUserId: user.id },
  })
  console.log(`✓ CEO set to ${user.email}`)
}

async function migrateMembershipRoles() {
  const all = await prisma.departmentMembership.findMany({
    select: { id: true, role: true, legacyRole: true },
  })
  let updated = 0
  for (const m of all) {
    // Already migrated
    if (m.role === 'HEAD' || m.role === 'MEMBER' || m.role === 'SECONDARY_MEMBER') {
      if (m.legacyRole !== null && m.legacyRole !== undefined) continue
    }
    const original = m.role ?? null
    const next = (() => {
      const v = (original ?? '').trim().toLowerCase()
      if (v === 'lead' || v === 'head') return 'HEAD'
      return 'MEMBER'
    })()
    await prisma.departmentMembership.update({
      where: { id: m.id },
      data: { role: next, legacyRole: original ?? '' },
    })
    updated++
  }
  console.log(`✓ Migrated ${updated} membership role(s)`)
}

async function ensurePrimaryDept() {
  const grouped = await prisma.departmentMembership.findMany({
    where: { endedAt: null },
    orderBy: { joinedAt: 'asc' },
    select: { id: true, userId: true, isPrimary: true },
  })
  type Row = (typeof grouped)[number]
  const byUser = new Map<string, Row[]>()
  for (const m of grouped) {
    if (!byUser.has(m.userId)) byUser.set(m.userId, [])
    byUser.get(m.userId)!.push(m)
  }
  let touched = 0
  for (const rows of Array.from(byUser.values())) {
    const primaries = rows.filter((r: Row) => r.isPrimary)
    if (primaries.length === 1) continue
    // Either zero or many primaries — reset: oldest joinedAt becomes primary, others false.
    const [first, ...rest] = rows
    await prisma.departmentMembership.update({ where: { id: first.id }, data: { isPrimary: true } })
    for (const r of rest) {
      if (r.isPrimary) {
        await prisma.departmentMembership.update({ where: { id: r.id }, data: { isPrimary: false } })
      }
    }
    touched++
  }
  console.log(`✓ Normalized primary-department flag for ${touched} user(s)`)
}

async function main() {
  console.log('► Backfill: ensure organization settings')
  await ensureSettings()

  const ceoArg = parseFlag('ceo')
  if (ceoArg) {
    await setCeo(ceoArg)
  } else {
    const settings = await prisma.organizationSettings.findUnique({ where: { id: 'singleton' } })
    if (!settings?.companyCeoUserId) {
      console.log('! No CEO set — pass --ceo=<email-or-id> to designate one (skipping)')
    } else {
      console.log(`✓ CEO already set (${settings.companyCeoUserId})`)
    }
  }

  console.log('► Backfill: department membership roles')
  await migrateMembershipRoles()

  console.log('► Backfill: ensure exactly one primary department per user')
  await ensurePrimaryDept()

  console.log('✓ Done')
}

main()
  .catch((err) => { console.error('✗', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
