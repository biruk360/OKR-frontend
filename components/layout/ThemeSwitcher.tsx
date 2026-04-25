'use client'

import { useEffect, useState } from 'react'
import { useThemeStore, type ThemeName } from '@/lib/stores/theme-store'

const OPTIONS: Array<{ value: ThemeName; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'apple', label: 'Apple' },
  { value: 'apple-pro', label: 'Apple Pro' },
]

export default function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const active: ThemeName = mounted ? theme : 'apple-pro'

  return (
    <div
      role="tablist"
      aria-label="Theme"
      className="hidden sm:inline-flex items-center rounded-full p-0.5 text-[11px] font-medium"
      style={{ background: 'var(--ap-bg-sunken, rgba(120,120,128,0.12))' }}
    >
      {OPTIONS.map((opt) => {
        const isActive = active === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setTheme(opt.value)}
            className="rounded-full px-2.5 py-1 transition-colors"
            style={{
              background: isActive ? 'var(--ap-bg-raised, #fff)' : 'transparent',
              color: isActive
                ? 'var(--ap-fg, #1d1d1f)'
                : 'var(--ap-fg-muted, #6e6e73)',
              boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.06)' : undefined,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
