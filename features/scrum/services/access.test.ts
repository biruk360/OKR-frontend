import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canProxyForResolved } from './access'

describe('proxy authorization decisions', () => {
  it('allows self, admin, direct manager, department lead in same department, and project manager', () => {
    assert.equal(canProxyForResolved({ isSelf: true, role: 'EMPLOYEE', directManager: false, sameDepartment: false, projectManager: false }), true)
    assert.equal(canProxyForResolved({ isSelf: false, role: 'ADMIN', directManager: false, sameDepartment: false, projectManager: false }), true)
    assert.equal(canProxyForResolved({ isSelf: false, role: 'EMPLOYEE', directManager: true, sameDepartment: false, projectManager: false }), true)
    assert.equal(canProxyForResolved({ isSelf: false, role: 'DEPARTMENT_LEAD', directManager: false, sameDepartment: true, projectManager: false }), true)
    assert.equal(canProxyForResolved({ isSelf: false, role: 'EMPLOYEE', directManager: false, sameDepartment: false, projectManager: true }), true)
  })

  it('rejects peer proxy attempts even when the peer shares a department', () => {
    assert.equal(canProxyForResolved({ isSelf: false, role: 'EMPLOYEE', directManager: false, sameDepartment: true, projectManager: false }), false)
  })

  it('does not let executives proxy unless another relationship grants it', () => {
    assert.equal(canProxyForResolved({ isSelf: false, role: 'EXECUTIVE', directManager: false, sameDepartment: false, projectManager: false }), false)
  })
})

describe('scrum access decisions (remediation 2026-09-25)', () => {
  const none = { directManager: false, sameDepartment: false, projectManager: false }

  it('manage: admin, direct manager, same-department lead, and PM — never a peer or an unrelated executive', async () => {
    const { canManageScrumUserResolved } = await import('./access')
    assert.equal(canManageScrumUserResolved({ role: 'ADMIN', ...none }), true)
    assert.equal(canManageScrumUserResolved({ role: 'EMPLOYEE', ...none, directManager: true }), true)
    assert.equal(canManageScrumUserResolved({ role: 'DEPARTMENT_LEAD', ...none, sameDepartment: true }), true)
    assert.equal(canManageScrumUserResolved({ role: 'EMPLOYEE', ...none, projectManager: true }), true)
    assert.equal(canManageScrumUserResolved({ role: 'EMPLOYEE', ...none, sameDepartment: true }), false)
    assert.equal(canManageScrumUserResolved({ role: 'EXECUTIVE', ...none }), false)
    assert.equal(canManageScrumUserResolved({ role: 'DEPARTMENT_LEAD', ...none }), false)
  })

  it('records (absences/metrics): self, org-wide roles, or a manager — not peers', async () => {
    const { canReadScrumUserRecordsResolved } = await import('./access')
    assert.equal(canReadScrumUserRecordsResolved({ isSelf: true, role: 'EMPLOYEE', canManage: false }), true)
    assert.equal(canReadScrumUserRecordsResolved({ isSelf: false, role: 'EXECUTIVE', canManage: false }), true)
    assert.equal(canReadScrumUserRecordsResolved({ isSelf: false, role: 'ADMIN', canManage: false }), true)
    assert.equal(canReadScrumUserRecordsResolved({ isSelf: false, role: 'EMPLOYEE', canManage: true }), true)
    assert.equal(canReadScrumUserRecordsResolved({ isSelf: false, role: 'EMPLOYEE', canManage: false }), false)
    assert.equal(canReadScrumUserRecordsResolved({ isSelf: false, role: 'DEPARTMENT_LEAD', canManage: false }), false)
  })

  it('act on update (links, blocker resolve/escalate): owner or manager only', async () => {
    const { canActOnScrumUpdateResolved } = await import('./access')
    assert.equal(canActOnScrumUpdateResolved({ isOwner: true, canManage: false }), true)
    assert.equal(canActOnScrumUpdateResolved({ isOwner: false, canManage: true }), true)
    assert.equal(canActOnScrumUpdateResolved({ isOwner: false, canManage: false }), false)
  })

  it('edit (PATCH /updates/[id]): owner only — blocks the takeover', async () => {
    const { canEditScrumUpdateResolved } = await import('./access')
    assert.equal(canEditScrumUpdateResolved({ actorId: 'u1', ownerId: 'u1' }), true)
    assert.equal(canEditScrumUpdateResolved({ actorId: 'attacker', ownerId: 'u1' }), false)
    assert.equal(canEditScrumUpdateResolved({ actorId: '', ownerId: '' }), false)
  })

  it('analytics: org-wide roles, or anyone who manages at least one person', async () => {
    const { canViewScrumAnalyticsResolved } = await import('./access')
    assert.equal(canViewScrumAnalyticsResolved({ role: 'ADMIN', managedUserCount: 0 }), true)
    assert.equal(canViewScrumAnalyticsResolved({ role: 'EXECUTIVE', managedUserCount: 0 }), true)
    assert.equal(canViewScrumAnalyticsResolved({ role: 'DEPARTMENT_LEAD', managedUserCount: 4 }), true)
    assert.equal(canViewScrumAnalyticsResolved({ role: 'EMPLOYEE', managedUserCount: 2 }), true)
    assert.equal(canViewScrumAnalyticsResolved({ role: 'EMPLOYEE', managedUserCount: 0 }), false)
  })
})
