import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Static invariants for invite-only sprint boards (2026-09-25, decision 1b):
 *   - `canViewSprint` has no department branch any more;
 *   - every sprint LIST applies `sprintVisibilityWhere` (the same rule in SQL);
 *   - every write path that puts someone on a sprint card invites them
 *     (`inviteToSprint`) — and nothing removes a participant automatically;
 *   - moving/creating a card onto a board requires being able to view it;
 *   - the members endpoint gates view / edit.
 * The pure rule itself is unit-tested in lib/sprints/access.test.ts.
 */

const ROOT = join(__dirname, '..', '..')
const read = (r: string) => readFileSync(join(ROOT, r), 'utf8')

function handlers(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  const marks = [...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)]
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index! : src.length
    out[m[1]] = src.slice(m.index!, end)
  })
  return out
}

test('canViewSprint is invite-only: no department-membership branch', () => {
  const lib = read('lib/permissions.ts')
  const start = lib.indexOf('export function sprintViewVerdict')
  const fn = lib.slice(start, lib.indexOf('\n}\n', start))
  assert.ok(start > 0, 'sprintViewVerdict is not exported')
  assert.doesNotMatch(fn, /isInDepartment|departmentId|departmentMembership/, 'department membership must not grant sprint view')
  assert.match(fn, /CLIENT_PORTAL/)
  const view = lib.slice(lib.indexOf('export async function canViewSprint'))
  assert.match(view.slice(0, view.indexOf('\n}\n')), /sprintViewVerdict\(/, 'canViewSprint must delegate to the pure verdict')
})

test('every sprint list applies sprintVisibilityWhere', () => {
  const lists: [string, string | null][] = [
    ['app/api/sprints/route.ts', 'GET'],
    ['app/api/sprints/active/route.ts', 'GET'],
    ['app/api/sprints/[id]/end/route.ts', 'GET'], // destination picker
    ['app/api/sprints/[id]/report/route.ts', 'GET'], // lineage names
    ['lib/dashboards/home.server.ts', null], // home dashboard team activity feed (sprint card titles)
  ]
  for (const [file, method] of lists) {
    const src = read(file)
    const body = method ? handlers(src)[method] : src
    assert.ok(body, `${file} has no ${method}`)
    assert.match(body, /sprintVisibilityWhere\(/, `${file} ${method ?? ''} does not apply sprintVisibilityWhere`)
  }
  // GET /api/sprints must AND the rule, never spread it (spreading would let a
  // caller-supplied OR/participants filter overwrite it).
  assert.match(handlers(read('app/api/sprints/route.ts')).GET, /AND: \[where, scopeFilter \?\? \{\}, sprintVisibilityWhere\(session\.user\)\]/)
})

test('being put on a sprint card invites: every such write path calls inviteToSprint', () => {
  const paths: [string, string | null][] = [
    ['app/api/todos/route.ts', 'POST'],
    ['app/api/todos/[id]/route.ts', 'PATCH'],
    ['app/api/todos/[id]/members/route.ts', 'POST'],
    ['app/api/todos/[id]/duplicate/route.ts', 'POST'],
    ['app/api/sprints/ai/[planId]/accept/route.ts', 'POST'],
    ['app/api/sprints/[id]/clone/route.ts', 'POST'],
    ['app/api/sprints/[id]/reopen/route.ts', 'POST'],
    ['lib/sprints/close-sprint.ts', null],
    ['lib/todos/recurrence-generator.ts', null],
  ]
  for (const [file, method] of paths) {
    const src = read(file)
    const body = method ? handlers(src)[method] : src
    assert.ok(body, `${file} has no ${method}`)
    assert.match(body, /inviteToSprint\(tx|inviteToSprint\(prisma/, `${file} ${method ?? ''} does not invite the card's people`)
  }
})

test('nothing removes a sprint participant automatically', () => {
  const allowed = new Set([
    'app/api/sprints/[id]/participants/route.ts', // explicit Remove in the members dialog
    'app/api/sprints/[id]/route.ts', // explicit PATCH participantIds (full replacement)
  ])
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.(ts|tsx)$/.test(entry) || entry.endsWith('.test.ts')) continue
      const rel = relative(ROOT, full).split(sep).join('/')
      if (allowed.has(rel)) continue
      if (/sprintParticipant\.(delete|deleteMany)\(/.test(readFileSync(full, 'utf8'))) offenders.push(rel)
    }
  }
  for (const dir of ['app', 'lib', 'features']) walk(join(ROOT, dir))
  assert.deepEqual(offenders, [], `unexpected participant removal in:\n  ${offenders.join('\n  ')}`)
  // Leaving a card leaves the board alone.
  assert.doesNotMatch(handlers(read('app/api/todos/[id]/members/route.ts')).DELETE, /sprintParticipant/)
})

test('a card can only be put on a board its creator/mover can view', () => {
  const patch = handlers(read('app/api/todos/[id]/route.ts')).PATCH
  const view = patch.indexOf('canViewSprint(')
  assert.ok(view > 0 && view < patch.indexOf('prisma.$transaction('), 'PATCH must check the target sprint before writing')
  const post = handlers(read('app/api/todos/route.ts')).POST
  assert.ok(post.indexOf('canViewSprint(') > 0 && post.indexOf('canViewSprint(') < post.indexOf('tx.todo.create('))
  const gen = handlers(read('app/api/sprints/ai/generate/route.ts')).POST
  assert.ok(gen.indexOf('canViewSprint(') > 0 && gen.indexOf('canViewSprint(') < gen.indexOf('runSprintPlanPipeline('))
  assert.match(read('lib/sprints/close-sprint.ts'), /sprintViewVerdict\(\{ id: actorId, role: actor\.role \}, next\)/)
})

test('the members endpoint: GET needs view (404), POST/DELETE need canEditSprint', () => {
  const hs = handlers(read('app/api/sprints/[id]/participants/route.ts'))
  for (const m of ['GET', 'POST', 'DELETE']) {
    assert.ok(hs[m], `participants route has no ${m}`)
    assert.match(hs[m], /viewGate\(sprint, session\)\)\) return apiNotFound\(/, `${m} must 404 a sprint the caller cannot view`)
  }
  for (const m of ['POST', 'DELETE']) assert.match(hs[m], /canEditSprint\(/, `${m} must require canEditSprint`)
  assert.match(hs.DELETE, /The sprint owner cannot be removed/)
  assert.doesNotMatch(hs.DELETE, /todoMember|assigneeId/, 'removing someone from the board must not touch their cards')
})

test('board reorder lets sprint participants move cards (decision 4)', () => {
  const post = handlers(read('app/api/sprints/[id]/board/reorder/route.ts')).POST
  assert.match(post, /canMoveSprintCards\(/)
})
