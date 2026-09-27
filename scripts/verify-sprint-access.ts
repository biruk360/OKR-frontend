/**
 * DB-backed role matrix for invite-only sprint boards and card-by-link access
 * (2026-09-25 decisions 1b, 3, 4). NOT part of any `npm run test:*` — run it by
 * hand against the LOCAL dev DB:
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-sprint-access.ts
 *
 * It refuses to run unless DATABASE_URL points at localhost / 127.0.0.1.
 *
 * Like scripts/verify-todo-visibility.ts it commits uniquely-tagged fixtures,
 * calls the REAL route handlers with a bearer token per fixture user, and
 * deletes every fixture row in a `finally` block (also on assertion failure).
 * No notification-emitting writes are made (PATCH touches only `coverColor`).
 */
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { prisma } from '../lib/prisma'
import { nextAuthSecret } from '../lib/auth'
import { GET as listSprints } from '../app/api/sprints/route'
import { GET as getBoard } from '../app/api/sprints/[id]/board/route'
import { GET as getParticipants, POST as inviteParticipant } from '../app/api/sprints/[id]/participants/route'
import { GET as getTodo, PATCH as patchTodo } from '../app/api/todos/[id]/route'
import { POST as addMember } from '../app/api/todos/[id]/members/route'
import { GET as getComments } from '../app/api/todos/[id]/comments/route'

const TAG = `vsa-${Date.now().toString(36)}`
let failures = 0

function check(cond: boolean, msg: string) {
  if (cond) console.log(`  ok   ${msg}`)
  else {
    failures++
    console.log(`  FAIL ${msg}`)
  }
}

type Handler = (req: NextRequest, ctx?: { params: Record<string, string> }) => Promise<Response>

async function call(
  handler: Handler,
  userId: string,
  method: string,
  path: string,
  params: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; json: any }> {
  if (!nextAuthSecret) throw new Error('NEXTAUTH_SECRET is not set')
  const token = await encode({
    token: { sub: userId, email: `${userId}@x`, name: 'fixture', role: 'EMPLOYEE', isProjectManager: false },
    secret: nextAuthSecret,
  })
  const req = new NextRequest(`http://localhost${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  const res = await handler(req, { params })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  const host = url.replace(/^.*@/, '').split(/[:/]/)[0]
  if (!['localhost', '127.0.0.1'].includes(host)) {
    throw new Error(`Refusing to run: DATABASE_URL host is "${host}", not localhost`)
  }
  console.log(`# verify-sprint-access — fixtures tagged ${TAG} on ${host}`)

  const timeframe = await prisma.timeframe.findFirst({ select: { id: true } })
  if (!timeframe) throw new Error('No timeframe in the dev DB')

  const created = { users: [] as string[], todos: [] as string[], objectives: [] as string[], sprints: [] as string[], depts: [] as string[] }
  const mkUser = async (key: string, role: string) => {
    const u = await prisma.user.create({
      data: { email: `${TAG}-${key}@example.invalid`, name: `${TAG} ${key}`, role, isActive: true },
      select: { id: true },
    })
    created.users.push(u.id)
    return u.id
  }

  try {
    // ── Fixtures ─────────────────────────────────────────────────────────────
    const admin = await mkUser('admin', 'ADMIN')
    const exec = await mkUser('exec', 'EXECUTIVE')
    const leadInDept = await mkUser('lead-in-dept', 'DEPARTMENT_LEAD') // same department, NOT invited
    const owner = await mkUser('owner', 'EMPLOYEE')
    const participant = await mkUser('participant', 'EMPLOYEE')
    const empInDept = await mkUser('emp-in-dept', 'EMPLOYEE') // same department, NOT invited
    const later = await mkUser('added-later', 'EMPLOYEE') // gets put on a card mid-run
    const stranger = await mkUser('stranger', 'EMPLOYEE')

    const dept = await prisma.department.create({ data: { name: `${TAG} Dept` }, select: { id: true } })
    created.depts.push(dept.id)
    for (const u of [leadInDept, owner, participant, empInDept]) {
      await prisma.departmentMembership.create({ data: { userId: u, departmentId: dept.id } })
    }

    // A public company objective: every signed-in user can view it unredacted.
    const objective = await prisma.objective.create({
      data: { title: `${TAG} O`, level: 'COMPANY', ownerId: admin, timeframeId: timeframe.id, isPrivate: false },
      select: { id: true },
    })
    created.objectives.push(objective.id)

    const sprint = await prisma.sprint.create({
      data: {
        name: `${TAG} Sprint`, ownerId: owner, departmentId: dept.id, state: 'ACTIVE',
        participants: { create: [{ userId: participant, role: 'MEMBER' }] },
        columns: { create: [{ name: 'To Do', statusKey: 'PENDING', position: 0 }] },
      },
      select: { id: true },
    })
    created.sprints.push(sprint.id)

    const mkTodo = async (title: string, data: Record<string, unknown>) => {
      const t = await prisma.todo.create({ data: { title: `${TAG} ${title}`, ...data } as any, select: { id: true } })
      created.todos.push(t.id)
      return t.id
    }
    // A sprint card nobody but the owner is on, linked to the public objective.
    const sprintCard = await mkTodo('sprint card', { creatorId: owner, assigneeId: owner, sprintId: sprint.id, objectiveId: objective.id })
    // The same kind of card outside any sprint.
    const backlogCard = await mkTodo('backlog card', { creatorId: owner, assigneeId: owner, objectiveId: objective.id })
    // The stranger's own card — they may write it, but not move it onto a board they cannot see.
    const strangerCard = await mkTodo('stranger own card', { creatorId: stranger, assigneeId: stranger })

    const S = { id: sprint.id }
    const listed = async (u: string) =>
      ((await call(listSprints as Handler, u, 'GET', '/api/sprints?state=ACTIVE')).json?.data ?? []).map((s: { id: string }) => s.id)

    // ── 1b: view + list ──────────────────────────────────────────────────────
    console.log('\n## Decision 1b — sprint view and list (invite-only)')
    const viewMatrix: [string, string, boolean][] = [
      ['ADMIN', admin, true],
      ['EXECUTIVE', exec, true],
      ['owner (EMPLOYEE)', owner, true],
      ['participant (EMPLOYEE)', participant, true],
      ['DEPARTMENT_LEAD in the department, not invited', leadInDept, false],
      ['EMPLOYEE in the department, not invited', empInDept, false],
      ['EMPLOYEE stranger', stranger, false],
    ]
    for (const [name, u, expected] of viewMatrix) {
      const board = await call(getBoard as Handler, u, 'GET', `/api/sprints/${S.id}/board`, S)
      check((board.status === 200) === expected, `${name}: board GET ${board.status} (expected ${expected ? 200 : 403})`)
      const inList = (await listed(u)).includes(S.id)
      check(inList === expected, `${name}: ${expected ? 'listed' : 'not listed'} in GET /api/sprints (view ≡ list)`)
    }

    // ── 3: card by link ──────────────────────────────────────────────────────
    console.log('\n## Decision 3 — opening a card by link')
    const cardMatrix: [string, string, number, number][] = [
      // name, user, sprint card, backlog card
      ['ADMIN', admin, 200, 200],
      ['EXECUTIVE', exec, 200, 200],
      ['participant (sprint viewer)', participant, 200, 200],
      ['EMPLOYEE in the department, not invited', empInDept, 404, 200],
      ['EMPLOYEE stranger (can view the linked objective)', stranger, 404, 200],
    ]
    for (const [name, u, sprintExpected, backlogExpected] of cardMatrix) {
      const a = await call(getTodo as Handler, u, 'GET', `/api/todos/${sprintCard}`, { id: sprintCard })
      check(a.status === sprintExpected, `${name}: sprint card GET ${a.status} (expected ${sprintExpected})`)
      const b = await call(getTodo as Handler, u, 'GET', `/api/todos/${backlogCard}`, { id: backlogCard })
      check(b.status === backlogExpected, `${name}: backlog card GET ${b.status} (expected ${backlogExpected})`)
    }
    const probe = await call(getTodo as Handler, stranger, 'GET', '/api/todos/does-not-exist', { id: 'does-not-exist' })
    check(probe.status === 404, 'a missing card answers exactly like a forbidden one (404)')
    const comments = await call(getComments as Handler, stranger, 'GET', `/api/todos/${sprintCard}/comments`, { id: sprintCard })
    check(comments.status === 404, `comments of a sprint card the stranger cannot read: ${comments.status} (expected 404)`)
    // Known gap (reported): DEPARTMENT_LEAD writes any card (TODO_WRITE_ROLES), and read ⊇ write.
    const leadRead = await call(getTodo as Handler, leadInDept, 'GET', `/api/todos/${sprintCard}`, { id: sprintCard })
    console.log(`  info DEPARTMENT_LEAD not invited: sprint card GET ${leadRead.status} (read ⊇ write; DL is in TODO_WRITE_ROLES)`)

    // ── 4: participants edit every card in their sprint ──────────────────────
    console.log('\n## Decision 4 — participants may edit every card in the sprint')
    const p1 = await call(patchTodo as Handler, participant, 'PATCH', `/api/todos/${sprintCard}`, { id: sprintCard }, { coverColor: 'blue' })
    check(p1.status === 200, `participant PATCHes a card they are not on: ${p1.status} (expected 200)`)
    const p2 = await call(patchTodo as Handler, empInDept, 'PATCH', `/api/todos/${sprintCard}`, { id: sprintCard }, { coverColor: 'red' })
    check(p2.status === 403, `uninvited department member PATCH: ${p2.status} (expected 403)`)

    // ── Being put on a card is an invitation ────────────────────────────────
    console.log('\n## Being added as a card member invites to the board')
    check((await call(getBoard as Handler, later, 'GET', `/api/sprints/${S.id}/board`, S)).status === 403, 'before: not on the board (403)')
    const add = await call(addMember as Handler, participant, 'POST', `/api/todos/${sprintCard}/members`, { id: sprintCard }, { userId: later })
    check(add.status === 200, `participant adds a member to the card: ${add.status}`)
    const row = await prisma.sprintParticipant.findUnique({ where: { sprintId_userId: { sprintId: S.id, userId: later } } })
    check(row?.role === 'MEMBER', 'a SprintParticipant (MEMBER) row now exists for them')
    check((await call(getBoard as Handler, later, 'GET', `/api/sprints/${S.id}/board`, S)).status === 200, 'after: board GET 200')
    check((await listed(later)).includes(S.id), 'after: listed in GET /api/sprints')
    // Moving your own card onto a board you cannot see is refused (no self-invite).
    const move = await call(patchTodo as Handler, stranger, 'PATCH', `/api/todos/${strangerCard}`, { id: strangerCard }, { sprintId: S.id })
    check(move.status === 403, `a stranger cannot move their own card onto a board they cannot see: ${move.status} (expected 403)`)
    const stillOut = await prisma.sprintParticipant.findUnique({ where: { sprintId_userId: { sprintId: S.id, userId: stranger } } })
    check(stillOut === null, '…and is not invited by trying')

    // ── Members endpoint ────────────────────────────────────────────────────
    console.log('\n## Members endpoint')
    const pOwner = await call(getParticipants as Handler, owner, 'GET', `/api/sprints/${S.id}/participants`, S)
    check(pOwner.status === 200 && pOwner.json.data.canManage === true, 'owner: lists members and may manage them')
    const pPart = await call(getParticipants as Handler, participant, 'GET', `/api/sprints/${S.id}/participants`, S)
    check(pPart.status === 200 && pPart.json.data.canManage === false, 'participant: lists members read-only')
    check((await call(getParticipants as Handler, stranger, 'GET', `/api/sprints/${S.id}/participants`, S)).status === 404, 'stranger: 404')
    const selfInvite = await call(inviteParticipant as Handler, leadInDept, 'POST', `/api/sprints/${S.id}/participants`, S, { userId: leadInDept })
    check(selfInvite.status === 404, `uninvited lead cannot invite themselves: ${selfInvite.status} (expected 404)`)
    const invite = await call(inviteParticipant as Handler, owner, 'POST', `/api/sprints/${S.id}/participants`, S, { userId: stranger })
    check(invite.status === 200, `owner invites the stranger: ${invite.status}`)
    check((await call(getTodo as Handler, stranger, 'GET', `/api/todos/${sprintCard}`, { id: sprintCard })).status === 200, 'invited stranger can now open the sprint card')
  } finally {
    // Cascades remove participants, columns, members, activity logs.
    await prisma.todo.deleteMany({ where: { id: { in: created.todos } } })
    await prisma.sprint.deleteMany({ where: { id: { in: created.sprints } } })
    await prisma.objective.deleteMany({ where: { id: { in: created.objectives } } })
    await prisma.departmentMembership.deleteMany({ where: { userId: { in: created.users } } })
    await prisma.department.deleteMany({ where: { id: { in: created.depts } } })
    await prisma.watcher.deleteMany({ where: { userId: { in: created.users } } })
    await prisma.user.deleteMany({ where: { id: { in: created.users } } })
    await prisma.$disconnect()
  }

  console.log(`\n# ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURE(S)`}`)
  if (failures > 0) process.exitCode = 1
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
