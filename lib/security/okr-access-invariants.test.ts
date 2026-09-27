import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Static invariants for the 2026-09-25 remediation (S4 — OKR access):
 *   - the objective detail page gates on canViewObjective + DELETED like the KR page;
 *   - GET /api/todos/[id] applies the card read rule (canReadTodo) before loading;
 *   - canReadTodo is a real rule built on the unified visibility rule, not a pass-through;
 *   - /api/risks applies object-level view/edit checks;
 *   - retrospective HTML is sanitised on write and never rendered raw.
 * These scans stop a refactor from quietly reopening any of the gaps.
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

test('objective detail page checks canViewObjective and DELETED before rendering', () => {
  // The page is thin (session gate → loader → render); the gate lives in its loader.
  assert.match(read('app/dashboard/objectives/[id]/page.tsx'), /loadObjectiveDetail\(session\.user, id\)/)
  const page = read('features/objectives/services/objective-detail.server.ts')
  assert.match(page, /status === 'DELETED'\) notFound\(\)/)
  const view = page.indexOf('canViewObjective(')
  assert.ok(view > 0, 'objective page does not call canViewObjective')
  assert.match(page, /if \(!visibility\.canView\) notFound\(\)/)
  assert.ok(view < page.indexOf('prisma.todo.findMany('), 'the gate must run before initiatives are read')
  assert.match(page, /redactObjective\(/, 'a redacted viewer must get the redacted objective')
  assert.match(page, /redactKeyResult\(/, 'private KRs must be redacted on the objective page')
})

test('GET /api/todos/[id] applies canReadTodo and answers 404 before loading the card', () => {
  const get = handlers(read('app/api/todos/[id]/route.ts')).GET
  assert.ok(get, 'expected a GET handler')
  const gate = get.indexOf('canReadTodo(')
  assert.ok(gate > 0, 'GET /api/todos/[id] does not call canReadTodo')
  assert.ok(gate < get.indexOf('prisma.todo.findUnique('), 'the read gate must run before the card is loaded')
  assert.match(get, /canReadTodo\(session\.user, todoId\)\)\) return apiNotFound\(/)
})

test('canReadTodo is built on the unified visibility rule and explicit participants', () => {
  const lib = read('lib/todos/access.ts')
  const start = lib.indexOf('export async function canReadTodo')
  assert.ok(start > 0, 'canReadTodo is not exported')
  const fn = lib.slice(start, lib.indexOf('\n}\n', start))
  assert.doesNotMatch(fn, /_actor/, 'canReadTodo must use the actor')
  for (const call of ['todoReadVerdict(', 'hasTodoParticipantWriteAccess(', 'prisma.watcher.findFirst(',
    'canViewSprint(', 'isOnVisibilitySurface(', 'canViewLinkedOkrUnredacted(', 'canWriteTodo(']) {
    assert.ok(fn.includes(call), `canReadTodo does not call ${call.slice(0, -1)}`)
  }
  assert.match(fn, /userType === 'CLIENT_PORTAL'\) return false/)
  assert.match(lib, /todoVisibilityWhere\(user, 'todos'/)
  assert.match(lib, /todoVisibilityWhere\(user, 'work'/)
})

test('/api/risks applies object-level view (GET) and edit (POST) checks', () => {
  const src = read('app/api/risks/route.ts')
  for (const call of ['canViewObjective(', 'canViewKeyResult(', 'canEditObjective(', 'canEditKeyResultWithObjectiveContext(']) {
    assert.ok(src.includes(call), `risks route does not call ${call.slice(0, -1)}`)
  }
  const hs = handlers(src)
  const get = hs.GET
  assert.ok(get.indexOf('riskParentAccess(') > 0 && get.indexOf('riskParentAccess(') < get.indexOf('prisma.risk.findMany('),
    'GET must check access before reading risks (and reporter emails)')
  const post = hs.POST
  assert.ok(post.indexOf('riskParentAccess(') > 0 && post.indexOf('riskParentAccess(') < post.indexOf('prisma.risk.create('),
    'POST must check access before creating a risk')
  assert.match(post, /if \(!access\.canEdit\)/)
})

test('retrospective PUT sanitises input and never spreads the raw body', () => {
  for (const route of ['app/api/objectives/[id]/retrospective/route.ts', 'app/api/keyresults/[id]/retrospective/route.ts']) {
    const put = handlers(read(route)).PUT
    assert.ok(put, `${route} has no PUT`)
    assert.match(put, /parseRetrospectiveInput\(/, `${route} does not sanitise the retrospective`)
    assert.doesNotMatch(put, /body\.what/, `${route} stores raw body fields`)
  }
})

test('retrospective HTML is rendered only through the DOMPurify component', () => {
  for (const file of ['components/shared/RolledFromBanner.tsx', 'components/period-close-report/PeriodCloseReportClient.tsx']) {
    const src = read(file)
    assert.doesNotMatch(src, /dangerouslySetInnerHTML/, `${file} renders raw HTML`)
    assert.match(src, /RichTextContent/, `${file} must render rich text via RichTextContent`)
  }
})
