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
