'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Lock } from 'lucide-react'

type InviteState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; email: string; name: string }
  | { kind: 'done'; email: string }

const MIN_LENGTH = 10

/**
 * Client-portal invite acceptance: the invitee chooses their password. The
 * token is single-use (the stored hash is replaced by the password hash) and
 * validated server-side by /api/portal/invite, which is rate-limited.
 */
export default function AcceptPortalInvitePage() {
  const search = useSearchParams()
  const router = useRouter()
  const token = search.get('token') ?? ''
  const [state, setState] = useState<InviteState>({ kind: 'loading' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid' })
      return
    }
    let alive = true
    fetch(`/api/portal/invite?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((body) => {
        if (!alive) return
        setState(body?.success && body.data ? { kind: 'ready', email: body.data.email, name: body.data.name } : { kind: 'invalid' })
      })
      .catch(() => alive && setState({ kind: 'invalid' }))
    return () => { alive = false }
  }, [token])

  const valid = password.length >= MIN_LENGTH && /[A-Za-z]/.test(password) && /\d/.test(password)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!valid) return setError(`Use at least ${MIN_LENGTH} characters with letters and numbers.`)
    if (password !== confirm) return setError('The passwords do not match.')
    setSaving(true)
    try {
      const res = await fetch('/api/portal/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.success) {
        setError(body.error || 'The password could not be set. Please try again.')
        return
      }
      setState({ kind: 'done', email: body.data.email })
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-[420px] rounded-card bg-surface-card p-8 shadow-card">
        <h1 className="text-page-title text-ink-primary">Client Portal</h1>
        {state.kind === 'loading' && <p className="mt-2 text-body-sm text-ink-secondary">Checking your invite…</p>}
        {state.kind === 'invalid' && (
          <div className="mt-4 space-y-3">
            <p className="text-body-sm text-ink-secondary">This invite link is invalid, has already been used, or has expired. Ask your project manager for a new one.</p>
            <Link href="/portal/signin" className="btn btn-outline w-full">Go to sign in</Link>
          </div>
        )}
        {state.kind === 'done' && (
          <div className="mt-4 space-y-3">
            <p className="text-body-sm text-ink-secondary">Your password is set for <strong className="text-ink-primary">{state.email}</strong>. You can now sign in.</p>
            <button type="button" className="btn btn-primary w-full" onClick={() => router.push('/portal/signin')}>Sign in</button>
          </div>
        )}
        {state.kind === 'ready' && (
          // Rendered only after the client-side invite check, so it is always
          // hydrated; method/action still rule out a native GET of the password.
          <form
            className="mt-4 space-y-4"
            method="post"
            action={`/portal/accept-invite?token=${encodeURIComponent(token)}`}
            onSubmit={submit}
          >
            <p className="text-body-sm text-ink-secondary">Welcome, {state.name}. Choose a password for <strong className="text-ink-primary">{state.email}</strong>.</p>
            {error && <div className="rounded-md bg-danger-50 px-3 py-2 text-body-sm font-medium text-danger-700">{error}</div>}
            <label className="block">
              <span className="text-body-sm font-medium text-ink-primary">New password</span>
              <div className="relative mt-1">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-tertiary" />
                <input type={show ? 'text' : 'password'} autoComplete="new-password" required value={password}
                  onChange={(e) => setPassword(e.target.value)} className="input w-full pl-9 pr-9" />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink-primary" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <span className={valid ? 'text-xs text-success-700' : 'text-xs text-ink-tertiary'}>At least {MIN_LENGTH} characters, letters and numbers.</span>
            </label>
            <label className="block">
              <span className="text-body-sm font-medium text-ink-primary">Confirm password</span>
              <input type={show ? 'text' : 'password'} autoComplete="new-password" required value={confirm}
                onChange={(e) => setConfirm(e.target.value)} className="input mt-1 w-full" />
            </label>
            <button type="submit" disabled={saving} className="btn btn-primary w-full">{saving ? 'Saving…' : 'Set password'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
