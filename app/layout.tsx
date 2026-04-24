import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from 'react-hot-toast'
import { getServerSessionSafe } from '@/lib/auth'

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
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1D1D1F',
                color: '#fff',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
