'use client'

import { Toaster } from 'react-hot-toast'

/**
 * Toasts render inside the app document, so they read the `--ap-*` custom
 * properties from `app/globals.css` directly — no hardcoded palette, no
 * JS dark-mode detection. The dark theme is applied by a `dark` class on
 * <html>, which `:root.dark` in globals.css keys off, so every var() below
 * flips automatically with the theme and stays correct after a retarget.
 *
 * react-hot-toast writes `style` and `iconTheme` straight into CSS, so var()
 * references resolve the same way they would in a stylesheet.
 */
export default function AppleToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: 'var(--ap-bg-raised)',
          color: 'var(--ap-fg)',
          border: '1px solid var(--ap-border)',
          borderRadius: 'var(--ap-radius-card)',
          padding: '12px 16px',
          fontSize: '13px',
          boxShadow: 'var(--ap-shadow-md)',
        },
        success: { iconTheme: { primary: 'var(--ap-ok)', secondary: 'var(--ap-bg-raised)' } },
        error: { iconTheme: { primary: 'var(--ap-danger)', secondary: 'var(--ap-bg-raised)' } },
        loading: { iconTheme: { primary: 'var(--ap-accent)', secondary: 'var(--ap-bg-raised)' } },
      }}
    />
  )
}
