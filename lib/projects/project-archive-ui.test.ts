import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Project archive flow', () => {
  it('keeps authorization, archive mutation, and required audit in one transaction', () => {
    const route = source('app/api/projects/[id]/route.ts')
    assert.match(route, /export const DELETE = withAuth/)
    assert.match(route, /getWritableProject\(session, params\.id\)/)
    assert.match(route, /prisma\.\$transaction/)
    assert.match(route, /archivedAt: new Date\(\)/)
    assert.match(route, /action: 'ARCHIVED'/)
    assert.match(route, /\{ client: tx, required: true \}/)
  })

  it('provides a project-level archive mutation that calls the existing DELETE endpoint', () => {
    const hooks = source('features/projects/hooks/useProject.ts')
    assert.match(hooks, /export function useArchiveProject/)
    assert.match(hooks, /fetchJson\(`\/api\/projects\/\$\{id\}`[\s\S]*method: 'DELETE'/)
  })

  it('exposes archive under project settings with permission and pending states', () => {
    const controls = source('features/projects/components/ProjectDeliveryControlCenter.tsx')
    assert.match(controls, /id: 'settings', label: 'Settings'/)
    assert.match(controls, /Archive project/)
    assert.match(controls, /disabled=\{!canEdit \|\| archivePending\}/)
    assert.match(controls, /onClick=\{onArchive\}/)
  })

  it('requires confirmation, explains retention, and returns to the active directory', () => {
    const workspace = source('features/projects/components/ProjectWorkspaceClient.tsx')
    assert.match(workspace, /<ConfirmDialog/)
    assert.match(workspace, /variant="warning"/)
    assert.match(workspace, /without permanently deleting its records/)
    assert.match(workspace, /router\.replace\('\/dashboard\/projects'\)/)
  })
})
