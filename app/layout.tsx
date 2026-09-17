import type { Metadata, Viewport } from 'next'
import { Instrument_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { getServerSessionSafe } from '@/lib/auth'
import ThemeBodyClass from './theme-body-class'
import AppleToaster from '@/components/layout/AppleToaster'
import { CommandPalette } from '@/components/cmdk/CommandPalette'
import LiveAnnouncer from '@/components/shared/LiveAnnouncer'

// next/font rather than the design's <link> tags — same faces, no
// render-blocking round trip. The weights are the ones the designs actually
// use: 400/500/600/700 sans, 500 mono.
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-instrument-sans',
  adjustFontFallback: true,
  fallback: ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
})

// The font classes carry the @font-face definitions; the VARIABLES are what
// --ap-font-sans / --ap-font-mono reference. Applying `.className` to <body>
// (as this file used to) sets font-family directly and outranks the token — it
// is why --ap-font-sans was defined but never actually rendered.
const fontVars = `${instrumentSans.variable} ${plexMono.variable}`

export const metadata: Metadata = {
  title: 'OKR Management System',
  description: 'A comprehensive OKR management system for organizations',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F9FAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#111419' },
  ],
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSessionSafe()

  return (
    <html lang="en" suppressHydrationWarning className={fontVars}>
      <body className={`${fontVars} apple-pro-surface theme-apple-full`} suppressHydrationWarning>
        <Providers session={session}>
          <ThemeBodyClass baseClassName={fontVars} />
          {children}
          <CommandPalette />
          <AppleToaster />
          <LiveAnnouncer />
        </Providers>
      </body>
    </html>
  )
}
