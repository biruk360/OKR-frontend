import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { z } from 'zod'
import { SLIP_REASONS } from '../../features/projects/types'

/**
 * Source-level guards for the 2026-09-25 remediation (S5). Each pins a fix
 * that is one careless edit away from regressing and has no unit under test.
 */

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

// The portal pages load their data through the server loader, so it is portal code too.
const PORTAL_PAGE_LOADER = join(ROOT, 'features/projects/services/portal-pages.server.ts')
const PORTAL_SOURCES = [...walk(join(ROOT, 'app/api/portal')), ...walk(join(ROOT, 'app/portal')), PORTAL_PAGE_LOADER]

test('portal and public snapshot pages stay thin: no Prisma, data comes from their server loaders', () => {
  const pages: Array<[string, RegExp]> = [
    ['app/portal/page.tsx', /await loadPortalHomePage\(\)/],
    ['app/portal/projects/[id]/page.tsx', /await loadPortalProjectPage\(params, tab\)/],
    ['app/projects/snapshots/[snapshotId]/page.tsx', /await loadPublicSnapshotPage\(params\.snapshotId\)/],
  ]
  for (const [page, loaderCall] of pages) {
    const src = read(page)
    assert.doesNotMatch(src, /@\/lib\/prisma/, `${page} imports Prisma`)
    assert.match(src, loaderCall, `${page} must call its server loader`)
  }
  const loader = readFileSync(PORTAL_PAGE_LOADER, 'utf8')
  assert.match(loader, /if \(!portalSession && !internalSession\) redirect\('\/portal\/signin'\)/)
  assert.match(loader, /if \(portalSession && !canPortalUserAccessProject\(portalSession, params\.id\)\) notFound\(\)/)
  assert.match(loader, /\{ \.\.\.portalProjectWhere\(portalSession\.user\.projectIds\), id: params\.id \}/)
  assert.match(loader, /portalEnabled: true,\s+archivedAt: null,/)
  const snapshot = read('features/projects/services/snapshot-page.server.ts')
  assert.match(snapshot, /where: \{ id: snapshotId, type: 'PUBLIC_SNAPSHOT', status: 'APPROVED' \}/)
  assert.match(snapshot, /if \(!report\) notFound\(\)/)
})

test('invariant 4: every portal serializer call passes the employee-name list', () => {
  const serializeCall = /\b(serialize[A-Za-z]+ForClient|scrubPortalPayload)\(/g
  let checked = 0
  for (const file of PORTAL_SOURCES) {
    const src = readFileSync(file, 'utf8')
    const calls = src.match(serializeCall) ?? []
    if (calls.length === 0) continue
    const rel = relative(ROOT, file)
    for (const match of src.matchAll(/\b(?:serialize[A-Za-z]+ForClient|scrubPortalPayload)\(([^()]|\([^()]*\))*\)/g)) {
      checked++
      assert.match(match[0], /forbiddenEmployeeNames/, `${rel}: ${match[0].slice(0, 60)}… is missing forbiddenEmployeeNames`)
    }
    assert.match(src, /loadPortalForbiddenNames\(/, `${rel} must load names via loadPortalForbiddenNames`)
  }
  assert.ok(checked >= 8, `expected to inspect the portal serializer calls, saw ${checked}`)
})

test('invariant 4: portal code never builds the name list from active users only', () => {
  for (const file of PORTAL_SOURCES) {
    const src = readFileSync(file, 'utf8')
    assert.ok(
      !/user\.findMany\(\s*\{\s*where:\s*\{\s*isActive/.test(src),
      `${relative(ROOT, file)} loads only active users — inactive employees would leak`,
    )
  }
})

test('invariant 4: portal comment thread is scoped to a portal-enabled project', () => {
  const src = read('app/api/portal/projects/[id]/activities/[activityId]/comments/route.ts')
  assert.match(src, /portalProjectWhere\(/)
})

test('invariant 2: slipReason must be a taxonomy value, not any string', () => {
  for (const p of [
    'app/api/projects/[id]/activities/schedule/route.ts',
    'app/api/projects/[id]/activities/[activityId]/route.ts',
  ]) {
    const src = read(p)
    assert.match(src, /slipReason:\s*z\.enum\(SLIP_REASONS\)/, `${p} accepts a free-text slipReason`)
  }
  const schema = z.enum(SLIP_REASONS)
  for (const bad of ['', ' ', 'x', 'because']) assert.equal(schema.safeParse(bad).success, false, `"${bad}" passed`)
  assert.equal(schema.safeParse('CLIENT_APPROVAL_DELAY').success, true)
})

test('invariant 10: snapshot, client-report, AI assistant and portal comment mutations are audited', () => {
  const snapshots = read('app/api/projects/[id]/snapshots/route.ts')
  assert.equal((snapshots.match(/recordActivity\(\{/g) ?? []).length, 3, 'snapshot create/refresh/delete must each record activity')
  for (const p of [
    'app/api/projects/[id]/reports/route.ts',
    'app/api/projects/[id]/ai-assistant/route.ts',
    'app/api/portal/projects/[id]/activities/[activityId]/comments/route.ts',
  ]) {
    assert.match(read(p), /recordActivity\(\{/, `${p} mutates without an ActivityLog entry`)
  }
})

test('project activity uploads never go back under public/', () => {
  const src = read('app/api/projects/[id]/activities/[activityId]/attachments/route.ts')
  assert.ok(!/['"`]public['"`]/.test(src), 'upload route builds a path under public/')
  assert.ok(!/\bwriteFile\(/.test(src), 'upload route writes bytes itself instead of via persistProjectFile')
  assert.match(src, /validateUpload\(/)
  assert.match(src, /persistProjectFile\(/)
})
