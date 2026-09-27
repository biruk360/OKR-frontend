/**
 * Backfill for invite-only sprint boards (2026-09-25, decision 1b).
 *
 * Before this change a sprint was visible to its owner, its SprintParticipants
 * AND every member of its department. Now only the owner and participants (plus
 * ADMIN / EXECUTIVE) see it, and being put on a card is an invitation. This
 * script makes existing data match that rule:
 *
 *   ADD   for every sprint: its owner and every assignee / member of its cards
 *         (AI drafts `aiSuggested=true` are not board cards yet and are skipped)
 *         as SprintParticipant role MEMBER. Idempotent; never removes anyone.
 *   LOSE  lists who would lose access under the new rule: active members of the
 *         sprint's department who are neither owner, participant, nor on one of
 *         its cards, and are not ADMIN / EXECUTIVE. Report only — nothing is
 *         changed for them; the board owner can invite them from the board.
 *
 * Dry-run by default. `--apply` writes the ADD rows.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-sprint-participants.ts           # dry-run
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-sprint-participants.ts --apply   # write
 *
 * Refuses a non-localhost DATABASE_URL unless `--allow-remote` is passed.
 */
import { prisma } from '../lib/prisma'
import { SPRINT_VIEW_ALL_ROLES } from '../lib/permissions'

const APPLY = process.argv.includes('--apply')
const ALLOW_REMOTE = process.argv.includes('--allow-remote')

interface Person { id: string; name: string; email: string; role: string }

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  const host = url.replace(/^.*@/, '').split(/[:/]/)[0]
  if (!['localhost', '127.0.0.1'].includes(host) && !ALLOW_REMOTE) {
    throw new Error(`Refusing to run against "${host}" without --allow-remote`)
  }
  console.log(`# backfill-sprint-participants — ${APPLY ? 'APPLY' : 'DRY RUN'} on ${host}\n`)

  const sprints = await prisma.sprint.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, name: true, state: true, ownerId: true, departmentId: true,
      department: { select: { name: true } },
      participants: { select: { userId: true } },
      todos: {
        where: { aiSuggested: false },
        select: { assigneeId: true, members: { select: { userId: true } } },
      },
    },
  })

  const userIds = new Set<string>()
  for (const s of sprints) {
    userIds.add(s.ownerId)
    for (const t of s.todos) {
      if (t.assigneeId) userIds.add(t.assigneeId)
      for (const m of t.members) userIds.add(m.userId)
    }
  }
  const deptIds = Array.from(new Set(sprints.map((s) => s.departmentId).filter((d): d is string => !!d)))
  const memberships = deptIds.length
    ? await prisma.departmentMembership.findMany({
        where: { departmentId: { in: deptIds }, endedAt: null, user: { isActive: true } },
        select: { departmentId: true, userId: true },
      })
    : []
  for (const m of memberships) userIds.add(m.userId)
  const people = new Map<string, Person>(
    (await prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true, email: true, role: true },
    })).map((u) => [u.id, u]),
  )
  const label = (id: string) => {
    const p = people.get(id)
    return p ? `${p.name} <${p.email}> (${p.role})` : `${id} (unknown user)`
  }

  let totalAdd = 0
  let totalLose = 0
  const loseRows: string[] = []

  for (const s of sprints) {
    const existing = new Set(s.participants.map((p) => p.userId))
    const desired = new Set<string>([s.ownerId])
    for (const t of s.todos) {
      if (t.assigneeId) desired.add(t.assigneeId)
      for (const m of t.members) desired.add(m.userId)
    }
    // Only real, existing users (a dangling id would fail the FK).
    const toAdd = Array.from(desired).filter((id) => !existing.has(id) && people.has(id))

    const willSee = new Set([...Array.from(existing), ...Array.from(desired)])
    const lose = s.departmentId
      ? memberships
          .filter((m) => m.departmentId === s.departmentId && !willSee.has(m.userId))
          .map((m) => m.userId)
          .filter((id) => !SPRINT_VIEW_ALL_ROLES.includes(people.get(id)?.role ?? ''))
      : []
    const uniqueLose = Array.from(new Set(lose))

    console.log(`## ${s.name} [${s.state}] — ${s.department ? `dept ${s.department.name}` : 'no department'} · ${s.id}`)
    console.log(`   owner: ${label(s.ownerId)}`)
    console.log(`   participants now: ${existing.size} · cards: ${s.todos.length} · to add: ${toAdd.length} · would lose access: ${uniqueLose.length}`)
    for (const id of toAdd) console.log(`   + add   ${label(id)}${id === s.ownerId ? '  [owner]' : ''}`)
    for (const id of uniqueLose) {
      console.log(`   - LOSES ${label(id)}`)
      loseRows.push(`${s.name} (${s.id}) — ${label(id)}`)
    }

    totalAdd += toAdd.length
    totalLose += uniqueLose.length
    if (APPLY && toAdd.length > 0) {
      await prisma.sprintParticipant.createMany({
        data: toAdd.map((userId) => ({ sprintId: s.id, userId, role: 'MEMBER' })),
        skipDuplicates: true,
      })
    }
  }

  console.log(`\n# Summary: ${sprints.length} sprint(s) · ${totalAdd} participant row(s) ${APPLY ? 'added' : 'to add'} · ${totalLose} department member(s) would lose access`)
  if (loseRows.length > 0) {
    console.log('\n# Who loses access (department members not invited and not on a card — invite them from the board if they should keep it):')
    for (const r of loseRows) console.log(`  ${r}`)
  }
  if (!APPLY) console.log('\n(dry run — nothing written; re-run with --apply to add the participant rows)')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
