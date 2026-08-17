import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { canCreateProject, type UserRole } from '@/lib/permissions'

const ROOT = path.resolve(__dirname, '..', '..')

describe('project creation authorization', () => {
  it('allows the three management roles and denies an employee without the capability', () => {
    const expected: Array<{ role: UserRole; allowed: boolean }> = [
      { role: 'ADMIN', allowed: true },
      { role: 'EXECUTIVE', allowed: true },
      { role: 'DEPARTMENT_LEAD', allowed: true },
      { role: 'EMPLOYEE', allowed: false },
    ]

    for (const { role, allowed } of expected) {
      assert.equal(canCreateProject({ role, isProjectManager: false }), allowed, role)
    }
  })

  it('recognizes only an explicit Project Manager capability for an employee', () => {
    assert.equal(canCreateProject({ role: 'EMPLOYEE', isProjectManager: true }), true)
    assert.equal(canCreateProject({ role: 'EMPLOYEE', isProjectManager: false }), false)
    assert.equal(canCreateProject({ role: 'EMPLOYEE' }), false)
  })

  it('wires the API guard and Projects UI visibility to the same helper', () => {
    const apiRoute = readFileSync(path.join(ROOT, 'app/api/projects/route.ts'), 'utf8')
    const projectsPage = readFileSync(path.join(ROOT, 'app/dashboard/projects/page.tsx'), 'utf8')
    const projectsList = readFileSync(path.join(ROOT, 'features/projects/components/ProjectsListClient.tsx'), 'utf8')

    assert.match(apiRoute, /import \{ canCreateProject \} from '@\/lib\/permissions'/)
    assert.match(apiRoute, /export const POST = withAuth\(/)
    assert.match(apiRoute, /if \(!canCreateProject\(\{\s*role: session\.user\.role,\s*isProjectManager: session\.user\.isProjectManager,\s*\}\)\) \{\s*return apiForbidden\('Insufficient permissions'\)/)
    assert.doesNotMatch(apiRoute, /export const POST = withRole\(/)

    const guardIndex = apiRoute.indexOf('if (!canCreateProject(')
    const bodyReadIndex = apiRoute.indexOf('request.json()')
    assert.ok(guardIndex >= 0 && guardIndex < bodyReadIndex, 'authorization must run before reading or processing the request body')

    assert.match(projectsPage, /import \{ canCreateProject \} from '@\/lib\/permissions'/)
    assert.match(projectsPage, /const canCreate = canCreateProject\(\{\s*role: session\.user\.role,\s*isProjectManager: session\.user\.isProjectManager,\s*\}\)/)
    assert.match(projectsPage, /canCreateProject=\{canCreate\}/)

    assert.match(projectsList, /canCreateProject: boolean/)
    assert.match(projectsList, /\{canCreateProject && \(/)
    assert.doesNotMatch(projectsList, /CAN_CREATE/)
  })
})
