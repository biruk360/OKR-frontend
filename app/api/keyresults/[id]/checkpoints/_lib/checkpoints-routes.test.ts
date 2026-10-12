import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Static wiring checks for the KR checkpoint routes (same approach as
 * lib/okr/lock-guard.test.ts): every mutating handler must hit the period-close
 * lock guard, the KR edit permission and the package audit writer.
 */
const ROOT = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const ROUTES = ['route.ts', '[checkpointId]/route.ts']

test('checkpoint routes import and call the KR lock guard', () => {
  for (const file of ROUTES) {
    const src = read(file)
    assert.match(src, /from '@\/lib\/okr\/lock-guard'/, `${file} must import the lock guard`)
    assert.ok((src.match(/keyResultLockResponse\s*\(/g) || []).length >= 1, `${file} must call keyResultLockResponse`)
    assert.match(src, /resolveCheckpointAccess\s*\(/, `${file} must resolve KR access`)
    assert.match(src, /withAuth</, `${file} must use withAuth`)
  }
})

test('every mutation writes an activity row', () => {
  const collection = read('route.ts')
  assert.match(collection, /auditCheckpointEvent\([\s\S]*'CREATED'/)
  const single = read('[checkpointId]/route.ts')
  assert.match(single, /auditCheckpointUpdate\(/)
  assert.match(single, /auditCheckpointEvent\([\s\S]*'DELETED'/)
})

test('server helper uses the KR permission functions and package audit', () => {
  const lib = read('_lib/checkpoints.server.ts')
  assert.match(lib, /canViewKeyResult\(/)
  assert.match(lib, /canEditKeyResultWithObjectiveContext\(/)
  assert.match(lib, /recordPackageActivity\(/)
  assert.match(lib, /recordPackageUpdateIfChanged\(/)
  assert.match(lib, /entityType: 'KR_CHECKPOINT'/)
})
