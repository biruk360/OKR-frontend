'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import AuthCard, {
  AUTH_INPUT_CLASS,
  AUTH_LINK_CLASS,
  AuthAlert,
  AuthFieldGroup,
  AuthFieldRow,
  AuthNote,
  AuthSubmitButton,
} from './AuthCard'
import { PASSWORD_MIN_LENGTH } from '../services/signup-schema'
import { resetPasswordFormSchema, type ResetPasswordFormValues } from '../services/password-reset-schema'
import { zodFormResolver } from '../services/zod-resolver'

const REDIRECT_AFTER_MS = 2000

/**
 * Choose a new password from an emailed `/auth/reset-password?token=…` link.
 * The same link serves a forgot-password reset (1-hour token) and a first-time
 * invitation (7-day token) — POST /api/auth/reset-password handles both — so
 * the copy is neutral between them.
 *
 * Must render under a Suspense boundary (useSearchParams).
 */
export default function ResetPasswordForm() {
  const router = useRouter()
  const token = useSearchParams().get('token') ?? ''
  const [showPassword, setShowPassword] = useState(false)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodFormResolver<ResetPasswordFormValues>(resetPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => router.push('/auth/signin'), REDIRECT_AFTER_MS)
    return () => clearTimeout(t)
  }, [done, router])

  const onSubmit = handleSubmit(async ({ password }) => {
    clearErrors('root')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        setError('root', { message: json?.error || 'We could not update your password. The link may have expired.' })
        return
      }
      setDone(true)
    } catch {
      setError('root', { message: 'Network error — check your connection and try again.' })
    }
  })

  const backLink = (
    <Link href="/auth/signin" className={AUTH_LINK_CLASS}>
      <ArrowLeft className="size-3.5" strokeWidth={1.75} /> Back to sign in
    </Link>
  )

  if (!token) {
    return (
      <AuthCard title="Link incomplete" footer={backLink}>
        <AuthAlert tone="error">
          This page needs the reset link from your email, and the one you opened has no token.{' '}
          <Link href="/auth/forgot-password" className="font-semibold text-white underline underline-offset-4">
            Request a new link
          </Link>
          .
        </AuthAlert>
      </AuthCard>
    )
  }

  if (done) {
    return (
      <AuthCard title="Password updated" footer={backLink}>
        <AuthAlert tone="success">
          Your password has been set. Taking you to sign in…
        </AuthAlert>
      </AuthCard>
    )
  }

  const fieldNote = errors.password?.message || errors.confirmPassword?.message
  const toggle = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
      className="-mr-1 flex size-8 shrink-0 items-center justify-center self-end rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
    >
      {showPassword ? <EyeOff className="size-[15px]" strokeWidth={1.75} /> : <Eye className="size-[15px]" strokeWidth={1.75} />}
    </button>
  )

  return (
    <AuthCard
      title="Set a new password"
      description={`Choose a password of at least ${PASSWORD_MIN_LENGTH} characters. Any other signed-in sessions will be signed out.`}
      footer={backLink}
    >
      <form onSubmit={onSubmit} noValidate>
        {errors.root?.message && (
          <div className="mb-4">
            <AuthAlert tone="error">
              {errors.root.message}{' '}
              <Link href="/auth/forgot-password" className="font-semibold text-white underline underline-offset-4">
                Request a new link
              </Link>
            </AuthAlert>
          </div>
        )}

        <AuthFieldGroup>
          <AuthFieldRow id="password" label="New password" invalid={Boolean(errors.password)} trailing={toggle}>
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
              aria-invalid={Boolean(errors.password)}
              className={AUTH_INPUT_CLASS}
              {...register('password')}
            />
          </AuthFieldRow>
          <AuthFieldRow id="confirmPassword" label="Confirm password" invalid={Boolean(errors.confirmPassword)}>
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter the password"
              aria-invalid={Boolean(errors.confirmPassword)}
              className={AUTH_INPUT_CLASS}
              {...register('confirmPassword')}
            />
          </AuthFieldRow>
        </AuthFieldGroup>

        <AuthNote message={fieldNote} />

        <AuthSubmitButton pending={isSubmitting} pendingLabel="Saving" className="mt-4">
          Set password
        </AuthSubmitButton>
      </form>
    </AuthCard>
  )
}
