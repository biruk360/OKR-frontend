import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { liveTimeframeWhere } from './active-timeframe'

const ROOT = join(__dirname, '..', '..')

test('liveTimeframeWhere accepts the selected timeframe OR one covering now', () => {
  const now = new Date('2026-09-27T10:00:00Z')
  assert.deepEqual(liveTimeframeWhere(now), {
    OR: [{ isActive: true }, { startDate: { lte: now }, endDate: { gte: now } }],
  })
})

// Production ran with no timeframe flagged isActive (2026-09-27): every surface that
// required it came up empty ("No timeframes" on the strategy map). Only the exclusive
// toggle itself and the flag-aware default resolver may filter on isActive alone.
test('no surface filters timeframes on isActive alone', () => {
  const files = [
    'lib/okr/alignment-map-data.ts',
    'features/scrum/services/scrum-links.ts',
    'features/scrum/services/scrum-jobs.ts',
    'lib/notifications/jobs.ts',
    'lib/ai/context-bundler.ts',
  ]
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    assert.doesNotMatch(src, /timeframe(\.findMany|\.findFirst)?\(\{\s*where:\s*\{\s*isActive:\s*true\s*\}/, f)
    assert.doesNotMatch(src, /timeframe:\s*\{\s*isActive:\s*true\s*\}/, f)
  }
})
