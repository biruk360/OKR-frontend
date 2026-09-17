'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import {
  useThemeStore,
  type Appearance,
  type ThemeName,
} from '@/lib/stores/theme-store'

const THEMES: Array<{ value: ThemeName; label: string }> = [
  { value: 'apple', label: 'Apple' },
  { value: 'apple-pro', label: 'Apple Pro' },
]

const APPEARANCES: Array<{ value: Appearance; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'Match system', Icon: Monitor },
]

/** Segmented track shared by both controls — mirrors `.ap-segmented`. */
const trackStyle = {
  background: 'var(--ap-bg-sunken)',
  padding: 2,
  gap: 2,
} as const

function pillStyle(isActive: boolean) {
  return {
    background: isActive ? 'var(--ap-bg-raised)' : 'transparent',
    color: isActive ? 'var(--ap-fg)' : 'var(--ap-fg-subtle)',
    boxShadow: isActive ? 'var(--ap-shadow-sm)' : undefined,
    borderRadius: 'var(--ap-radius-sm)',
  }
}

export default function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const appearance = useThemeStore((s) => s.appearance)
  const setAppearance = useThemeStore((s) => s.setAppearance)

  // Persisted values only exist client-side, so render the SSR defaults until
  // mounted or the markup mismatches on hydration.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const activeTheme: ThemeName = mounted ? theme : 'apple-pro'
  const activeAppearance: Appearance = mounted ? appearance : 'system'

  return (
    <div className="hidden items-center gap-2 sm:inline-flex">
      <div
        role="tablist"
        aria-label="Theme"
        className="inline-flex items-center rounded-[9px] text-[12px] font-semibold"
        style={trackStyle}
      >
        {THEMES.map((opt) => {
          const isActive = activeTheme === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTheme(opt.value)}
              className="h-[26px] px-2.5 transition-colors"
              style={pillStyle(isActive)}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <div
        role="tablist"
        aria-label="Appearance"
        className="inline-flex items-center rounded-[9px]"
        style={trackStyle}
      >
        {APPEARANCES.map(({ value, label, Icon }) => {
          const isActive = activeAppearance === value
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={label}
              title={label}
              onClick={() => setAppearance(value)}
              className="grid h-[26px] w-[28px] place-items-center transition-colors"
              style={pillStyle(isActive)}
            >
              <Icon className="size-3.5" aria-hidden />
            </button>
          )
        })}
      </div>
    </div>
  )
}
