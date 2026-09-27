import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// OKR comments are content of the OKR: both reading and posting must pass the
// full-view gate, or comments on private objectives/KRs leak to any signed-in user.
const ROOT = join(__dirname, '..', '..')
const ROUTES = [
  ['app/api/objectives/[id]/comments/route.ts', "'OBJECTIVE'"],
  ['app/api/keyresults/[id]/comments/route.ts', "'KEY_RESULT'"],
] as const

for (const [file, entity] of ROUTES) {
  test(`${file}: GET and POST both gate on canAccessOkrComments`, () => {
    const src = readFileSync(join(ROOT, file), 'utf8')
    for (const method of ['GET', 'POST']) {
      const start = src.indexOf(`export const ${method} =`)
      assert.ok(start >= 0, `${method} handler missing`)
      const next = src.indexOf('export const ', start + 1)
      const body = src.slice(start, next === -1 ? undefined : next)
      assert.match(body, new RegExp(`canAccessOkrComments\\(session\\.user, ${entity}, id\\)`), `${method} must call the gate`)
      assert.ok(
        body.indexOf('canAccessOkrComments(') < body.indexOf('prisma.comment.'),
        `${method} must gate before touching comments`,
      )
    }
  })
}
