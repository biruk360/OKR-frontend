import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { canAccessSettings, canManageUsers } from '@/lib/permissions'
import { setProjectManagerCapability } from './project-manager-capability'

const ROOT = process.cwd()

function capabilityDatabase(initial: boolean | null) {
  let isProjectManager = initial
  const updates: unknown[] = []
  const auditEntries: unknown[] = []

  const database = {
    async $transaction<T>(operation: (tx: any) => Promise<T>): Promise<T> {
      return operation({
        user: {
          async findUnique() {
            return isProjectManager === null
              ? null
              : { id: 'employee-1', name: 'Employee One', email: 'employee@example.com', isProjectManager }
          },
          async update(args: any) {
            updates.push(args)
            isProjectManager = args.data.isProjectManager
            return { id: 'employee-1', name: 'Employee One', email: 'employee@example.com', isProjectManager }
          },
        },
        activityLog: {
          async create(args: unknown) {
            auditEntries.push(args)
            return args
          },
        },
      })
    },
  }

  return { database, updates, auditEntries }
}

describe('Project Manager capability', () => {
  it('atomically grants the capability and records the actor, target, and field change', async () => {
    const fake = capabilityDatabase(false)
    const result = await setProjectManagerCapability({
      actorId: 'admin-1',
      targetUserId: 'employee-1',
      enabled: true,
    }, fake.database)

    assert.equal(result?.changed, true)
    assert.equal(result?.user.isProjectManager, true)
    assert.equal(fake.updates.length, 1)
    assert.equal(fake.auditEntries.length, 1)
    const audit = (fake.auditEntries[0] as any).data
    assert.equal(audit.entityType, 'USER')
    assert.equal(audit.action, 'PROJECT_MANAGER_CAPABILITY_GRANTED')
    assert.equal(audit.actorId, 'admin-1')
    assert.deepEqual(audit.changes, { isProjectManager: { from: false, to: true } })
    assert.deepEqual(audit.metadata, {
      targetUserId: 'employee-1',
      targetUserName: 'Employee One',
      targetUserEmail: 'employee@example.com',
    })
  })

  it('records revocation and does not create duplicate audit rows for a no-op', async () => {
    const revoke = capabilityDatabase(true)
    const revoked = await setProjectManagerCapability({
      actorId: 'admin-1', targetUserId: 'employee-1', enabled: false,
    }, revoke.database)
    assert.equal(revoked?.user.isProjectManager, false)
    assert.equal((revoke.auditEntries[0] as any).data.action, 'PROJECT_MANAGER_CAPABILITY_REVOKED')

    const noOp = capabilityDatabase(true)
    const unchanged = await setProjectManagerCapability({
      actorId: 'admin-1', targetUserId: 'employee-1', enabled: true,
    }, noOp.database)
    assert.equal(unchanged?.changed, false)
    assert.equal(noOp.updates.length, 0)
    assert.equal(noOp.auditEntries.length, 0)
  })

  it('keeps capability administration admin-only and refreshes project access from persisted session data', () => {
    const route = readFileSync(path.join(ROOT, 'app/api/users/[id]/project-manager-capability/route.ts'), 'utf8')
    const auth = readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf8')
    const projectsRoute = readFileSync(path.join(ROOT, 'app/api/projects/route.ts'), 'utf8')
    const projectsPage = readFileSync(path.join(ROOT, 'app/dashboard/projects/page.tsx'), 'utf8')
    const userDetail = readFileSync(path.join(ROOT, 'components/settings/UserDetail.tsx'), 'utf8')

    assert.match(route, /withRole<RouteIdParams>\('ADMIN'/)
    assert.match(route, /setProjectManagerCapability\(\{\s*actorId: session\.user\.id/)
    const service = readFileSync(path.join(ROOT, 'lib/projects/project-manager-capability.ts'), 'utf8')
    assert.match(service, /recordActivity\(\{/)
    assert.match(service, /\{ client: tx, required: true \}/)
    assert.match(auth, /select: \{ role: true, isActive: true, isProjectManager: true \}/)
    assert.match(projectsRoute, /isProjectManager: session\.user\.isProjectManager/)
    assert.match(projectsPage, /isProjectManager: session\.user\.isProjectManager/)
    assert.match(userDetail, /currentUserRole === 'ADMIN'/)
    assert.match(userDetail, /role="switch"/)
    assert.match(userDetail, /project-manager-capability/)
  })

  it('confers no Settings or user-management access by itself', () => {
    assert.equal(canAccessSettings('EMPLOYEE'), false)
    assert.equal(canManageUsers('EMPLOYEE'), false)

    const settingsLayout = readFileSync(path.join(ROOT, 'app/dashboard/settings/layout.tsx'), 'utf8')
    const usersPage = readFileSync(path.join(ROOT, 'app/dashboard/settings/users/page.tsx'), 'utf8')
    assert.doesNotMatch(settingsLayout, /isProjectManager/)
    assert.doesNotMatch(usersPage, /canManageUsers\([^)]*isProjectManager/)
  })
})
