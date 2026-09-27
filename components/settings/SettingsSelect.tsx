'use client'

/**
 * SettingsSelect — the form/picker select used across Settings screens.
 *
 * A thin, option-list wrapper over the Radix `components/ui/select` primitive
 * so each call site stays as short as the native `<select>` it replaced.
 * `FilterSelect` is the filter-bar control (eyebrow label, clear/remove
 * affordances); this is the plain labelled form field.
 *
 * - `value === ''` shows the placeholder (Radix treats '' as "no selection").
 * - Options with a `group` are rendered under a SelectGroup heading, in the
 *   order the groups first appear (replaces native <optgroup>).
 * - Radix forbids '' as an item value; placeholder-only options ("Select…")
 *   must be dropped from `options` and passed as `placeholder` instead.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SettingsSelectOption {
  value: string
  label: string
  group?: string
  disabled?: boolean
}

export interface SettingsSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: SettingsSelectOption[]
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
  size?: 'sm' | 'default'
}

export function SettingsSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled,
  id,
  className,
  size = 'default',
  'aria-label': ariaLabel,
}: SettingsSelectProps) {
  const groups = React.useMemo(() => {
    const order: string[] = []
    const byGroup = new Map<string, SettingsSelectOption[]>()
    for (const opt of options) {
      const key = opt.group ?? ''
      if (!byGroup.has(key)) {
        byGroup.set(key, [])
        order.push(key)
      }
      byGroup.get(key)!.push(opt)
    }
    return order.map((key) => ({ key, items: byGroup.get(key)! }))
  }, [options])

  const renderItem = (opt: SettingsSelectOption) => (
    <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
      {opt.label}
    </SelectItem>
  )

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        size={size}
        aria-label={ariaLabel}
        className={cn('w-full bg-surface-card text-ink-primary', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {groups.map(({ key, items }) =>
          key ? (
            <SelectGroup key={key}>
              <SelectLabel>{key}</SelectLabel>
              {items.map(renderItem)}
            </SelectGroup>
          ) : (
            <React.Fragment key="__ungrouped">{items.map(renderItem)}</React.Fragment>
          ),
        )}
      </SelectContent>
    </Select>
  )
}

export default SettingsSelect
