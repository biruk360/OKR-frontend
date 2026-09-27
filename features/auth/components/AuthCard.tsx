'use client'

import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHydrated } from '@/hooks/useHydrated'
import { cn } from '@/lib/utils'

/**
 * The glass card and its field idiom, shared by the secondary auth screens
 * (forgot / reset password). Visually identical to the sign-in card
 * (SignInForm), which keeps its own inline copy for now — it was rebuilt
 * separately and is intentionally left untouched.
 *
 * Colours are oklch literals rather than tokens for the same reason as the
 * sign-in card: this panel sits on an arbitrary photograph, not on an app
 * surface, and the surface tokens lose contrast there.
 */

/**
 * Borderless, transparent field sitting inside an AuthFieldRow. The global
 * focus ring is suppressed because the row itself carries the focus signature.
 */
export const AUTH_INPUT_CLASS =
  'ap-auth-input h-auto w-full rounded-none border-0 bg-transparent p-0 text-[14.5px] leading-tight text-white caret-[color:var(--ap-accent)] placeholder:text-white/30 shadow-none outline-none focus-visible:border-0 focus-visible:ring-0 focus-visible:!shadow-none md:text-[14.5px] dark:bg-transparent'

const ERROR_TEXT = 'oklch(0.84 0.11 25)'

export default function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div
      className="ap-auth-rise relative w-full max-w-[400px] overflow-hidden rounded-[16px] border border-white/10 p-7 text-white sm:p-8"
      style={{
        background: 'oklch(0.17 0.02 258 / 0.62)',
        backdropFilter: 'blur(28px) saturate(160%)',
        WebkitBackdropFilter: 'blur(28px) saturate(160%)',
        boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.10), 0 40px 90px -34px oklch(0.06 0.02 258 / 0.85)',
        animationDelay: '160ms',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, oklch(1 0 0 / 0.4), transparent)' }}
      />
      <header>
        <h2 className="text-[27px] font-semibold leading-none tracking-[-0.035em]">{title}</h2>
        {description && <p className="mt-3 text-[13px] leading-relaxed text-white/65">{description}</p>}
      </header>
      <div className="mt-7">{children}</div>
      {footer && <div className="mt-6 text-center">{footer}</div>}
    </div>
  )
}

/** The grouped block that holds one or more AuthFieldRows, hairline-separated. */
export function AuthFieldGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[12px] border border-white/10 [&>*+*]:border-t [&>*+*]:border-white/10"
      style={{ background: 'oklch(1 0 0 / 0.055)' }}
    >
      {children}
    </div>
  )
}

/** One row of the grouped block: mono micro-label over the value, focus bar on the left. */
export function AuthFieldRow({
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
        invalid && 'bg-[oklch(0.58_0.19_25/0.14)]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-1/2 w-[2.5px] -translate-y-1/2 rounded-r-full transition-all duration-200 ease-out',
          invalid ? 'h-[58%]' : 'h-0 group-focus-within:h-[58%]',
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

/**
 * The single note line under a field group — the first validation error, or a
 * hint. Holds its height so the button below never jumps.
 */
export function AuthNote({ message, tone = 'error' }: { message?: string | null; tone?: 'error' | 'hint' }) {
  return (
    <p
      role={message && tone === 'error' ? 'alert' : undefined}
      className={cn(
        'mt-1.5 min-h-[14px] px-1 text-[11.5px] leading-[14px] transition-opacity duration-200',
        message ? 'opacity-100' : 'opacity-0',
      )}
      style={{ color: tone === 'error' ? ERROR_TEXT : 'oklch(0.85 0.09 70)' }}
    >
      {message ?? ' '}
    </p>
  )
}

/** A banner inside the card: a server error (shakes in) or a success state. */
export function AuthAlert({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const error = tone === 'error'
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-[10px] py-2.5 pl-3 pr-3 text-[12.5px] leading-snug text-white/90',
        error && 'ap-auth-shake',
      )}
      style={{
        background: error ? 'oklch(0.58 0.19 25 / 0.16)' : 'oklch(0.62 0.15 150 / 0.16)',
        boxShadow: error ? 'inset 2px 0 0 oklch(0.74 0.17 25)' : 'inset 2px 0 0 oklch(0.78 0.15 150)',
      }}
    >
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * Full-width primary action in the sign-in card's style. Disabled until
 * hydration so a click can never trigger the form's native submit.
 */
export const AuthSubmitButton = forwardRef<
  HTMLButtonElement,
  { pending: boolean; pendingLabel: string; children: React.ReactNode; className?: string }
>(function AuthSubmitButton({ pending, pendingLabel, children, className }, ref) {
  const hydrated = useHydrated()
  return (
    <Button
      ref={ref}
      type="submit"
      disabled={!hydrated || pending}
      className={cn(
        'relative h-[46px] w-full rounded-[11px] text-[14px] font-semibold tracking-[-0.01em] text-white transition-[filter,transform] hover:brightness-[1.08] disabled:opacity-80',
        className,
      )}
      style={{
        background: 'var(--ap-accent)',
        boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.22), 0 10px 24px -16px oklch(0.52 0.17 255 / 0.9)',
      }}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </Button>
  )
})

/** The quiet text link used under the card ("Back to sign in"). */
export const AUTH_LINK_CLASS =
  'inline-flex items-center gap-1.5 text-[12.5px] text-white/55 underline-offset-4 transition hover:text-white hover:underline'
