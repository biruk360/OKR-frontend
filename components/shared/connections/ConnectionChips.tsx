'use client'

/**
 * ConnectionChips (CON-1) — one row of link chips for an objective, KR, task,
 * KPI, duty or development item:
 *   ↑ Aligns to · ↓ Supported by n · ⟲ From FY25/26 · → Continued as ·
 *   ⛔ Blocked by DEPxx · ⏳ Waiting on n · ⇢ n waiting on this · ⚖ Decision D46 ·
 *   KPI · duties · development · milestones.
 * Each chip opens a popover listing its items (redacted ones as "Private item",
 * CON-8). `compact` shows icon + count only (dense rows / trees).
 *
 * Chips are an adornment: while loading they show two placeholders, and on error
 * or with nothing linked they render nothing. Clicks never bubble to the row.
 */
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ConnectionEntityType, ConnectionsPayload } from '@/lib/connections/types'
import {
  buildConnectionChips,
  buildConnectionGroups,
  CHIP_GROUP,
  type ConnectionChipKind,
  type ConnectionChipModel,
} from './connection-display'
import { CONNECTION_CHIP_ICONS, CONNECTION_TONE_STYLE, ConnectionGroupRows } from './ConnectionRows'
import { useConnections } from './useConnections'

export interface ConnectionChipsProps {
  entityType: ConnectionEntityType
  entityId: string
  /** Icon + count only. */
  compact?: boolean
  /** Pre-loaded payload (skips the request). */
  data?: ConnectionsPayload
  /** Chip kinds this surface already shows elsewhere. */
  hide?: readonly ConnectionChipKind[]
  /** Show at most this many chips, then "+n". */
  max?: number
  /** Plain left click on a link inside a chip popover. */
  onNavigate?: () => void
  /** Rendered after the chips (e.g. a "Manage links" button). */
  trailing?: ReactNode
  /** Defer the request (e.g. until a row scrolls into view). Default true. */
  enabled?: boolean
  className?: string
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation()

function ChipButton({ chip, compact }: { chip: ConnectionChipModel; compact: boolean }) {
  const Icon = CONNECTION_CHIP_ICONS[chip.kind]
  const tone = CONNECTION_TONE_STYLE[chip.tone]
  return (
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={chip.description}
        title={chip.description}
        className={cn(
          'inline-flex max-w-[220px] items-center gap-1 rounded-full font-semibold transition-[filter] hover:brightness-95 focus-visible:outline-none ap-focus-ring',
          compact ? 'h-5 px-1.5 text-micro' : 'h-6 px-2 text-caption',
        )}
        style={{ background: tone.bg, color: tone.fg }}
      >
        <Icon className={compact ? 'size-3' : 'size-3.5'} aria-hidden />
        <span className="truncate tabular-nums">{compact ? chip.count : chip.label}</span>
      </button>
    </PopoverTrigger>
  )
}

export function ConnectionChips({
  entityType,
  entityId,
  compact = false,
  data,
  hide,
  max,
  onNavigate,
  trailing,
  enabled = true,
  className,
}: ConnectionChipsProps) {
  const query = useConnections(entityType, entityId, { enabled: enabled && !data })
  const payload = data ?? query.data

  if (!payload) {
    if (!query.isLoading || !enabled) return trailing ? <span className={className}>{trailing}</span> : null
    return (
      <span className={cn('inline-flex items-center gap-1', className)} aria-busy="true" aria-label="Loading links">
        <Skeleton className={cn('rounded-full', compact ? 'h-5 w-8' : 'h-6 w-20')} />
        <Skeleton className={cn('rounded-full', compact ? 'h-5 w-8' : 'h-6 w-16')} />
      </span>
    )
  }

  const chips = buildConnectionChips(payload, { hide })
  if (chips.length === 0 && !trailing) return null
  const shown = typeof max === 'number' ? chips.slice(0, max) : chips
  const hidden = chips.length - shown.length
  const groups = buildConnectionGroups(payload)

  return (
    <span
      className={cn('inline-flex flex-wrap items-center gap-1', className)}
      onClick={stop}
      onKeyDown={stop}
      role="group"
      aria-label="Links and dependencies"
    >
      {shown.map((chip) => {
        const groupKey = CHIP_GROUP[chip.kind]
        const group = groups.find((g) => g.key === groupKey)
        return (
          <Popover key={chip.kind}>
            <ChipButton chip={chip} compact={compact} />
            <PopoverContent label={chip.description} heading={chip.description} width={320} variant="panel" onClick={stop}>
              <div className="max-h-[320px] overflow-y-auto">
                {group ? (
                  <ConnectionGroupRows group={group} onNavigate={onNavigate} />
                ) : (
                  <p className="py-2 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>Nothing to show.</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )
      })}
      {hidden > 0 && (
        <span
          className={cn('inline-flex items-center rounded-full px-1.5 font-semibold', compact ? 'h-5 text-micro' : 'h-6 text-caption')}
          style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
          title={chips.slice(shown.length).map((c) => c.description).join(' · ')}
        >
          +{hidden}
        </span>
      )}
      {trailing}
    </span>
  )
}

export default ConnectionChips
