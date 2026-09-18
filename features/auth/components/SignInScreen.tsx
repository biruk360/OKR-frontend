'use client'

import { Compass } from 'lucide-react'
import AuthBackdrop from './AuthBackdrop'
import AuthHero from './AuthHero'
import SignInForm from './SignInForm'

/**
 * The whole sign-in screen: a rotating photo backdrop, the editorial column on
 * large viewports, and the glass credentials card.
 *
 * Below `lg` the hero column is dropped rather than stacked — on a phone the
 * photograph plus the card is the entire design, and anything above it would
 * push the fields under the fold.
 */
export default function SignInScreen() {
  return (
    <AuthBackdrop>
      <div className="mx-auto flex min-h-screen w-full max-w-content flex-col px-5 pb-24 pt-10 sm:px-8 sm:pb-20 lg:px-12">
        <div className="grid flex-1 items-center gap-14 lg:grid-cols-[1.05fr_minmax(0,420px)] xl:gap-20">
          <div className="hidden lg:block">
            <AuthHero />
          </div>

          <div className="flex w-full flex-col items-center lg:items-end">
            <div className="ap-auth-rise mb-6 flex w-full max-w-[420px] items-center gap-2.5 text-white lg:hidden">
              <span className="flex size-9 items-center justify-center rounded-[var(--ap-radius-md)] border border-white/20 bg-white/15 backdrop-blur-md">
                <Compass className="size-[18px]" strokeWidth={1.75} />
              </span>
              <span className="text-[15px] font-semibold tracking-tight">OKR Workspace</span>
            </div>

            <SignInForm />
          </div>
        </div>

        <p className="mt-10 text-center text-[11.5px] text-white/60 [text-shadow:0_1px_2px_oklch(0.1_0.02_258/0.6)] lg:text-left">
          Trouble signing in? Ask your workspace admin to reset your access.
        </p>
      </div>
    </AuthBackdrop>
  )
}
