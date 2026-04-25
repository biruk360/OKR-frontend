'use client'

import { useEffect } from 'react'
import { bodyClassForTheme, useThemeStore } from '@/lib/stores/theme-store'

interface Props {
  baseClassName: string
}

/**
 * Sets document.body className based on theme store. Hydrates after mount so the
 * SSR class (apple-pro by default) is replaced with whatever the user persisted.
 */
export default function ThemeBodyClass({ baseClassName }: Props) {
  const theme = useThemeStore((s) => s.theme)
  useEffect(() => {
    document.body.className = bodyClassForTheme(theme, baseClassName)
  }, [theme, baseClassName])
  return null
}
