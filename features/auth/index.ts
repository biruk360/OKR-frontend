/**
 * Feature barrel for Auth (sign-in, sign-up, forgot / reset password).
 * Physical files live under `./components/`, `./hooks/` and `./services/`.
 */

export { default as AuthBackdrop } from './components/AuthBackdrop'
export { default as AuthCard } from './components/AuthCard'
export { default as AuthScreenLayout } from './components/AuthScreenLayout'
export { default as AuthHero } from './components/AuthHero'
export { default as CompanySignature } from './components/CompanySignature'
export { default as ForgotPasswordForm } from './components/ForgotPasswordForm'
export { default as ResetPasswordForm } from './components/ResetPasswordForm'
export { default as SignInForm } from './components/SignInForm'
export { default as SignInScreen } from './components/SignInScreen'
export { default as SignUpForm } from './components/SignUpForm'

export { useWallpaper } from './hooks/useWallpaper'
export { safeCallbackUrl } from './services/callback-url'
export { registerSchema, signUpFormSchema, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './services/signup-schema'
export type { RegisterInput, SignUpFormValues } from './services/signup-schema'
export { forgotPasswordSchema, resetPasswordFormSchema } from './services/password-reset-schema'
export type { ForgotPasswordValues, ResetPasswordFormValues } from './services/password-reset-schema'
export { zodFormResolver } from './services/zod-resolver'
export { fetchWallpapers, pickStartIndex, FALLBACK_SCENES, FALLBACK_PAYLOAD } from './services/wallpaper'

export type { Wallpaper, WallpaperPayload, WallpaperSource } from './types'
