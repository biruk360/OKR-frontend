/**
 * Chart colours — theme-aware CSS colour strings for charts and data marks.
 *
 * Recharts, dhtmlx-gantt templates and inline SVG accept any CSS colour, and
 * `var(--x)` works in SVG presentation attributes (fill/stroke/stopColor) as
 * well as in `style`. Every entry below reads an existing CSS variable from
 * `app/globals.css`, so charts follow dark mode instead of freezing the light
 * hexes. Do NOT add hex here — if a chart needs a new hue, add a CSS variable
 * in globals.css first and point an entry at it.
 *
 * Roles map onto the Apple Pro status palette (`--ap-green/orange/red`), the
 * single accent (`--ap-accent`) and the neutral ink/border tiers. Categorical
 * series beyond those reuse the palette channel variables (`--rgb-*`).
 */

export const chartColors = {
  /** Primary series / brand accent (was #007AFF). */
  accent: 'var(--ap-accent)',
  /** On track / positive (was #34C759). */
  success: 'var(--ap-green)',
  /** At risk / caution (was #FF9500 / #FF9F0A). */
  warning: 'var(--ap-orange)',
  /** Off track / negative (was #FF3B30). */
  danger: 'var(--ap-red)',
  /** Neutral / pending / closed (was #8E8E93). */
  neutral: 'var(--ap-none)',
  /** Darker neutral for "not measurable" (was #636366). */
  neutralStrong: 'var(--ap-fg-subtle)',
  /** Target / reference lines. */
  reference: 'var(--ap-fg-faint)',
  /** Gridlines. */
  grid: 'var(--ap-border)',
  /** Axis tick labels. */
  axis: 'var(--ap-fg-muted)',
  /** Plain foreground (labels drawn inside a chart). */
  foreground: 'var(--ap-fg)',
  /** Chart/tooltip background. */
  surface: 'var(--ap-bg-raised)',
  /** Sunken track behind bars/meters. */
  track: 'var(--ap-bg-sunken)',
  /** Text on a filled accent mark. */
  onAccent: 'var(--ap-accent-fg)',
  /** Secondary categorical hues (palette channel variables). */
  accentLight: 'rgb(var(--rgb-primary-400))',
  successDark: 'rgb(var(--rgb-success-700))',
  warningLight: 'rgb(var(--rgb-warning-300))',
} as const

export type ChartColor = keyof typeof chartColors

/** Confidence/goal status → chart colour (ON_TRACK / AT_RISK / OFF_TRACK / CLOSED). */
export const STATUS_CHART_COLOR: Record<string, string> = {
  ON_TRACK: chartColors.success,
  AT_RISK: chartColors.warning,
  OFF_TRACK: chartColors.danger,
  CLOSED: chartColors.neutral,
}

/**
 * A translucent version of any CSS colour (including `var(--x)`), for washes
 * behind icons and tinted fills. Replaces the old `${hex}1F` suffix trick,
 * which only worked on literal hexes.
 */
export function chartAlpha(color: string, percent: number): string {
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  return `color-mix(in oklch, ${color} ${p}%, transparent)`
}

/** Shared Recharts tooltip content style, themed. */
export const chartTooltipStyle = {
  background: chartColors.surface,
  borderColor: chartColors.grid,
  color: chartColors.foreground,
  borderRadius: 10,
  fontSize: 12,
} as const

/** Shared Recharts axis tick props, themed. */
export const chartAxisTick = { fontSize: 10, fill: chartColors.axis } as const
