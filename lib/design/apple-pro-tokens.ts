/**
 * Apple Pro — Design Tokens (macOS Sonoma / iOS 17).
 *
 * JS/TS export of the same tokens defined as CSS vars under `.apple-pro-surface`
 * in `app/globals.css`. Use this when you need token values inside JS (chart
 * colors, framer-motion style props, canvas rendering, etc.).
 */
export const appleProTokens = {
  color: {
    bg: '#F2F2F7',
    bgRaised: '#FFFFFF',
    bgSunken: '#EFEFF4',
    bgHover: '#F7F7FA',
    fg: '#000000',
    fgMuted: '#3C3C43',
    fgSubtle: 'rgba(60, 60, 67, 0.6)',
    fgFaint: 'rgba(60, 60, 67, 0.36)',
    border: 'rgba(60, 60, 67, 0.10)',
    borderStrong: 'rgba(60, 60, 67, 0.22)',
    borderSoft: 'rgba(60, 60, 67, 0.06)',
    accent: '#007AFF',
    accentHover: '#0060DF',
    accentSoft: 'rgba(0, 122, 255, 0.12)',
    accentFg: '#FFFFFF',
    status: {
      ok:     { base: '#34C759', bg: 'rgba(52,199,89,0.15)',  fg: '#1F7A33' },
      warn:   { base: '#FF9500', bg: 'rgba(255,149,0,0.15)',  fg: '#A85800' },
      danger: { base: '#FF3B30', bg: 'rgba(255,59,48,0.14)',  fg: '#B3271E' },
      ahead:  { base: '#AF52DE', bg: 'rgba(175,82,222,0.14)', fg: '#7A2DB0' },
      none:   { base: '#8E8E93', bg: 'rgba(142,142,147,0.15)',fg: '#3C3C43' },
    },
    dark: {
      bg: '#000000',
      bgRaised: '#1C1C1E',
      bgSunken: '#0A0A0C',
      bgHover: '#2C2C2E',
      fg: '#FFFFFF',
      fgMuted: 'rgba(235, 235, 245, 0.78)',
      fgSubtle: 'rgba(235, 235, 245, 0.55)',
      fgFaint: 'rgba(235, 235, 245, 0.28)',
      border: 'rgba(255, 255, 255, 0.10)',
      borderStrong: 'rgba(255, 255, 255, 0.18)',
      borderSoft: 'rgba(255, 255, 255, 0.06)',
      accent: '#0A84FF',
      accentHover: '#409CFF',
      accentSoft: 'rgba(10, 132, 255, 0.22)',
      status: {
        ok: '#30D158', warn: '#FF9F0A', danger: '#FF453A', ahead: '#BF5AF2', none: '#8E8E93',
      },
    },
  },
  radius: { sm: 10, md: 14, card: 16, lg: 22, pill: 9999 },
  space:  [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48] as const,
  font: {
    sans: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif`,
    mono: `ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace`,
  },
  shadow: {
    sm:   '0 0.5px 0 rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.05)',
    md:   '0 2px 8px rgba(0,0,0,0.06), 0 0.5px 0 rgba(0,0,0,0.05)',
    lg:   '0 30px 60px -20px rgba(0,0,0,0.25), 0 10px 20px -10px rgba(0,0,0,0.1)',
    card: '0 1px 3px rgba(0,0,0,0.04), 0 0.5px 0 rgba(0,0,0,0.03)',
  },
  z: { topbar: 20, popover: 40, tweaks: 60, modal: 80 },
} as const;

export type AppleProTokens = typeof appleProTokens;
