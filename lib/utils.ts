import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, formatDistanceToNow } from 'date-fns'

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
