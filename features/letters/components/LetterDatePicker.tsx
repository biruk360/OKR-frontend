'use client'

import { useMemo } from 'react'
// kenat exports ESM only; the function-level helpers are tree-shakable.
import { toEC, toGC, monthNames } from 'kenat'
import { Calendar } from 'lucide-react'

export type CalendarMode = 'GC' | 'EC'

interface Props {
  /** ISO yyyy-mm-dd in the Gregorian calendar — the canonical storage format. */
  value: string
  onChange: (gcIso: string) => void
  mode: CalendarMode
  onModeChange: (m: CalendarMode) => void
  disabled?: boolean
  lang?: 'en' | 'am'
  label?: string
  modeLabel?: { gc: string; ec: string; toggle: string }
}

// kenat's monthNames is { english: [...], amharic: [...] }
type MonthNamesShape = { english?: string[]; amharic?: string[] }

const EC_MONTHS_EN = (monthNames as MonthNamesShape).english || [
  'Meskerem','Tikimt','Hidar','Tahsas','Tir','Yekatit','Megabit','Miazia','Genbot','Sene','Hamle','Nehase','Pagumē',
]
const EC_MONTHS_AM = (monthNames as MonthNamesShape).amharic || [
  'መስከረም','ጥቅምት','ኅዳር','ታኅሣሥ','ጥር','የካቲት','መጋቢት','ሚያዝያ','ግንቦት','ሰኔ','ሐምሌ','ነሐሴ','ጳጉሜ',
]

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y: y || 1970, m: m || 1, d: d || 1 }
}

function isoOf(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
}

export default function LetterDatePicker({
  value,
  onChange,
  mode,
  onModeChange,
  disabled,
  lang = 'en',
  label,
  modeLabel,
}: Props) {
  // The canonical value is always GC. When the user is in EC mode, we render
  // EC selects but convert on every change so the underlying ISO stays GC.
  const gc = useMemo(() => parseIso(value), [value])
  const ec = useMemo(() => toEC(gc.y, gc.m, gc.d), [gc.y, gc.m, gc.d])

  const ecMonths = lang === 'am' ? EC_MONTHS_AM : EC_MONTHS_EN

  function setEC(part: 'y' | 'm' | 'd', n: number) {
    const next = { year: ec.year, month: ec.month, day: ec.day, [part === 'y' ? 'year' : part === 'm' ? 'month' : 'day']: n }
    try {
      const back = toGC(next.year, next.month, next.day)
      onChange(isoOf(back.year, back.month, back.day))
    } catch {
      /* invalid EC date (e.g. Pagumē 7) — ignore the change */
    }
  }

  const ecYears: number[] = []
  for (let y = ec.year - 5; y <= ec.year + 5; y++) ecYears.push(y)

  const inputId = 'letter-date-input'

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white text-xs">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onModeChange('GC')}
            className={`px-2.5 py-1 ${mode === 'GC' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            title={modeLabel?.toggle || 'Calendar'}
          >
            {modeLabel?.gc || 'GC'}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onModeChange('EC')}
            className={`px-2.5 py-1 ${mode === 'EC' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {modeLabel?.ec || 'EC'}
          </button>
        </div>

        {mode === 'GC' ? (
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
            <input
              id={inputId}
              type="date"
              value={value}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              className="h-9 rounded-md border border-gray-200 bg-white pl-7 pr-2 text-sm"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <select
              disabled={disabled}
              value={ec.day}
              onChange={(e) => setEC('d', Number(e.target.value))}
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
              aria-label="Day"
            >
              {Array.from({ length: ec.month === 13 ? (ec.year % 4 === 3 ? 6 : 5) : 30 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              disabled={disabled}
              value={ec.month}
              onChange={(e) => setEC('m', Number(e.target.value))}
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
              aria-label="Month"
            >
              {ecMonths.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
            <select
              disabled={disabled}
              value={ec.year}
              onChange={(e) => setEC('y', Number(e.target.value))}
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
              aria-label="Year"
            >
              {ecYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        )}

        <span className="self-center text-xs text-gray-500">
          {mode === 'GC'
            ? `EC: ${ec.day} ${ecMonths[ec.month - 1]} ${ec.year}`
            : `GC: ${value}`}
        </span>
      </div>
    </div>
  )
}

export function formatEthiopianDate(iso: string, lang: 'en' | 'am' = 'en'): string {
  const { y, m, d } = parseIso(iso)
  try {
    const ec = toEC(y, m, d)
    const months = lang === 'am' ? EC_MONTHS_AM : EC_MONTHS_EN
    return `${ec.day} ${months[ec.month - 1]} ${ec.year}`
  } catch {
    return iso
  }
}
