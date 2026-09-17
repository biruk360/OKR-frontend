import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Two axes, deliberately separate:
 *   - `theme`      — which Apple surface treatment (typography + chrome rules)
 *   - `appearance` — light / dark / follow the OS
 *
 * The `'default'` theme was removed in the design refresh. It dropped both scope
 * classes, and because ~97% of `var(--ap-*)` call sites carry no fallback, the
 * tokens resolved to nothing: status pills lost their colour, skeletons rendered
 * transparent, the command palette lost its background. Tokens now live on
 * `:root` so that class of bug is gone, which also made `'default'` visually
 * near-identical to `'apple'` — two tabs that look the same is worse than one.
 */
export type ThemeName = 'apple' | 'apple-pro'
export type Appearance = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: ThemeName
  appearance: Appearance
  setTheme: (theme: ThemeName) => void
  setAppearance: (appearance: Appearance) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'apple-pro',
      appearance: 'system',
      setTheme: (theme) => set({ theme }),
      setAppearance: (appearance) => set({ appearance }),
    }),
    {
      name: 'okr-theme',
      version: 2,
      // Existing users have `'default'` persisted under this key. Without this
      // it would survive as an unhandled value and `bodyClassForTheme` would
      // fall through to the apple-pro branch anyway — but the switcher would
      // show nothing selected. Normalise it instead.
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<ThemeState>
        return {
          theme: state.theme === 'apple' ? 'apple' : 'apple-pro',
          appearance: state.appearance ?? 'system',
        } as ThemeState
      },
    },
  ),
)

export function bodyClassForTheme(theme: ThemeName, base: string): string {
  if (theme === 'apple') return `${base} apple-pro-surface`
  return `${base} apple-pro-surface theme-apple-full`
}

/** Resolve `system` against the OS. Safe to call during SSR — returns light. */
export function resolveAppearance(appearance: Appearance): 'light' | 'dark' {
  if (appearance !== 'system') return appearance
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
