'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Lock, ArrowLeft, KeyRound } from 'lucide-react'

const inputCls =
  'w-full rounded-[10px] border-0 pl-9 pr-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[color:var(--ap-accent)]'
const inputStyle = { background: 'rgba(120,120,128,0.06)' } as const

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
      <div className="rounded-[10px] px-4 py-3 text-[12px]"
        style={{ background: 'var(--ap-danger-bg)', color: 'var(--ap-danger-fg)' }}>
        This page requires a reset token.{' '}
        <Link href="/auth/forgot-password" className="font-semibold underline">Request a new link.</Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="rounded-[10px] px-4 py-3 text-[12px]"
        style={{ background: 'var(--ap-ok-bg)', color: 'var(--ap-ok-fg)' }}>
        Password updated. Redirecting to sign in…
      </div>
    )
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-[10px] px-3 py-2 text-[12px] font-medium"
          style={{ background: 'var(--ap-danger-bg)', color: 'var(--ap-danger-fg)' }}>
          {error}
        </div>
      )}
      <div>
        <label htmlFor="password" className="block text-[12px] font-medium mb-1.5">New password</label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input id="password" type={show ? 'text' : 'password'} required autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            className={inputCls + ' pr-9'} style={inputStyle} placeholder="At least 8 characters" />
          <button type="button" onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <div>
        <label htmlFor="confirm" className="block text-[12px] font-medium mb-1.5">Confirm new password</label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input id="confirm" type={show ? 'text' : 'password'} required autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className={inputCls} style={inputStyle} placeholder="Re-enter password" />
        </div>
      </div>
      <button type="submit" disabled={loading}
        className="w-full rounded-[10px] py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-60"
        style={{ background: 'var(--ap-accent)' }}>
        {loading ? 'Updating…' : 'Reset password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
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
            Choose a new password
          </h1>
          <p className="mt-1 text-center text-[13px] text-muted-foreground">
            The reset link is valid for one hour.
          </p>
        </div>

        <div className="mt-6">
          <Suspense fallback={<div className="text-center text-[13px] text-muted-foreground">Loading…</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>

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
