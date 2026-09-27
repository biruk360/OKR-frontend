import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Regression barrier for docs/okr_quick_view_modals_REQUIREMENTS.md.
 *  - QV-6: redacted viewers never receive check-ins, initiatives or comments.
 *  - QV-2/3: the Filters quick views read the real field names (the original
 *    mock-up read `createdAt`/`author`/`note` and `confidence === 'ON_TRACK'`
 *    on objectives, so every value was wrong or blank).
 */

const ROOT = path.resolve(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const getHandler = (src: string) => src.slice(src.indexOf('export const GET'), src.indexOf('export const', src.indexOf('export const GET') + 1))

test('QV-6: check-ins GET returns nothing to a redacted viewer, before querying', () => {
  const get = getHandler(read('app/api/keyresults/[id]/check-ins/route.ts'))
  const guard = get.indexOf('if (visibility.isRedacted) return apiSuccess([])')
  assert.ok(guard > 0, 'redacted branch must return an empty list')
  assert.ok(guard < get.indexOf('keyResultCheckIn.findMany'), 'guard must run before the check-in query')
})

test('QV-6: KR GET strips initiatives when redacted and exposes isRedacted', () => {
  const get = getHandler(read('app/api/keyresults/[id]/route.ts'))
  assert.match(get, /\{ \.\.\.redactKeyResult\(keyResult\), todos: \[\] \}/)
  assert.match(get, /isRedacted: visibility\.isRedacted/)
})

test('QV-6: objective GET strips comments + KR initiatives when redacted', () => {
  const get = getHandler(read('app/api/objectives/[id]/route.ts'))
  assert.match(get, /\{ \.\.\.redactObjective\(objective\), comments: \[\] \}/)
  assert.match(get, /\{ \.\.\.redactKeyResult\(kr\), todos: \[\], isRedacted: true \}/, 'individually private KRs drop initiatives')
  assert.match(get, /isRedacted: visibility\.isRedacted/)
})

test('QV-2: KR quick view uses the check-in API field names and shared thread', () => {
  const src = read('features/filters/components/KeyResultDetailModal.tsx')
  assert.match(src, /asOfDate/)
  assert.doesNotMatch(src, /ci\.createdAt|ci\.author|ci\.note/, 'check-ins have asOfDate / createdBy / analysis')
  assert.match(src, /<OkrComments endpoint="keyresults"/)
  assert.match(src, /current \/ target/, 'progress formula must match the full page')
  assert.doesNotMatch(src, /Quick AI Mode|No dependencies/, 'no inert placeholder sections')
})

test('QV-3: objective quick view reads goalStatus + numeric confidence', () => {
  const src = read('features/filters/components/ObjectiveDetailModal.tsx')
  assert.match(src, /tier=\{obj\.goalStatus\}/)
  assert.doesNotMatch(src, /\b(obj|data)\??\.confidence === '(ON_TRACK|AT_RISK|OFF_TRACK)'/, 'Objective.confidence is an Int 0–100 (status is goalStatus)')
  assert.doesNotMatch(src, /Net Confidence Score|No dependencies|There are no dependencies/)
  assert.match(src, /<OkrComments endpoint="objectives"/)
})
