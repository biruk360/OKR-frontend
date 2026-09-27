/**
 * Pre-deploy to-do visibility diff (calendar spec CPM-11(c), A6). READ-ONLY.
 *
 * For every active user, compares the to-do ids each surface showed BEFORE the
 * CPM-2 change (the old inline rules, no record scope on the SSR pages) with the
 * ids it shows AFTER (`todoVisibilityWhere`, record scope ANDed), and prints per
 * user: count before → after, every id/title that disappears and every id that
 * appears. Sets are compared uncapped (true visibility); a note is printed when a
 * surface's cap would truncate the rendered list.
 *
 * Run (uses DATABASE_URL from .env — point it at the DB you are about to deploy to):
 *
 *   npx tsx --tsconfig tsconfig.json scripts/todo-visibility-diff.ts
 *   npx tsx --tsconfig tsconfig.json scripts/todo-visibility-diff.ts --user someone@company.com
 *   npx tsx --tsconfig tsconfig.json scripts/todo-visibility-diff.ts --quiet   # summary only
 *
 * It issues SELECTs only (Prisma findMany + the scope-rule lookups in
 * lib/apply-scope.ts). Review the "loses" lines and name them in the release notes.
 *
 * Each lost row is tagged with why the user no longer sees it:
 *   [participant]  the user is assignee / creator / member / watcher of the card or
 *                  owns / participates in its sprint — the EMPLOYEE participant scope
 *                  (user decision 2026-09-25) must never hide these; any such line is
 *                  a regression (counted as "participant losses" in the summary);
 *   [okr-owner]    visible before only through owning the card's KR / KR's objective /
 *                  objective — hidden by design for scoped roles (see visibility.ts).
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  TODOS_SURFACE_TAKE,
  todoParticipantScopeWhere,
  todoVisibilityWhere,
  type TodoSurface,
} from '../lib/todos/visibility'

type Row = { id: string; title: string }

/** The rules exactly as they were inline before CPM-2 (spec §1.4). */
function legacyWhere(user: { id: string; role: string }, surface: TodoSurface): Prisma.TodoWhereInput | null {
  const userId = user.id
  if (surface === 'todos') {
    // app/dashboard/todos/page.tsx (SSR) — no record scope.
    return user.role === 'ADMIN'
      ? {}
      : {
          OR: [
            { assigneeId: userId },
            { creatorId: userId },
            { keyResult: { ownerId: userId } },
            { keyResult: { objective: { ownerId: userId } } },
            { objective: { ownerId: userId } },
          ],
        }
  }
  if (surface === 'work') {
    // app/dashboard/work/page.tsx (SSR) — no record scope.
    return user.role === 'ADMIN' || user.role === 'EXECUTIVE'
      ? {}
      : { OR: [{ assigneeId: userId }, { creatorId: userId }, { members: { some: { userId } } }] }
  }
  return null // `mine` is a new surface; there is no "before".
}

async function ids(where: Prisma.TodoWhereInput): Promise<Map<string, string>> {
  const rows: Row[] = await prisma.todo.findMany({ where, select: { id: true, title: true } })
  return new Map(rows.map((r) => [r.id, r.title]))
}

/** Of `lostIds`, those the user is a participant of (assignee/creator/member/watcher/sprint). */
async function participantIds(userId: string, lostIds: string[]): Promise<Set<string>> {
  if (lostIds.length === 0) return new Set()
  const participant = await todoParticipantScopeWhere(userId, undefined, async (uid) =>
    (await prisma.watcher.findMany({ where: { userId: uid, entityType: 'TODO' }, select: { entityId: true } })).map(
      (w) => w.entityId,
    ),
  )
  const rows = await prisma.todo.findMany({ where: { AND: [{ id: { in: lostIds } }, participant] }, select: { id: true } })
  return new Set(rows.map((r) => r.id))
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const onlyEmail = arg('--user')
  const quiet = process.argv.includes('--quiet')
  const url = process.env.DATABASE_URL ?? ''
  console.log(`# To-do visibility diff — DB host: ${url.replace(/^.*@/, '').replace(/\?.*$/, '') || '(unset)'}`)
  console.log(`# ${new Date().toISOString()} · read-only · sets uncapped (to-dos list renders first ${TODOS_SURFACE_TAKE})\n`)

  const users = await prisma.user.findMany({
    where: { isActive: true, ...(onlyEmail ? { email: onlyEmail } : {}) },
    select: { id: true, email: true, name: true, role: true },
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
  })

  type Totals = { usersLosing: number; lost: number; participantLost: number; usersGaining: number; gained: number }
  const zero = (): Totals => ({ usersLosing: 0, lost: 0, participantLost: 0, usersGaining: 0, gained: 0 })
  const totals: Record<TodoSurface, Totals> = { todos: zero(), work: zero(), mine: zero() }
  const summary: string[] = []

  for (const u of users) {
    const header = `${u.role.padEnd(15)} ${u.email}`
    const lines: string[] = []
    const cells: string[] = []

    for (const surface of ['todos', 'work', 'mine'] as const) {
      const after = await ids(await todoVisibilityWhere({ id: u.id, role: u.role }, surface))
      const legacy = legacyWhere(u, surface)
      if (!legacy) {
        cells.push(`${surface} –→${after.size}`)
        continue
      }
      const before = await ids(legacy)
      const lost = Array.from(before.entries()).filter(([id]) => !after.has(id))
      const gained = Array.from(after.entries()).filter(([id]) => !before.has(id))
      cells.push(`${surface} ${before.size}→${after.size}`)

      if (lost.length) {
        const own = await participantIds(u.id, lost.map(([id]) => id))
        totals[surface].usersLosing++
        totals[surface].lost += lost.length
        totals[surface].participantLost += own.size
        lines.push(`    ${surface}: loses ${lost.length} (${own.size} participant, ${lost.length - own.size} okr-owner)`)
        if (!quiet) {
          for (const [id, title] of lost) lines.push(`      - ${id}  [${own.has(id) ? 'participant' : 'okr-owner'}]  ${title}`)
        }
      }
      if (gained.length) {
        totals[surface].usersGaining++
        totals[surface].gained += gained.length
        lines.push(`    ${surface}: gains ${gained.length}`)
        if (!quiet) for (const [id, title] of gained) lines.push(`      + ${id}  ${title}`)
      }
      if (surface === 'todos' && after.size > TODOS_SURFACE_TAKE) {
        lines.push(`    todos: ${after.size} visible, list renders the first ${TODOS_SURFACE_TAKE}`)
      }
    }

    summary.push(`${header}  ${cells.join('  ')}`)
    console.log(`${header}\n  ${cells.join('  ')}`)
    for (const l of lines) console.log(l)
  }

  console.log('\n# Summary')
  for (const s of summary) console.log(s)
  console.log('')
  for (const surface of ['todos', 'work'] as const) {
    const t = totals[surface]
    console.log(
      `${surface}: ${t.usersLosing}/${users.length} users lose ${t.lost} row(s) ` +
        `(${t.participantLost} participant, ${t.lost - t.participantLost} okr-owner); ${t.usersGaining} gain ${t.gained}`,
    )
  }
  const participantLost = totals.todos.participantLost + totals.work.participantLost
  console.log(
    participantLost === 0
      ? '\nOK: no user loses a card they are assignee / creator / member / watcher / sprint participant of.'
      : `\nREGRESSION: ${participantLost} lost row(s) are cards the user participates in — investigate before deploying.`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
