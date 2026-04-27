'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft, KeyRound } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not send reset email')
        return
      }
      setDone(true)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ background: 'var(--ap-bg)' }}>
      <div className="w-full max-w-[420px] rounded-[14px] border bg-card p-8 shadow-lg"
        style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex flex-col items-center">
          <div className="flex size-11 items-center justify-center rounded-[10px]"
            style={{ background: 'var(--ap-accent-soft)' }}>
            <KeyRound className="size-5" style={{ color: 'var(--ap-accent)' }} strokeWidth={2} />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
            Reset your password
          </h1>
          <p className="mt-1 text-center text-[13px] text-muted-foreground">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        {done ? (
          <div className="mt-6 rounded-[10px] px-4 py-3 text-[12px]"
            style={{ background: 'var(--ap-ok-bg)', color: 'var(--ap-ok-fg)' }}>
            If an account exists for <strong>{email}</strong>, a reset link has been sent. The link expires in 1 hour.
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-[10px] px-3 py-2 text-[12px] font-medium"
                style={{ background: 'var(--ap-danger-bg)', color: 'var(--ap-danger-fg)' }}>
                {error}
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-[12px] font-medium mb-1.5">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input id="email" type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-[10px] border-0 pl-9 pr-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[color:var(--ap-accent)]"
                  style={{ background: 'rgba(120,120,128,0.06)' }} />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full rounded-[10px] py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-60"
              style={{ background: 'var(--ap-accent)' }}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href="/auth/signin"
            className="inline-flex items-center gap-1 text-[12px] font-medium hover:underline"
            style={{ color: 'var(--ap-accent)' }}>
            <ArrowLeft className="size-3.5" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
