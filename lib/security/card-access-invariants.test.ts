import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Static invariants for card sub-resources and sprint reads.
 *
 * The checklist routes shipped with only `withAuth`, so any signed-in user
 * could rename, delete or add to any card's checklists by id — and PATCH/DELETE
 * never checked the checklist belonged to the card in the URL. The sprint board
 * and `GET /api/sprints/[id]` skipped `canViewSprint`. These scans stop either
 * gap from quietly coming back in a new or refactored handler.
 *
 * Spec: docs/calendar_view_REQUIREMENTS.md CPM-3, CPM-9;
 *       docs/trello_parity_sprint_board_REQUIREMENTS.md SEC-2, CDM-11, STA-7.
 */

const ROOT = join(__dirname, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

const rel = (f: string) => relative(ROOT, f).split(sep).join('/')
const read = (r: string) => readFileSync(join(ROOT, r), 'utf8')
/** One exported loader's body from features/sprints/services/sprint-pages.server.ts. */
function sprintLoader(name: string): string {
  const src = read('features/sprints/services/sprint-pages.server.ts')
  const start = src.indexOf(`export async function ${name}(`)
  assert.ok(start >= 0, `sprint-pages.server.ts does not export ${name}`)
  return src.slice(start, src.indexOf('\n}\n', start))
}

/** Splits a route source into `{ method: body }` for each exported handler. */
function handlers(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /export const (GET|POST|PUT|PATCH|DELETE)\b/g
  const marks = [...src.matchAll(re)]
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index! : src.length
    out[m[1]] = src.slice(m.index!, end)
  })
  return out
}

/**
 * True when `body` calls one of `callees` directly, or calls a function
 * declared in the same file whose own body calls one of them.
 */
function callsVia(src: string, body: string, callees: string[]): boolean {
  const local = [...src.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)]
  const names = new Set(callees)
  for (const fn of local) {
    const start = fn.index!
    // The body ends at the next top-level declaration, not just the next
    // export — otherwise a helper declared before another helper would be
    // credited with that one's calls.
    const rest = src.slice(start + 1)
    const nextDecl = rest.search(/\n(?:export |async function |function |const |\/\*\*)/)
    const fnBody = src.slice(start, nextDecl === -1 ? src.length : start + 1 + nextDecl)
    if (callees.some((c) => fnBody.includes(`${c}(`))) names.add(fn[1])
  }
  return [...names].some((n) => body.includes(`${n}(`))
}

const CHECKLIST_ROUTES = walk(join(ROOT, 'app', 'api', 'todos', '[id]', 'checklists')).map(rel)
const MUTATIONS = ['POST', 'PUT', 'PATCH', 'DELETE']

test('CPM-3: every checklist mutation handler enforces canWriteTodo', () => {
  assert.ok(CHECKLIST_ROUTES.length >= 4, `expected the checklist routes, found ${CHECKLIST_ROUTES.length}`)
  const failures: string[] = []
  for (const route of CHECKLIST_ROUTES) {
    const src = read(route)
    for (const [method, body] of Object.entries(handlers(src))) {
      if (!MUTATIONS.includes(method)) continue
      if (!callsVia(src, body, ['todoWriteGuard', 'canWriteTodo'])) failures.push(`${method} ${route}`)
    }
  }
  assert.deepEqual(failures, [], `checklist mutations without canWriteTodo:\n  ${failures.join('\n  ')}`)
})

test('SEC-2: checklist/item handlers pin the sub-resource to the card in the URL', () => {
  const failures: string[] = []
  for (const route of CHECKLIST_ROUTES) {
    if (!route.includes('[checklistId]')) continue
    const src = read(route)
    for (const [method, body] of Object.entries(handlers(src))) {
      if (!MUTATIONS.includes(method)) continue
      if (!callsVia(src, body, ['checklistBelongsToTodo', 'checklistItemBelongsToTodo'])) {
        failures.push(`${method} ${route}`)
      }
    }
  }
  assert.deepEqual(failures, [], `handlers that do not pin to the URL card:\n  ${failures.join('\n  ')}`)
})

test('CPM-3: checklist GET handlers apply the card read rule', () => {
  for (const route of CHECKLIST_ROUTES) {
    const src = read(route)
    const get = handlers(src).GET
    if (!get) continue
    assert.ok(callsVia(src, get, ['canReadTodo']), `GET ${route} does not call canReadTodo`)
  }
})

test('CPM-3: PATCH /api/todos/[id] uses the extracted rule, not an inline copy', () => {
  const src = read('app/api/todos/[id]/route.ts')
  const patch = handlers(src).PATCH
  assert.ok(patch, 'expected a PATCH handler')
  assert.match(patch, /canWriteTodo\(/)
  assert.doesNotMatch(patch, /resolveDocTypePermission\(/, 'the write rule must live in lib/todos/access.ts only')
})

test('STA-7: the card write guard returns 403 without canWriteTodo and 409 SPRINT_CLOSED on a closed sprint', () => {
  const src = read('lib/todos/access.ts')
  const guard = src.slice(src.indexOf('export async function todoWriteGuard'))
  assert.match(guard, /canWriteTodo\(/)
  assert.match(guard, /apiForbidden\(/)
  assert.match(guard, /isClosedSprintState\(/)
  assert.match(guard, /status: 409, code: 'SPRINT_CLOSED'/)
})

test('CPM-9: sprint read handlers and the board page check canViewSprint', () => {
  const reads = [
    'app/api/sprints/[id]/route.ts',
    'app/api/sprints/[id]/board/route.ts',
    'app/api/sprints/[id]/columns/route.ts',
    'app/api/sprints/[id]/report/route.ts',
  ]
  for (const route of reads) {
    const get = handlers(read(route)).GET
    assert.ok(get, `${route} has no GET`)
    assert.match(get, /canViewSprint\(/, `GET ${route} does not check canViewSprint`)
  }
  // The page is thin composition; its gate lives in the sprint page loader.
  assert.match(read('app/dashboard/sprints/[id]/page.tsx'), /assertSprintBoardAccess\(/, 'the sprint board page must call its access loader')
  const page = sprintLoader('assertSprintBoardAccess')
  assert.match(page, /canViewSprint\(/, 'the sprint board page does not check canViewSprint')
  assert.match(page, /if \(!allowed\) notFound\(\)/, 'the sprint board page must render not-found when denied')
})

// ---------------------------------------------------------------------------
// Card comments, attachment upload and activity (SEC-2, CDM-11 / STA-7)
// ---------------------------------------------------------------------------

/**
 * Card sub-resources. They shipped with only `withAuth`, so any signed-in user
 * could read or post on any card by id. Since the 2026-09-25 access decisions
 * there is ONE rule set for a card and everything hanging off it:
 * read = `canReadTodo` (via `todoReadGuard`, or `canAccessAttachmentScope('TODO',
 * …, 'read')` which delegates to it), write = `canWriteTodo` via `todoWriteGuard`
 * (404 / 403 / 409 SPRINT_CLOSED).
 */
const CARD_READS: Record<string, string[]> = {
  'app/api/todos/[id]/comments/route.ts': ['GET'],
  'app/api/todos/[id]/activity/route.ts': ['GET'],
  'app/api/todos/[id]/attachments/[attachmentId]/route.ts': ['GET'],
}
const CARD_WRITES: Record<string, string[]> = {
  'app/api/todos/[id]/comments/route.ts': ['POST'],
  'app/api/todos/[id]/comments/[commentId]/route.ts': ['PATCH', 'DELETE'],
  'app/api/todos/[id]/attachments/route.ts': ['POST'],
  'app/api/todos/[id]/attachments/[attachmentId]/route.ts': ['DELETE'],
  'app/api/todos/[id]/labels/route.ts': ['POST', 'DELETE'],
  'app/api/todos/[id]/members/route.ts': ['POST', 'DELETE'],
}
/** Kept for the closed-sprint scan below: every card mutation. */
const CARD_SCOPED: Record<string, string[]> = CARD_WRITES

test('SEC-2: card sub-resource reads apply canReadTodo and writes apply canWriteTodo', () => {
  const failures: string[] = []
  const scan = (table: Record<string, string[]>, callees: string[], label: string) => {
    for (const [route, methods] of Object.entries(table)) {
      const src = read(route)
      const hs = handlers(src)
      for (const method of methods) {
        const body = hs[method]
        if (!body) failures.push(`${method} ${route} (missing handler)`)
        else if (!callsVia(src, body, callees)) failures.push(`${method} ${route} (${label})`)
      }
    }
  }
  scan(CARD_READS, ['todoReadGuard', 'canReadTodo', 'canAccessAttachmentScope'], 'read rule')
  scan(CARD_WRITES, ['todoWriteGuard'], 'write rule')
  assert.deepEqual(failures, [], `card handlers without the card rule:\n  ${failures.join('\n  ')}`)
})

test('decision 4: canAccessAttachmentScope(TODO) delegates to the card rules (read = canReadTodo, write = canWriteTodo)', () => {
  const lib = read('lib/attachments/access.ts')
  const todoCase = lib.slice(lib.indexOf("case 'TODO':"), lib.indexOf("case 'OKR':"))
  assert.match(todoCase, /canWriteTodo\(actor, entityId\)/)
  assert.match(todoCase, /canReadTodo\(actor, entityId\)/)
  assert.doesNotMatch(todoCase, /prisma\./, 'the TODO branch must not re-implement the card rule inline')
  // Staging a comment upload is a write; streaming one back is a read.
  assert.match(read('app/api/comment-attachments/route.ts'), /canAccessAttachmentScope\(commentType, entityId, actor, 'write'\)/)
  assert.match(read('app/api/comment-attachments/[id]/route.ts'), /'read',\n\s*\)/)
})

test('decision 3: every card-by-id read answers 404 through canReadTodo', () => {
  const guard = read('lib/todos/access.ts')
  const readGuard = guard.slice(guard.indexOf('export async function todoReadGuard'))
  assert.match(readGuard, /canReadTodo\(actor, todoId\)\)\) return apiNotFound\(/)
  // The write guard never discloses a card the caller cannot read: 404 before 403.
  const writeGuard = guard.slice(guard.indexOf('export async function todoWriteGuard'))
  const notFound = writeGuard.indexOf("if (!(await canReadTodo(actor, todoId))) return apiNotFound(")
  assert.ok(notFound > 0 && notFound < writeGuard.indexOf('apiForbidden('), 'todoWriteGuard must 404 an unreadable card before 403')
  // Share, watchers and duplicate apply the read rule.
  assert.match(read('app/api/todos/[id]/share/route.ts'), /canReadTodo\(session\.user, todo\.id\)/)
  const watchers = handlers(read('app/api/watchers/route.ts'))
  for (const m of ['GET', 'POST']) {
    assert.match(watchers[m], /entityType === 'TODO' && !\(await canReadTodo\(session\.user, entityId\)\)\) return apiNotFound\(/, `watchers ${m}`)
  }
  const dup = handlers(read('app/api/todos/[id]/duplicate/route.ts')).POST
  const readAt = dup.indexOf('canReadTodo(')
  assert.ok(readAt > 0 && readAt < dup.indexOf('tx.todo.create('), 'duplicate must check canReadTodo before copying')
})

test('STA-7: card comment and attachment mutations are refused on a closed sprint', () => {
  const failures: string[] = []
  for (const [route, methods] of Object.entries(CARD_SCOPED)) {
    const src = read(route)
    const hs = handlers(src)
    for (const method of methods) {
      if (!MUTATIONS.includes(method)) continue
      const body = hs[method]
      if (!body || !callsVia(src, body, ['sprintClosedGuard', 'todoWriteGuard'])) failures.push(`${method} ${route}`)
    }
  }
  assert.deepEqual(failures, [], `mutations without the closed-sprint guard:\n  ${failures.join('\n  ')}`)

  const lib = read('lib/todos/access.ts')
  const guard = lib.slice(lib.indexOf('export async function sprintClosedGuard'))
  assert.ok(lib.includes('export async function sprintClosedGuard'), 'sprintClosedGuard is not exported')
  assert.match(guard, /isClosedSprintState\(/)
  assert.match(guard, /status: 409, code: 'SPRINT_CLOSED'/)
})

test('SEC-2: comment POST gates before it writes, pins parentId to the card, and filters attachmentIds', () => {
  const post = handlers(read('app/api/todos/[id]/comments/route.ts')).POST
  assert.ok(post, 'expected a POST handler')
  const create = post.indexOf('prisma.todoComment.create(')
  assert.ok(create > 0, 'expected the comment create')
  for (const call of ['todoWriteGuard(']) {
    const at = post.indexOf(call)
    assert.ok(at > 0 && at < create, `${call.slice(0, -1)} must run before the comment is created`)
  }
  // parentId must belong to this card and be top-level.
  assert.match(post, /parent\.todoId !== todoId/, 'parentId is not pinned to the URL card')
  assert.match(post, /parent\.parentId !== null/, 'replies to replies are not rejected')
  assert.ok(post.indexOf('parent.todoId !== todoId') < create, 'parentId must be checked before the create')
  // Foreign attachment ids are dropped before storing.
  const filter = post.search(/todoAttachment\.findMany\(\{\s*where: \{ id: \{ in: requestedAttachmentIds \}, todoId \}/)
  assert.ok(filter > 0 && filter < create, 'attachmentIds must be filtered to this card before the create')
})

test('CPM-9: the sprint report page and the clone route check canViewSprint', () => {
  // The page is thin composition; its gate lives in the sprint page loader.
  assert.match(read('app/dashboard/sprints/[id]/report/page.tsx'), /loadSprintReportAccess\(/, 'the sprint report page must call its access loader')
  const page = sprintLoader('loadSprintReportAccess')
  assert.match(page, /canViewSprint\(/, 'the sprint report page does not check canViewSprint')
  assert.match(page, /if \(!allowed\) notFound\(\)/, 'the sprint report page must render not-found when denied')

  const clone = handlers(read('app/api/sprints/[id]/clone/route.ts')).POST
  assert.ok(clone, 'expected a POST handler')
  const view = clone.indexOf('canViewSprint(')
  assert.ok(view > 0, 'clone does not check canViewSprint on the source')
  assert.ok(view < clone.indexOf('prisma.sprint.create('), 'canViewSprint must run before the clone is created')
  assert.ok(view < clone.indexOf('prisma.todo.findMany('), 'canViewSprint must run before source tasks are read')
})
