'use client'

/**
 * LineagePopover (CON-6) — "Continues 3 FY25/26 items" with a popover listing
 * each predecessor (SUCCEEDS, n:m) with its sub-kind, primary flag and final
 * grade, plus the successors ("Continued as …") when the item was carried on.
 * Reads GET /api/connections; redacted items show as "Private item" (CON-8).
 *
 * `LineageList` is the popover body on its own, for RolledFromBanner (P4) or a
 * detail section.
 */
import type { ReactNode } from 'react'
import { ArrowRight, ChevronDown, History } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConnectionItemRow, useConnections } from '@/components/shared/connections'
import { cn } from '@/lib/utils'
import type { ConnectionEntityType, ConnectionItem, ConnectionsPayload } from '@/lib/connections/types'
import { lineageSummary, successorSummary } from '../utils'

export type LineageDirection = 'predecessors' | 'successors' | 'both'

export interface LineageListProps {
  predecessors: readonly ConnectionItem[]
  successors: readonly ConnectionItem[]
  show?: LineageDirection
  onNavigate?: () => void
}

function LineageSection({ title, icon: Icon, items, onNavigate }: {
  title: string
  icon: typeof History
  items: readonly ConnectionItem[]
  onNavigate?: () => void
}) {
  return (
    <section aria-label={title}>
      <p className="flex items-center gap-1.5 pt-1 text-micro font-semibold uppercase tracking-wide" style={{ color: 'var(--ap-fg-subtle)' }}>
        <Icon className="size-3" aria-hidden /> {title} <span className="tabular-nums">· {items.length}</span>
      </p>
      {items.map((item) => (
        <ConnectionItemRow key={`${item.type}:${item.id}`} item={item} showFinal onNavigate={onNavigate} />
      ))}
    </section>
  )
}

export function LineageList({ predecessors, successors, show = 'both', onNavigate }: LineageListProps) {
  const showPred = show !== 'successors' && predecessors.length > 0
  const showSucc = show !== 'predecessors' && successors.length > 0
  if (!showPred && !showSucc) {
    return <p className="py-2 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>No earlier or later items are linked.</p>
  }
  return (
    <div className="space-y-2">
      {showPred && <LineageSection title="Continues" icon={History} items={predecessors} onNavigate={onNavigate} />}
      {showSucc && <LineageSection title="Continued as" icon={ArrowRight} items={successors} onNavigate={onNavigate} />}
    </div>
  )
}

export interface LineagePopoverProps {
  entityType: ConnectionEntityType
  entityId: string
  /** Pre-loaded payload (skips the request). */
  data?: ConnectionsPayload
  show?: LineageDirection
  /** Custom trigger content (wrapped in the trigger button). */
  trigger?: ReactNode
  onNavigate?: () => void
  className?: string
}

export function LineagePopover({ entityType, entityId, data, show = 'both', trigger, onNavigate, className }: LineagePopoverProps) {
  const query = useConnections(entityType, entityId, { enabled: !data })
  const payload = data ?? query.data
  if (!payload) return null

  const predecessors = show === 'successors' ? [] : payload.predecessors
  const successors = show === 'predecessors' ? [] : payload.successors
  if (predecessors.length === 0 && successors.length === 0) return null

  const summary = lineageSummary(predecessors) ?? successorSummary(successors) ?? 'Lineage'
  const Icon = predecessors.length > 0 ? History : ArrowRight

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold transition-colors hover:bg-[var(--ap-bg-hover)] ap-focus-ring',
            className,
          )}
          style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent-on-soft)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {trigger ?? (
            <>
              <Icon className="size-3.5" aria-hidden />
              <span>{summary}</span>
              {predecessors.length > 0 && successors.length > 0 && (
                <span style={{ color: 'var(--ap-fg-muted)' }}>· {successorSummary(successors)}</span>
              )}
              <ChevronDown className="size-3" aria-hidden />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent label="Lineage" heading={summary} width={360} onClick={(e) => e.stopPropagation()}>
        <div className="max-h-[360px] overflow-y-auto">
          <LineageList predecessors={predecessors} successors={successors} onNavigate={onNavigate} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default LineagePopover
