'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { safeCallbackUrl } from '../services/callback-url'

/** Set when "Remember me" is ticked, so the next visit arrives pre-filled. */
const REMEMBERED_EMAIL_KEY = 'okr.auth.rememberedEmail'

interface SignInValues {
  email: string
  password: string
  remember: boolean
}

/** Glass field styling — the card sits on a photograph, not on a surface. */
const FIELD_CLASS =
  'h-11 rounded-[var(--ap-radius-md)] border-white/20 bg-white/10 pl-10 pr-10 text-[14px] text-white placeholder:text-white/45 md:text-[14px] dark:bg-white/10 dark:border-white/20 backdrop-blur-sm transition hover:border-white/30 focus-visible:border-white/45 focus-visible:bg-white/[0.16]'

/** Applied on top of FIELD_CLASS when a field has failed validation. A red that
 * survives a bright photograph — the shadcn `destructive` token is tuned for
 * light surfaces and disappears on this glass. */
const INVALID_FIELD_CLASS =
  'border-[oklch(0.74_0.17_25/0.9)] bg-[oklch(0.58_0.19_25/0.18)] focus-visible:border-[oklch(0.80_0.16_25)]'

export default function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    defaultValues: { email: '', password: '', remember: false },
  })

  useEffect(() => {
    try {
      const remembered = window.localStorage.getItem(REMEMBERED_EMAIL_KEY)
      if (remembered) {
        setValue('email', remembered)
        setValue('remember', true)
      }
    } catch {
      /* storage blocked — the field simply starts empty */
    }
  }, [setValue])

  const onSubmit = handleSubmit(async ({ email, password, remember }) => {
    clearErrors('root')
    try {
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) {
        setError('root', { message: 'That email and password do not match an account.' })
        return
      }

      const session = await getSession()
      if (!session) {
        setError('root', { message: 'Signed in, but the session did not start. Try again.' })
        return
      }

      try {
        if (remember) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email)
        else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY)
      } catch {
        /* storage blocked — sign-in still succeeds */
      }

      // Honour callbackUrl so a shared card link survives sign-in (SHR-6).
      router.push(safeCallbackUrl(searchParams.get('callbackUrl')))
      router.refresh()
    } catch {
      setError('root', { message: 'Something went wrong on our side. Please try again.' })
    }
  })

  return (
    <div
      className="ap-auth-rise w-full max-w-[420px] rounded-[var(--ap-radius-lg)] border border-white/15 p-7 text-white shadow-[0_32px_80px_-24px_oklch(0.1_0.02_258/0.65)] backdrop-blur-2xl sm:p-8"
      style={{ background: 'oklch(0.20 0.02 258 / 0.58)', animationDelay: '160ms' }}
    >
      <div>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Sign in</h2>
        <p className="mt-1 text-[13px] text-white/60">Continue to your OKR workspace.</p>
      </div>

      <form className="mt-7 space-y-4" onSubmit={onSubmit} noValidate>
        {errors.root?.message && (
          <div
            role="alert"
            className="ap-auth-shake flex items-start gap-2 rounded-[var(--ap-radius-md)] border border-white/15 px-3 py-2.5 text-[12.5px] leading-relaxed text-white"
            style={{ background: 'oklch(0.58 0.19 25 / 0.28)' }}
          >
            <ShieldAlert className="mt-px size-4 shrink-0" strokeWidth={1.75} />
            <span>{errors.root.message}</span>
          </div>
        )}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-white/80">
            Email
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45"
              strokeWidth={1.75}
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              aria-invalid={Boolean(errors.email)}
              className={cn(FIELD_CLASS, 'pr-3', errors.email && INVALID_FIELD_CLASS)}
              {...register('email', {
                required: 'Enter your email address.',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'That does not look like an email address.' },
              })}
            />
          </div>
          {errors.email && (
            <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[oklch(0.85_0.11_25)]">
              <AlertTriangle className="size-3" strokeWidth={1.75} />
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-[12px] font-medium text-white/80">
            Password
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45"
              strokeWidth={1.75}
            />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              aria-invalid={Boolean(errors.password)}
              className={cn(FIELD_CLASS, errors.password && INVALID_FIELD_CLASS)}
              onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
              {...register('password', { required: 'Enter your password.' })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 transition hover:text-white"
            >
              {showPassword ? (
                <EyeOff className="size-4" strokeWidth={1.75} />
              ) : (
                <Eye className="size-4" strokeWidth={1.75} />
              )}
            </button>
          </div>
          {errors.password ? (
            <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[oklch(0.85_0.11_25)]">
              <AlertTriangle className="size-3" strokeWidth={1.75} />
              {errors.password.message}
            </p>
          ) : (
            capsLock && (
              <p className="mt-1.5 flex items-center gap-1 text-[12px] text-white/70">
                <AlertTriangle className="size-3" strokeWidth={1.75} />
                Caps Lock is on.
              </p>
            )
          )}
        </div>

        <div className="flex items-center justify-between pt-1 text-[12.5px]">
          <label className="inline-flex cursor-pointer items-center gap-2 text-white/70 transition hover:text-white">
            <input
              type="checkbox"
              className="size-3.5 rounded border-white/30 bg-white/10 accent-[color:var(--ap-accent)]"
              {...register('remember')}
            />
            Remember me
          </label>
          <Link href="/auth/forgot-password" className="font-medium text-white/80 transition hover:text-white hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="group/cta mt-2 h-11 w-full gap-2 rounded-[var(--ap-radius-md)] text-[14px] font-semibold text-white shadow-[0_10px_30px_-10px_oklch(0.52_0.17_255/0.8)] transition hover:brightness-110 disabled:opacity-70"
          style={{
            background:
              'linear-gradient(135deg, var(--ap-accent) 0%, oklch(0.55 0.19 285) 100%)',
          }}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight
                className="size-4 transition-transform group-hover/cta:translate-x-0.5"
                strokeWidth={2}
              />
            </>
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-white/60">
        Don&apos;t have an account?{' '}
        <Link href="/auth/signup" className="font-semibold text-white transition hover:underline">
          Create one
        </Link>
      </p>
    </div>
  )
}
