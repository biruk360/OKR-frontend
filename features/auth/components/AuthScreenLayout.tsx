'use client'

import { Compass } from 'lucide-react'
import AuthBackdrop from './AuthBackdrop'
import AuthHero from './AuthHero'
import CompanySignature from './CompanySignature'

/**
 * The sign-in screen's frame — photo backdrop, editorial hero on large
 * viewports, card column on the right — for the secondary auth screens
 * (forgot / reset password). Same grid and breakpoints as SignInScreen so
 * moving between the screens does not shift the layout.
 */
export default function AuthScreenLayout({
  children,
  footnote,
}: {
  children: React.ReactNode
  footnote?: React.ReactNode
}) {
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

            {children}
          </div>
        </div>

        <CompanySignature align="center" className="ap-auth-rise mt-12 lg:hidden" />

        {footnote && (
          <p className="mt-8 text-center text-[11.5px] text-white/60 [text-shadow:0_1px_2px_oklch(0.1_0.02_258/0.6)] lg:mt-10 lg:text-left">
            {footnote}
          </p>
        )}
      </div>
    </AuthBackdrop>
  )
}
