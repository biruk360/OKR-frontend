'use client'

import { useEffect } from 'react'
import {
  bodyClassForTheme,
  resolveAppearance,
  useThemeStore,
} from '@/lib/stores/theme-store'

interface Props {
  baseClassName: string
}

/**
 * Applies both theme axes to the document.
 *
 * - `theme` → classes on <body> (replaces className wholesale, which is exactly
 *   why the dark class must NOT live here).
 * - `appearance` → the `dark` class on <html>. It goes on the root element
 *   because this component rewrites body.className on every theme change and
 *   would otherwise wipe it. tailwind.config.js carries darkMode:'class' so the
 *   `dark:` variants and the CSS in globals.css key off the same signal.
 *
 * Hydrates after mount, so the SSR classes (apple-pro, light) are replaced with
 * whatever the user persisted.
 */
export default function ThemeBodyClass({ baseClassName }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const appearance = useThemeStore((s) => s.appearance)

  useEffect(() => {
    document.body.className = bodyClassForTheme(theme, baseClassName)
  }, [theme, baseClassName])

  useEffect(() => {
    const apply = () => {
      const resolved = resolveAppearance(appearance)
      document.documentElement.classList.toggle('dark', resolved === 'dark')
      document.documentElement.style.colorScheme = resolved
    }
    apply()

    // Only follow the OS while the user has not pinned a preference.
    if (appearance !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [appearance])

  return null
}
