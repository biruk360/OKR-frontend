'use client'

import { useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Mail, Lock, Target } from 'lucide-react'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) {
        setError('Invalid email or password')
      } else {
        const session = await getSession()
        if (session) {
          router.push('/dashboard')
          router.refresh()
        }
      }
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: 'var(--ap-bg)' }}
    >
      <div
        className="w-full max-w-[420px] rounded-[14px] border bg-card p-8 shadow-lg"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div className="flex flex-col items-center">
          <div
            className="flex size-11 items-center justify-center rounded-[10px]"
            style={{ background: 'var(--ap-accent-soft)' }}
          >
            <Target className="size-5" style={{ color: 'var(--ap-accent)' }} strokeWidth={2} />
          </div>
          <h1
            className="mt-4 text-[22px] font-semibold leading-tight"
            style={{ letterSpacing: '-0.02em' }}
          >
            Welcome back
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Sign in to your OKR workspace</p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div
              className="rounded-[10px] px-3 py-2 text-[12px] font-medium"
              style={{ background: 'var(--ap-danger-bg)', color: 'var(--ap-danger-fg)' }}
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-[12px] font-medium mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-[10px] border-0 pl-9 pr-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[color:var(--ap-accent)]"
                style={{ background: 'rgba(120,120,128,0.06)' }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-[12px] font-medium mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full rounded-[10px] border-0 pl-9 pr-9 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[color:var(--ap-accent)]"
                style={{ background: 'rgba(120,120,128,0.06)' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[12px]">
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" className="size-3.5 rounded" />
              <span className="text-muted-foreground">Remember me</span>
            </label>
            <Link
              href="/auth/forgot-password"
              className="font-medium hover:underline"
              style={{ color: 'var(--ap-accent)' }}
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-[10px] py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-60"
            style={{ background: 'var(--ap-accent)' }}
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-[12px] text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="font-semibold hover:underline" style={{ color: 'var(--ap-accent)' }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
