'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Lock, ArrowLeft } from 'lucide-react'

function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!token) { setError('Missing reset token in URL'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || 'Reset failed')
        return
      }
      setDone(true)
      setTimeout(() => router.push('/auth/signin'), 2000)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="rounded-card-lg bg-danger-500/10 px-4 py-4 text-body-sm text-danger-700">
        This page requires a reset token. <Link href="/auth/forgot-password" className="font-medium underline">Request a new reset link.</Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="rounded-card-lg bg-success-500/10 px-4 py-4 text-body-sm text-success-700">
        Password updated. Redirecting to sign in…
      </div>
    )
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-card-lg bg-danger-500/10 px-4 py-3 text-body-sm text-danger-700">{error}</div>
      )}
      <div>
        <label htmlFor="password" className="label mb-1 block text-ink-primary">New password</label>
        <div className="relative mt-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Lock className="h-5 w-5 text-ink-secondary" strokeWidth={1.75} />
          </div>
          <input
            id="password"
            name="password"
            type={show ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input pl-10 pr-10"
            placeholder="At least 8 characters"
          />
          <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-3" onClick={() => setShow(!show)}>
            {show ? <EyeOff className="h-5 w-5 text-ink-secondary" /> : <Eye className="h-5 w-5 text-ink-secondary" />}
          </button>
        </div>
      </div>
      <div>
        <label htmlFor="confirm" className="label mb-1 block text-ink-primary">Confirm new password</label>
        <input
          id="confirm"
          name="confirm"
          type={show ? 'text' : 'password'}
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input"
          placeholder="Re-enter the password"
        />
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Updating…' : 'Reset password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-app py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h2 className="text-center text-page-title text-ink-primary">Choose a new password</h2>
          <p className="mt-2 text-center text-body-sm text-ink-secondary">
            Enter your new password below. The reset link is valid for one hour.
          </p>
        </div>

        <Suspense fallback={<div className="text-center text-body-sm text-ink-secondary">Loading…</div>}>
          <ResetPasswordForm />
        </Suspense>

        <div className="text-center">
          <Link href="/auth/signin" className="inline-flex items-center text-body-sm font-medium text-primary-500 hover:text-primary-700">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
