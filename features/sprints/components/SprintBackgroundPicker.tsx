'use client'

/**
 * SprintBackgroundPicker — popover with a swatch grid for choosing the
 * board's gradient background. PATCHes /api/sprints/[id] with the chosen
 * preset key and calls `onChanged` so the caller can invalidate queries.
 */

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BACKGROUND_PRESETS,
  BACKGROUND_KEYS,
  type SprintBackgroundKey,
} from '@/lib/sprint-backgrounds'

interface Props {
  sprintId: string
  current: SprintBackgroundKey | string | null
  onChanged: (next: SprintBackgroundKey) => void
}

export default function SprintBackgroundPicker({ sprintId, current, onChanged }: Props) {
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
        className="inline-flex items-center gap-1.5 rounded-[10px] border bg-card px-3 py-1 text-[12px] font-semibold hover:bg-muted"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        Background
      </button>

      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-[280px] rounded-[12px] border bg-card p-3 shadow-popover"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Board background
          </p>
          <div className="grid grid-cols-4 gap-2">
            {BACKGROUND_KEYS.map((k) => {
              const preset = BACKGROUND_PRESETS[k]
              const active = current === k || (!current && k === 'none')
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => pick(k)}
                  title={preset.label}
                  className={cn(
                    'relative aspect-[5/4] overflow-hidden rounded-[8px] border transition hover:scale-[1.04]',
                    active ? 'ring-2 ring-primary-500 ring-offset-1' : '',
                  )}
                  style={{
                    borderColor: 'var(--ap-border-soft, var(--ap-border))',
                    backgroundImage: preset.swatch,
                  }}
                >
                  {active && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Check className="h-4 w-4 text-white drop-shadow" />
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
          <p className="mt-2 text-[10px] text-muted-foreground">
            Subtle gradients, designed to keep cards legible.
          </p>
        </div>
      )}
    </div>
  )
}
