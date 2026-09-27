import { SignUpForm } from '@/features/auth'

/** Public self sign-up. Thin route — the form (no role picker) lives in features/auth. */
export default function SignUpPage() {
  return <SignUpForm />
}
