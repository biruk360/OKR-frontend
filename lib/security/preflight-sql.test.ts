import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Static checks over scripts/preflight.sql.
 *
 * The file's own header promises "every block is guarded so running this
 * repeatedly is a no-op" — it runs on the VPS before `prisma db push`, with no
 * migration history to fall back on. That promise was enforced by nothing but
 * care, and the file is now 700+ lines. A re-run that is not a no-op fails the
 * deploy, or worse, half-applies.
 *
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md §8.2 (DM-2 dependency).
 */

const SQL_PATH = join(__dirname, '..', '..', 'scripts', 'preflight.sql')
const RAW = readFileSync(SQL_PATH, 'utf8')

/** Strip `--` comments and the bodies of DO $$ ... $$ blocks, which carry their
 *  own IF EXISTS / IF NOT EXISTS guards and are checked separately. */
function bareStatements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
  const withoutDoBlocks = withoutComments.replace(/DO\s*\$\$[\s\S]*?\$\$\s*;?/gi, ' ')
  return withoutDoBlocks
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const STATEMENTS = bareStatements(RAW)
const DO_BLOCKS = [...RAW.matchAll(/DO\s*\$\$([\s\S]*?)\$\$/gi)].map((m) => m[1])

test('the file is present and substantial', () => {
  assert.ok(RAW.length > 1000, 'preflight.sql looks empty or truncated')
  assert.ok(STATEMENTS.length > 0, 'no top-level statements parsed — the parser may be wrong')
})

test('every bare ADD COLUMN is idempotent', () => {
  const offenders = STATEMENTS.filter(
    (s) => /ALTER TABLE/i.test(s) && /ADD COLUMN/i.test(s) && !/ADD COLUMN IF NOT EXISTS/i.test(s),
  )
  assert.deepEqual(
    offenders, [],
    `these ADD COLUMN statements are outside a guarded DO block and lack IF NOT EXISTS:\n  ${offenders.join('\n  ')}`,
  )
})

test('every bare CREATE INDEX is idempotent', () => {
  const offenders = STATEMENTS.filter(
    (s) => /CREATE (UNIQUE )?INDEX/i.test(s) && !/IF NOT EXISTS/i.test(s),
  )
  assert.deepEqual(
    offenders, [],
    `these CREATE INDEX statements lack IF NOT EXISTS:\n  ${offenders.join('\n  ')}`,
  )
})

test('no bare CREATE TABLE without IF NOT EXISTS', () => {
  const offenders = STATEMENTS.filter(
    (s) => /CREATE TABLE/i.test(s) && !/CREATE TABLE IF NOT EXISTS/i.test(s),
  )
  assert.deepEqual(offenders, [], `unguarded CREATE TABLE:\n  ${offenders.join('\n  ')}`)
})

test('constraint changes only happen inside guarded DO blocks', () => {
  // ADD/DROP CONSTRAINT is not idempotent on its own: re-adding throws
  // "already exists", re-dropping throws "does not exist". Both fail the deploy.
  const offenders = STATEMENTS.filter((s) => /(ADD|DROP) CONSTRAINT/i.test(s))
  assert.deepEqual(
    offenders, [],
    `constraint changes must sit inside a DO block that checks pg_constraint first:\n  ${offenders.join('\n  ')}`,
  )
})

test('every DO block that ADDS a constraint is guarded against re-adding it', () => {
  // Two shapes are idempotent, and both appear in this file:
  //   1. check pg_constraint directly, or
  //   2. add the constraint inside the same `IF NOT EXISTS (column…)` guard that
  //      creates the column — it can only run on the pass that adds the column.
  // Shape 2 is why this does not simply demand pg_constraint.
  const offenders = DO_BLOCKS
    .filter((b) => /ADD CONSTRAINT/i.test(b))
    .filter((b) => !/pg_constraint/i.test(b) && !/information_schema\.columns/i.test(b))
  assert.deepEqual(
    offenders.map((b) => b.slice(0, 160).replace(/\s+/g, ' ')), [],
    'a DO block adds a constraint with no guard against it already existing',
  )
})

test('every DO block that DROPS a constraint checks pg_constraint first', () => {
  // Dropping has no column-creation guard to hide behind: a second run throws
  // "constraint does not exist" and fails the deploy.
  const offenders = DO_BLOCKS
    .filter((b) => /DROP CONSTRAINT/i.test(b))
    .filter((b) => !/pg_constraint/i.test(b))
  assert.deepEqual(
    offenders.map((b) => b.slice(0, 160).replace(/\s+/g, ' ')), [],
    'a DO block drops a constraint without checking whether it is still there',
  )
})

test('every DO block that adds a column checks information_schema first', () => {
  const offenders = DO_BLOCKS
    .filter((b) => /ADD COLUMN/i.test(b))
    .filter((b) => !/information_schema\.columns/i.test(b) && !/IF NOT EXISTS/i.test(b))
  assert.deepEqual(
    offenders.map((b) => b.slice(0, 120).replace(/\s+/g, ' ')), [],
    'a DO block adds a column without checking whether it already exists',
  )
})

test('DM-2: the sprint_columns statusKey unique constraint is dropped, never re-added', () => {
  // The whole dynamic-lists model depends on several lanes sharing a status.
  // An earlier section used to CREATE this constraint; if that ever returns,
  // the two sections fight on every deploy.
  const name = 'sprint_columns_sprintId_statusKey_key'
  const adds = DO_BLOCKS.filter((b) => b.includes(name) && /ADD CONSTRAINT/i.test(b))
  const drops = DO_BLOCKS.filter((b) => b.includes(name) && /DROP CONSTRAINT/i.test(b))
  assert.equal(adds.length, 0, 'preflight re-adds the statusKey unique constraint that dynamic lists require dropped')
  assert.equal(drops.length, 1, `expected exactly one guarded DROP of ${name}, found ${drops.length}`)
})

test('the columnId backfill only ever targets rows that have none', () => {
  // Without the IS NULL guard a re-run would re-home every card to the first
  // lane of its status, silently undoing user-made moves.
  const backfill = STATEMENTS.find(
    (s) => /UPDATE .*initiatives/i.test(s) && /"columnId" = sc\.id/i.test(s),
  )
  assert.ok(backfill, 'the columnId backfill statement was not found')
  assert.match(backfill!, /"columnId" IS NULL/i, 'the columnId backfill must be scoped to rows with no lane yet')
})
