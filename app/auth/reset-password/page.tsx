import { Suspense } from 'react'
import { AuthScreenLayout, ResetPasswordForm } from '@/features/auth'

/**
 * Choose a new password from an emailed link (password reset or first-time
 * invitation). Thin route — the screen lives in features/auth.
 */
export default function ResetPasswordPage() {
  return (
    <AuthScreenLayout footnote="Link expired or already used? Request a new one from the sign-in screen.">
      {/* useSearchParams (the token) requires a Suspense boundary under the app router. */}
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthScreenLayout>
  )
}
