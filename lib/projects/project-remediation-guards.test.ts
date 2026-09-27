import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { canReadPortfolio } from './portfolio-access'

/** Source guards for remediation F5 (2026-09-25) — each pins a fix with no other unit under test. */

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

test('project module UI never uses native window.prompt / confirm / alert', () => {
  const offenders = [
    ...walk(join(ROOT, 'features/projects')),
    ...walk(join(ROOT, 'app/dashboard/projects')),
    ...walk(join(ROOT, 'app/portal')),
    join(ROOT, 'features/projects/services/portal-pages.server.ts'),
  ].filter((file) => /\bwindow\.(prompt|confirm|alert)\(/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(ROOT, file))
  assert.deepEqual(offenders, [])
})

test('Gantt baseline actions go through confirmation dialogs; re-baseline enforces the 20-char reason', () => {
  const gantt = read('features/projects/components/gantt/GanttChart.tsx')
  assert.doesNotMatch(gantt, /commitBaseline\.mutate\(/, 'toolbar must not commit the baseline in one click')
  assert.match(gantt, /<CommitBaselineDialog/)
  assert.match(gantt, /<RebaselineDialog/)
  const dialog = read('features/projects/components/baseline/RebaselineDialog.tsx')
  assert.match(dialog, /REBASELINE_REASON_MIN_LENGTH = 20/)
  assert.match(dialog, /useRebaselineDiff\(projectId, open\)/)
  assert.match(dialog, /disabled=\{!reasonValid\}/)
  assert.match(read('app/api/projects/[id]/baseline/rebaseline/route.ts'), /min\(20/)
})

test('the orphaned ProjectDetailClient is gone and not exported', () => {
  assert.equal(existsSync(join(ROOT, 'features/projects/components/ProjectDetailClient.tsx')), false)
  assert.doesNotMatch(read('features/projects/index.ts'), /ProjectDetailClient/)
})

test('portfolio: one role rule for the page and every portfolio API route', () => {
  assert.equal(canReadPortfolio('ADMIN'), true)
  assert.equal(canReadPortfolio('EXECUTIVE'), true)
  assert.equal(canReadPortfolio('DEPARTMENT_LEAD'), true)
  assert.equal(canReadPortfolio('EMPLOYEE'), false)
  assert.equal(canReadPortfolio(undefined), false)
  assert.match(read('app/dashboard/projects/portfolio/page.tsx'), /if \(!canReadPortfolio\(session\.user\.role\)\) redirect/)
  for (const file of walk(join(ROOT, 'app/api/projects/portfolio'))) {
    const src = readFileSync(file, 'utf8')
    const rel = relative(ROOT, file)
    assert.match(src, /import \{ canReadPortfolio \} from '@\/lib\/projects\/portfolio-access'/, `${rel} does not use the shared rule`)
    assert.doesNotMatch(src, /role === 'ADMIN'|role !== 'ADMIN'/, `${rel} hardcodes role strings`)
  }
})

test('deterministic "AI" output is logged as provider deterministic, never as a real provider', () => {
  for (const file of ['lib/projects/ai-assistant.ts', 'lib/projects/client-report.ts']) {
    const src = read(file)
    assert.match(src, /provider: 'deterministic'/, file)
    assert.doesNotMatch(src, /provider: 'openai'|provider: 'anthropic'/, file)
  }
})

test('attachment visibility change is write-gated and audited; the portal client reads files only through portal routes', () => {
  const route = read('app/api/projects/[id]/activities/[activityId]/attachments/[attachmentId]/route.ts')
  assert.match(route, /export const PATCH = withAuth/)
  assert.match(route, /ATTACHMENT_VISIBILITY_CHANGED/)
  assert.match(route, /\{ client: tx, required: true \}/)
  const page = read('app/portal/projects/[id]/page.tsx')
  assert.doesNotMatch(page, /\/api\/projects\//, 'portal page must not link to internal API routes')
  assert.doesNotMatch(read('features/projects/services/portal-pages.server.ts'), /\/api\/projects\//, 'portal page loader must not link to internal API routes')
})
