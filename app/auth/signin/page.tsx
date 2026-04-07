'use client'

import { useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Mail, Lock, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { DEMO_SEED_ACCOUNTS, DEMO_SEED_PASSWORD } from '@/lib/demo-seed-info'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showTestAccounts, setShowTestAccounts] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
      } else {
        // Get the updated session to check user role
        const session = await getSession()
        if (session) {
          router.push('/dashboard')
          router.refresh()
        }
      }
    } catch (error) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-app py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-primary-500/15">
            <Lock className="h-6 w-6 text-primary-600" strokeWidth={1.75} />
          </div>
          <h2 className="mt-6 text-center text-page-title text-ink-primary">Sign in to your account</h2>
          <p className="mt-2 text-center text-body-sm text-ink-secondary">
            Or{' '}
            <Link href="/auth/signup" className="font-medium text-primary-500 hover:text-primary-700">
              create a new account
            </Link>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-card-lg bg-danger-500/10 px-4 py-3 text-body-sm text-danger-700">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="label mb-1 block text-ink-primary">
                Email address
              </label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-5 w-5 text-ink-secondary" strokeWidth={1.75} />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="Enter your email"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="password" className="label mb-1 block text-ink-primary">
                Password
              </label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-ink-secondary" strokeWidth={1.75} />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10 pr-10"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-ink-secondary" strokeWidth={1.75} />
                  ) : (
                    <Eye className="h-5 w-5 text-ink-secondary" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 rounded border-surface-muted text-primary-500 focus:ring-primary-500"
              />
              <label htmlFor="remember-me" className="ml-2 block text-body-sm text-ink-primary">
                Remember me
              </label>
            </div>

            <div className="text-body-sm">
              <a href="#" className="font-medium text-primary-500 hover:text-primary-700">
                Forgot your password?
              </a>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Signing in...
                </div>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>

        {/* Seeded demo accounts (see prisma/seed.ts) */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowTestAccounts(!showTestAccounts)}
            className="flex w-full items-center justify-between rounded-card-lg bg-surface-card p-3 text-body-sm text-ink-secondary shadow-card transition-colors duration-[180ms] hover:bg-surface-hover"
          >
            <div className="flex items-center">
              <Info className="mr-2 h-4 w-4 text-primary-500" strokeWidth={2} />
              <span className="font-medium">Demo login credentials</span>
            </div>
            {showTestAccounts ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showTestAccounts && (
            <div className="mt-3 rounded-card-lg bg-primary-500/10 p-4">
              <p className="mb-3 text-body-sm font-semibold text-ink-primary">
                All seeded accounts use password:{' '}
                <code className="rounded bg-white/80 px-1 py-0.5">{DEMO_SEED_PASSWORD}</code>
              </p>
              <p className="mb-3 text-body-sm text-ink-secondary">
                Run <code className="rounded bg-white/80 px-1 py-0.5 text-[11px]">npm run db:seed</code> if these
                users are missing.
              </p>
              <div className="space-y-2 text-body-sm">
                {DEMO_SEED_ACCOUNTS.map((account) => (
                  <div
                    key={account.email}
                    className="flex items-center justify-between gap-2 rounded-card bg-surface-card p-2 shadow-card"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-ink-primary">{account.label}</span>
                      <span className="ml-2 text-ink-secondary">({account.role})</span>
                      <div className="truncate text-ink-secondary">{account.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(account.email)
                        setPassword(DEMO_SEED_PASSWORD)
                      }}
                      className="shrink-0 font-medium text-primary-500 hover:text-primary-700"
                    >
                      Use
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
