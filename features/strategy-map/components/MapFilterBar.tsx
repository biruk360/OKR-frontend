'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { MapFilters } from '../types'

const KEYS: { key: keyof MapFilters; label: string; defaultOn: boolean }[] = [
  { key: 'showIndividualOkrs',     label: 'Individual OKRs',  defaultOn: true },
  { key: 'showEmptyDepartments',   label: 'Empty depts',      defaultOn: true },
  { key: 'showOrgOnly',            label: 'Org only (hide OKRs)', defaultOn: false },
]

export function readFilters(params: URLSearchParams): MapFilters {
  return {
    showIndividualOkrs:   params.get('ind') !== '0',
    showEmptyDepartments: params.get('empty') !== '0',
    showOrgOnly:          params.get('orgonly') === '1',
  }
}

export function MapFilterBar({ value }: { value: MapFilters }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function toggle(key: keyof MapFilters) {
    const next = new URLSearchParams(params.toString())
    const flip = !value[key]
    if (key === 'showIndividualOkrs')      flip ? next.delete('ind') : next.set('ind', '0')
    else if (key === 'showEmptyDepartments') flip ? next.delete('empty') : next.set('empty', '0')
    else if (key === 'showOrgOnly')        flip ? next.set('orgonly', '1') : next.delete('orgonly')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {KEYS.map((k) => {
        const on = value[k.key]
        return (
          <button
            key={k.key}
            type="button"
            onClick={() => toggle(k.key)}
            className="rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
            style={{
              borderColor: on ? '#2563eb' : '#d1d5db',
              background: on ? 'rgba(37,99,235,0.08)' : '#fff',
              color: on ? '#1d4ed8' : '#6b7280',
            }}
          >
            {on ? '✓ ' : ''}{k.label}
          </button>
        )
      })}
    </div>
  )
}
