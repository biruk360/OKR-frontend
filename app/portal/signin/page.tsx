'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'

export default function PortalSignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const search = useSearchParams()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    try {
      const csrf = await fetch('/api/portal/auth/csrf').then((res) => res.json())
      const body = new URLSearchParams({
        csrfToken: csrf.csrfToken,
        email,
        password,
        json: 'true',
        callbackUrl: '/portal',
      })
      const res = await fetch('/api/portal/auth/callback/client-portal-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) {
        setError('Invalid email or password')
        return
      }
      router.push(search.get('callbackUrl') || '/portal')
      router.refresh()
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-[420px] rounded-card bg-surface-card p-8 shadow-card">
        <div>
          <h1 className="text-page-title text-ink-primary">Client Portal</h1>
          <p className="mt-1 text-body-sm text-ink-secondary">Sign in to view your project status.</p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {error && <div className="rounded-md bg-danger-50 px-3 py-2 text-body-sm font-medium text-danger-700">{error}</div>}
          <label className="block">
            <span className="text-body-sm font-medium text-ink-primary">Email</span>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-tertiary" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input w-full pl-9"
                placeholder="client@example.com"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-body-sm font-medium text-ink-primary">Password</span>
            <div className="relative mt-1">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-tertiary" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full pl-9 pr-9"
                placeholder="Your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink-primary"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          <button type="submit" disabled={isLoading} className="btn btn-primary w-full">
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
