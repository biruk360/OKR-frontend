import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeName = 'default' | 'apple' | 'apple-pro'

interface ThemeState {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'apple-pro',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'okr-theme' },
  ),
)

export function bodyClassForTheme(theme: ThemeName, base: string): string {
  if (theme === 'default') return base
  if (theme === 'apple') return `${base} apple-pro-surface`
  return `${base} apple-pro-surface theme-apple-full`
}
