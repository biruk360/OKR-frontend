import type { CSSProperties } from 'react'

/**
 * Sprint board background presets — subtle, modern, Apple-design-inspired.
 * Stored on Sprint.background as a preset key. Gradients are picked to feel
 * cohesive with the Apple Pro design tokens (--ap-*) and never compete with
 * the white/translucent lane surfaces stacked on top.
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
    swatch: 'linear-gradient(135deg, #F2F2F7 0%, #E5E5EA 100%)',
  },
  sunrise: {
    key: 'sunrise',
    label: 'Sunrise',
    gradient:
      'radial-gradient(at 18% 12%, #FFE7CF 0%, transparent 55%), radial-gradient(at 82% 88%, #FFD4D6 0%, transparent 55%), linear-gradient(135deg, #FFF6EC 0%, #FFEDED 100%)',
    swatch: 'linear-gradient(135deg, #FFE7CF 0%, #FFD4D6 100%)',
  },
  slate: {
    key: 'slate',
    label: 'Slate Mist',
    gradient:
      'radial-gradient(at 0% 0%, #DCE3EC 0%, transparent 60%), radial-gradient(at 100% 100%, #C7D0DC 0%, transparent 60%), linear-gradient(135deg, #EDF1F6 0%, #DCE3EC 100%)',
    swatch: 'linear-gradient(135deg, #DCE3EC 0%, #C7D0DC 100%)',
  },
  sage: {
    key: 'sage',
    label: 'Sage',
    gradient:
      'radial-gradient(at 20% 20%, #DCEBDA 0%, transparent 55%), radial-gradient(at 80% 80%, #C9DDC8 0%, transparent 55%), linear-gradient(135deg, #ECF3EA 0%, #D6E5D3 100%)',
    swatch: 'linear-gradient(135deg, #DCEBDA 0%, #C9DDC8 100%)',
  },
  peach: {
    key: 'peach',
    label: 'Peach',
    gradient:
      'radial-gradient(at 20% 25%, #FCD9C7 0%, transparent 55%), radial-gradient(at 85% 80%, #F9C0B0 0%, transparent 55%), linear-gradient(135deg, #FFEDE3 0%, #FCD0BD 100%)',
    swatch: 'linear-gradient(135deg, #FCD9C7 0%, #F9C0B0 100%)',
  },
  lavender: {
    key: 'lavender',
    label: 'Lavender',
    gradient:
      'radial-gradient(at 15% 15%, #E1DCF2 0%, transparent 55%), radial-gradient(at 85% 85%, #CFC6EA 0%, transparent 55%), linear-gradient(135deg, #EFEAFB 0%, #DBD2F1 100%)',
    swatch: 'linear-gradient(135deg, #E1DCF2 0%, #CFC6EA 100%)',
  },
  graphite: {
    key: 'graphite',
    label: 'Graphite',
    gradient:
      'radial-gradient(at 0% 100%, #2B2D33 0%, transparent 60%), radial-gradient(at 100% 0%, #3B3D45 0%, transparent 60%), linear-gradient(135deg, #1F2126 0%, #2B2D33 100%)',
    swatch: 'linear-gradient(135deg, #3B3D45 0%, #1F2126 100%)',
  },
  ocean: {
    key: 'ocean',
    label: 'Ocean',
    gradient:
      'radial-gradient(at 20% 20%, #CFE3F2 0%, transparent 55%), radial-gradient(at 85% 85%, #B6D2E8 0%, transparent 55%), linear-gradient(135deg, #E3EEF7 0%, #BFD6E9 100%)',
    swatch: 'linear-gradient(135deg, #CFE3F2 0%, #B6D2E8 100%)',
  },
  dusk: {
    key: 'dusk',
    label: 'Dusk',
    gradient:
      'radial-gradient(at 10% 10%, #E5D0E2 0%, transparent 55%), radial-gradient(at 90% 90%, #C7B9DC 0%, transparent 55%), linear-gradient(135deg, #EDDCEB 0%, #B8AAD3 100%)',
    swatch: 'linear-gradient(135deg, #E5D0E2 0%, #B8AAD3 100%)',
  },
  mint: {
    key: 'mint',
    label: 'Mint',
    gradient:
      'radial-gradient(at 18% 22%, #D2EDE0 0%, transparent 55%), radial-gradient(at 80% 78%, #BCE2D2 0%, transparent 55%), linear-gradient(135deg, #E5F4EC 0%, #C9E6D8 100%)',
    swatch: 'linear-gradient(135deg, #D2EDE0 0%, #BCE2D2 100%)',
  },
  blush: {
    key: 'blush',
    label: 'Blush',
    gradient:
      'radial-gradient(at 20% 20%, #F8DCE2 0%, transparent 55%), radial-gradient(at 80% 80%, #F1C5D2 0%, transparent 55%), linear-gradient(135deg, #FBEAEF 0%, #F0CCD7 100%)',
    swatch: 'linear-gradient(135deg, #F8DCE2 0%, #F1C5D2 100%)',
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
