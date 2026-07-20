export function validateCompleteScheduleOrder(currentIds: readonly string[], orderedIds: readonly string[]): string | null {
  if (orderedIds.length !== currentIds.length) return 'The submitted order must include every sibling exactly once.'
  const submitted = new Set(orderedIds)
  if (submitted.size !== orderedIds.length) return 'The submitted order contains duplicate IDs.'
  const current = new Set(currentIds)
  if (orderedIds.some((id) => !current.has(id))) return 'The submitted order contains an item outside this section.'
  return null
}
