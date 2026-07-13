import { prisma } from '@/lib/prisma'
import type { ScrumSerializableUpdate, ScrumViewer } from '@/types/scrum'

type ManagerIdResolver = (subjectUserId: string) => Promise<string | null>

interface SerializeOptions {
  managerIdResolver?: ManagerIdResolver
}

export type SerializedScrumUpdate<T extends ScrumSerializableUpdate> = Omit<T, 'mood'> & Partial<Pick<T, 'mood'>>

/**
 * Single read-path choke point for Daily Scrum privacy rules.
 *
 * Mood is physically removed unless the viewer is the subject or the subject's
 * active direct manager. Do not bypass this serializer in API read paths.
 */
export async function serializeScrumUpdate<T extends ScrumSerializableUpdate>(
  update: T,
  viewer: ScrumViewer,
  options: SerializeOptions = {},
): Promise<SerializedScrumUpdate<T>> {
  const out = { ...update } as SerializedScrumUpdate<T>
  const canSeeMood = await canViewUpdateMood(update, viewer, options)
  if (!canSeeMood) {
    delete (out as Record<string, unknown>).mood
  }
  return out
}

export async function serializeScrumUpdates<T extends ScrumSerializableUpdate>(
  updates: T[],
  viewer: ScrumViewer,
  options: SerializeOptions = {},
): Promise<Array<SerializedScrumUpdate<T>>> {
  return Promise.all(updates.map((update) => serializeScrumUpdate(update, viewer, options)))
}

export async function canViewUpdateMood(
  update: ScrumSerializableUpdate,
  viewer: ScrumViewer,
  options: SerializeOptions = {},
): Promise<boolean> {
  if (viewer.id === update.userId) return true
  const managerId = update.managerId ?? await (options.managerIdResolver ?? resolveDirectManagerId)(update.userId)
  return viewer.id === managerId
}

async function resolveDirectManagerId(subjectUserId: string): Promise<string | null> {
  const relationship = await prisma.managerRelationship.findFirst({
    where: {
      directReportId: subjectUserId,
      endedAt: null,
    },
    select: { managerId: true },
  })
  return relationship?.managerId ?? null
}
