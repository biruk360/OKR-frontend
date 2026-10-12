'use client'

/**
 * ProfileTimeframeSwitcher — PRF-3 timeframe picker for the employee profile
 * header. Writes `?tf=` (dropped when it equals the default) and keeps the active
 * tab, so every tab re-renders for the chosen timeframe. Past (closed) timeframes
 * are listed and marked read-only; the tab APIs enforce the read-only rule.
 */
import { useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { FilterSelect, type FilterSelectOption } from '@/components/ui/FilterSelect'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { useTimeframes } from '@/hooks/useTimeframes'
import { cn } from '@/lib/utils'
import type { ProfileTab } from '@/types/package'
import { isProfileTimeframeEnded, profileShellHref } from '../services/profile-shell'

export interface ProfileTimeframeSwitcherProps {
  userId: string
  activeTab: ProfileTab
  /** The timeframe the page resolved (server), shown before the list loads. */
  selected: { id: string; name: string; ended: boolean } | null
  defaultTimeframeId: string | null
  className?: string
}

export function ProfileTimeframeSwitcher({
  userId,
  activeTab,
  selected,
  defaultTimeframeId,
  className,
}: ProfileTimeframeSwitcherProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { timeframes, isLoading } = useTimeframes()

  const options = useMemo<FilterSelectOption[]>(() => {
    const now = new Date()
    const rows = [...timeframes].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    const list: FilterSelectOption[] = rows.map((tf) => ({
      value: tf.id,
      label: tf.name,
      hint: tf.id === defaultTimeframeId ? 'Current' : isProfileTimeframeEnded(tf.endDate, now) ? 'Closed' : undefined,
    }))
    // Keep the resolved timeframe selectable while the list loads (or if it is missing from it).
    if (selected && !list.some((o) => o.value === selected.id)) {
      list.unshift({ value: selected.id, label: selected.name, hint: selected.ended ? 'Closed' : undefined })
    }
    return list
  }, [timeframes, defaultTimeframeId, selected])

  const onChange = (value: string | undefined) => {
    if (!value || value === selected?.id) return
    startTransition(() => {
      router.push(profileShellHref(userId, activeTab, value, defaultTimeframeId), { scroll: false })
    })
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} aria-busy={pending || undefined}>
      <FilterSelect
        label="Timeframe"
        value={selected?.id}
        onValueChange={onChange}
        options={options}
        clearable={false}
        placeholder={isLoading ? 'Loading…' : 'Pick a timeframe'}
        menuWidth={260}
        disabled={pending || options.length === 0}
      />
      {selected?.ended ? (
        <MiniBadge tone="neutral" title="This timeframe has ended. Its package items are read-only.">
          <Lock className="mr-1 inline size-3" aria-hidden="true" />
          Closed · read-only
        </MiniBadge>
      ) : null}
    </div>
  )
}
