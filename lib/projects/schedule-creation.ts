export const AUTO_SECTION_ID = '__auto_section__'
export const DEFAULT_SECTION_NAME = 'General'
export const DEFAULT_SUBSECTION_NAME = 'General'

export interface TaskSectionLike {
  id: string
  milestones: Array<{ id: string }>
}

export function defaultTaskPlacement(sections: readonly TaskSectionLike[]) {
  return {
    sectionId: sections[0]?.id ?? AUTO_SECTION_ID,
    subsectionId: sections[0]?.milestones[0]?.id ?? '',
  }
}

export async function ensureTaskPlacement({
  sectionId,
  subsectionId,
  createSection,
  createSubsection,
}: {
  sectionId: string
  subsectionId: string
  createSection: (name: string) => Promise<{ id: string }>
  createSubsection: (sectionId: string, name: string) => Promise<{ id: string }>
}) {
  let resolvedSectionId = sectionId
  if (!resolvedSectionId || resolvedSectionId === AUTO_SECTION_ID) {
    const section = await createSection(DEFAULT_SECTION_NAME)
    resolvedSectionId = section.id
  }

  let resolvedSubsectionId = subsectionId
  if (!resolvedSubsectionId) {
    const subsection = await createSubsection(resolvedSectionId, DEFAULT_SUBSECTION_NAME)
    resolvedSubsectionId = subsection.id
  }

  return { sectionId: resolvedSectionId, subsectionId: resolvedSubsectionId }
}
