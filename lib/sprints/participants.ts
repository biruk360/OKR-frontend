/**
 * Invite-only sprint boards (2026-09-25, decision 1b): being put on a card is
 * an invitation. Whenever a user becomes the assignee or a member of a card
 * that belongs to a sprint, they are upserted as a SprintParticipant (role
 * MEMBER) in the same transaction as the card write, so the board they were
 * just put on is one they can open.
 *
 * Idempotent (`skipDuplicates`) and additive only: nothing here ever removes a
 * participant — leaving a card does not revoke board access.
 *
 * View rule: `canViewSprint` / `sprintVisibilityWhere` in lib/permissions.ts.
 */
import type { Prisma } from '@prisma/client'

/** The part of a Prisma client / transaction this helper needs. */
export type SprintParticipantWriter = Pick<Prisma.TransactionClient, 'sprintParticipant'>

/** The people a card invites: its assignee and members, de-duplicated, blanks dropped. */
export function cardInvitees(card: {
  assigneeId?: string | null
  memberIds?: readonly (string | null | undefined)[]
}): string[] {
  const ids = [card.assigneeId, ...(card.memberIds ?? [])]
  return Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)))
}

/**
 * Upsert `userIds` as MEMBER participants of `sprintId`. A no-op when the card
 * is not in a sprint or nobody is being added. Call it inside the transaction
 * that writes the card so the invitation and the assignment commit together.
 */
export async function inviteToSprint(
  tx: SprintParticipantWriter,
  sprintId: string | null | undefined,
  userIds: readonly (string | null | undefined)[],
): Promise<number> {
  if (!sprintId) return 0
  const ids = cardInvitees({ memberIds: userIds })
  if (ids.length === 0) return 0
  const { count } = await tx.sprintParticipant.createMany({
    data: ids.map((userId) => ({ sprintId, userId, role: 'MEMBER' })),
    skipDuplicates: true,
  })
  return count
}
