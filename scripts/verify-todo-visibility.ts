/**
 * DB-backed role matrix for to-do visibility (calendar spec CPM-11(a), CPM-AC-1/5/6).
 * NOT part of `npm run test:todos` — run it by hand against the LOCAL dev DB:
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-todo-visibility.ts
 *
 * It refuses to run unless DATABASE_URL points at localhost / 127.0.0.1.
 *
 * Why fixtures are committed and deleted rather than rolled back: `buildScopeFilter`
 * (lib/apply-scope.ts) reads RecordScopeRule / UserRole through the global Prisma
 * client, which cannot see rows inside another connection's open transaction. The
 * script therefore creates uniquely-tagged fixtures, runs the matrix, and deletes
 * every fixture row in a `finally` block (also on assertion failure).
 *
 * Per user × surface it checks two paths and asserts they agree exactly:
 *   - "SSR"     — `findTodosSurfaceRows` / `findWorkSurfaceRows`, what the pages render;
 *   - "refresh" — the real `GET /api/todos?surface=…` handler, called with a bearer
 *                 token for the fixture user (what todo-store / WorkBoardClient fetch).
 * Fixture users have no RBAC UserRole rows, so the seeded role-level scope rules do
 * not apply to them; one EMPLOYEE gets a user-level RecordScopeRule (CPM-AC-5) and
 * one ("emp-seeded-role") gets the real EMPLOYEE RBAC role, i.e. the seeded
 * participant scope (`participant is_participant user_id`, user decision
 * 2026-09-25): assignee · creator · member · watcher (read only) · owner/participant
 * of the card's sprint — NOT KR / objective ownership. Run
 * scripts/update-employee-todo-scope.ts --apply first on a DB seeded before that
 * decision; the script checks the rule is in place.
 */
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { prisma } from '../lib/prisma'
import { nextAuthSecret } from '../lib/auth'
import {
  findTodosSurfaceRows,
  findWorkSurfaceRows,
  TODO_SURFACES,
  type TodoSurface,
  type VisibilityUser,
} from '../lib/todos/visibility'
import { GET as listTodos } from '../app/api/todos/route'
import { buildScopeFilter } from '../lib/apply-scope'
import { canReadTodo, canWriteTodo } from '../lib/todos/access'
import { TODO_PARTICIPANT_SCOPE_RULE } from '../lib/todos/visibility'

const TAG = `vtv-${Date.now().toString(36)}`
let failures = 0

function check(cond: boolean, msg: string) {
  if (cond) console.log(`  ok   ${msg}`)
  else {
    failures++
    console.log(`  FAIL ${msg}`)
  }
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

async function ssrIds(user: VisibilityUser, surface: TodoSurface): Promise<string[]> {
  const rows = surface === 'work' ? await findWorkSurfaceRows(prisma, user) : await findTodosSurfaceRows(prisma, user, surface)
  return (rows as Array<{ id: string }>).map((r) => r.id)
}

async function apiGet(userId: string, query: string): Promise<{ status: number; rows: Array<Record<string, unknown>> }> {
  if (!nextAuthSecret) throw new Error('NEXTAUTH_SECRET is not set')
  const token = await encode({ token: { sub: userId, email: `${userId}@x`, name: 'fixture', role: 'EMPLOYEE', isProjectManager: false }, secret: nextAuthSecret })
  const req = new NextRequest(`http://localhost/api/todos?${query}`, { headers: { authorization: `Bearer ${token}` } })
  const res = await listTodos(req)
  const json = await res.json()
  return { status: res.status, rows: Array.isArray(json.data) ? json.data : [] }
}

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  const host = url.replace(/^.*@/, '').split(/[:/]/)[0]
  if (!['localhost', '127.0.0.1'].includes(host)) {
    throw new Error(`Refusing to run: DATABASE_URL host is "${host}", not localhost`)
  }
  console.log(`# verify-todo-visibility — fixtures tagged ${TAG} on ${host}`)

  const timeframe = await prisma.timeframe.findFirst({ select: { id: true } })
  if (!timeframe) throw new Error('No timeframe in the dev DB')
  const employeeRole = await (prisma as any).role.findFirst({ where: { key: 'EMPLOYEE' }, select: { id: true } })

  const created = { users: [] as string[], todos: [] as string[], krs: [] as string[], objectives: [] as string[], rules: [] as string[], sprints: [] as string[] }
  const mkUser = async (key: string, role: string) => {
    const u = await prisma.user.create({
      data: { email: `${TAG}-${key}@example.invalid`, name: `${TAG} ${key}`, role: role as any, isActive: true },
      select: { id: true },
    })
    created.users.push(u.id)
    return { id: u.id, role }
  }

  try {
    // ── Users ────────────────────────────────────────────────────────────────
    const admin = await mkUser('admin', 'ADMIN')
    const exec = await mkUser('exec', 'EXECUTIVE')
    const lead = await mkUser('lead', 'DEPARTMENT_LEAD')
    const empKr = await mkUser('emp-kr-owner', 'EMPLOYEE')
    const empAssignee = await mkUser('emp-assignee', 'EMPLOYEE')
    const empMember = await mkUser('emp-member', 'EMPLOYEE')
    const empUnrelated = await mkUser('emp-unrelated', 'EMPLOYEE')
    const empScoped = await mkUser('emp-scoped', 'EMPLOYEE')
    const empSeeded = await mkUser('emp-seeded-role', 'EMPLOYEE')
    const empOther = await mkUser('emp-other', 'EMPLOYEE') // owns the participant-scope fixtures below

    // ── OKR context: lead owns O1; empKr owns KR "Grow ARR" under O1 ────────────
    const o1 = await prisma.objective.create({
      data: { title: `${TAG} O1`, level: 'DEPARTMENT', ownerId: lead.id, timeframeId: timeframe.id },
      select: { id: true },
    })
    created.objectives.push(o1.id)
    const kr = await prisma.keyResult.create({
      data: { title: `${TAG} Grow ARR`, targetValue: 100, unit: '%', ownerId: empKr.id, objectiveId: o1.id },
      select: { id: true },
    })
    const krSeeded = await prisma.keyResult.create({
      data: { title: `${TAG} Seeded KR`, targetValue: 100, unit: '%', ownerId: empSeeded.id, objectiveId: o1.id },
      select: { id: true },
    })
    created.krs.push(kr.id, krSeeded.id)

    const mkTodo = async (title: string, data: Record<string, unknown>) => {
      const t = await prisma.todo.create({ data: { title: `${TAG} ${title}`, ...data } as any, select: { id: true } })
      created.todos.push(t.id)
      return t.id
    }
    const T1 = await mkTodo('T1 under Grow ARR', { keyResultId: kr.id, assigneeId: empAssignee.id, creatorId: admin.id })
    const T2 = await mkTodo('T2 unassigned w/ member', { creatorId: empAssignee.id })
    await prisma.todoMember.create({ data: { todoId: T2, userId: empMember.id } })
    const T3 = await mkTodo('T3 on objective O1', { objectiveId: o1.id, assigneeId: exec.id, creatorId: exec.id })
    const T4 = await mkTodo('T4 assigned to scoped', { assigneeId: empScoped.id, creatorId: lead.id })
    const T5 = await mkTodo('T5 created by scoped', { creatorId: empScoped.id })
    const T6 = await mkTodo('T6 admin own', { assigneeId: admin.id, creatorId: admin.id })
    const T7 = await mkTodo('T7 under seeded KR', { keyResultId: krSeeded.id, assigneeId: empAssignee.id, creatorId: admin.id })

    // Participant-scope fixtures: each card relates to empSeeded in exactly one way.
    const T8 = await mkTodo('T8 created by seeded', { creatorId: empSeeded.id, assigneeId: empOther.id })
    const T9 = await mkTodo('T9 seeded is member', { creatorId: empOther.id, assigneeId: empOther.id })
    await prisma.todoMember.create({ data: { todoId: T9, userId: empSeeded.id } })
    const T10 = await mkTodo('T10 seeded watches', { creatorId: empOther.id, assigneeId: empOther.id })
    await prisma.watcher.create({ data: { userId: empSeeded.id, entityType: 'TODO', entityId: T10 } })
    const sprint = await prisma.sprint.create({ data: { name: `${TAG} S1`, ownerId: empOther.id }, select: { id: true } })
    created.sprints.push(sprint.id)
    await prisma.sprintParticipant.create({ data: { sprintId: sprint.id, userId: empSeeded.id } })
    const T11 = await mkTodo('T11 on seeded sprint', { creatorId: empOther.id, assigneeId: empOther.id, sprintId: sprint.id })

    // CPM-AC-5: one RecordScopeRule limiting empScoped to to-dos assigned to them.
    const rule = await (prisma as any).recordScopeRule.create({
      data: { targetType: 'user', targetId: empScoped.id, doctypeKey: 'todo', fieldName: 'assigneeId', operator: 'equals', valueType: 'user_id', isActive: true },
      select: { id: true },
    })
    created.rules.push(rule.id)
    let participantRuleActive = false
    if (employeeRole) {
      await (prisma as any).userRole.create({ data: { userId: empSeeded.id, roleId: employeeRole.id } })
      const roleRules: Array<{ fieldName: string; operator: string; valueType: string; isActive: boolean }> =
        await (prisma as any).recordScopeRule.findMany({
          where: { targetType: 'role', targetId: employeeRole.id, doctypeKey: 'todo', isActive: true },
        })
      participantRuleActive =
        roleRules.length === 1 &&
        roleRules[0].fieldName === TODO_PARTICIPANT_SCOPE_RULE.fieldName &&
        roleRules[0].operator === TODO_PARTICIPANT_SCOPE_RULE.operator &&
        roleRules[0].valueType === TODO_PARTICIPANT_SCOPE_RULE.valueType
    }

    const fixtureIds = new Set(created.todos)
    const totalTodos = await prisma.todo.count()

    // ── Expected ids per role × surface (CPM-AC-6). 'ALL' = unrestricted. ───────
    type Expect = string[] | 'ALL'
    const matrix: Array<{ name: string; user: VisibilityUser; expect: Record<TodoSurface, Expect> }> = [
      { name: 'ADMIN', user: admin, expect: { todos: 'ALL', work: 'ALL', mine: [T6] } },
      { name: 'EXECUTIVE', user: exec, expect: { todos: [T3], work: 'ALL', mine: [T3] } },
      { name: 'DEPARTMENT_LEAD (owns O1)', user: lead, expect: { todos: [T1, T3, T4, T7], work: [T4], mine: [] } },
      { name: 'EMPLOYEE KR owner', user: empKr, expect: { todos: [T1], work: [], mine: [] } },
      { name: 'EMPLOYEE assignee', user: empAssignee, expect: { todos: [T1, T2, T7], work: [T1, T2, T7], mine: [T1, T7] } },
      { name: 'EMPLOYEE member', user: empMember, expect: { todos: [T2], work: [T2], mine: [T2] } },
      { name: 'EMPLOYEE unrelated', user: empUnrelated, expect: { todos: [], work: [], mine: [] } },
      { name: 'EMPLOYEE w/ scope rule', user: empScoped, expect: { todos: [T4], work: [T4], mine: [T4] } },
    ]
    if (participantRuleActive) {
      // Seeded EMPLOYEE participant scope ∩ each surface rule. T7 (KR owner only) is
      // hidden by decision; T10 (watch) is in the scope but on no surface rule, so it
      // is reachable by opening the card, not in the lists. Since 2026-09-25 the
      // to-dos surface includes member (T9) and invited-sprint (T11) cards — before
      // that fix they were scoped in and then dropped by the AND (smoke test B1).
      matrix.push({
        name: 'EMPLOYEE w/ seeded RBAC role (participant scope)',
        user: empSeeded,
        expect: { todos: [T8, T9, T11], work: [T8, T9], mine: [T9] },
      })
    }

    console.log('\n## Role matrix (SSR path vs GET /api/todos?surface=…)')
    for (const row of matrix) {
      for (const surface of TODO_SURFACES) {
        const ssr = await ssrIds(row.user, surface)
        const api = await apiGet(row.user.id, `surface=${surface}`)
        const apiIds = api.rows.map((r) => String(r.id))
        const exp = row.expect[surface]
        const label = `${row.name} × ${surface}`
        if (exp === 'ALL') {
          check(ssr.length === Math.min(totalTodos, surface === 'todos' ? 500 : Infinity) && created.todos.every((id) => ssr.includes(id)), `${label}: sees every to-do (${ssr.length})`)
        } else {
          check(sameSet(ssr, exp), `${label}: SSR ids = expected [${exp.length}]${sameSet(ssr, exp) ? '' : ` got ${ssr.filter((i) => fixtureIds.has(i)).length} fixture / ${ssr.length} total`}`)
        }
        check(api.status === 200 && ssr.join() === apiIds.join(), `${label}: refresh returns the SSR ids in the same order`)
        if (surface === 'work' && api.rows[0]) {
          const r = api.rows[0]
          check(['members', 'labels', 'checklists', 'attachments'].every((k) => Array.isArray(r[k])), `${label}: refresh rows carry members/labels/checklists/attachments`)
        }
        if (surface !== 'work' && api.rows[0]) {
          const r = api.rows[0] as any
          check('cardNumber' in r && 'archivedAt' in r && (r.keyResult === null || typeof r.keyResult.objective.timeframeName === 'string'), `${label}: refresh rows have the TodoRow shape`)
        }
      }
    }

    console.log('\n## CPM-AC-1 — EMPLOYEE KR owner keeps the KR to-do after a refresh')
    const beforeRefresh = await ssrIds(empKr, 'todos')
    await prisma.todo.update({ where: { id: T3 }, data: { status: 'COMPLETED' } }) // "complete any other card"
    const afterRefresh = (await apiGet(empKr.id, 'surface=todos')).rows.map((r) => String(r.id))
    check(beforeRefresh.includes(T1) && afterRefresh.includes(T1), 'T1 (assigned to someone else, under their KR) is in the list before and after refresh')
    const legacy = (await apiGet(empKr.id, 'mine=all')).rows.map((r) => String(r.id))
    check(!legacy.includes(T1), 'the old ?mine=all refresh would have dropped T1 (the fixed shrink)')

    if (participantRuleActive) {
      console.log('\n## CPM-AC-1 — EMPLOYEE with the seeded RBAC role: list does not shrink after a refresh')
      const ssrBefore = await ssrIds(empSeeded, 'todos')
      await prisma.todo.update({ where: { id: T3 }, data: { status: 'PENDING' } })
      const refreshed = (await apiGet(empSeeded.id, 'surface=todos')).rows.map((r) => String(r.id))
      check(ssrBefore.join() === refreshed.join(), 'SSR and refresh return the same ids in the same order (no shrink)')
      check(
        !ssrBefore.includes(T7) && !refreshed.includes(T7),
        'T7 (under a KR they own, not a participant) is hidden on both — by decision, KR/objective ownership is not in the EMPLOYEE participant scope',
      )
    }

    console.log('\n## CPM-AC-5 — RecordScopeRule: list, refresh agree and exclude out-of-scope cards')
    for (const surface of TODO_SURFACES) {
      const ssr = await ssrIds(empScoped, surface)
      const api = (await apiGet(empScoped.id, `surface=${surface}`)).rows.map((r) => String(r.id))
      check(sameSet(ssr, api) && !ssr.includes(T5), `${surface}: same set on SSR and refresh; T5 (created by them, not assigned) excluded`)
    }

    console.log('\n## CLIENT_PORTAL — never sees internal to-dos')
    for (const surface of TODO_SURFACES) {
      const portal = { id: empAssignee.id, role: 'EMPLOYEE', userType: 'CLIENT_PORTAL' }
      check((await ssrIds(portal, surface)).length === 0, `${surface}: 0 rows for a CLIENT_PORTAL session (even with an internal user's id)`)
    }

    console.log('\n## Legacy callers keep working')
    const mineAll = (await apiGet(empAssignee.id, 'mine=all')).rows.map((r) => String(r.id))
    check(sameSet(mineAll, [T1, T2, T7]), '?mine=all still returns assignee OR creator')
    const bad = await apiGet(empAssignee.id, 'surface=calendar')
    check(bad.status === 400, 'unknown ?surface= is rejected with 400')

    console.log('\n## Seeded EMPLOYEE participant scope (assignee · creator · member · watcher · sprint)')
    if (!employeeRole) {
      console.log('  no RBAC EMPLOYEE role in this DB — skipped')
    } else if (!participantRuleActive) {
      check(false, 'EMPLOYEE todo scope is exactly one active `participant is_participant user_id` rule (run scripts/update-employee-todo-scope.ts --apply)')
    } else {
      const inScope = async (action?: 'write') => {
        const scope = await buildScopeFilter(empSeeded.id, 'todo', action)
        const rows = await prisma.todo.findMany({
          where: { AND: [{ id: { in: created.todos } }, ...(scope ? [scope as any] : [])] },
          select: { id: true },
        })
        return rows.map((r) => r.id)
      }
      const read = await inScope()
      const write = await inScope('write')
      check(sameSet(read, [T8, T9, T10, T11]), 'read scope = created (T8) + member (T9) + watched (T10) + sprint participant (T11); not KR-owned T7')
      check(sameSet(write, [T8, T9, T11]), 'write scope excludes the watched card T10 (watching is read-only; anyone can watch any id)')
      const actor = { id: empSeeded.id, role: 'EMPLOYEE' }
      check(await canWriteTodo(actor, T11), 'may edit T11, a card on a sprint they participate in (sprint invite-only rule)')
      check(!(await canWriteTodo(actor, T10)), 'may NOT edit T10, a card they only watch')
      check(await canReadTodo(actor, T11), 'may open T11 (sprint participant)')
      // Single-card read of a watched-only card is lib/todos/access.ts's call (the
      // watcher path there may change); reported, not asserted.
      console.log(`  info T10 (watched only) single-card read: ${(await canReadTodo(actor, T10)) ? 'allowed' : 'denied'}`)
    }
  } finally {
    // Cleanup — every fixture row, children first.
    await prisma.todoMember.deleteMany({ where: { todoId: { in: created.todos } } })
    await prisma.watcher.deleteMany({ where: { userId: { in: created.users } } })
    await prisma.todo.deleteMany({ where: { id: { in: created.todos } } })
    await prisma.sprint.deleteMany({ where: { id: { in: created.sprints } } })
    await prisma.keyResult.deleteMany({ where: { id: { in: created.krs } } })
    await prisma.objective.deleteMany({ where: { id: { in: created.objectives } } })
    await (prisma as any).recordScopeRule.deleteMany({ where: { id: { in: created.rules } } })
    await (prisma as any).userRole.deleteMany({ where: { userId: { in: created.users } } })
    await prisma.user.deleteMany({ where: { id: { in: created.users } } })
    const leftover = await prisma.user.count({ where: { email: { startsWith: TAG } } })
    console.log(`\n# cleanup: ${leftover === 0 ? 'all fixtures removed' : `${leftover} fixture users LEFT BEHIND`}`)
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  if (failures) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
