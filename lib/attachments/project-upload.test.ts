/**
 * Project activity attachment upload / serve / static-path guardrails.
 *
 * The same stored-XSS fix as card attachments (todo-upload.test.ts), applied
 * to the project module. The activity uploader used to accept any file type
 * and write it into `public/uploads/project-activities/`, served statically
 * from our own origin with no session check — an uploaded .html/.svg ran as
 * the app, and INTERNAL files were readable by URL without signing in. These
 * tests pin the fix:
 *   - the upload route validates with `validateUpload`, writes only to the
 *     private root (never under public/) and keeps visibility INTERNAL;
 *   - the serve route runs the project read rule, resolves through the
 *     contained resolver, re-verifies the bytes and uses serve.ts headers;
 *   - path resolution for private and legacy rows cannot be walked out of its
 *     root and is pinned to the row's own project/activity/id;
 *   - middleware 404s every spelling of /uploads/project-activities/… while
 *     the card block and the original middleware behaviour are unchanged;
 *   - no UI renders an activity attachment from `storagePath`, and no portal
 *     route exposes attachments without the CLIENT_VISIBLE SQL filter.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md UPL-2..UPL-7, UPL-AC-1;
 *       docs/attachment_viewer_REQUIREMENTS.md NRG-1, A1; CLAUDE.md PM
 *       invariants 5 and 10.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { getMiddlewareMatchers } from 'next/dist/build/analysis/get-page-static-info'
import { getMiddlewareRouteMatcher } from 'next/dist/shared/lib/router/utils/middleware-route-matcher'
import { NextRequest } from 'next/server'
import {
  LEGACY_PROJECT_PUBLIC_ROOT, PROJECT_UPLOAD_ROOT, persistProjectFile, projectAttachmentApiUrl,
  resolveProjectAttachmentPath,
} from './project-storage'
import { TODO_UPLOAD_ROOT } from './todo-storage'
import { BLOCKED_STATIC_UPLOAD_PREFIX, BLOCKED_STATIC_UPLOAD_PREFIXES, isBlockedStaticUploadPath } from './static-paths'
import { validateUpload } from './file-types'
import { config as middlewareConfig, middleware } from '../../middleware'

const ROOT = path.join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const UPLOAD_ROUTE = 'app/api/projects/[id]/activities/[activityId]/attachments/route.ts'
const ITEM_ROUTE = 'app/api/projects/[id]/activities/[activityId]/attachments/[attachmentId]/route.ts'
const PANEL = 'features/projects/components/activity/ActivityDetailPanel.tsx'

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

const bytes = (s: string) => new Uint8Array(Array.from(s).map((c) => c.charCodeAt(0)))
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const HTML = bytes('<script>alert(document.cookie)</script>')
const SVG = bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')

// ── Validation ──────────────────────────────────────────────────────────────

test('UPL-2/3: the files an activity upload must refuse are refused by validateUpload', () => {
  const refused = [
    { filename: 'x.html', declaredMime: 'text/html', head: HTML },
    { filename: 'x.svg', declaredMime: 'image/svg+xml', head: SVG },
    { filename: 'x.xml', declaredMime: 'application/xml', head: bytes('<?xml version="1.0"?>') },
    { filename: 'x.js', declaredMime: 'text/javascript', head: bytes('alert(1)') },
    { filename: 'evil.png', declaredMime: 'image/png', head: HTML },          // magic bytes lie
    { filename: 'x.png', declaredMime: 'image/svg+xml', head: PNG },          // declared MIME lies
    { filename: 'x.bin', declaredMime: 'application/octet-stream', head: PNG }, // unknown type
    { filename: 'noext', declaredMime: '', head: PNG },
  ]
  for (const f of refused) {
    const v = validateUpload({ ...f, size: f.head.byteLength })
    assert.equal(v.ok, false, `accepted ${f.filename} (${f.declaredMime})`)
  }
  const ok = validateUpload({ filename: 'shot.png', declaredMime: 'image/png', size: PNG.byteLength, head: PNG })
  assert.ok(ok.ok && ok.type.mime === 'image/png')
})

test('UPL-2/3: the activity upload route validates before anything is written, and stores the validated MIME', () => {
  const post = code(handler(read(UPLOAD_ROUTE), 'POST'))
  const auth = post.indexOf('getWritableProject(')
  const form = post.indexOf('formData(')
  const validate = post.indexOf('validateUpload(')
  const reject = post.search(/if \(!verdict\.ok\) return apiBadRequest\(verdict\.message\)/)
  const create = post.indexOf('activityAttachment.create(')
  const write = post.indexOf('persistProjectFile(')
  assert.ok(auth >= 0 && auth < form, 'the write-access check must run before the body is read')
  assert.ok(validate > 0, 'POST no longer calls validateUpload')
  assert.ok(reject > validate, 'a failed validation must return 400 with the helper message')
  assert.ok(create > reject && write > reject, 'nothing may be written before validation passes (UPL-AC-1)')
  assert.match(post, /mimeType: verdict\.type\.mime/)
  assert.doesNotMatch(post, /mimeType: file\.type/)
  // Invariant 5: uploads are INTERNAL; nothing in the request can make them client-visible.
  assert.match(post, /visibility: 'INTERNAL'/)
  assert.doesNotMatch(post, /CLIENT_VISIBLE/)
})

// ── Private write ───────────────────────────────────────────────────────────

test('UPL-4/7: the activity upload route never writes under public/, and row + file land together', () => {
  const src = code(read(UPLOAD_ROUTE))
  assert.doesNotMatch(src, /['"]public['"]/, 'upload route references public/')
  assert.doesNotMatch(src, /\/uploads\//, 'upload route builds a static /uploads/ url')
  assert.doesNotMatch(src, /\bwriteFile\(|\bmkdir\(/, 'upload route writes files itself instead of via project-storage')
  assert.match(src, /projectAttachmentApiUrl\(/, 'storagePath must be the authenticated route')
  const post = code(handler(read(UPLOAD_ROUTE), 'POST'))
  assert.match(post, /\$transaction\(/, 'row and file must be written in one transaction')
  assert.match(post, /\.catch\(async[\s\S]*deleteProjectFile\(/, 'a rolled-back transaction must remove the written file')
})

test('the private project root is outside public/ and separate from the card root', () => {
  const pub = path.resolve(process.cwd(), 'public') + path.sep
  assert.ok(!path.resolve(PROJECT_UPLOAD_ROOT).startsWith(pub), `PROJECT_UPLOAD_ROOT is under public/: ${PROJECT_UPLOAD_ROOT}`)
  assert.notEqual(path.resolve(PROJECT_UPLOAD_ROOT), path.resolve(TODO_UPLOAD_ROOT))
  assert.equal(LEGACY_PROJECT_PUBLIC_ROOT, path.join(process.cwd(), 'public', 'uploads', 'project-activities'))
  if (!process.env.PROJECT_UPLOAD_DIR) {
    assert.equal(PROJECT_UPLOAD_ROOT, path.join(process.cwd(), 'var', 'uploads', 'project-activities'))
  }
})

test('persistProjectFile writes <root>/<id> and refuses an unsafe id', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'proj-att-'))
  try {
    const root = path.join(dir, 'private')
    const full = await persistProjectFile('cabc123', Buffer.from(PNG), root)
    assert.equal(full, path.resolve(root, 'cabc123'))
    assert.deepEqual(new Uint8Array(readFileSync(full)), PNG)
    for (const id of ['../x', '..', 'a/b', '', 'x\0y']) {
      await assert.rejects(persistProjectFile(id, Buffer.from(PNG), root), `accepted id ${JSON.stringify(id)}`)
    }
    assert.deepEqual(readdirSync(root), ['cabc123'])
    assert.equal(existsSync(path.join(dir, 'x')), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── Serve route ─────────────────────────────────────────────────────────────

test('UPL-7: the GET route runs the project read rule, resolves via project-storage and sets serve.ts headers', () => {
  const get = code(handler(read(ITEM_ROUTE), 'GET'))
  const access = get.indexOf('getReadableProject(')
  const resolve = get.indexOf('resolveProjectAttachmentPath(')
  const readAt = get.indexOf('readFile(')
  assert.ok(access >= 0, 'GET lost its project access check')
  assert.ok(access < resolve && resolve < readAt, 'access check → contained resolve → read, in that order')
  assert.match(get, /serveTypeFor\(/, 'GET must re-verify bytes before choosing a type')
  assert.match(get, /attachmentResponseHeaders\(/)
  assert.doesNotMatch(get, /path\.(join|resolve)\(/, 'GET builds its own path instead of the contained resolver')
  assert.doesNotMatch(get, /storagePath\.replace|['"]public['"]/)
  // The row is pinned in SQL to the project and activity in the URL.
  const src = code(read(ITEM_ROUTE))
  assert.match(src, /activityId: params\.activityId,\s*activity: \{ milestone: \{ phase: \{ projectId: params\.id \} \} \}/)
})

test('the DELETE route: write access, contained delete, row first, ActivityLog (invariant 10)', () => {
  const del = code(handler(read(ITEM_ROUTE), 'DELETE'))
  assert.match(del, /getWritableProject\(/)
  const rowDelete = del.indexOf('activityAttachment.delete(')
  const fileDelete = del.indexOf('deleteProjectFile(')
  assert.ok(rowDelete > 0 && fileDelete > rowDelete, 'delete the row first, then the bytes via the contained resolver')
  assert.doesNotMatch(del, /\bunlink\(|path\.resolve\(/, 'DELETE must not build a path from storagePath itself')
  assert.match(del, /recordActivity\(\{[\s\S]*kind: 'ATTACHMENT_DELETED'/)
  const post = code(handler(read(UPLOAD_ROUTE), 'POST'))
  assert.match(post, /recordActivity\(\{[\s\S]*kind: 'ATTACHMENT_ADDED'/)
})

// ── Path resolution ─────────────────────────────────────────────────────────

const roots = { privateRoot: '/srv/app/var/uploads/project-activities', legacyRoot: '/srv/app/public/uploads/project-activities' }
const row = (storagePath: string, over: Partial<{ id: string; activityId: string; projectId: string }> = {}) =>
  ({ id: 'att1', activityId: 'act1', projectId: 'p1', storagePath, ...over })

test('resolveProjectAttachmentPath: private rows → <privateRoot>/<id>, legacy rows → <legacyRoot>/<name>', () => {
  assert.deepEqual(
    resolveProjectAttachmentPath(row(projectAttachmentApiUrl('p1', 'act1', 'att1')), roots),
    { kind: 'private', path: path.resolve(roots.privateRoot, 'att1') },
  )
  assert.deepEqual(
    resolveProjectAttachmentPath(row('/uploads/project-activities/1700-uuid.png'), roots),
    { kind: 'legacy', path: path.resolve(roots.legacyRoot, '1700-uuid.png') },
  )
})

test('resolveProjectAttachmentPath: traversal, foreign roots and other rows\' urls resolve to nothing', () => {
  const bad = [
    row('/uploads/project-activities/../../../.env'),
    row('/uploads/project-activities/..'),
    row('/uploads/project-activities/'),
    row('/uploads/project-activities/sub/x.png'),
    row('/uploads/project-activities/..\\..\\x'),
    row('/uploads/project-activities/x\0.png'),
    row('/uploads/todos/x.png'),
    row('/etc/passwd'),
    row('https://evil.example/x.png'),
    row(''),
    // A private-looking path for another project, activity or id is not this row's file.
    row(projectAttachmentApiUrl('p2', 'act1', 'att1')),
    row(projectAttachmentApiUrl('p1', 'act2', 'att1')),
    row(projectAttachmentApiUrl('p1', 'act1', 'att2')),
    row(projectAttachmentApiUrl('p1', 'act1', '../att1'), { id: '../att1' }),
    row(projectAttachmentApiUrl('p1', 'act1', '..'), { id: '..' }),
  ]
  for (const r of bad) {
    assert.equal(resolveProjectAttachmentPath(r, roots), null, `resolved ${JSON.stringify(r.storagePath)} (id ${r.id})`)
  }
})

// ── Static path closed (middleware) ─────────────────────────────────────────

/** Raw spellings Next 14's public/ handler resolves into public/uploads/project-activities/. */
const PROJECT_BYPASS_SPELLINGS = [
  '/uploads/project-activities/x.html',
  '/uploads/project-activities',
  '/uploads/%70roject-activities/x.html',
  '/uploads/project-activities%2Fx.svg',
  '/%75ploads/project-activities/x.html',
  '/uploads%2fproject-activities%2fx.html',
  '/uploads/%2570roject-activities/x.html',
  '/Uploads/Project-Activities/x.html',
  '/UPLOADS/PROJECT-ACTIVITIES/X.SVG',
  '/uploads/./project-activities/x.html',
  '/uploads/x/../project-activities/x.html',
  '/api/../uploads/project-activities/x.html',
  '/_next/static/../../uploads/project-activities/x.html',
  '/_next/../uploads/project-activities/x.html',
  '/x/%2e%2e/uploads/project-activities/x.html',
  '/api/%2E%2E/uploads/project-activities/x.html',
  '/a/b/../../uploads/project-activities/x.html',
]

test('NRG-1: static-paths lists both roots and blocks every spelling of /uploads/project-activities/…', () => {
  assert.deepEqual([...BLOCKED_STATIC_UPLOAD_PREFIXES], ['/uploads/todos', '/uploads/project-activities'])
  assert.equal(BLOCKED_STATIC_UPLOAD_PREFIX, '/uploads/todos')
  for (const p of PROJECT_BYPASS_SPELLINGS) assert.ok(isBlockedStaticUploadPath(p), `not blocked: ${p}`)
  // Card block unchanged.
  for (const p of ['/uploads/todos/x.html', '/uploads/%74odos/x.html', '/api/../uploads/todos/x.html']) {
    assert.ok(isBlockedStaticUploadPath(p), `card block regressed: ${p}`)
  }
  for (const p of [
    '/uploads/project-activitiesx/y', '/uploads/project', '/uploads/project-activity/x', '/uploads/other/x.png',
    '/api/projects/p1/activities/a1/attachments/att1', '/dashboard/projects/p1', '/portal/projects/p1', '/',
  ]) {
    assert.equal(isBlockedStaticUploadPath(p), false, `over-blocked: ${p}`)
  }
})

test('NRG-1: the middleware matcher reaches every spelling and middleware answers 404', () => {
  const matches = getMiddlewareRouteMatcher(getMiddlewareMatchers(middlewareConfig.matcher, {} as never))
  const req = { headers: {}, cookies: {} } as never
  for (const p of PROJECT_BYPASS_SPELLINGS) {
    assert.ok(matches(p, req, {}), `middleware would not run for ${p}`)
    const res = middleware(new NextRequest(`http://localhost:3000${p}`))
    assert.equal(res.status, 404, `middleware did not 404 ${p}`)
    assert.equal(res.headers.get('x-pathname'), null)
  }
  // The authenticated serve route is an ordinary API call: middleware does not run for it.
  assert.equal(matches('/api/projects/p1/activities/a1/attachments/att1', req, {}), false)
  // Original behaviour kept: dashboard path header, portal-only 403, sprint deprecation, card 404.
  const dash = middleware(new NextRequest('http://localhost:3000/dashboard/projects/p1?activity=a1'))
  assert.equal(dash.headers.get('x-pathname'), '/dashboard/projects/p1?activity=a1')
  const portalOnly = middleware(new NextRequest('http://localhost:3000/dashboard/projects', {
    headers: { cookie: 'portal-next-auth.session-token=x; __Secure-portal-next-auth.session-token=x' },
  }))
  assert.equal(portalOnly.status, 403)
  assert.equal(middleware(new NextRequest('http://localhost:3000/api/sprints/s1/activities')).headers.get('Deprecation'), 'true')
  assert.equal(middleware(new NextRequest('http://localhost:3000/uploads/todos/x.html')).status, 404)
  const portalPage = middleware(new NextRequest('http://localhost:3000/portal/projects/p1'))
  assert.equal(portalPage.headers.get('x-middleware-next'), '1')
})

// ── Readers ─────────────────────────────────────────────────────────────────

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full)
  }
  return out
}

test('NRG-1: no UI links an activity attachment by storagePath; the panel uses the authenticated route', () => {
  const panel = code(read(PANEL))
  assert.doesNotMatch(panel, /storagePath/, 'ActivityDetailPanel reads storagePath again')
  assert.match(panel, /href=\{`\/api\/projects\/\$\{project\.id\}\/activities\/\$\{attachment\.activityId\}\/attachments\/\$\{attachment\.id\}`\}/)
  const offenders = ['components', 'features', 'app']
    .flatMap((d) => sourceFiles(path.join(ROOT, d)))
    .filter((f) => f.endsWith('.tsx'))
    .filter((f) => /(?:src|href)=\{[^}]*\.storagePath\b/.test(readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f))
  assert.deepEqual(offenders, [], `these render an attachment from storagePath: ${offenders.join(', ')}`)
})

test('invariant 5: any portal code that reads activity attachments filters CLIENT_VISIBLE in SQL', () => {
  // Today no portal route reads attachments. If one is added it must use the
  // serializer's SQL filter (or the portal list helper) — never an unfiltered query.
  const portalPageLoader = path.join(ROOT, 'features', 'projects', 'services', 'portal-pages.server.ts')
  const portalFiles = [...sourceFiles(path.join(ROOT, 'app', 'api', 'portal')), ...sourceFiles(path.join(ROOT, 'app', 'portal')), portalPageLoader]
  // The portal project page reads client-visible files through its server loader.
  assert.match(code(readFileSync(portalPageLoader, 'utf8')), /portalActivityAttachmentWhere\(/)
  assert.match(readFileSync(path.join(ROOT, 'app', 'portal', 'projects', '[id]', 'page.tsx'), 'utf8'), /await loadPortalProjectPage\(/)
  for (const f of portalFiles) {
    const src = code(readFileSync(f, 'utf8'))
    if (!/activityAttachment|listActivityAttachments|ActivityAttachment/.test(src)) continue
    assert.match(
      src,
      /portalActivityAttachmentWhere\(|listActivityAttachments\([^)]*portal: true/,
      `${path.relative(ROOT, f)} reads attachments without the CLIENT_VISIBLE SQL filter`,
    )
    assert.doesNotMatch(src, /storagePath/, `${path.relative(ROOT, f)} exposes storagePath to the portal`)
  }
  // The internal serve route never accepts a portal session.
  const item = code(read(ITEM_ROUTE))
  assert.match(item, /export const GET = withAuth</)
  assert.doesNotMatch(item, /withPortal|getPortalSession/)
})
