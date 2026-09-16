/**
 * Card visuals — the shared palette, colour-blind patterns and contrast maths
 * for card labels and covers.
 *
 * Why this exists: the label palette and the cover palette were two separate
 * arrays of raw hex literals inside TodoCardModal, which broke the "no hardcoded
 * hex, use design tokens" rule and meant a label colour and a cover colour never
 * agreed. Both now come from one place.
 *
 * Colour-blind mode draws a distinct texture over each colour so hue is never
 * the only signal (WCAG 1.4.1 "Use of Color").
 *
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md CRD-1, CRD-2, CVR-1..4,
 * DM-4, DM-5, A11Y-4.
 */

export type CardPattern =
  | 'SOLID' | 'DIAGONAL' | 'DOTS' | 'VERTICAL' | 'HORIZONTAL'
  | 'ZIGZAG' | 'CROSS' | 'WAVE' | 'GRID' | 'DASH'

export const CARD_PATTERNS: CardPattern[] = [
  'SOLID', 'DIAGONAL', 'DOTS', 'VERTICAL', 'HORIZONTAL',
  'ZIGZAG', 'CROSS', 'WAVE', 'GRID', 'DASH',
]

export interface CardSwatch {
  /** Stable key persisted nowhere — colour remains the stored value. */
  key: string
  label: string
  /** CSS custom property holding the colour, defined in app/globals.css. */
  token: string
  /** Literal fallback, used when the token cannot be resolved (e.g. canvas, email). */
  hex: string
  /** Default texture for this swatch in colour-blind mode. */
  pattern: CardPattern
}

/**
 * The ten shared card colours. Order is meaningful: `patternForIndex` maps a
 * position here to a texture, which is how existing labels acquire a distinct
 * pattern without a data migration.
 */
export const CARD_PALETTE: CardSwatch[] = [
  { key: 'green',  label: 'Green',  token: '--ap-card-green',  hex: '#61BD4F', pattern: 'DIAGONAL' },
  { key: 'yellow', label: 'Yellow', token: '--ap-card-yellow', hex: '#F2D600', pattern: 'ZIGZAG' },
  { key: 'orange', label: 'Orange', token: '--ap-card-orange', hex: '#FF9F1A', pattern: 'VERTICAL' },
  { key: 'red',    label: 'Red',    token: '--ap-card-red',    hex: '#EB5A46', pattern: 'DOTS' },
  { key: 'purple', label: 'Purple', token: '--ap-card-purple', hex: '#C377E0', pattern: 'WAVE' },
  { key: 'blue',   label: 'Blue',   token: '--ap-card-blue',   hex: '#0079BF', pattern: 'HORIZONTAL' },
  { key: 'sky',    label: 'Sky',    token: '--ap-card-sky',    hex: '#00C2E0', pattern: 'DASH' },
  { key: 'lime',   label: 'Lime',   token: '--ap-card-lime',   hex: '#51E898', pattern: 'GRID' },
  { key: 'pink',   label: 'Pink',   token: '--ap-card-pink',   hex: '#FF78CB', pattern: 'CROSS' },
  { key: 'slate',  label: 'Slate',  token: '--ap-card-slate',  hex: '#344563', pattern: 'SOLID' },
]

/** Look a palette entry up by its stored colour value (case-insensitive). */
export function swatchForColor(color: string | null | undefined): CardSwatch | null {
  if (!color) return null
  const needle = color.trim().toLowerCase()
  return CARD_PALETTE.find((s) => s.hex.toLowerCase() === needle) ?? null
}

/**
 * Texture for a colour that has no explicit `pattern` stored. Falls back to the
 * palette position, then to a hash of the colour string so even a custom colour
 * gets a stable, distinct texture rather than all of them going SOLID.
 */
export function patternForColor(color: string | null | undefined): CardPattern {
  const swatch = swatchForColor(color)
  if (swatch) return swatch.pattern
  if (!color) return 'SOLID'
  let hash = 0
  for (let i = 0; i < color.length; i++) hash = (hash * 31 + color.charCodeAt(i)) >>> 0
  return CARD_PATTERNS[hash % CARD_PATTERNS.length]
}

export function resolvePattern(
  pattern: string | null | undefined,
  color: string | null | undefined,
): CardPattern {
  if (pattern && (CARD_PATTERNS as string[]).includes(pattern)) return pattern as CardPattern
  return patternForColor(color)
}

/**
 * CSS `background-image` overlay for a pattern, or '' for SOLID.
 *
 * Drawn in a translucent ink so it reads on both light and dark swatches without
 * needing a second colour decision per palette entry.
 */
export function patternBackgroundImage(pattern: CardPattern, ink = 'rgba(0,0,0,0.42)'): string {
  switch (pattern) {
    case 'DIAGONAL':
      return `repeating-linear-gradient(45deg, ${ink} 0 2px, transparent 2px 6px)`
    case 'VERTICAL':
      return `repeating-linear-gradient(90deg, ${ink} 0 2px, transparent 2px 6px)`
    case 'HORIZONTAL':
      return `repeating-linear-gradient(0deg, ${ink} 0 2px, transparent 2px 6px)`
    case 'DASH':
      return `repeating-linear-gradient(90deg, ${ink} 0 5px, transparent 5px 10px)`
    case 'GRID':
      return `repeating-linear-gradient(0deg, ${ink} 0 1.5px, transparent 1.5px 7px), `
           + `repeating-linear-gradient(90deg, ${ink} 0 1.5px, transparent 1.5px 7px)`
    case 'CROSS':
      return `repeating-linear-gradient(45deg, ${ink} 0 1.5px, transparent 1.5px 7px), `
           + `repeating-linear-gradient(-45deg, ${ink} 0 1.5px, transparent 1.5px 7px)`
    case 'DOTS':
      return `radial-gradient(${ink} 1.4px, transparent 1.5px)`
    case 'ZIGZAG':
      return `repeating-linear-gradient(135deg, ${ink} 0 2px, transparent 2px 5px)`
    case 'WAVE':
      return `repeating-radial-gradient(circle at 0 50%, ${ink} 0 1.2px, transparent 1.2px 5px)`
    case 'SOLID':
    default:
      return ''
  }
}

/** Background-size companion for patterns that need one (dot grids). */
export function patternBackgroundSize(pattern: CardPattern): string | undefined {
  if (pattern === 'DOTS') return '7px 7px'
  if (pattern === 'WAVE') return '10px 10px'
  return undefined
}

/**
 * Inline style for a colour chip, applying the texture only when colour-blind
 * mode is on so the default board stays visually calm.
 */
export function swatchStyle(
  color: string,
  opts: { colorBlind?: boolean; pattern?: string | null; ink?: string } = {},
): React.CSSProperties {
  const style: React.CSSProperties = { backgroundColor: color }
  if (!opts.colorBlind) return style
  const resolved = resolvePattern(opts.pattern, color)
  const image = patternBackgroundImage(resolved, opts.ink)
  if (!image) return style
  style.backgroundImage = image
  const size = patternBackgroundSize(resolved)
  if (size) style.backgroundSize = size
  return style
}

// ─── Contrast ───────────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] | null {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** Relative luminance per WCAG 2.1. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 1
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Ink colour for text sitting on `background` — whichever of near-black or
 * white contrasts better. Used by full-bleed covers, where the card title sits
 * directly on the chosen colour (CVR-4).
 */
export function readableInk(background: string): '#1D1D1F' | '#FFFFFF' {
  return contrastRatio(background, '#1D1D1F') >= contrastRatio(background, '#FFFFFF')
    ? '#1D1D1F'
    : '#FFFFFF'
}
