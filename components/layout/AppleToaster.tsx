'use client'

import { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { useThemeStore } from '@/lib/stores/theme-store'

function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark') ||
    document.body.classList.contains('dark')
}

export default function AppleToaster() {
  const theme = useThemeStore((s) => s.theme)
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(isDarkMode())
    const observer = new MutationObserver(() => setDark(isDarkMode()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [theme])

  const bg = dark ? '#1C1C1E' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : '#000000'
  const border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(60,60,67,0.10)'

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: bg,
          color: fg,
          border: `0.5px solid ${border}`,
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '13px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 0.5px 0 rgba(0,0,0,0.05)',
        },
        success: { iconTheme: { primary: '#34C759', secondary: bg } },
        error: { iconTheme: { primary: '#FF3B30', secondary: bg } },
        loading: { iconTheme: { primary: '#007AFF', secondary: bg } },
      }}
    />
  )
}
