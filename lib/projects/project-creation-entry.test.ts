import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { canCreateProject } from '@/lib/permissions'
import { getProjectCreationMethodOptions } from '@/features/projects/components/creation/methods'

const ROOT = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')

describe('Project creation entry and draft shell', () => {
  it('AC1: shows Manual, Import, and AI to an authorized creator when project AI is enabled', () => {
    assert.equal(canCreateProject({ role: 'DEPARTMENT_LEAD', isProjectManager: false }), true)
    const methods = getProjectCreationMethodOptions({ aiFeatureEnabled: true, aiAvailable: true })

    assert.deepEqual(methods.map((method) => method.sourceMethod), [
      'MANUAL', 'FILE_IMPORT', 'AI_GUIDED',
    ])
    assert.deepEqual(methods.map((method) => method.title), [
      'Create manually', 'Import a project file', 'Create with AI',
    ])
    assert.ok(methods.every((method) => method.available))
    assert.ok(methods.every((method) => method.description.length > 20 && method.bestFor.length > 20))
  })

  it('AC2: hides creation UI and denies direct draft creation through the same permission rule', () => {
    assert.equal(canCreateProject({ role: 'EMPLOYEE', isProjectManager: false }), false)
    const page = read('app/dashboard/projects/page.tsx')
    const list = read('features/projects/components/ProjectsListClient.tsx')
    const route = read('app/api/projects/creation-drafts/route.ts')

    assert.match(page, /const canCreate = canCreateProject\(/)
    assert.match(page, /canCreateProject=\{canCreate\}/)
    assert.match(list, /\{canCreateProject && \(/)
    assert.match(route, /if \(!canCreateProject\(\{/)
    const guard = route.indexOf('if (!canCreateProject(')
    const body = route.indexOf('request.json()')
    assert.ok(guard >= 0 && guard < body, 'direct API access must be denied before body processing')
  })

  it('AC26: exposes all three options to an Employee holding the Project Manager capability', () => {
    assert.equal(canCreateProject({ role: 'EMPLOYEE', isProjectManager: true }), true)
    const methods = getProjectCreationMethodOptions({ aiFeatureEnabled: true, aiAvailable: true })

    assert.deepEqual(methods.map((method) => method.sourceMethod), [
      'MANUAL', 'FILE_IMPORT', 'AI_GUIDED',
    ])
    assert.ok(methods.every((method) => method.available))
  })

  it('keeps Manual and Import available when AI is unavailable and hides AI only when its flag is off', () => {
    const unavailable = getProjectCreationMethodOptions({ aiFeatureEnabled: true, aiAvailable: false })
    assert.equal(unavailable.find((method) => method.key === 'manual')?.available, true)
    assert.equal(unavailable.find((method) => method.key === 'import')?.available, true)
    assert.equal(unavailable.find((method) => method.key === 'ai')?.available, false)
    assert.match(unavailable.find((method) => method.key === 'ai')?.unavailableReason ?? '', /Manual creation and file import remain available/)

    const disabled = getProjectCreationMethodOptions({ aiFeatureEnabled: false, aiAvailable: true })
    assert.deepEqual(disabled.map((method) => method.key), ['manual', 'import'])
  })

  it('renders persistent method/progress chrome with back, save-exit, and confirmed discard controls', () => {
    const shell = read('features/projects/components/creation/CreationDraftShell.tsx')
    assert.match(shell, /projectCreationMethodLabel\(draft\.sourceMethod\)/)
    assert.match(shell, /Project creation progress/)
    assert.match(shell, /Back to methods/)
    assert.match(shell, /Save and exit/)
    assert.match(shell, /<ConfirmDialog/)
    assert.match(shell, /Discard project draft\?/)
    assert.match(shell, /No production project data will be changed/)
  })

  it('requires confirmation before a method switch and states exactly what is preserved or discarded', () => {
    const list = read('features/projects/components/ProjectsListClient.tsx')
    const route = read('app/api/projects/creation-drafts/[id]/route.ts')
    assert.match(list, /setSwitchConfirmOpen\(true\)/)
    assert.match(list, /discardMethodData: true/)
    assert.match(list, /Common project details will be preserved/)
    assert.match(list, /Method-specific schedule, source, and validation work will be discarded only after you confirm/)
    assert.match(route, /Changing creation method requires explicit method-data discard confirmation/)
  })

  it('persists and resumes the active private draft without relying on production project rows', () => {
    const list = read('features/projects/components/ProjectsListClient.tsx')
    const hooks = read('features/projects/hooks/useProjects.ts')
    assert.match(list, /creationDraft/)
    assert.match(list, /window\.history\.replaceState/)
    assert.match(list, /useProjectCreationDraft\(resumeDraftId, canCreateProject\)/)
    assert.match(hooks, /POST/)
    assert.match(hooks, /method: 'PATCH'/)
    assert.match(hooks, /method: 'DELETE'/)
  })

  it('derives safe AI-card state server-side and exports both creation components through the feature barrel', () => {
    const page = read('app/dashboard/projects/page.tsx')
    const barrel = read('features/projects/index.ts')
    assert.match(page, /getAiProviderAdminSettings\(\)/)
    assert.match(page, /aiFeatureEnabled=\{aiSettings\?\.featureEnabled === true\}/)
    assert.match(page, /aiAvailable=\{aiSettings\?\.available === true\}/)
    assert.match(barrel, /export \{ NewProjectEntry \}/)
    assert.match(barrel, /export \{ CreationDraftShell \}/)
  })
})
