'use client'

/**
 * SprintBackgroundPicker — popover with a swatch grid for choosing the
 * board's gradient background. PATCHes /api/sprints/[id] with the chosen
 * preset key and calls `onChanged` so the caller can invalidate queries.
 */

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Image as ImageIcon } from 'lucide-react'
import {
  BACKGROUND_PRESETS,
  BACKGROUND_KEYS,
  type SprintBackgroundKey,
} from '@/lib/sprint-backgrounds'

interface Props {
  sprintId: string
  current: SprintBackgroundKey | string | null
  onChanged: (next: SprintBackgroundKey) => void
  /**
   * Dark board ground (`graphite`). Only the TRIGGER forks — it sits on the
   * board chrome. The popover keeps its own light surface so the swatches are
   * judged against a neutral ground rather than the preset being replaced.
   */
  dark?: boolean
}

export default function SprintBackgroundPicker({ sprintId, current, onChanged, dark }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<SprintBackgroundKey | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  async function pick(key: SprintBackgroundKey) {
    if (saving) return
    setSaving(key)
    try {
      const res = await fetch(`/api/sprints/${sprintId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background: key }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      onChanged(key)
      setOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to change background')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[32px] items-center gap-1.5 rounded-[var(--ap-radius-md)] border px-3 text-[12.5px] font-semibold"
        style={{
          borderColor: dark ? 'oklch(1 0 0 / 0.2)' : 'var(--ap-border-strong)',
          background: dark ? 'oklch(1 0 0 / 0.1)' : 'var(--ap-bg-raised)',
          color: dark ? 'oklch(1 0 0)' : 'var(--ap-fg-muted)',
        }}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        Background
      </button>

      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-[268px] rounded-[11px] border p-3"
          style={{
            borderColor: 'var(--ap-border)',
            background: 'var(--ap-bg-raised)',
            boxShadow: 'var(--ap-shadow-pop-xl)',
          }}
        >
          <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: 'var(--ap-fg-subtle)' }}>
            Board background
          </p>
          <div className="grid grid-cols-4 gap-[7px]">
            {BACKGROUND_KEYS.map((k) => {
              const preset = BACKGROUND_PRESETS[k]
              const active = current === k || (!current && k === 'none')
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => pick(k)}
                  title={preset.label}
                  className="relative h-[40px] overflow-hidden rounded-[var(--ap-radius-md)] border transition hover:brightness-[0.97]"
                  style={{
                    borderColor: 'var(--ap-border-soft)',
                    backgroundImage: preset.swatch,
                    boxShadow: active
                      ? '0 0 0 2px var(--ap-bg-raised), 0 0 0 4px oklch(0.55 0.14 255)'
                      : undefined,
                  }}
                >
                  {active && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Check className="h-[15px] w-[15px]" style={{ color: 'oklch(0.35 0.06 262)' }} strokeWidth={3} />
                    </span>
                  )}
                  {saving === k && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-[10px] font-semibold text-white">
                      …
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11.5px] leading-[1.5]" style={{ color: 'var(--ap-fg-subtle)' }}>
            Subtle grounds, chosen to keep card text legible.
          </p>
        </div>
      )}
    </div>
  )
}
