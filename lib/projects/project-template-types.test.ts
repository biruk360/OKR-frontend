import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { PROJECT_TYPES, PROJECT_TYPE_LABEL } from '@/features/projects/types'
import { cloneTemplateStructure, SYSTEM_TEMPLATES } from './templates'

const ROOT = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')

describe('Project template type linking', () => {
  it('provides every approved project type with a labelled system template', () => {
    assert.deepEqual(PROJECT_TYPES, [
      'WEBSITE',
      'WEB_PORTAL',
      'DATA_PLATFORM',
      'MOBILE_APP',
      'BANKING_APP',
      'ICT_EQUIPMENT_SUPPLY',
      'IMPORT',
    ])
    assert.equal(PROJECT_TYPE_LABEL.ICT_EQUIPMENT_SUPPLY, 'ICT Equipment Supply')

    for (const projectType of PROJECT_TYPES) {
      const linked = SYSTEM_TEMPLATES.filter((template) => template.projectType === projectType)
      assert.ok(linked.length >= 1, `${PROJECT_TYPE_LABEL[projectType]} needs a system template`)
      assert.ok(linked.every((template) => template.structure.phases.length > 0))
    }
  })

  it('preserves the project-type association when cloning a template', () => {
    const source = {
      name: 'Portal rollout',
      description: 'Reusable portal delivery',
      projectType: 'WEB_PORTAL',
      structureJson: { phases: [{ name: 'Delivery', weight: 100, milestones: [] }] },
    } as const

    const clone = cloneTemplateStructure(source as never)
    assert.equal(clone.projectType, 'WEB_PORTAL')
    assert.equal(clone.structureJson.phases[0]?.name, 'Delivery')
  })

  it('renders a type-first picker, template management link, and compact responsive progress controls', () => {
    const wizard = read('features/projects/components/CreateProjectWizard.tsx')
    const shell = read('features/projects/components/creation/CreationDraftShell.tsx')
    const list = read('features/projects/components/ProjectsListClient.tsx')

    assert.match(wizard, /Choose project type and schedule/)
    assert.match(wizard, /PROJECT_TYPES\.map/)
    assert.match(wizard, /Manage templates/)
    assert.match(wizard, /template\.projectType === projectType/)
    assert.match(wizard, /grid-cols-2 gap-2 sm:grid-cols-4/)
    assert.match(shell, /grid-cols-2 gap-2 sm:grid-cols-4/)
    assert.match(list, /size="xl"/)
  })

  it('seeds linked templates during every production deployment', () => {
    const deploy = read('scripts/deploy.sh')
    const seed = read('prisma/seed-project-templates.ts')
    assert.match(deploy, /npm run db:seed:project-templates/)
    assert.match(seed, /projectType: def\.projectType/)
  })
})
