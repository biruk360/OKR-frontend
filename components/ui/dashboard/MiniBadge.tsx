import type { ReactNode } from 'react'

interface Props {
  color: string
  children: ReactNode
}

/** Tiny rounded badge — used in DashboardCard header right slot for counts/status. */
export function MiniBadge({ color, children }: Props) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: 'var(--ap-bg-sunken)', color }}
    >
      {children}
    </span>
  )
}
