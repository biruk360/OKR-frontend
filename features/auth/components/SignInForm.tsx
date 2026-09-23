'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check, Eye, EyeOff, Loader2 } from 'lucide-react'
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

/**
 * The field itself: borderless, transparent, sitting inside a grouped row.
 *
 * `focus-visible:!shadow-none` is load-bearing. `globals.css` puts a 3px blue
 * ring on every focused input under the Apple Pro scope, which would draw a
 * halo around a field that has no visible box of its own. The focus indicator
 * here is the row — its background lifts and a bright bar grows on its left
 * edge — so the global ring is suppressed rather than duplicated.
 */
const INPUT_CLASS =
  'ap-auth-input h-auto w-full rounded-none border-0 bg-transparent p-0 text-[14.5px] leading-tight text-white caret-[color:var(--ap-accent)] placeholder:text-white/30 shadow-none outline-none focus-visible:border-0 focus-visible:ring-0 focus-visible:!shadow-none md:text-[14.5px] dark:bg-transparent'

/** A row of the grouped field block: mono micro-label over the value. */
function FieldRow({
  id,
  label,
  invalid,
  trailing,
  children,
}: {
  id: string
  label: string
  invalid?: boolean
  trailing?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 px-4 py-2.5 transition-colors duration-200',
        'focus-within:bg-white/[0.07]',
        invalid && 'bg-[oklch(0.58_0.19_25/0.14)]'
      )}
    >
      {/* The focus signature: a bright bar that grows out of the left edge.
          Brighter than --ap-accent on purpose — the token is tuned for white
          surfaces and loses its 3:1 against this panel. */}
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-1/2 w-[2.5px] -translate-y-1/2 rounded-r-full transition-all duration-200 ease-out',
          invalid ? 'h-[58%]' : 'h-0 group-focus-within:h-[58%]'
        )}
        style={{ background: invalid ? 'oklch(0.74 0.17 25)' : 'oklch(0.74 0.15 250)' }}
      />
      <div className="min-w-0 flex-1">
        <label
          htmlFor={id}
          className="block text-[9.5px] uppercase tracking-[0.18em] text-white/45"
          style={{ fontFamily: 'var(--ap-font-mono)' }}
        >
          {label}
        </label>
        <div className="mt-1">{children}</div>
      </div>
      {trailing}
    </div>
  )
}

export default function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [host, setHost] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    defaultValues: { email: '', password: '', remember: false },
  })

  const remember = watch('remember')

  useEffect(() => {
    setHost(window.location.host)
  }, [])

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

  const onSubmit = handleSubmit(async ({ email, password, remember: keep }) => {
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
        if (keep) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email)
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

  const fieldNote = errors.email?.message || errors.password?.message || (capsLock ? 'Caps Lock is on.' : null)
  const noteIsError = Boolean(errors.email || errors.password)

  return (
    <div
      className="ap-auth-rise relative w-full max-w-[400px] overflow-hidden rounded-[16px] border border-white/10 p-7 text-white sm:p-8"
      style={{
        background: 'oklch(0.17 0.02 258 / 0.62)',
        backdropFilter: 'blur(28px) saturate(160%)',
        WebkitBackdropFilter: 'blur(28px) saturate(160%)',
        boxShadow:
          'inset 0 1px 0 oklch(1 0 0 / 0.10), 0 40px 90px -34px oklch(0.06 0.02 258 / 0.85)',
        animationDelay: '160ms',
      }}
    >
      {/* The sheet highlight — a hairline that catches light along the top edge
          and fades out before the corners, the way a real panel would. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, oklch(1 0 0 / 0.4), transparent)' }}
      />

      <header>
        {/* The host you are actually signing in to, rather than a second copy
            of the brand the hero already carries. Read after mount — the
            server cannot know it, and guessing would be a hydration mismatch.
            The line keeps its height so the card never reflows on hydration. */}
        <p
          className="h-[13px] text-[10px] tracking-[0.08em] text-white/40"
          style={{ fontFamily: 'var(--ap-font-mono)' }}
        >
          {host}
        </p>
        <h2 className="mt-2 text-[27px] font-semibold leading-none tracking-[-0.035em]">
          Sign in
        </h2>
      </header>

      <form className="mt-7" onSubmit={onSubmit} noValidate>
        {errors.root?.message && (
          <div
            role="alert"
            className="ap-auth-shake mb-4 flex items-start gap-2.5 rounded-[10px] py-2.5 pl-3 pr-3 text-[12.5px] leading-snug"
            style={{
              background: 'oklch(0.58 0.19 25 / 0.16)',
              boxShadow: 'inset 2px 0 0 oklch(0.74 0.17 25)',
            }}
          >
            <span className="text-white/90">{errors.root.message}</span>
          </div>
        )}

        {/* One grouped block, two rows, a hairline between them — the app's
            inset-list idiom rather than two floating boxes. */}
        <div
          className="overflow-hidden rounded-[12px] border border-white/10"
          style={{ background: 'oklch(1 0 0 / 0.055)' }}
        >
          <FieldRow id="email" label="Email" invalid={Boolean(errors.email)}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              aria-invalid={Boolean(errors.email)}
              className={INPUT_CLASS}
              {...register('email', {
                required: 'Enter your email address.',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'That does not look like an email address.',
                },
              })}
            />
          </FieldRow>

          <div className="h-px bg-white/10" aria-hidden />

          <FieldRow
            id="password"
            label="Password"
            invalid={Boolean(errors.password)}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="-mr-1 flex size-8 shrink-0 items-center justify-center self-end rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
              >
                {showPassword ? (
                  <EyeOff className="size-[15px]" strokeWidth={1.75} />
                ) : (
                  <Eye className="size-[15px]" strokeWidth={1.75} />
                )}
              </button>
            }
          >
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              className={INPUT_CLASS}
              onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
              {...register('password', { required: 'Enter your password.' })}
            />
          </FieldRow>
        </div>

        {/* One note line for the whole block — validation or caps lock. It holds
            its height so the button never jumps as messages come and go. */}
        <p
          className={cn(
            'mt-1.5 min-h-[14px] px-1 text-[11.5px] leading-[14px] transition-opacity duration-200',
            fieldNote ? 'opacity-100' : 'opacity-0'
          )}
          style={{ color: noteIsError ? 'oklch(0.84 0.11 25)' : 'oklch(0.85 0.09 70)' }}
        >
          {fieldNote ?? ' '}
        </p>

        <div className="mt-2.5 flex items-center justify-between">
          <label className="group/check inline-flex cursor-pointer select-none items-center gap-2 text-[12.5px] text-white/65 transition hover:text-white/90">
            <input type="checkbox" className="peer sr-only" {...register('remember')} />
            <span
              aria-hidden
              className={cn(
                'flex size-[15px] items-center justify-center rounded-[5px] border transition-all duration-150',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-white/50',
                remember ? 'border-transparent' : 'border-white/25 group-hover/check:border-white/40'
              )}
              style={remember ? { background: 'var(--ap-accent)' } : undefined}
            >
              <Check
                className={cn('size-[11px] transition-opacity', remember ? 'opacity-100' : 'opacity-0')}
                strokeWidth={3}
              />
            </span>
            Remember me
          </label>

          <Link
            href="/auth/forgot-password"
            className="text-[12.5px] text-white/55 underline-offset-4 transition hover:text-white hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="relative mt-6 h-[46px] w-full rounded-[11px] text-[14px] font-semibold tracking-[-0.01em] text-white transition-[filter,transform] hover:brightness-[1.08] disabled:opacity-80"
          style={{
            background: 'var(--ap-accent)',
            boxShadow:
              'inset 0 1px 0 oklch(1 0 0 / 0.22), 0 10px 24px -16px oklch(0.52 0.17 255 / 0.9)',
          }}
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
              Signing in
            </span>
          ) : (
            <>
              Sign in
              {/* A keyboard hint instead of the usual arrow. */}
              <kbd
                aria-hidden
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-normal text-white/45"
                style={{ fontFamily: 'var(--ap-font-mono)' }}
              >
                ⏎
              </kbd>
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
