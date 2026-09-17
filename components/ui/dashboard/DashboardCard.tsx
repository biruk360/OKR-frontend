import type { ReactNode } from 'react'
import { SectionHeading } from '../SectionHeading'

interface Props {
  title: string
  right?: ReactNode
  children: ReactNode
}

/**
 * Consistent card wrapper for any dashboard widget. Header has a small uppercase
 * eyebrow + an optional right-aligned slot (badge, action, count). Body padding
 * is uniform so charts and tables align across rows.
 *
 * The header row itself now lives in `components/ui/SectionHeading` — this card
 * consumes it so the treatment has one definition rather than eight.
 */
export function DashboardCard({ title, right, children }: Props) {
  return (
    <section className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      <SectionHeading title={title} right={right} />
      <div className="p-4">{children}</div>
    </section>
  )
}
