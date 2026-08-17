import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'

interface CapabilityUser {
  id: string
  name: string
  email: string
  isProjectManager: boolean
}

interface CapabilityTransaction {
  user: {
    findUnique(args: unknown): Promise<CapabilityUser | null>
    update(args: unknown): Promise<CapabilityUser>
  }
  activityLog: {
    create(args: unknown): Promise<unknown>
  }
}

interface CapabilityDatabase {
  $transaction<T>(operation: (tx: CapabilityTransaction) => Promise<T>): Promise<T>
}

export interface SetProjectManagerCapabilityInput {
  actorId: string
  targetUserId: string
  enabled: boolean
}

export interface SetProjectManagerCapabilityResult {
  user: CapabilityUser
  changed: boolean
}

/**
 * Persist a Project Manager capability change and its audit entry atomically.
 * Authorization remains the responsibility of the admin-only HTTP boundary.
 */
export async function setProjectManagerCapability(
  input: SetProjectManagerCapabilityInput,
  database: CapabilityDatabase = prisma as unknown as CapabilityDatabase,
): Promise<SetProjectManagerCapabilityResult | null> {
  return database.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, name: true, email: true, isProjectManager: true },
    })
    if (!existing) return null

    if (existing.isProjectManager === input.enabled) {
      return { user: existing, changed: false }
    }

    const updated = await tx.user.update({
      where: { id: input.targetUserId },
      data: { isProjectManager: input.enabled },
      select: { id: true, name: true, email: true, isProjectManager: true },
    })

    await recordActivity({
      entityType: 'USER',
      action: input.enabled
        ? 'PROJECT_MANAGER_CAPABILITY_GRANTED'
        : 'PROJECT_MANAGER_CAPABILITY_REVOKED',
      actorId: input.actorId,
      changes: {
        isProjectManager: { from: existing.isProjectManager, to: input.enabled },
      },
      metadata: {
        targetUserId: existing.id,
        targetUserName: existing.name,
        targetUserEmail: existing.email,
      },
    }, { client: tx, required: true })

    return { user: updated, changed: true }
  })
}
