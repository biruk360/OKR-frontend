/**
 * Feature barrel for Auth (the sign-in experience).
 * Physical files live under `./components/`, `./hooks/` and `./services/`.
 */

export { default as AuthBackdrop } from './components/AuthBackdrop'
export { default as AuthHero } from './components/AuthHero'
export { default as CompanySignature } from './components/CompanySignature'
export { default as SignInForm } from './components/SignInForm'
export { default as SignInScreen } from './components/SignInScreen'

export { useWallpaper } from './hooks/useWallpaper'
export { safeCallbackUrl } from './services/callback-url'
export { fetchWallpapers, pickStartIndex, FALLBACK_SCENES, FALLBACK_PAYLOAD } from './services/wallpaper'

export type { Wallpaper, WallpaperPayload, WallpaperSource } from './types'
