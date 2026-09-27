/**
 * Card (to-do) attachment upload / serve / static-path guardrails.
 *
 * The card uploader used to accept any file type and write it into
 * `public/uploads/todos/`, which Next serves statically from our own origin
 * with no session check: an uploaded .html/.svg was stored XSS, and any card
 * file was readable by URL. These tests pin the fix:
 *   - the upload route validates with `validateUpload` and writes only to the
 *     private root (never under public/);
 *   - the serve route re-verifies the bytes and sets nosniff, a sandboxed CSP,
 *     private caching and `attachment` for anything not an image/PDF;
 *   - path resolution for both private and legacy rows cannot be walked out
 *     of its root;
 *   - middleware 404s every spelling of /uploads/todos/…, and its matcher
 *     (compiled exactly as Next 14 compiles it) reaches those spellings.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md UPL-2..UPL-7, UPL-AC-1;
 *       docs/attachment_viewer_REQUIREMENTS.md NRG-1, NRG-AC-1.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import path from 'path'
import { getMiddlewareMatchers } from 'next/dist/build/analysis/get-page-static-info'
import { getMiddlewareRouteMatcher } from 'next/dist/shared/lib/router/utils/middleware-route-matcher'
import {
  resolveTodoAttachmentPath, todoAttachmentApiUrl, TODO_UPLOAD_ROOT, LEGACY_TODO_PUBLIC_ROOT,
} from './todo-storage'
import { resolveInside, resolveStoredPath, generateStoredName, UPLOAD_ROOT } from './storage'
import { attachmentResponseHeaders, serveTypeFor, SANDBOX_CSP } from './serve'
import { isBlockedStaticUploadPath, normalizeRequestPath } from './static-paths'
import { ALLOWED_TYPES } from './file-types'
import { NextRequest } from 'next/server'
import { config as middlewareConfig, middleware } from '../../middleware'

const ROOT = path.join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const UPLOAD_ROUTE = 'app/api/todos/[id]/attachments/route.ts'
const ITEM_ROUTE = 'app/api/todos/[id]/attachments/[attachmentId]/route.ts'

/** Code only — comments may (and do) mention public/ to explain why it is avoided. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function handler(src: string, method: string): string {
  const start = src.indexOf(`export const ${method} `)
  assert.ok(start >= 0, `${method} handler not found`)
  const next = src.indexOf('\nexport const ', start + 1)
  return src.slice(start, next === -1 ? src.length : next)
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
const HTML = new Uint8Array(Array.from('<script>alert(document.cookie)</script>').map((c) => c.charCodeAt(0)))
const type = (mime: string) => ALLOWED_TYPES.find((t) => t.mime === mime)!

// ── Upload route ────────────────────────────────────────────────────────────

test('UPL-2/3: the card upload route validates every file with validateUpload and rejects with its message', () => {
  const post = code(handler(read(UPLOAD_ROUTE), 'POST'))
  const validate = post.indexOf('validateUpload(')
  const reject = post.search(/if \(!verdict\.ok\) return apiBadRequest\(verdict\.message\)/)
  const write = post.indexOf('persistTodoFile(')
  const create = post.indexOf('todoAttachment.create(')
  assert.ok(validate > 0, 'POST no longer calls validateUpload')
  assert.ok(reject > validate, 'a failed validation must return 400 with the helper message')
  assert.ok(write > reject && create > reject, 'nothing may be written before validation passes (UPL-AC-1)')
  // The served type is the validated canonical one, never the uploader's claim.
  assert.match(post, /mimeType: verdict\.type\.mime/)
  assert.doesNotMatch(post, /mimeType: file\.type/)
})

test('UPL-4/7: the card upload route never writes under public/', () => {
  const src = code(read(UPLOAD_ROUTE))
  assert.doesNotMatch(src, /['"]public['"]/, 'upload route references public/')
  assert.doesNotMatch(src, /\/uploads\//, 'upload route builds a static /uploads/ url')
  assert.doesNotMatch(src, /\bwriteFile\(/, 'upload route writes files itself instead of via todo-storage')
  assert.match(src, /todoAttachmentApiUrl\(/, 'row url must be the authenticated route')
  // The access gate added for SEC-2 / STA-7 stays at the top, before any read of the body.
  const post = code(handler(read(UPLOAD_ROUTE), 'POST'))
  // Since 2026-09-25 that gate is the card write guard (canWriteTodo + 409 SPRINT_CLOSED).
  const gate = post.indexOf('todoWriteGuard(')
  assert.ok(gate > 0 && gate < post.indexOf('formData('), 'todoWriteGuard must run before the body is read')
})

test('the private card root is outside public/', () => {
  const pub = path.resolve(process.cwd(), 'public') + path.sep
  assert.ok(!path.resolve(TODO_UPLOAD_ROOT).startsWith(pub), `TODO_UPLOAD_ROOT is under public/: ${TODO_UPLOAD_ROOT}`)
  assert.ok(!path.resolve(UPLOAD_ROOT).startsWith(pub), `UPLOAD_ROOT is under public/: ${UPLOAD_ROOT}`)
})

// ── Serve route ─────────────────────────────────────────────────────────────

test('UPL-7: the GET route resolves via todo-storage and sets headers via serve.ts', () => {
  const src = read(ITEM_ROUTE)
  const get = code(handler(src, 'GET'))
  assert.match(get, /canAccessAttachmentScope\('TODO'/, 'GET lost its access check')
  assert.match(get, /resolveTodoAttachmentPath\(/)
  assert.match(get, /serveTypeFor\(/, 'GET must re-verify bytes before choosing a type')
  assert.match(get, /attachmentResponseHeaders\(/)
  assert.doesNotMatch(get, /path\.join\(/, 'GET builds its own path instead of the contained resolver')
  const del = code(handler(src, 'DELETE'))
  assert.match(del, /deleteTodoFile\(/)
  assert.doesNotMatch(del, /path\.join\(process\.cwd\(\), 'public', attachment\.url\)/)
  assert.match(del, /attachment\.todoId !== todoId/, 'DELETE must pin the attachment to the card in the URL')
})

test('serve headers: nosniff + private cache everywhere; non-image/PDF is a sandboxed download', () => {
  const cases = [
    { t: type('text/plain'), disp: 'attachment', csp: SANDBOX_CSP },
    { t: type('text/csv'), disp: 'attachment', csp: SANDBOX_CSP },
    { t: type('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), disp: 'attachment', csp: SANDBOX_CSP },
    { t: null, disp: 'attachment', csp: SANDBOX_CSP },
  ]
  for (const { t, disp, csp } of cases) {
    const h = attachmentResponseHeaders({ type: t, filename: 'f', size: 3 })
    assert.equal(h['X-Content-Type-Options'], 'nosniff')
    assert.match(h['Cache-Control'], /^private/)
    assert.ok(h['Content-Disposition'].startsWith(`${disp};`), `${t?.mime ?? 'unknown'} → ${h['Content-Disposition']}`)
    assert.equal(h['Content-Security-Policy'], csp)
    assert.equal(h['Content-Type'], t ? t.mime : 'application/octet-stream')
  }
})

test('serve headers: images inline under a sandboxed CSP; PDFs inline without sandbox', () => {
  for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
    const h = attachmentResponseHeaders({ type: type(mime), filename: 'a.png', size: 1 })
    assert.ok(h['Content-Disposition'].startsWith('inline;'))
    assert.match(h['Content-Security-Policy'], /\bsandbox\b/)
    assert.match(h['Content-Security-Policy'], /default-src 'none'/)
    assert.equal(h['X-Content-Type-Options'], 'nosniff')
  }
  const pdf = attachmentResponseHeaders({ type: type('application/pdf'), filename: 'a.pdf', size: 1 })
  assert.ok(pdf['Content-Disposition'].startsWith('inline;'))
  assert.equal(pdf['Content-Type'], 'application/pdf')
  assert.equal(pdf['Content-Security-Policy'], undefined, "sandbox would stop Chrome's PDF viewer rendering the preview")
})

test('serve headers: a non-ASCII or quote-laden filename cannot break the header', () => {
  const h = attachmentResponseHeaders({ type: type('text/plain'), filename: 'ሰነድ "x"\r\n.txt', size: 1 })
  const cd = h['Content-Disposition']
  assert.ok(/^[\x20-\x7e]*$/.test(cd), `header must be printable ASCII: ${cd}`)
  assert.doesNotMatch(cd.split(';')[1], /"x"/)
  assert.match(cd, /filename\*=UTF-8''/)
})

test('serveTypeFor: legacy bytes that do not match their recorded type are served as opaque', () => {
  assert.equal(serveTypeFor({ filename: 'evil.png', mimeType: 'image/png', bytes: HTML }), null)
  assert.equal(serveTypeFor({ filename: 'x.html', mimeType: 'text/html', bytes: HTML }), null)
  assert.equal(serveTypeFor({ filename: 'x.svg', mimeType: 'image/svg+xml', bytes: HTML }), null)
  assert.equal(serveTypeFor({ filename: 'notes.txt', mimeType: 'text/html', bytes: HTML }), null)
  assert.equal(serveTypeFor({ filename: 'ok.png', mimeType: 'image/png', bytes: PNG })?.mime, 'image/png')
  assert.equal(serveTypeFor({ filename: 'Doc.PDF', mimeType: 'application/pdf', bytes: PDF })?.mime, 'application/pdf')
})

// ── Path resolution ─────────────────────────────────────────────────────────

const roots = { privateRoot: '/srv/app/var/uploads/todos', legacyRoot: '/srv/app/public/uploads/todos' }

test('resolveTodoAttachmentPath: private rows map to <privateRoot>/<id>, legacy rows to <legacyRoot>/<name>', () => {
  const priv = resolveTodoAttachmentPath({ id: 'cabc123', todoId: 't1', url: todoAttachmentApiUrl('t1', 'cabc123') }, roots)
  assert.deepEqual(priv, { kind: 'private', path: path.resolve(roots.privateRoot, 'cabc123') })
  const legacy = resolveTodoAttachmentPath({ id: 'cabc123', todoId: 't1', url: '/uploads/todos/1700-abc.png' }, roots)
  assert.deepEqual(legacy, { kind: 'legacy', path: path.resolve(roots.legacyRoot, '1700-abc.png') })
})

test('resolveTodoAttachmentPath: traversal and foreign urls resolve to nothing', () => {
  const bad = [
    { id: 'a1', todoId: 't1', url: '/uploads/todos/../../../.env' },
    { id: 'a1', todoId: 't1', url: '/uploads/todos/..' },
    { id: 'a1', todoId: 't1', url: '/uploads/todos/' },
    { id: 'a1', todoId: 't1', url: '/uploads/todos/sub/x.png' },
    { id: 'a1', todoId: 't1', url: '/uploads/todos/..\\..\\x' },
    { id: 'a1', todoId: 't1', url: '/uploads/todos/x\0.png' },
    { id: 'a1', todoId: 't1', url: '/uploads/other/x.png' },
    { id: 'a1', todoId: 't1', url: '/etc/passwd' },
    { id: 'a1', todoId: 't1', url: 'https://evil.example/x.png' },
    { id: 'a1', todoId: 't1', url: '' },
    // A private-looking url for another card or another id is not this row's file.
    { id: 'a1', todoId: 't1', url: todoAttachmentApiUrl('t2', 'a1') },
    { id: 'a1', todoId: 't1', url: todoAttachmentApiUrl('t1', 'a2') },
    { id: '../a1', todoId: 't1', url: todoAttachmentApiUrl('t1', '../a1') },
    { id: '..', todoId: 't1', url: todoAttachmentApiUrl('t1', '..') },
  ]
  for (const row of bad) {
    assert.equal(resolveTodoAttachmentPath(row, roots), null, `resolved ${JSON.stringify(row.url)} (id ${row.id})`)
  }
})

test('resolveInside: one plain segment, contained in the root', () => {
  const root = '/srv/app/var/uploads/comments'
  assert.equal(resolveInside(root, 'a.png'), path.resolve(root, 'a.png'))
  for (const name of ['', '.', '..', '../x', 'a/b', 'a\\b', '..hidden', 'x\0y', '/etc/passwd']) {
    assert.throws(() => resolveInside(root, name), `accepted ${JSON.stringify(name)}`)
  }
  // The comment-attachment wrapper still accepts what it generates.
  const stored = generateStoredName('.png')
  assert.equal(resolveStoredPath(stored), path.resolve(UPLOAD_ROOT, stored))
  assert.throws(() => resolveStoredPath('../../etc/passwd'))
})

test('legacy root is the old public dir, the private root is not', () => {
  assert.equal(LEGACY_TODO_PUBLIC_ROOT, path.join(process.cwd(), 'public', 'uploads', 'todos'))
  assert.notEqual(path.resolve(TODO_UPLOAD_ROOT), path.resolve(LEGACY_TODO_PUBLIC_ROOT))
})

// ── Static path closed (middleware) ─────────────────────────────────────────

/** Raw request paths that Next 14's public/ handler resolved to public/uploads/todos/x.html (verified on `next dev`). */
const BYPASS_SPELLINGS = [
  '/uploads/todos/x.html',
  '/uploads/todos',
  '/uploads/%74odos/x.html',
  '/uploads/todos%2Fx.html',
  '/%75ploads/todos/x.html',
  '/uploads%2ftodos%2fx.html',
  '/uploads/%2574odos/x.html',
  '/Uploads/todos/x.html',
  '/UPLOADS/TODOS/x.html',
  '/uploads/./todos/x.html',
  '/uploads/x/../todos/x.html',
  '/api/../uploads/todos/x.html',
  '/_next/static/../../uploads/todos/x.html',
  '/_next/../uploads/todos/x.html',
  '/x/%2e%2e/uploads/todos/x.html',
  '/api/%2E%2E/uploads/todos/x.html',
  '/a/b/../../uploads/todos/x.html',
]

test('NRG-1: every spelling of /uploads/todos/… is blocked by the handler', () => {
  for (const p of BYPASS_SPELLINGS) assert.ok(isBlockedStaticUploadPath(p), `not blocked: ${p}`)
  for (const p of ['/uploads/other/x.png', '/uploadstodos/x', '/uploads/todosx/y', '/dashboard/todos', '/api/todos/t1/attachments/a1', '/', '/icon.svg']) {
    assert.equal(isBlockedStaticUploadPath(p), false, `over-blocked: ${p}`)
  }
  assert.equal(normalizeRequestPath('/a/./b/../C//d'), '/a/c/d')
  assert.equal(normalizeRequestPath('/%E0%A4%A'), '/%e0%a4%a')   // malformed escape does not throw
})

test('NRG-1: the middleware matcher, compiled as Next 14 compiles it, reaches every spelling', () => {
  const matchers = getMiddlewareMatchers(middlewareConfig.matcher, {} as never)
  const matches = getMiddlewareRouteMatcher(matchers)
  const req = { headers: {}, cookies: {} } as never
  for (const p of BYPASS_SPELLINGS) {
    assert.ok(matches(p, req, {}), `middleware would not run for ${p}`)
  }
  // The scopes it had before still match.
  for (const p of ['/dashboard', '/dashboard/todos', '/api/sprints/s1/activities']) {
    assert.ok(matches(p, req, {}), `lost original scope: ${p}`)
  }
  // …and ordinary API calls still do not go through middleware.
  for (const p of ['/api/todos/t1/attachments', '/api/auth/session', '/_next/static/chunks/main.js']) {
    assert.equal(matches(p, req, {}), false, `middleware now runs for ${p}`)
  }
})

test('NRG-1: middleware answers 404 for every spelling of the upload path, and leaves other paths alone', async () => {
  for (const p of BYPASS_SPELLINGS) {
    const res = middleware(new NextRequest(`http://localhost:3000${p}`))
    assert.equal(res.status, 404, `middleware did not 404 ${p}`)
    assert.equal(res.headers.get('x-pathname'), null)
  }
  // Paths outside the original scope pass straight through, unmodified.
  const other = middleware(new NextRequest('http://localhost:3000/auth/signin'))
  assert.equal(other.headers.get('x-middleware-next'), '1')
  assert.equal(other.headers.get('x-pathname'), null)
  // Original behaviour kept: dashboard path header, portal-only block, sprint deprecation.
  const dash = middleware(new NextRequest('http://localhost:3000/dashboard/todos?open=abc'))
  assert.equal(dash.headers.get('x-pathname'), '/dashboard/todos?open=abc')
  const portalOnly = middleware(new NextRequest('http://localhost:3000/dashboard', {
    headers: { cookie: 'portal-next-auth.session-token=x; __Secure-portal-next-auth.session-token=x' },
  }))
  assert.equal(portalOnly.status, 403)
  const sprint = middleware(new NextRequest('http://localhost:3000/api/sprints/s1/activities'))
  assert.equal(sprint.headers.get('Deprecation'), 'true')
})
