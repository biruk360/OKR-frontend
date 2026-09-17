import type { CSSProperties } from 'react'

/**
 * Sprint board background presets.
 *
 * Stored on Sprint.background as a preset KEY, never as a colour — which is why
 * the values could be retargeted to the refreshed palette without a migration.
 * Every pre-existing key is preserved for exactly that reason; dropping one
 * would leave sprints saved against it with no ground.
 *
 * Values merge the app's original set with the refreshed design's: ten map
 * across directly, `sunrise` is derived (no counterpart), and `clay` is the one
 * new preset. The swatch is deliberately a STRONGER gradient than the ground it
 * applies — that contrast is what keeps the 40px picker chips readable.
 *
 * Grounds must never compete with the translucent lane surfaces stacked on top.
 */

export type SprintBackgroundKey =
  | 'none'
  | 'sunrise'
  | 'slate'
  | 'sage'
  | 'peach'
  | 'lavender'
  | 'graphite'
  | 'ocean'
  | 'dusk'
  | 'mint'
  | 'blush'
  | 'clay'

export interface SprintBackgroundPreset {
  key: SprintBackgroundKey
  label: string
  /** CSS background-image value. Empty string = no override (neutral surface). */
  gradient: string
  /** Small swatch background for the picker chip (single linear-gradient). */
  swatch: string
}

export const BACKGROUND_PRESETS: Record<SprintBackgroundKey, SprintBackgroundPreset> = {
  none: {
    key: 'none',
    label: 'None',
    gradient: '',
    swatch: 'linear-gradient(150deg, oklch(0.97 0.004 262), oklch(0.94 0.006 262))',
  },
  sunrise: {
    key: 'sunrise',
    label: 'Sunrise',
    // The one preset with no counterpart in the design set. Derived in the same
    // idiom but pushed golden, so it stays distinguishable from `peach`.
    gradient: 'linear-gradient(150deg, oklch(0.96 0.035 75), oklch(0.94 0.045 45))',
    swatch: 'linear-gradient(150deg, oklch(0.95 0.045 75), oklch(0.93 0.055 45))',
  },
  slate: {
    key: 'slate',
    label: 'Slate Mist',
    gradient: 'linear-gradient(150deg, oklch(0.94 0.012 250), oklch(0.9 0.018 255))',
    swatch: 'linear-gradient(150deg, oklch(0.92 0.015 250), oklch(0.87 0.02 255))',
  },
  sage: {
    key: 'sage',
    label: 'Sage',
    gradient: 'linear-gradient(150deg, oklch(0.95 0.025 150), oklch(0.92 0.035 145))',
    swatch: 'linear-gradient(150deg, oklch(0.94 0.03 150), oklch(0.9 0.04 145))',
  },
  peach: {
    key: 'peach',
    label: 'Peach',
    gradient: 'linear-gradient(150deg, oklch(0.96 0.03 45), oklch(0.94 0.045 30))',
    swatch: 'linear-gradient(150deg, oklch(0.95 0.035 45), oklch(0.93 0.05 30))',
  },
  lavender: {
    key: 'lavender',
    label: 'Lavender',
    gradient: 'linear-gradient(150deg, oklch(0.94 0.03 285), oklch(0.91 0.04 275))',
    swatch: 'linear-gradient(150deg, oklch(0.91 0.04 285), oklch(0.88 0.05 275))',
  },
  graphite: {
    key: 'graphite',
    label: 'Graphite',
    gradient: 'linear-gradient(150deg, oklch(0.34 0.015 262), oklch(0.26 0.015 262))',
    swatch: 'oklch(0.28 0.015 262)',
  },
  ocean: {
    key: 'ocean',
    label: 'Ocean',
    gradient: 'linear-gradient(150deg, oklch(0.94 0.03 225), oklch(0.91 0.045 235))',
    swatch: 'linear-gradient(150deg, oklch(0.92 0.04 225), oklch(0.88 0.055 235))',
  },
  dusk: {
    key: 'dusk',
    label: 'Dusk',
    gradient: 'linear-gradient(150deg, oklch(0.92 0.045 300), oklch(0.89 0.055 290))',
    swatch: 'linear-gradient(150deg, oklch(0.87 0.06 300), oklch(0.83 0.07 290))',
  },
  mint: {
    key: 'mint',
    label: 'Mint',
    gradient: 'linear-gradient(150deg, oklch(0.94 0.04 160), oklch(0.91 0.05 165))',
    swatch: 'linear-gradient(150deg, oklch(0.91 0.06 160), oklch(0.88 0.07 165))',
  },
  blush: {
    key: 'blush',
    label: 'Blush',
    gradient: 'linear-gradient(150deg, oklch(0.94 0.035 350), oklch(0.91 0.045 355))',
    swatch: 'linear-gradient(150deg, oklch(0.91 0.05 350), oklch(0.88 0.06 355))',
  },
  clay: {
    key: 'clay',
    label: 'Clay',
    gradient: 'linear-gradient(150deg, oklch(0.93 0.04 40), oklch(0.89 0.05 30))',
    swatch: 'linear-gradient(150deg, oklch(0.9 0.05 40), oklch(0.86 0.06 30))',
  },
}

export const BACKGROUND_KEYS = Object.keys(BACKGROUND_PRESETS) as SprintBackgroundKey[]

export function isSprintBackgroundKey(value: unknown): value is SprintBackgroundKey {
  return typeof value === 'string' && value in BACKGROUND_PRESETS
}

export function getBackgroundPreset(key: string | null | undefined): SprintBackgroundPreset {
  if (key && isSprintBackgroundKey(key)) return BACKGROUND_PRESETS[key]
  return BACKGROUND_PRESETS.none
}

/**
 * CSS style object for the board container. Returns an empty object for
 * 'none' so the underlying app surface (--ap-bg) shows through.
 */
export function getBackgroundStyle(key: string | null | undefined): CSSProperties {
  const preset = getBackgroundPreset(key)
  if (!preset.gradient) return {}
  return { backgroundImage: preset.gradient }
}

/** True when the preset is dark enough that lane/floating-bar surfaces should
 *  use a slightly stronger translucency for legibility. */
export function isDarkBackground(key: string | null | undefined): boolean {
  return getBackgroundPreset(key).key === 'graphite'
}
