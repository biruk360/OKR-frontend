/**
 * Source-level guardrails for the attachment viewer.
 *
 * These assert over the checked-in source rather than over behaviour: the two
 * things they protect — that nothing reads an attachment from a statically
 * served path, and that no surface re-rolls its own click handling — are
 * properties of the codebase that a unit test on one module cannot see.
 *
 * Spec: docs/attachment_viewer_REQUIREMENTS.md NRG-AC-1, AVW-1, AVW-3.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..')
const UI_DIRS = ['components', 'features', 'app']

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) tsxFiles(full, out)
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

const files = UI_DIRS.flatMap((d) => tsxFiles(path.join(ROOT, d)))
const sources = files.map((f) => ({ file: path.relative(ROOT, f), text: readFileSync(f, 'utf8') }))

test('there is source to scan', () => {
  assert.ok(sources.length > 100, `expected the UI tree, found ${sources.length} files`)
})

// ── NRG-AC-1 ───────────────────────────────────────────────────────────────

test('NRG-AC-1: no component renders a to-do attachment from /uploads/', () => {
  // `public/uploads/**` is served statically with no session check. Every read
  // must go through /api/todos/[id]/attachments/[attachmentId], which runs the
  // permission check and pins the Content-Type we validated on upload.
  const offenders = sources
    .filter(({ text }) => /(?:src|href)=\{?["'`][^"'`]*\/uploads\//.test(text))
    .map(({ file }) => file)
  assert.deepEqual(offenders, [], `these render an attachment from a static path: ${offenders.join(', ')}`)
})

// ── AVW-1 / AVW-3 ──────────────────────────────────────────────────────────

test('AVW-1: only the shared viewer decides how an attachment opens', () => {
  // A surface that opens a file itself is a surface that will drift from the
  // others — which is exactly the defect this spec was written for. The one
  // place allowed to call window.open on an attachment is the hook.
  const offenders = sources
    .filter(({ file }) => file !== 'components/shared/CommentAttachments.tsx')
    .filter(({ text }) => /window\.open\([^)]*\b(att|attachment)\b/i.test(text))
    .map(({ file }) => file)
  assert.deepEqual(offenders, [], `these open an attachment outside the shared viewer: ${offenders.join(', ')}`)
})

test('AVW-3: to-do card attachments are buttons, not inert divs', () => {
  const card = sources.find(({ file }) => file === 'components/todos/TodoCardModal.tsx')
  assert.ok(card, 'TodoCardModal.tsx not found')
  // Both the card grid (surface 1) and the comment thread (surface 2) go
  // through the hook; before this change one did nothing and the other
  // opened a raw tab.
  assert.match(card!.text, /useAttachmentViewer\(/, 'card modal no longer uses the shared viewer')
  assert.equal(
    (card!.text.match(/useAttachmentViewer\(/g) ?? []).length, 2,
    'expected one viewer for the card grid and one for the comment thread',
  )
  assert.doesNotMatch(
    card!.text,
    /<a[^>]*href=\{attachmentUrl\(/,
    'an attachment still opens as a raw link instead of through the viewer',
  )
})
