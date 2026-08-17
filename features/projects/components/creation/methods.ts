import type { ProjectCreationSourceMethod } from '@/lib/projects/creation-draft'

export type ProjectCreationMethodKey = 'manual' | 'import' | 'ai'

export interface ProjectCreationMethodOption {
  key: ProjectCreationMethodKey
  sourceMethod: ProjectCreationSourceMethod
  title: string
  description: string
  bestFor: string
  available: boolean
  unavailableReason?: string
}

const BASE_METHODS: ProjectCreationMethodOption[] = [
  {
    key: 'manual',
    sourceMethod: 'MANUAL',
    title: 'Create manually',
    description: 'Enter project details and create a blank schedule or use a standard project template.',
    bestFor: 'A project whose structure is already known or will be planned directly in the system.',
    available: true,
  },
  {
    key: 'import',
    sourceMethod: 'FILE_IMPORT',
    title: 'Import a project file',
    description: 'Upload CSV, Excel, or Word. The system validates structured data and uses AI to clean or extract the schedule when needed.',
    bestFor: 'Existing work plans, schedules, implementation plans, and TOR documents.',
    available: true,
  },
]

export function getProjectCreationMethodOptions(input: {
  aiFeatureEnabled: boolean
  aiAvailable: boolean
}): ProjectCreationMethodOption[] {
  const methods = BASE_METHODS.map((method) => ({ ...method }))
  if (input.aiFeatureEnabled) {
    methods.push({
      key: 'ai',
      sourceMethod: 'AI_GUIDED',
      title: 'Create with AI',
      description: 'Describe the project or paste its TOR. AI prepares an editable plan for review.',
      bestFor: 'Early planning where a complete structured schedule does not yet exist.',
      available: input.aiAvailable,
      unavailableReason: input.aiAvailable
        ? undefined
        : 'AI setup is unavailable. Manual creation and file import remain available.',
    })
  }
  return methods
}

export function projectCreationMethodLabel(sourceMethod: ProjectCreationSourceMethod): string {
  switch (sourceMethod) {
    case 'MANUAL': return 'Create manually'
    case 'FILE_IMPORT': return 'Import a project file'
    case 'AI_GUIDED': return 'Create with AI'
    case 'AI_TOR': return 'Create with AI from TOR'
  }
}
