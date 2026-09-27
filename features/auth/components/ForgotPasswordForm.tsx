'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { ArrowLeft } from 'lucide-react'
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
import { forgotPasswordSchema, type ForgotPasswordValues } from '../services/password-reset-schema'
import { zodFormResolver } from '../services/zod-resolver'

/**
 * Request a password-reset link. POST /api/auth/forgot-password answers the
 * same way whether or not the address has an account (no enumeration), so the
 * success state is worded conditionally too.
 */
export default function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodFormResolver<ForgotPasswordValues>(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = handleSubmit(async ({ email }) => {
    clearErrors('root')
    const normalized = email.trim().toLowerCase()
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        setError('root', { message: json?.error || 'We could not send the reset email. Please try again.' })
        return
      }
      setSentTo(normalized)
    } catch {
      setError('root', { message: 'Network error — check your connection and try again.' })
    }
  })

  const backLink = (
    <Link href="/auth/signin" className={AUTH_LINK_CLASS}>
      <ArrowLeft className="size-3.5" strokeWidth={1.75} /> Back to sign in
    </Link>
  )

  if (sentTo) {
    return (
      <AuthCard title="Check your email" footer={backLink}>
        <AuthAlert tone="success">
          If an account exists for <strong className="font-semibold text-white">{sentTo}</strong>, a reset
          link is on its way. The link expires in 1 hour.
        </AuthAlert>
        <p className="mt-4 text-[12.5px] leading-relaxed text-white/60">
          Nothing arrived after a few minutes? Check your spam folder, or{' '}
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="text-white/85 underline underline-offset-4 transition hover:text-white"
          >
            try a different address
          </button>
          .
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Reset password"
      description="Enter the email you sign in with and we will send you a link to choose a new password."
      footer={backLink}
    >
      {/* method/action: no-JS fallback only (onSubmit prevents it). Never a
          native GET — that would put the form fields in the URL. */}
      <form method="post" action="/auth/forgot-password" onSubmit={onSubmit} noValidate>
        {errors.root?.message && (
          <div className="mb-4">
            <AuthAlert tone="error">{errors.root.message}</AuthAlert>
          </div>
        )}

        <AuthFieldGroup>
          <AuthFieldRow id="email" label="Email" invalid={Boolean(errors.email)}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              aria-invalid={Boolean(errors.email)}
              className={AUTH_INPUT_CLASS}
              {...register('email')}
            />
          </AuthFieldRow>
        </AuthFieldGroup>

        <AuthNote message={errors.email?.message} />

        <AuthSubmitButton pending={isSubmitting} pendingLabel="Sending link" className="mt-4">
          Send reset link
        </AuthSubmitButton>
      </form>
    </AuthCard>
  )
}
