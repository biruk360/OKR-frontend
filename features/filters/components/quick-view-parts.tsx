'use client'

/**
 * Building blocks shared by the Filters-workspace quick-view modals
 * (ObjectiveDetailModal, KeyResultDetailModal). Spec:
 * docs/okr_quick_view_modals_REQUIREMENTS.md (QV-1).
 *
 * The modals are a fast, read-mostly summary; every trimmed section links to
 * the full page, which owns editing / check-ins / lifecycle actions.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, ExternalLink, Lock, RotateCw, X, type LucideIcon } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'

// ─── Status tiers ─────────────────────────────────────────────────────────────

export const TIER_TONE: Record<string, string> = {
  ON_TRACK: 'ontrack', AT_RISK: 'atrisk', OFF_TRACK: 'offtrack', CLOSED: 'none',
}
export const TIER_LABEL: Record<string, string> = {
  ON_TRACK: 'On track', AT_RISK: 'At risk', OFF_TRACK: 'Off track', CLOSED: 'Closed',
}
const TIER_RING: Record<string, string> = {
  ON_TRACK: 'var(--ap-green)', AT_RISK: 'var(--ap-orange)', OFF_TRACK: 'var(--ap-red)',
}

export function TierPill({ tier }: { tier?: string | null }) {
  return (
    <span className="ap-status-pill" data-tone={TIER_TONE[tier ?? ''] ?? 'none'}>
      {TIER_LABEL[tier ?? ''] ?? 'No status'}
    </span>
  )
}

export function scoreColor(n: number): string {
  return n >= 70 ? 'var(--ap-green)' : n >= 40 ? 'var(--ap-orange)' : 'var(--ap-red)'
}

export function clampPct(p: unknown): number {
  const n = typeof p === 'number' ? p : Number(p)
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(n, 0), 100)
}

/** API people carry a nullable name; UserAvatar needs a string. */
export function asAvatarUser(p: { id: string; name: string | null; avatar?: string | null }) {
  return { id: p.id, name: p.name ?? 'Unknown', avatar: p.avatar ?? null }
}

export const LEVEL_LABEL: Record<string, string> = {
  COMPANY: 'Company', DEPARTMENT: 'Department', INDIVIDUAL: 'Individual',
}

// ─── Data loading ─────────────────────────────────────────────────────────────

/** Reads the standard `{ success, data, error }` envelope; throws on failure. */
export async function fetchEnvelope<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || (res.status === 403 ? 'You do not have access to this item.' : res.status === 404 ? 'This item no longer exists.' : 'Could not load this item.'))
  }
  return json.data as T
}

/**
 * Loads `key`'s data with cancellation: switching rows quickly never paints the
 * previous item. `reload(true)` refetches silently (no skeleton) for realtime.
 */
export function useQuickViewData<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const silentRef = useRef(false)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    // Closing: keep the last payload so the dialog doesn't flash while it animates out.
    if (!key) return
    const silent = silentRef.current
    silentRef.current = false
    const ctrl = new AbortController()
    if (!silent) { setLoading(true); setData(null); setError(null) }
    loadRef.current(ctrl.signal)
      .then((d) => { if (!ctrl.signal.aborted) { setData(d); setError(null) } })
      // A failed silent refresh keeps the view it already has.
      .catch((e) => { if (!ctrl.signal.aborted && !silent) setError(e?.message || 'Could not load this item.') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [key, tick])

  const reload = useCallback((silent = false) => {
    silentRef.current = silent
    setTick((n) => n + 1)
  }, [])

  return { data, error, loading, reload }
}

// ─── Shell ────────────────────────────────────────────────────────────────────

/** A plain left click closes the modal before navigating; modified clicks
 *  (new tab / window) leave it open. */
function closeOnPlainClick(e: React.MouseEvent, onClose: () => void) {
  if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) onClose()
}

export function QuickViewShell({
  open, onClose, title, breadcrumb, fullHref, fullLabel, rail, children,
}: {
  open: boolean
  onClose: () => void
  /** Accessible dialog name. */
  title: string
  breadcrumb: ReactNode
  fullHref: string | null
  fullLabel: string
  rail?: ReactNode
  children: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      hideHeader
      showCloseButton={false}
      size="2xl"
      className="!gap-0 overflow-hidden !p-0"
    >
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden" style={{ background: 'var(--ap-bg)' }}>
        <header
          className="flex shrink-0 items-center gap-3 border-b px-5 py-3"
          style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)' }}
        >
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
            {breadcrumb}
          </nav>
          {fullHref && (
            <Link
              href={fullHref}
              onClick={(e) => closeOnPlainClick(e, onClose)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--ap-radius-sm)] px-3 text-xs font-semibold transition-colors hover:bg-[var(--ap-accent-hover)]"
              style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {fullLabel}
            </Link>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-[var(--ap-radius-sm)] p-1.5 transition-colors hover:bg-[var(--ap-bg-hover)]"
          >
            <X className="size-4" style={{ color: 'var(--ap-fg-muted)' }} aria-hidden />
          </button>
        </header>

        {/* Stacks on narrow screens (one scroll); two independent scroll columns on lg+. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div className="min-w-0 flex-1 px-5 py-5 lg:overflow-y-auto">{children}</div>
          {rail && (
            <aside
              className="flex shrink-0 flex-col gap-3 border-t p-4 lg:w-[320px] lg:overflow-y-auto lg:border-l lg:border-t-0"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              {rail}
            </aside>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function QuickViewSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

export function QuickViewError({ message, onRetry, fullHref, onClose }: {
  message: string; onRetry: () => void; fullHref: string | null; onClose: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="text-body-sm" style={{ color: 'var(--ap-fg-muted)' }}>{message}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--ap-radius-sm)] border px-3 text-xs font-medium transition-colors hover:bg-[var(--ap-bg-hover)]"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <RotateCw className="size-3.5" aria-hidden /> Retry
        </button>
        {fullHref && (
          <Link
            href={fullHref}
            onClick={(e) => closeOnPlainClick(e, onClose)}
            className="text-xs font-semibold hover:underline"
            style={{ color: 'var(--ap-accent)' }}
          >
            Open full page
          </Link>
        )}
      </div>
    </div>
  )
}

export function PrivateNotice({ what }: { what: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-[var(--ap-radius-md)] px-4 py-3 text-body-sm"
      style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
    >
      <Lock className="size-4 shrink-0" aria-hidden />
      This {what} is private. Only its progress and owner are visible to you.
    </div>
  )
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

export function Crumb({ icon: Icon, label, onClick }: { icon?: LucideIcon; label: string; onClick?: () => void }) {
  const inner = (
    <>
      {Icon && <Icon className="size-3.5 shrink-0" style={{ color: 'var(--ap-accent)' }} aria-hidden />}
      <span className="truncate">{label}</span>
    </>
  )
  if (!onClick) return <span className="flex min-w-0 max-w-[320px] items-center gap-1.5">{inner}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex min-w-0 max-w-[320px] items-center gap-1.5 rounded-[6px] px-1 py-0.5 transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
    >
      {inner}
    </button>
  )
}

// ─── Hero pieces ──────────────────────────────────────────────────────────────

export function Chip({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold"
      style={accent
        ? { background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }
        : { background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
    >
      {children}
    </span>
  )
}

export function PersonLink({ person, role, onNavigate }: {
  person?: { id: string; name: string | null; avatar?: string | null } | null
  role?: string
  onNavigate: () => void
}) {
  if (!person) return <span className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>Unassigned</span>
  return (
    <Link
      href={`/dashboard/org/users/${person.id}`}
      onClick={(e) => closeOnPlainClick(e, onNavigate)}
      className="inline-flex min-w-0 items-center gap-2 rounded-[6px] hover:underline"
    >
      <UserAvatar user={asAvatarUser(person)} size={24} tooltip={false} />
      <span className="truncate text-xs font-medium" style={{ color: 'var(--ap-fg)' }}>{person.name ?? 'Unknown'}</span>
      {role && <span className="text-caption" style={{ color: 'var(--ap-fg-subtle)' }}>· {role}</span>}
    </Link>
  )
}

export function ProgressRing({ value, tier, size = 52 }: { value: number; tier?: string | null; size?: number }) {
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = clampPct(value)
  return (
    <div className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--ap-kr-bar-bg)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          stroke={TIER_RING[tier ?? ''] ?? 'var(--ap-accent)'}
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-caption font-semibold tabular-nums">
        {Math.round(pct)}%
      </span>
    </div>
  )
}

export function StatStrip({ children }: { children: ReactNode }) {
  // 1px gaps over a border-coloured backdrop draw the cell dividers at every breakpoint.
  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--ap-radius-md)] border sm:grid-cols-4"
      style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-border)' }}
    >
      {children}
    </div>
  )
}

export function StatCell({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col justify-center gap-1.5 px-4 py-3.5', className)} style={{ background: 'var(--ap-bg-sunken)' }}>
      <p className="text-micro font-semibold uppercase tracking-wide" style={{ color: 'var(--ap-fg-subtle)' }}>{label}</p>
      {children}
    </div>
  )
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export function Section({ title, count, action, children, id }: {
  title: string; count?: number | string; action?: ReactNode; children: ReactNode; id?: string
}) {
  return (
    <section id={id} className="rounded-[var(--ap-radius-md)] border" style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)' }}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5" style={{ borderColor: 'var(--ap-border)' }}>
        <h3 className="text-caption font-semibold uppercase tracking-wide" style={{ color: 'var(--ap-fg-subtle)' }}>
          {title}{count !== undefined && <span className="ml-1 tabular-nums">({count})</span>}
        </h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function ViewAllLink({ href, label, onNavigate }: { href: string; label: string; onNavigate: () => void }) {
  return (
    <Link
      href={href}
      onClick={(e) => closeOnPlainClick(e, onNavigate)}
      className="inline-flex items-center gap-1 text-caption font-semibold hover:underline"
      style={{ color: 'var(--ap-accent)' }}
    >
      {label} <ArrowRight className="size-3" aria-hidden />
    </Link>
  )
}

export function MetaRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 border-b py-2 last:border-b-0" style={{ borderColor: 'var(--ap-border)' }}>
      <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--ap-fg-subtle)' }} aria-hidden />
      <span className="w-20 shrink-0 text-xs font-medium" style={{ color: 'var(--ap-fg-subtle)' }}>{label}</span>
      <div className="min-w-0 flex-1 text-xs" style={{ color: 'var(--ap-fg)' }}>{children}</div>
    </div>
  )
}

export function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--ap-radius-md)] border" style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)' }}>
      <p className="border-b px-4 py-2.5 text-micro font-semibold uppercase tracking-wide" style={{ borderColor: 'var(--ap-border)', color: 'var(--ap-fg-subtle)' }}>
        {title}
      </p>
      <div className="px-4 py-1.5">{children}</div>
    </div>
  )
}

/** Inline link that closes the modal on a plain click. */
export function QuickLink({ href, children, onNavigate, className }: {
  href: string; children: ReactNode; onNavigate: () => void; className?: string
}) {
  return (
    <Link
      href={href}
      onClick={(e) => closeOnPlainClick(e, onNavigate)}
      className={cn('font-medium hover:underline', className)}
      style={{ color: 'var(--ap-accent)' }}
    >
      {children}
    </Link>
  )
}
