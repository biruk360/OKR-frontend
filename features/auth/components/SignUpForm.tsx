'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { Eye, EyeOff, Mail, Lock, User, Target, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useHydrated } from '@/hooks/useHydrated'
import { signUpFormSchema, PASSWORD_MIN_LENGTH, type SignUpFormValues } from '../services/signup-schema'

/**
 * Self-service sign-up. There is intentionally no role picker: the server
 * always creates an EMPLOYEE (POST /api/auth/register ignores `role`); admins
 * change roles from Settings → Users.
 *
 * New accounts are created inactive and need administrator activation, so a
 * successful submit shows a "pending activation" state instead of redirecting.
 * The server answers identically for new and existing emails (no enumeration).
 */

/** Zod → react-hook-form bridge (no @hookform/resolvers dependency in this repo). */
const zodResolver: Resolver<SignUpFormValues> = async (values) => {
  const result = signUpFormSchema.safeParse(values)
  if (result.success) return { values, errors: {} }
  const errors: FieldErrors<SignUpFormValues> = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof SignUpFormValues | undefined
    if (key && !errors[key]) errors[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors }
}

const inputCls =
  'w-full rounded-[var(--ap-radius-sm)] border-0 pl-9 pr-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[color:var(--ap-accent)]'
const inputStyle = { background: 'rgba(120,120,128,0.06)' } as const

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium" style={{ color: 'var(--ap-danger-fg)' }} role="alert">
      {message}
    </p>
  )
}

export default function SignUpForm() {
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  // Submit stays disabled until hydration, so it can never fire the native submit.
  const hydrated = useHydrated()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver,
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await response.json().catch(() => null)

      if (response.ok && data?.success) {
        setSubmitted(
          data.message ||
            'Account created. An administrator must activate it before you can sign in.',
        )
        return
      }
      const message = data?.error || 'Failed to create account'
      setError('root', { message })
      toast.error(message)
    } catch {
      toast.error('An error occurred. Please try again.')
    }
  })

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: 'var(--ap-bg)' }}
    >
      <div
        className="w-full max-w-[420px] rounded-[var(--ap-radius-md)] border bg-card p-8 shadow-lg"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div className="flex flex-col items-center">
          <div
            className="flex size-11 items-center justify-center rounded-[var(--ap-radius-sm)]"
            style={{ background: 'var(--ap-accent-soft)' }}
          >
            <Target className="size-5" style={{ color: 'var(--ap-accent)' }} strokeWidth={2} />
          </div>
          <h1
            className="mt-4 text-[22px] font-semibold leading-tight"
            style={{ letterSpacing: '-0.02em' }}
          >
            Create your account
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Get started with OKR tracking</p>
        </div>

        {submitted ? (
          <div className="mt-6 space-y-4" role="status">
            <div className="flex items-start gap-3 rounded-[var(--ap-radius-sm)] px-4 py-3 text-[13px]"
              style={{ background: 'var(--ap-ok-bg)', color: 'var(--ap-ok-fg)' }}>
              <ShieldCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              <div>
                <p className="font-semibold">Pending administrator activation</p>
                <p className="mt-1">{submitted}</p>
              </div>
            </div>
            <Link href="/auth/signin"
              className="block w-full rounded-[var(--ap-radius-sm)] py-2.5 text-center text-[13px] font-semibold text-white transition"
              style={{ background: 'var(--ap-accent)' }}>
              Back to sign in
            </Link>
          </div>
        ) : (
        // method/action: no-JS fallback only (onSubmit prevents it). Never a
        // native GET — that would put the password in the URL.
        <form className="mt-6 space-y-4" method="post" action="/auth/signup" onSubmit={onSubmit} noValidate>
          {errors.root?.message && (
            <div className="rounded-[var(--ap-radius-sm)] px-3 py-2 text-[12px] font-medium"
              style={{ background: 'var(--ap-danger-bg)', color: 'var(--ap-danger-fg)' }} role="alert">
              {errors.root.message}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-[12px] font-medium mb-1.5">Full name</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input id="name" type="text" autoComplete="name" {...register('name')}
                aria-invalid={Boolean(errors.name)}
                className={inputCls} style={inputStyle} placeholder="Jane Doe" />
            </div>
            <FieldError message={errors.name?.message} />
          </div>

          <div>
            <label htmlFor="email" className="block text-[12px] font-medium mb-1.5">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input id="email" type="email" autoComplete="email" {...register('email')}
                aria-invalid={Boolean(errors.email)}
                className={inputCls} style={inputStyle} placeholder="you@example.com" />
            </div>
            <FieldError message={errors.email?.message} />
          </div>

          <div>
            <label htmlFor="password" className="block text-[12px] font-medium mb-1.5">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                {...register('password')} aria-invalid={Boolean(errors.password)}
                className={inputCls + ' pr-9'} style={inputStyle} placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <FieldError message={errors.password?.message} />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-[12px] font-medium mb-1.5">Confirm password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password"
                {...register('confirmPassword')} aria-invalid={Boolean(errors.confirmPassword)}
                className={inputCls + ' pr-9'} style={inputStyle} placeholder="Re-enter password" />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <FieldError message={errors.confirmPassword?.message} />
          </div>

          <button type="submit" disabled={!hydrated || isSubmitting}
            className="w-full rounded-[var(--ap-radius-sm)] py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-60"
            style={{ background: 'var(--ap-accent)' }}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        )}

        <p className="mt-6 text-center text-[12px] text-muted-foreground">
          Already have an account?{' '}
          <Link href="/auth/signin" className="font-semibold hover:underline" style={{ color: 'var(--ap-accent)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
