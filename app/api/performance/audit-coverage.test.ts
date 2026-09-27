/**
 * Invariant: every mutating Performance API handler writes an ActivityLog row
 * via recordActivity(). Static scan — splits each route file at its
 * `export const <METHOD>` declarations and checks each POST/PUT/PATCH/DELETE
 * handler body calls recordActivity (directly or via a local `audit…()` helper).
 *
 * Run: npx tsx --test app/api/performance/audit-coverage.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(process.cwd(), 'app/api/performance')

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

test('every mutating performance handler records activity', () => {
  const missing: string[] = []
  let checked = 0
  for (const file of routeFiles(ROOT)) {
    const source = readFileSync(file, 'utf8')
    const parts = source.split(/(?=export const (?:GET|POST|PUT|PATCH|DELETE)\b)/)
    for (const part of parts) {
      const method = /^export const (POST|PUT|PATCH|DELETE)\b/.exec(part)?.[1]
      if (!method) continue
      checked++
      // A local `audit…()` helper that wraps recordActivity also counts.
      if (!/recordActivity\(|\baudit\w*\(/.test(part)) missing.push(`${method} ${relative(ROOT, file)}`)
    }
  }
  assert.ok(checked > 20, `expected to scan the performance mutation handlers, found ${checked}`)
  assert.deepEqual(missing, [], `handlers without recordActivity:\n${missing.join('\n')}`)
})
