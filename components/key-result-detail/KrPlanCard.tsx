'use client'

/**
 * KR plan card (KRX-3 / KRX-4) for the KR detail rail: the checkpoint strip
 * (Q2 · Q3 · Q4 with status, add/edit for editors) and the Definition section
 * (baseline / target / measured by, editable by the KR owner and managers).
 *
 * Both read `GET /api/keyresults/[id]/checkpoints` through one cached query; a
 * redacted or forbidden viewer gets nothing. Realtime: the KR channel's UPDATED
 * signals (checkpoint and KR edits by others) refetch the plan and connections.
 */
import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  CheckpointStrip,
  KrDefinitionSection,
  krCheckpointKeys,
  useKrCheckpoints,
  type KrCheckpointsPayload,
} from '@/features/key-results'
import { connectionsQueryKey } from '@/components/shared/connections'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { OKR_REALTIME_EVENT_NAMES, keyResultRealtimeChannel } from '@/lib/okr/realtime'
import { cn } from '@/lib/utils'

/**
 * The V2 sections use SectionHeading (its own px-4 / py-3) above unpadded bodies;
 * inside a padded card the heading row is flattened so title and body line up.
 */
export const FLUSH_SECTION_HEADING =
  '[&_[data-slot=section-heading]]:px-0 [&_[data-slot=section-heading]]:pb-2 [&_[data-slot=section-heading]]:pt-0'

/** Anything worth showing in a read-only checkpoints / definition section (KRX-3/4)? */
export function hasKrPlanContent(plan: KrCheckpointsPayload | undefined): boolean {
  if (!plan || plan.isRedacted) return false
  const d = plan.definition
  const hasDefinition = !!d && !!(d.commitment || d.baselineText || d.targetText || d.measuredBy || d.dueText || d.dueDate)
  return plan.checkpoints.length > 0 || hasDefinition
}

/**
 * Plan summary for surfaces outside the KR page (e.g. the Filters quick view):
 * reads the same cached checkpoints query, only once `enabled` (KR known visible).
 */
export function useKrPlanSummary(keyResultId: string | null, enabled: boolean) {
  const { data } = useKrCheckpoints(keyResultId, { enabled })
  const hasContent = enabled && hasKrPlanContent(data)
  return { hasContent, checkpointCount: hasContent && data ? data.checkpoints.length : 0 }
}

/** Invalidate the cached checkpoints / definition for a KR (realtime refresh helper). */
export function invalidateKrPlan(queryClient: QueryClient, keyResultId: string) {
  return queryClient.invalidateQueries({ queryKey: krCheckpointKeys.detail(keyResultId) })
}

/** Read-only compact checkpoint strip + definition, for embedding inside another card/section. */
export function KrPlanCompact({ keyResultId, className }: { keyResultId: string; className?: string }) {
  return (
    <div className={cn('space-y-3', FLUSH_SECTION_HEADING, className)}>
      <CheckpointStrip keyResultId={keyResultId} variant="compact" />
      <KrDefinitionSection keyResultId={keyResultId} variant="compact" />
    </div>
  )
}

export default function KrPlanCard({ keyResultId }: { keyResultId: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const { data, error } = useKrCheckpoints(keyResultId)
  const hidden = !!data?.isRedacted || error?.status === 403 || error?.status === 404

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: krCheckpointKeys.detail(keyResultId) })
    void queryClient.invalidateQueries({ queryKey: connectionsQueryKey('KEY_RESULT', keyResultId) })
  }, [queryClient, keyResultId])
  useRealtimeRefresh({
    channel: data && !hidden ? keyResultRealtimeChannel(keyResultId) : null,
    events: OKR_REALTIME_EVENT_NAMES,
    onRefresh: refresh,
    ignoreActorId: (session?.user as { id?: string } | undefined)?.id ?? null,
  })

  if (hidden) return null

  return (
    <section
      aria-label="Checkpoints and definition"
      className="overflow-hidden rounded-[var(--ap-radius-md)] border bg-card"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <div className={cn('px-4 py-3', FLUSH_SECTION_HEADING)}>
        <CheckpointStrip keyResultId={keyResultId} />
      </div>
      <div className={cn('border-t px-4 py-3', FLUSH_SECTION_HEADING)} style={{ borderColor: 'var(--ap-border)' }}>
        <KrDefinitionSection keyResultId={keyResultId} onSaved={() => router.refresh()} />
      </div>
    </section>
  )
}
