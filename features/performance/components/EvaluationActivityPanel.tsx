'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, History } from 'lucide-react'
import { Button } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'
import type { EvaluationActivityEntry } from '../types'
import { useEvaluationActivity } from '../hooks/ui-extras'
import { humanizeEnum } from './PerformanceStatusBadge'
import { SectionCard } from './SectionCard'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

/** Compact one-line summary of a log entry's metadata (id lists become counts). */
function metadataSummary(metadata: Record<string, unknown> | null): string {
  if (!metadata) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(metadata)) {
    if (value == null) continue
    if (Array.isArray(value)) parts.push(`${humanizeEnum(key)}: ${value.length}`)
    else if (typeof value === 'object') parts.push(humanizeEnum(key))
    else {
      const text = String(value)
      parts.push(`${humanizeEnum(key)}: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`)
    }
  }
  return parts.join(' · ')
}

function ActivityRow({ entry }: { entry: EvaluationActivityEntry }) {
  const summary = metadataSummary(entry.metadata)
  return (
    <li className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      {entry.actor
        ? <UserAvatar user={{ id: entry.actor.id, name: entry.actor.name ?? 'User', avatar: entry.actor.avatar }} size={24} />
        : <History className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{entry.actor?.name ?? 'System'}</span>{' '}
          <span className="text-muted-foreground">{humanizeEnum(entry.action).toLowerCase()}</span>
        </p>
        {summary && <p className="truncate text-xs text-muted-foreground" title={summary}>{summary}</p>}
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
        </p>
      </div>
    </li>
  )
}

/**
 * Collapsible audit trail for one evaluation, mirroring CalibrationPanel's
 * client-side gating: shown only to users with calibration-level access. The
 * API additionally restricts to lead evaluator / performance admins and 403s
 * otherwise — the query is non-retrying and errors simply hide the panel.
 */
export function EvaluationActivityPanel({ evaluationId }: { evaluationId: string }) {
  const permissions = usePerformancePermissions()
  const canView = permissions.canFeature('module.performance')
    && permissions.canFeature('page.performance.calibration')
    && permissions.canDo('evaluation', 'canRead')
    && permissions.canDo('evaluator_score', 'canRead')
    && permissions.canDo('criterion_result', 'canRead')
  const [expanded, setExpanded] = useState(false)
  const activity = useEvaluationActivity(evaluationId, canView)

  if (!canView || activity.isError || (activity.data && activity.data.length === 0)) return null

  return (
    <SectionCard
      title="Activity"
      actions={
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Hide' : `Show${activity.data ? ` (${activity.data.length})` : ''}`}
          <ChevronDown className={cn('ml-1 size-3.5 transition-transform', expanded && 'rotate-180')} />
        </Button>
      }
      contentClassName={expanded ? 'px-4 py-4' : 'hidden'}
    >
      {activity.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {(activity.data ?? []).map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
        </ol>
      )}
    </SectionCard>
  )
}
