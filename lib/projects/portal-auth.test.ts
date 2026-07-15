import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canPortalUserAccessProject, shouldBlockDashboardForPortalOnly, type PortalSession } from '../portal-auth'

const portalSession = {
  user: {
    id: 'client1',
    name: 'Client PM',
    email: 'client@example.com',
    role: 'EMPLOYEE',
    userType: 'CLIENT_PORTAL',
    clientName: 'Meda',
    projectIds: ['p1', 'p2'],
  },
  expires: '2099-01-01T00:00:00.000Z',
} as PortalSession

test('canPortalUserAccessProject: projectIds are the hard scope', () => {
  assert.equal(canPortalUserAccessProject(portalSession, 'p1'), true)
  assert.equal(canPortalUserAccessProject(portalSession, 'p3'), false)
  assert.equal(canPortalUserAccessProject(null, 'p1'), false)
})

test('shouldBlockDashboardForPortalOnly: portal-only sessions receive dashboard 403', () => {
  assert.equal(shouldBlockDashboardForPortalOnly({
    pathname: '/dashboard/projects',
    hasPortalSessionCookie: true,
    hasInternalSessionCookie: false,
  }), true)
  assert.equal(shouldBlockDashboardForPortalOnly({
    pathname: '/dashboard/projects',
    hasPortalSessionCookie: true,
    hasInternalSessionCookie: true,
  }), false)
  assert.equal(shouldBlockDashboardForPortalOnly({
    pathname: '/portal',
    hasPortalSessionCookie: true,
    hasInternalSessionCookie: false,
  }), false)
})
