import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { getServerSessionSafe } from '@/lib/auth'
import ThemeBodyClass from './theme-body-class'
import AppleToaster from '@/components/layout/AppleToaster'
import { CommandPalette } from '@/components/cmdk/CommandPalette'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  adjustFontFallback: true,
  fallback: ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
})

export const metadata: Metadata = {
  title: 'OKR Management System',
  description: 'A comprehensive OKR management system for organizations',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F2F2F7',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSessionSafe()

  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className={`${inter.className} apple-pro-surface theme-apple-full`} suppressHydrationWarning>
        <Providers session={session}>
          <ThemeBodyClass baseClassName={inter.className} />
          {children}
          <CommandPalette />
          <AppleToaster />
        </Providers>
      </body>
    </html>
  )
}
