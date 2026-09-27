import { AuthScreenLayout, ForgotPasswordForm } from '@/features/auth'

/** Request a password-reset link. Thin route — the screen lives in features/auth. */
export default function ForgotPasswordPage() {
  return (
    <AuthScreenLayout footnote="No longer have access to that inbox? Ask your workspace admin to reset your access.">
      <ForgotPasswordForm />
    </AuthScreenLayout>
  )
}
