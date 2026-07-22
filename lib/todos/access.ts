export interface TodoParticipantAccess {
  assigneeId: string | null
  creatorId: string
  memberIds: string[]
}

export function hasTodoParticipantWriteAccess(
  userId: string,
  todo: TodoParticipantAccess,
): boolean {
  return (
    todo.assigneeId === userId ||
    todo.creatorId === userId ||
    todo.memberIds.includes(userId)
  )
}
