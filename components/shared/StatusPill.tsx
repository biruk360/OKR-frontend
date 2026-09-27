'use client'

import { normalizeStatus, type StatusKey } from '@/lib/status-key'

const MAP: Record<StatusKey, { label: string; bg: string; fg: string; dot: string }> = {
  'on-track':    { label: 'On track',  bg: 'rgba(52,199,89,0.12)', fg: 'var(--ap-green)',  dot: 'var(--ap-green)' },
  'at-risk':     { label: 'At risk',   bg: 'rgba(255,149,0,0.12)', fg: 'var(--ap-orange)', dot: 'var(--ap-orange)' },
  'off-track':   { label: 'Off track', bg: 'rgba(255,59,48,0.12)', fg: 'var(--ap-red)',    dot: 'var(--ap-red)' },
  'no-owner':    { label: 'Unassigned',bg: 'rgba(255,59,48,0.12)', fg: 'var(--ap-red)',    dot: 'var(--ap-red)' },
  'completed':   { label: 'Done',      bg: 'rgba(0,122,255,0.12)', fg: 'var(--ap-accent)', dot: 'var(--ap-accent)' },
  'closed':      { label: 'Closed',    bg: 'rgba(120,120,128,0.12)', fg: 'var(--ap-fg-muted)', dot: 'var(--ap-fg-muted)' },
  'pending':     { label: 'Pending',   bg: 'rgba(120,120,128,0.12)', fg: 'var(--ap-fg-muted)', dot: 'var(--ap-fg-muted)' },
  'in-progress': { label: 'In progress', bg: 'rgba(0,122,255,0.12)', fg: 'var(--ap-accent)', dot: 'var(--ap-accent)' },
  'in-review':   { label: 'In review', bg: 'var(--ap-ahead-bg)', fg: 'var(--ap-ahead-fg)', dot: 'var(--ap-ahead)' },
  'stuck':       { label: 'Stuck',     bg: 'var(--ap-warn-bg)', fg: 'var(--ap-warn-fg)', dot: 'var(--ap-warn)' },
  'cancelled':   { label: 'Cancelled', bg: 'rgba(120,120,128,0.12)', fg: 'var(--ap-fg-muted)', dot: 'var(--ap-fg-muted)' },
  // Sprint lifecycle states (Sprints v2)
  'planning':    { label: 'Planning',  bg: 'rgba(120,120,128,0.14)', fg: 'var(--ap-fg-muted)', dot: 'var(--ap-fg-muted)' },
  'active':      { label: 'Active',    bg: 'rgba(52,199,89,0.14)', fg: 'var(--ap-green)', dot: 'var(--ap-green)' },
}

// normalizeStatus lives in lib/status-key.ts so server components can call it
// (a function exported from this 'use client' module is only a client
// reference on the server). Import it from there, not from here.

export default function StatusPill({
  status,
  size = 'sm',
}: {
  status: StatusKey | string | null | undefined
  size?: 'xs' | 'sm' | 'md'
}) {
  const key = (typeof status === 'string' && status in MAP)
    ? status as StatusKey
    : normalizeStatus(status as string | null | undefined)
  const c = MAP[key] ?? MAP['pending']
  const sizing =
    size === 'xs' ? 'px-1.5 py-0.5 text-micro' :
    size === 'md' ? 'px-2.5 py-1 text-xs' :
    'px-2 py-0.5 text-caption'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sizing}`}
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  )
}

export function PaceChip({ delta }: { delta: number }) {
  const positive = delta >= 0
  const bg = positive ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)'
  const fg = positive ? 'var(--ap-green)' : 'var(--ap-red)'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-micro font-semibold tabular-nums"
      style={{ background: bg, color: fg }}
    >
      {positive ? '▲' : '▼'}{Math.abs(delta)}pt
    </span>
  )
}

export function LevelBadge({ level }: { level: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    COMPANY:    { label: 'Company',    bg: 'var(--ap-ahead-bg)',     fg: 'var(--ap-ahead-fg)' },
    DEPARTMENT: { label: 'Department', bg: 'rgba(0,122,255,0.12)',  fg: 'var(--ap-accent)' },
    INDIVIDUAL: { label: 'Individual', bg: 'rgba(120,120,128,0.14)', fg: 'var(--ap-fg-muted)' },
  }
  const c = map[level] ?? map.INDIVIDUAL
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  )
}
