'use client'

/**
 * PRF-9 filters: level (company-owned / department-owned / contributed /
 * individual), commitment (C / A / C-A), status (on track / at risk / off
 * track / closed), "Blocked only" and "Checkpoint due in 30 days".
 */
import type { ReactNode } from 'react'
import { CalendarClock, AlertOctagon, X } from 'lucide-react'
import { FilterSelect, type FilterSelectOption } from '@/components/ui/FilterSelect'
import { cn } from '@/lib/utils'
import { KR_COMMITMENTS, KR_COMMITMENT_LABELS, KR_COMMITMENT_SHORT, isKrCommitment } from '@/types/package'
import { LEVEL_BUCKET_LABELS, STATUS_KEY_LABELS, activeFilterCount } from './okr-profile-utils'
import type { OkrProfileFilters, OkrProfileLevelBucket, OkrProfileStatusKey } from './types'

const LEVEL_OPTIONS: FilterSelectOption[] = (Object.keys(LEVEL_BUCKET_LABELS) as OkrProfileLevelBucket[]).map((k) => ({
  value: k,
  label: LEVEL_BUCKET_LABELS[k],
}))
const COMMITMENT_OPTIONS: FilterSelectOption[] = KR_COMMITMENTS.map((c) => ({
  value: c,
  label: KR_COMMITMENT_LABELS[c],
  hint: KR_COMMITMENT_SHORT[c],
}))
const STATUS_OPTIONS: FilterSelectOption[] = (Object.keys(STATUS_KEY_LABELS) as OkrProfileStatusKey[]).map((k) => ({
  value: k,
  label: STATUS_KEY_LABELS[k],
}))

function isLevel(v: string | undefined): v is OkrProfileLevelBucket {
  return !!v && v in LEVEL_BUCKET_LABELS
}
function isStatus(v: string | undefined): v is OkrProfileStatusKey {
  return !!v && v in STATUS_KEY_LABELS
}

function ToggleChip({
  pressed,
  onToggle,
  icon,
  children,
}: {
  pressed: boolean
  onToggle: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-caption font-semibold transition-colors ap-focus-ring',
        pressed
          ? 'border-transparent bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]'
          : 'border-[var(--ap-border)] bg-[var(--ap-bg-raised)] text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)]',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export interface OkrProfileFilterBarProps {
  filters: OkrProfileFilters
  onChange: (next: OkrProfileFilters) => void
  shown: number
  total: number
}

export function OkrProfileFilterBar({ filters, onChange, shown, total }: OkrProfileFilterBarProps) {
  const active = activeFilterCount(filters)
  const set = (patch: Partial<OkrProfileFilters>) => onChange({ ...filters, ...patch })

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter OKRs">
      <FilterSelect
        label="Level"
        placeholder="All levels"
        value={filters.level}
        options={LEVEL_OPTIONS}
        onValueChange={(v) => set({ level: isLevel(v) ? v : undefined })}
      />
      <FilterSelect
        label="Commitment"
        placeholder="Any"
        value={filters.commitment}
        options={COMMITMENT_OPTIONS}
        onValueChange={(v) => set({ commitment: isKrCommitment(v) ? v : undefined })}
      />
      <FilterSelect
        label="Status"
        placeholder="Any"
        value={filters.status}
        options={STATUS_OPTIONS}
        onValueChange={(v) => set({ status: isStatus(v) ? v : undefined })}
      />
      <ToggleChip
        pressed={!!filters.blockedOnly}
        onToggle={() => set({ blockedOnly: !filters.blockedOnly || undefined })}
        icon={<AlertOctagon className="size-3.5" aria-hidden />}
      >
        Blocked only
      </ToggleChip>
      <ToggleChip
        pressed={!!filters.checkpointDue30}
        onToggle={() => set({ checkpointDue30: !filters.checkpointDue30 || undefined })}
        icon={<CalendarClock className="size-3.5" aria-hidden />}
      >
        Checkpoint due in 30 days
      </ToggleChip>
      {active > 0 && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-caption font-semibold text-[var(--ap-accent)] ap-focus-ring hover:bg-[var(--ap-bg-hover)]"
        >
          <X className="size-3.5" aria-hidden />
          Clear filters
        </button>
      )}
      <span className="ml-auto text-caption text-[var(--ap-fg-subtle)]" aria-live="polite">
        {active > 0 ? `${shown} of ${total} objectives` : `${total} objective${total === 1 ? '' : 's'}`}
      </span>
    </div>
  )
}
