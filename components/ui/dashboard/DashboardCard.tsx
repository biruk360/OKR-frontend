import type { ReactNode } from 'react'

interface Props {
  title: string
  right?: ReactNode
  children: ReactNode
}

/**
 * Consistent card wrapper for any dashboard widget. Header has a small uppercase
 * eyebrow + an optional right-aligned slot (badge, action, count). Body padding
 * is uniform so charts and tables align across rows.
 */
export function DashboardCard({ title, right, children }: Props) {
  return (
    <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}
