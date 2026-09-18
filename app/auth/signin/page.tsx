import { Suspense } from 'react'
import { SignInScreen } from '@/features/auth'

export default function SignInPage() {
  // useSearchParams (callbackUrl) requires a Suspense boundary under the app router.
  return (
    <Suspense fallback={null}>
      <SignInScreen />
    </Suspense>
  )
}
