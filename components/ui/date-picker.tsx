'use client'

/**
 * AppleDatePicker + AppleDateRangePicker (UX-01)
 *
 * Apple Pro calendar pickers built on the --ap-* token set (docs/apple_pro_token.md).
 * Replaces every native <input type="date"> in the sprint module.
 *
 * Values are ISO date strings ("YYYY-MM-DD") to match existing API payloads.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

// ─── date helpers (all local-time, ISO-string based) ─────────────────────────

export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromIso(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function displayLabel(iso: string | null): string {
  const d = fromIso(iso)
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
}

function dayCount(startIso: string | null, endIso: string | null): number | null {
  const s = fromIso(startIso), e = fromIso(endIso)
  if (!s || !e) return null
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** 42-cell (6×7) month grid, week starting Monday (ISO). */
function buildMonthGrid(visible: Date): (Date | null)[] {
  const first = startOfMonth(visible)
  const mondayOffset = (first.getDay() + 6) % 7 // 0 = Monday
  const gridStart = addDays(first, -mondayOffset)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

// ─── styles (token-driven; see docs/apple_pro_token.md) ──────────────────────

const css = `
.apdp-trigger {
  display: inline-flex; align-items: center; gap: 8px; width: 100%;
  height: 30px; padding: 0 10px; border-radius: 10px;
  background: rgba(120,120,128,0.10);
  border: 0.5px solid var(--ap-border);
  font-size: 13px; color: var(--ap-fg); letter-spacing: -0.01em;
  cursor: pointer; transition: background .12s, outline .12s;
  text-align: left;
}
.apdp-trigger:hover { background: rgba(120,120,128,0.16); }
.apdp-trigger:focus-visible { outline: 2px solid var(--ap-accent); outline-offset: 1px; border-color: transparent; }
.apdp-trigger .placeholder { color: var(--ap-fg-faint); }
.apdp-trigger svg { color: var(--ap-fg-muted); flex-shrink: 0; }

.apdp-pop {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 40;
  width: 300px; border-radius: 16px;
  background: var(--ap-bg-raised);
  border: 0.5px solid var(--ap-border);
  box-shadow: 0 30px 60px -20px rgba(0,0,0,0.25), 0 10px 20px -10px rgba(0,0,0,0.10);
  padding: 12px;
  transform-origin: top left;
  animation: apdp-in .2s cubic-bezier(.2,.8,.2,1);
}
.apdp-pop.flip { top: auto; bottom: calc(100% + 6px); transform-origin: bottom left; }
@keyframes apdp-in {
  from { opacity: 0; transform: scale(.96) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .apdp-pop { animation: none; }
  .apdp-day, .apdp-nav, .apdp-preset, .apdp-trigger { transition: none !important; }
}

.apdp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.apdp-title { font-size: 13px; font-weight: 600; letter-spacing: -0.005em; color: var(--ap-fg); }
.apdp-nav {
  width: 26px; height: 26px; border-radius: 8px; border: none; background: transparent;
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  color: var(--ap-fg-muted); transition: background .12s;
}
.apdp-nav:hover { background: var(--ap-bg-sunken); }
.apdp-today-btn {
  border: none; background: transparent; cursor: pointer; font-size: 12px; font-weight: 500;
  color: var(--ap-accent); padding: 3px 8px; border-radius: 7px; transition: background .12s;
}
.apdp-today-btn:hover { background: var(--ap-accent-soft); }

.apdp-week { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 2px; }
.apdp-week span {
  text-align: center; font-size: 10px; font-weight: 600; letter-spacing: 0.6px;
  text-transform: uppercase; color: var(--ap-fg-subtle); padding: 4px 0;
}

.apdp-grid { display: grid; grid-template-columns: repeat(7, 1fr); row-gap: 1px; }
.apdp-day {
  position: relative; height: 36px; border: none; background: transparent; cursor: pointer;
  font-size: 13px; color: var(--ap-fg); border-radius: 999px;
  font-variant-numeric: tabular-nums; transition: background .12s, color .12s;
}
.apdp-day:hover:not(:disabled) { background: var(--ap-bg-hover); }
.apdp-day:focus-visible { outline: 2px solid var(--ap-accent); outline-offset: -2px; }
.apdp-day.outside { color: var(--ap-fg-faint); }
.apdp-day:disabled { color: var(--ap-fg-faint); cursor: not-allowed; }
.apdp-day.today::after {
  content: ''; position: absolute; inset: 3px; border-radius: 999px;
  border: 1.5px solid var(--ap-accent); pointer-events: none;
}
.apdp-day.selected { background: var(--ap-accent); color: #fff; font-weight: 600; }
.apdp-day.selected:hover { background: var(--ap-accent-hover); }
.apdp-day.selected.today::after { border-color: rgba(255,255,255,0.7); }

.apdp-day.in-range { background: var(--ap-accent-soft); border-radius: 6px; }
.apdp-day.in-range:hover { background: var(--ap-accent-soft); }
.apdp-day.range-edge { background: var(--ap-accent); color: #fff; font-weight: 600; border-radius: 999px; }

.apdp-presets { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.apdp-preset {
  padding: 3px 10px; border-radius: 7px; border: none; cursor: pointer;
  font-size: 11px; font-weight: 500; color: var(--ap-fg-muted);
  background: rgba(120,120,128,0.12); transition: background .12s, color .12s;
}
.apdp-preset:hover { background: rgba(120,120,128,0.20); }
.apdp-preset.active {
  background: var(--ap-bg-raised); color: var(--ap-fg); font-weight: 600;
  box-shadow: 0 3px 8px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04);
}

.apdp-foot {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 10px; padding-top: 10px; border-top: 0.5px solid var(--ap-border);
  font-size: 12px; color: var(--ap-fg-muted); font-variant-numeric: tabular-nums;
}
.apdp-clear {
  border: none; background: transparent; cursor: pointer; font-size: 12px; font-weight: 500;
  color: var(--ap-fg-muted); padding: 2px 6px; border-radius: 6px; transition: background .12s;
  display: inline-flex; align-items: center; gap: 3px;
}
.apdp-clear:hover { background: rgba(120,120,128,0.10); color: var(--ap-fg); }
`

let stylesInjected = false
function useInjectStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.textContent = css
  document.head.appendChild(el)
  stylesInjected = true
}

// ─── shared popover/calendar internals ───────────────────────────────────────

interface GridProps {
  visible: Date
  setVisible: (d: Date) => void
  selected: Date | null
  rangeStart: Date | null
  rangeEnd: Date | null
  hoverDate: Date | null
  minDate?: Date | null
  maxDate?: Date | null
  onPick: (d: Date) => void
  onHover: (d: Date | null) => void
}

function CalendarGrid({ visible, setVisible, selected, rangeStart, rangeEnd, hoverDate, minDate, maxDate, onPick, onHover }: GridProps) {
  const today = new Date()
  const cells = useMemo(() => buildMonthGrid(visible), [visible])
  const isCurrentMonth = visible.getFullYear() === today.getFullYear() && visible.getMonth() === today.getMonth()

  const disabled = (d: Date) =>
    (!!minDate && d < startOfDay(minDate)) || (!!maxDate && d > startOfDay(maxDate))

  // Roving-focus keyboard navigation (UX-01 a11y): one tab stop in the grid,
  // arrows move the focus day, PgUp/PgDn a month, Home/End week edges, Enter selects.
  const anchor = selected ?? rangeStart ?? today
  const [focusDate, setFocusDate] = useState<Date>(anchor)
  const dayRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  useEffect(() => { setFocusDate(selected ?? rangeStart ?? today) }, [selected, rangeStart, visible])

  const moveFocus = (d: Date) => {
    setFocusDate(d)
    if (d.getMonth() !== visible.getMonth()) setVisible(startOfMonth(d))
    requestAnimationFrame(() => dayRefs.current.get(toIso(d))?.focus())
  }

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const moves: Record<string, Date> = {
      ArrowLeft: addDays(focusDate, -1),
      ArrowRight: addDays(focusDate, 1),
      ArrowUp: addDays(focusDate, -7),
      ArrowDown: addDays(focusDate, 7),
      Home: addDays(focusDate, -((focusDate.getDay() + 6) % 7)),
      End: addDays(focusDate, 6 - ((focusDate.getDay() + 6) % 7)),
      PageUp: new Date(focusDate.getFullYear(), focusDate.getMonth() - 1, focusDate.getDate()),
      PageDown: new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, focusDate.getDate()),
    }
    const next = moves[e.key]
    if (next) {
      e.preventDefault()
      moveFocus(next)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!disabled(focusDate)) onPick(focusDate)
    }
  }

  // Live range preview while picking the second endpoint.
  const previewEnd = rangeStart && !rangeEnd ? hoverDate : null
  const effStart = previewEnd && rangeStart && previewEnd < rangeStart ? previewEnd : rangeStart
  const effEnd = previewEnd && rangeStart && previewEnd < rangeStart ? rangeStart : (previewEnd ?? rangeEnd)

  const inBand = (d: Date) =>
    !!effStart && !!effEnd && d > effStart && d < effEnd
  const isEdge = (d: Date) =>
    (!!effStart && sameDay(d, effStart)) || (!!effEnd && sameDay(d, effEnd))

  return (
    <div>
      <div className="apdp-head">
        <button type="button" className="apdp-nav" aria-label="Previous month"
          onClick={() => setVisible(new Date(visible.getFullYear(), visible.getMonth() - 1, 1))}>
          <ChevronLeft size={15} />
        </button>
        <span className="apdp-title">{monthLabel(visible)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {!isCurrentMonth && (
            <button type="button" className="apdp-today-btn" onClick={() => setVisible(startOfMonth(today))}>Today</button>
          )}
          <button type="button" className="apdp-nav" aria-label="Next month"
            onClick={() => setVisible(new Date(visible.getFullYear(), visible.getMonth() + 1, 1))}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="apdp-week" role="row">
        {WEEKDAYS.map(w => <span key={w}>{w}</span>)}
      </div>
      <div className="apdp-grid" role="grid" aria-label={monthLabel(visible)} onKeyDown={onGridKeyDown}>
        {cells.map((d, i) => {
          if (!d) return <span key={i} />
          const outside = d.getMonth() !== visible.getMonth()
          const sel = sameDay(d, selected) || isEdge(d)
          const cls = [
            'apdp-day',
            outside && 'outside',
            sameDay(d, today) && 'today',
            sel && 'selected',
            !sel && inBand(d) && 'in-range',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              aria-selected={sel}
              aria-disabled={disabled(d)}
              disabled={disabled(d)}
              tabIndex={sameDay(d, focusDate) ? 0 : -1}
              ref={(el) => { if (el) dayRefs.current.set(toIso(d), el) }}
              className={cls}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
              onMouseLeave={() => onHover(null)}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function usePopover(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  return ref
}

// ─── AppleDatePicker (single date) ───────────────────────────────────────────

export function AppleDatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  minDate,
  maxDate,
  disabled,
  align = 'left',
}: {
  value: string | null
  onChange: (iso: string | null) => void
  placeholder?: string
  minDate?: string | null
  maxDate?: string | null
  disabled?: boolean
  align?: 'left' | 'right'
}) {
  useInjectStyles()
  const [open, setOpen] = useState(false)
  const selected = fromIso(value)
  const [visible, setVisible] = useState<Date>(() => startOfMonth(selected ?? new Date()))
  const ref = usePopover(open, () => setOpen(false))

  useEffect(() => {
    if (open) setVisible(startOfMonth(selected ?? new Date()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="apdp-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
      >
        <Calendar size={14} />
        {value ? <span>{displayLabel(value)}</span> : <span className="placeholder">{placeholder}</span>}
      </button>
      {open && (
        <div className="apdp-pop" role="dialog" style={align === 'right' ? { left: 'auto', right: 0 } : undefined}>
          <CalendarGrid
            visible={visible}
            setVisible={setVisible}
            selected={selected}
            rangeStart={null}
            rangeEnd={null}
            hoverDate={null}
            minDate={fromIso(minDate)}
            maxDate={fromIso(maxDate)}
            onPick={(d) => { onChange(toIso(d)); setOpen(false) }}
            onHover={() => {}}
          />
        </div>
      )}
    </div>
  )
}

// ─── AppleDateRangePicker ────────────────────────────────────────────────────

export interface RangePreset {
  label: string
  days?: number       // end = start + (days - 1)
  thisMonth?: boolean // start = today, end = last day of month
}

const DEFAULT_PRESETS: RangePreset[] = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '4 weeks', days: 28 },
  { label: 'This month', thisMonth: true },
]

export function AppleDateRangePicker({
  start,
  end,
  onChange,
  presets = DEFAULT_PRESETS,
  minDate,
  disabled,
}: {
  start: string | null
  end: string | null
  onChange: (start: string | null, end: string | null) => void
  presets?: RangePreset[] | null
  minDate?: string | null
  disabled?: boolean
}) {
  useInjectStyles()
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState<Date>(() => startOfMonth(fromIso(start) ?? new Date()))
  const [hover, setHover] = useState<Date | null>(null)
  const ref = usePopover(open, () => setOpen(false))

  const startD = fromIso(start)
  const endD = fromIso(end)

  useEffect(() => {
    if (open) setVisible(startOfMonth(fromIso(start) ?? new Date()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = useCallback((d: Date) => {
    if (!startD || (startD && endD)) {
      onChange(toIso(d), null) // (re)start the range
    } else if (d < startD) {
      onChange(toIso(d), toIso(startD)) // clicked before start → swap
    } else {
      onChange(toIso(startD), toIso(d))
      setOpen(false)
    }
  }, [startD, endD, onChange])

  const applyPreset = (p: RangePreset) => {
    const s = fromIso(start) ?? new Date()
    if (p.thisMonth) {
      const last = new Date(s.getFullYear(), s.getMonth() + 1, 0)
      onChange(toIso(s), toIso(last))
    } else if (p.days) {
      onChange(toIso(s), toIso(addDays(s, p.days - 1)))
    }
  }

  const activePreset = presets?.find(p => {
    if (!startD || !endD) return false
    if (p.thisMonth) {
      const last = new Date(startD.getFullYear(), startD.getMonth() + 1, 0)
      return sameDay(endD, last) && sameDay(startD, new Date())
    }
    return !!p.days && dayCount(start, end) === p.days
  })?.label

  const days = dayCount(start, end)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="apdp-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
      >
        <Calendar size={14} />
        {start && end
          ? <span>{displayLabel(start)} → {displayLabel(end)}</span>
          : start
            ? <span>{displayLabel(start)} → <span className="placeholder">end date</span></span>
            : <span className="placeholder">Pick a date range</span>}
      </button>
      {open && (
        <div className="apdp-pop" role="dialog" style={{ width: 308 }}>
          {presets && presets.length > 0 && (
            <div className="apdp-presets">
              {presets.map(p => (
                <button
                  key={p.label}
                  type="button"
                  className={`apdp-preset${activePreset === p.label ? ' active' : ''}`}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <CalendarGrid
            visible={visible}
            setVisible={setVisible}
            selected={null}
            rangeStart={startD}
            rangeEnd={endD}
            hoverDate={hover}
            minDate={fromIso(minDate)}
            onPick={pick}
            onHover={setHover}
          />
          <div className="apdp-foot">
            <span>
              {days !== null
                ? `${days} day${days === 1 ? '' : 's'} · ${displayLabel(start)} → ${displayLabel(end)}`
                : start
                  ? 'Now pick the end date'
                  : 'Pick a start date'}
            </span>
            {(start || end) && (
              <button type="button" className="apdp-clear" onClick={() => onChange(null, null)}>
                <X size={11} /> Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
