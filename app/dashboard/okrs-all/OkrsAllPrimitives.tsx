'use client'

/** OKR Explorer — small presentational pieces shared by rows, cards and the drawer. */

import { CheckSquare, Target } from 'lucide-react'
import { PersonTooltip } from '@/components/shared/UserAvatar'
import { Progress } from '@/components/ui/progress'
import { getOkrStatusColor } from '@/lib/utils'
import { initialsOf, type RefUser, type Row } from './okrs-all-utils'

export function ProgressBar({ value, status, width = 120 }: { value: number; status: string; width?: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-2" style={{ width }}>
      <Progress value={pct} fill={getOkrStatusColor(status)} className="flex-1" />
      <span className="text-xs font-semibold tabular-nums w-9 text-right">{Math.round(pct)}%</span>
    </div>
  )
}

/** Render helper (not a component) so its root element can be a Radix `asChild` trigger. */
function avatarFace(user: RefUser | null | undefined, size: number) {
  if (!user) {
    return (
      <span className="inline-flex items-center justify-center rounded-full text-micro font-semibold"
        style={{ width: size, height: size, background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}>?</span>
    )
  }
  const initial = initialsOf(user.name ?? user.email)
  if (user.avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatar} alt={user.name ?? user.email}
      className="rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span role="img" aria-label={user.name ?? user.email}
      className="inline-flex items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)), background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}>
      {initial}
    </span>
  )
}

/** Owner / collaborator avatar with the full-name hover card (docs/user_name_hover_REQUIREMENTS.md UNH-2). */
export function Avatar({ user, size = 22, tooltip = true, detail }: { user: RefUser | null | undefined; size?: number; tooltip?: boolean; detail?: string }) {
  const face = avatarFace(user, size)
  if (!user || !tooltip) return face
  return <PersonTooltip person={user} detail={detail}>{face}</PersonTooltip>
}

export function KindIcon({ row }: { row: Row }) {
  if (row.kind === 'OBJ') {
    return (
      <span className="inline-flex items-center justify-center rounded-[6px]"
        style={{ width: 22, height: 22, background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}>
        <Target className="size-3" />
      </span>
    )
  }
  if (row.kind === 'KR') {
    return (
      <span className="inline-flex items-center justify-center rounded-[6px] text-[9px] font-bold"
        style={{ width: 22, height: 22, background: 'var(--ap-warn-bg)', color: 'var(--ap-orange)' }}>
        KR
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center rounded-[6px]"
      style={{ width: 22, height: 22, background: 'var(--ap-ok-bg)', color: 'var(--ap-green)' }}>
      <CheckSquare className="size-3" />
    </span>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-body-sm">{children}</div>
    </div>
  )
}
