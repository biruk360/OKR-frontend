import { Bell, AtSign, CheckCircle2, AlertTriangle, MessageSquare, type LucideIcon } from 'lucide-react'

/**
 * Icon + tone for a notification, keyed off its `type`/`eventKey` string.
 *
 * Shared by the header bell and the /dashboard/notifications page so the same
 * event cannot render as a comment bubble in one and a plain bell in the other.
 */
export function notificationIcon(type: string): { Icon: LucideIcon; bg: string; fg: string } {
  const t = (type || '').toUpperCase()
  if (t.includes('MENTION')) return { Icon: AtSign, bg: 'rgba(88,86,214,0.12)', fg: 'rgb(88,86,214)' }
  if (t.includes('COMMENT')) return { Icon: MessageSquare, bg: 'var(--ap-accent-soft)', fg: 'var(--ap-accent)' }
  if (t.includes('REMINDER') || t.includes('DUE') || t.includes('OVERDUE')) {
    return { Icon: AlertTriangle, bg: 'rgba(255,149,0,0.12)', fg: 'var(--ap-orange)' }
  }
  if (t.includes('RISK') || t.includes('OFF')) return { Icon: AlertTriangle, bg: 'rgba(255,149,0,0.12)', fg: 'var(--ap-orange)' }
  if (t.includes('COMPLETE') || t.includes('DONE')) return { Icon: CheckCircle2, bg: 'rgba(52,199,89,0.12)', fg: 'var(--ap-green)' }
  return { Icon: Bell, bg: 'rgba(120,120,128,0.15)', fg: 'var(--ap-fg-muted)' }
}

/** "TODO_DUE_REMINDER" → "todo due reminder" — the label shown under a row. */
export function notificationTypeLabel(type: string): string {
  return (type || '').replace(/_/g, ' ').toLowerCase()
}
