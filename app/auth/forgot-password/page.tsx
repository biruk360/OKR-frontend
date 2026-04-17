'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft } from 'lucide-react'

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
    <div className="flex min-h-screen items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h2 className="text-center text-page-title text-foreground">Reset your password</h2>
          <p className="mt-2 text-center text-body-sm text-muted-foreground">
            Enter the email associated with your account and we'll send you a reset link.
          </p>
        </div>

        {done ? (
          <div className="rounded-card-lg bg-success-500/10 px-4 py-4 text-body-sm text-success-700">
            If an account exists for <strong>{email}</strong>, a reset link has been sent. Check your inbox (and spam). The link expires in 1 hour.
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-card-lg bg-danger-500/10 px-4 py-3 text-body-sm text-danger-700">{error}</div>
            )}
            <div>
              <label htmlFor="email" className="label mb-1 block text-foreground">Email address</label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <div className="text-center">
          <Link href="/auth/signin" className="inline-flex items-center text-body-sm font-medium text-primary-500 hover:text-primary-700">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
