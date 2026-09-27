import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import { format, formatDistanceToNow } from 'date-fns'

// The design system's custom font sizes (tailwind.config.js `fontSize`) must be
// registered, or tailwind-merge reads `text-body-sm` as a text *colour* and drops
// it whenever a `text-ink-*` / `text-primary-*` class follows it in cn().
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'page-title', 'section-title', 'overline', 'body', 'body-sm', 'caption', 'micro'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string, formatStr: string = 'MMM dd, yyyy') {
  return format(new Date(date), formatStr)
}

export function formatRelativeTime(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function getProgressColor(progress: number): string {
  if (progress >= 70) return 'bg-success-500'
  if (progress >= 40) return 'bg-warning-500'
  return 'bg-danger-500'
}

export function getProgressBarClass(progress: number): string {
  if (progress >= 70) return 'bg-success-500'
  if (progress >= 40) return 'bg-warning-500'
  return 'bg-danger-500'
}

/**
 * Progress percentage → fill token. Same thresholds as `getProgressColor`, but
 * returns a CSS colour rather than a Tailwind class, because `components/ui/
 * progress.tsx` styles its indicator inline.
 *
 * `ResultsList` had this exact ladder inline; keep the two in step.
 */
export function getProgressBarColor(percent: number): string {
  if (percent >= 70) return 'var(--ap-ok)'
  if (percent >= 40) return 'var(--ap-warn)'
  return 'var(--ap-danger)'
}

/**
 * OKR status → token. Note this takes the kebab-case UI status
 * ('on-track', 'at-risk', …), NOT the ON_TRACK confidence enum that
 * `getConfidenceColor` handles — they are different vocabularies and
 * conflating them is how the app ended up with several near-copies.
 *
 * Was duplicated byte-for-byte as a local `progressColor` in
 * OkrHierarchyTable and OkrsAllClient, plus an inline variant in
 * NestedObjectivesList.
 */
export function getOkrStatusColor(status: string): string {
  switch (status) {
    case 'on-track':
    case 'completed':
    case 'in-progress':
      return 'var(--ap-ok)'
    case 'at-risk':
      return 'var(--ap-warn)'
    case 'off-track':
      return 'var(--ap-danger)'
    default:
      return 'var(--ap-fg-muted)'
  }
}

/**
 * Confidence → token. CLAUDE.md has mandated this helper for a long time, but it
 * did not exist, so three call sites each grew their own map with different
 * values: raw hex in PlansGantt, --ap-* vars in PerKrProgressCard, and raw
 * Tailwind palette classes in NavProgressCircles.
 *
 * Returns a CSS colour (a token reference), usable in `style` or a Tailwind
 * arbitrary value. Unknown/absent confidence falls back to the neutral token
 * rather than green — "no data" must not read as "on track".
 */
export function getConfidenceColor(confidence: string | null | undefined): string {
  switch (confidence) {
    case 'ON_TRACK': return 'var(--ap-ok)'
    case 'AT_RISK': return 'var(--ap-warn)'
    case 'OFF_TRACK': return 'var(--ap-danger)'
    default: return 'var(--ap-none)'
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
