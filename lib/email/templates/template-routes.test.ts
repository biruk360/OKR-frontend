import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Every in-app link an email template can emit must land on a real page.
 * Source scan: collect each '/dashboard…', '/auth…' and '/portal…' literal in
 * lib/email/templates/*.ts and resolve it against the app/ router tree
 * (dynamic `${…}` parts must hit a `[param]` folder; query strings are ignored).
 */

const ROOT = path.resolve(__dirname, '..', '..', '..')
const APP_DIR = path.join(ROOT, 'app')
const TEMPLATES_DIR = __dirname
const DYNAMIC = '\u0000dynamic'

function templateFiles(): string[] {
  return readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => path.join(TEMPLATES_DIR, f))
}

function collectPaths(): Array<{ file: string; raw: string }> {
  const out: Array<{ file: string; raw: string }> = []
  const re = /(['"`])(\/(?:dashboard|auth|portal)(?:[^'"`\s\\]|\$\{[^}]*\})*)/g
  for (const file of templateFiles()) {
    const src = readFileSync(file, 'utf8')
    for (const m of Array.from(src.matchAll(re))) out.push({ file: path.basename(file), raw: m[2] })
  }
  return out
}

function isDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory()
}

function hasPage(dir: string): boolean {
  return ['page.tsx', 'page.ts', 'page.jsx', 'page.js'].some((f) => existsSync(path.join(dir, f)))
}

/** Children of `dir`, looking through route groups like `(marketing)`. */
function childDirs(dir: string): Array<{ name: string; full: string }> {
  const out: Array<{ name: string; full: string }> = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (!isDir(full)) continue
    if (/^\(.+\)$/.test(name)) out.push(...childDirs(full))
    else out.push({ name, full })
  }
  return out
}

function resolves(dir: string, segments: string[]): boolean {
  if (segments.length === 0) {
    return hasPage(dir) || childDirs(dir).some((c) => /^\[\[\.\.\..+\]\]$/.test(c.name) && hasPage(c.full))
  }
  const [head, ...rest] = segments
  for (const child of childDirs(dir)) {
    if (/^\[{1,2}\.\.\..+\]{1,2}$/.test(child.name) && hasPage(child.full)) return true
    const isParam = /^\[[^.\]]+\]$/.test(child.name)
    if ((head !== DYNAMIC && child.name === head) || isParam) {
      if (resolves(child.full, rest)) return true
    }
  }
  return false
}

function toSegments(raw: string): string[] {
  const withoutTemplates = raw.replace(/\$\{[^}]*\}/g, DYNAMIC)
  const pathname = withoutTemplates.split(/[?#]/)[0]
  return pathname.split('/').filter(Boolean)
}

test('email templates reference at least the core app routes', () => {
  const raws = new Set(collectPaths().map((p) => p.raw))
  assert.ok(raws.size >= 10, `expected to find template links, found ${raws.size}`)
})

test('every email template link resolves to an existing app/ route', () => {
  const broken = collectPaths().filter(({ raw }) => !resolves(APP_DIR, toSegments(raw)))
  assert.deepEqual(
    broken.map((b) => `${b.file}: ${b.raw}`),
    [],
    'these template links have no matching page under app/',
  )
})

test('the resolver rejects routes that do not exist', () => {
  for (const bad of ['/dashboard/my', '/dashboard/alignment', '/dashboard/team', '/dashboard/admin/users', '/auth/activate']) {
    assert.equal(resolves(APP_DIR, toSegments(bad)), false, bad)
  }
  assert.equal(resolves(APP_DIR, toSegments('/dashboard/objectives/${d.id}')), true)
  assert.equal(resolves(APP_DIR, toSegments('/dashboard?checkin=1')), true)
})
