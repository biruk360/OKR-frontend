'use client'

/**
 * Row renderers shared by ConnectionsPanel (CON-2), the chip popovers (CON-1),
 * LinkManagerModal and LineagePopover. A redacted item (CON-8) renders as a lock
 * plus "Private item" — no title, owner, status or link.
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckSquare,
  Flag,
  Forward,
  Gauge,
  GraduationCap,
  History,
  Hourglass,
  KeyRound,
  Link2,
  Lock,
  Repeat,
  Scale,
  Target,
  XOctagon,
  type LucideIcon,
} from 'lucide-react'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { UserAvatar, UserAvatarStack } from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'
import type {
  ConnectionDecision,
  ConnectionDependency,
  ConnectionItem,
  ConnectionItemType,
  ConnectionPerson,
} from '@/lib/connections/types'
import {
  CONNECTION_ITEM_TYPE_LABELS,
  connectionStatusDisplay,
  connectionViaLabel,
  dependencyStatusLabel,
  dependencyTone,
  formatPercent,
  formatShortDate,
  PRIVATE_ITEM_LABEL,
  type ConnectionChipKind,
  type ConnectionGroup,
  type ConnectionTone,
} from './connection-display'

export const CONNECTION_ITEM_ICONS: Record<ConnectionItemType, LucideIcon> = {
  OBJECTIVE: Target,
  KEY_RESULT: KeyRound,
  TODO: CheckSquare,
  KPI: Gauge,
  DUTY: Repeat,
  DEVELOPMENT: GraduationCap,
  MILESTONE: Flag,
  DEPENDENCY: Link2,
  DECISION: Scale,
}

/** CON-1 chip icons (↑ ↓ ⟲ → ⛔ ⏳ ⇢ ⚖ KPI …). */
export const CONNECTION_CHIP_ICONS: Record<ConnectionChipKind, LucideIcon> = {
  alignsTo: ArrowUp,
  supportedBy: ArrowDown,
  predecessors: History,
  successors: ArrowRight,
  blockedBy: XOctagon,
  waitingOn: Hourglass,
  waitingOnThis: Forward,
  decisions: Scale,
  kpis: Gauge,
  duties: Repeat,
  development: GraduationCap,
  milestones: Flag,
}

/** Token pairs per tone — the same ramp MiniBadge uses. */
export const CONNECTION_TONE_STYLE: Record<ConnectionTone, { fg: string; bg: string }> = {
  neutral: { fg: 'var(--ap-fg-muted)', bg: 'var(--ap-bg-sunken)' },
  accent: { fg: 'var(--ap-accent-on-soft)', bg: 'var(--ap-accent-soft)' },
  ok: { fg: 'var(--ap-ok-fg)', bg: 'var(--ap-ok-bg)' },
  warn: { fg: 'var(--ap-warn-fg)', bg: 'var(--ap-warn-bg)' },
  danger: { fg: 'var(--ap-danger-fg)', bg: 'var(--ap-danger-bg)' },
}

function asAvatar(p: ConnectionPerson) {
  return { id: p.id, name: p.name ?? 'Unknown', avatar: p.avatar }
}

/** A plain left click runs `onNavigate` (e.g. close a modal) before Next navigates. */
function navigateHandler(onNavigate?: () => void) {
  if (!onNavigate) return undefined
  return (e: React.MouseEvent) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) onNavigate()
  }
}

function RowShell({ icon: Icon, iconColor, children, trailing, className }: {
  icon: LucideIcon
  iconColor?: string
  children: ReactNode
  trailing?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex items-start gap-2.5 border-b py-2 last:border-b-0', className)}
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: iconColor ?? 'var(--ap-fg-subtle)' }} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {trailing && <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>}
    </div>
  )
}

function TitleLink({ href, children, onNavigate }: { href: string; children: ReactNode; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={navigateHandler(onNavigate)}
      className="line-clamp-2 break-words text-xs font-medium hover:underline"
      style={{ color: 'var(--ap-fg)' }}
    >
      {children}
    </Link>
  )
}

function RefTag({ value }: { value: string | null | undefined }) {
  if (!value) return null
  return (
    <span className="mr-1 font-mono text-micro font-semibold tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>
      {value}
    </span>
  )
}

function Meta({ children }: { children: ReactNode }) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-micro" style={{ color: 'var(--ap-fg-subtle)' }}>
      {children}
    </p>
  )
}

/** "Private item" row (CON-8). */
export function PrivateConnectionRow({ type, detail, trailing }: { type: ConnectionItemType; detail?: string | null; trailing?: ReactNode }) {
  return (
    <RowShell icon={Lock} trailing={trailing}>
      <p className="text-xs font-medium italic" style={{ color: 'var(--ap-fg-muted)' }}>{PRIVATE_ITEM_LABEL}</p>
      <Meta>
        <span>{CONNECTION_ITEM_TYPE_LABELS[type]}</span>
        {detail && <span>· {detail}</span>}
      </Meta>
    </RowShell>
  )
}

export interface ConnectionItemRowProps {
  item: ConnectionItem
  /** Show the relation ("Parent", "Contributes", "Carried · Primary"). Default true. */
  showVia?: boolean
  /** Show the final grade on closed items (lineage). */
  showFinal?: boolean
  onNavigate?: () => void
  /** Extra controls at the right (e.g. a remove-link button). */
  trailing?: ReactNode
}

export function ConnectionItemRow({ item, showVia = true, showFinal = false, onNavigate, trailing }: ConnectionItemRowProps) {
  const via = showVia ? connectionViaLabel(item) : null
  if (item.redacted) return <PrivateConnectionRow type={item.type} detail={via} trailing={trailing} />

  const status = connectionStatusDisplay(item.status)
  const pct = formatPercent(item.progress)
  const due = formatShortDate(item.dueDate)
  return (
    <RowShell
      icon={CONNECTION_ITEM_ICONS[item.type]}
      iconColor="var(--ap-accent)"
      trailing={
        <>
          {item.owner && <UserAvatar user={asAvatar(item.owner)} size={20} />}
          {trailing}
        </>
      }
    >
      <TitleLink href={item.href} onNavigate={onNavigate}>
        <RefTag value={item.ref} />
        {item.title}
      </TitleLink>
      <Meta>
        <span>{CONNECTION_ITEM_TYPE_LABELS[item.type]}</span>
        {via && <span>· {via}</span>}
        {item.timeframe?.name && <span>· {item.timeframe.name}</span>}
        {item.project && <span>· {item.project.code}</span>}
        {item.parentLabel && <span>· {item.parentLabel}</span>}
        {due && <span>· Due {due}</span>}
        {pct && <span className="tabular-nums">· {pct}</span>}
        {status && <MiniBadge tone={status.tone}>{status.label}</MiniBadge>}
      </Meta>
      {showFinal && item.final && (
        <Meta>
          <span>
            Final grade <span className="font-semibold tabular-nums" style={{ color: 'var(--ap-fg)' }}>
              {typeof item.final.finalGrade === 'number' ? item.final.finalGrade.toFixed(2) : '—'}
            </span>
          </span>
          {item.final.outcome && <span>· {connectionStatusDisplay(item.final.outcome)?.label}</span>}
          {formatPercent(item.final.finalProgress) && <span>· reached {formatPercent(item.final.finalProgress)}</span>}
        </Meta>
      )}
    </RowShell>
  )
}

export function ConnectionDependencyRow({ dep, onNavigate }: { dep: ConnectionDependency; onNavigate?: () => void }) {
  const tone = dependencyTone(dep)
  const counterparties = dep.direction === 'INBOUND' ? dep.providers : dep.needers
  const neededBy = formatShortDate(dep.neededByDate)
  return (
    <RowShell
      icon={dep.late ? XOctagon : dep.direction === 'INBOUND' ? Hourglass : Forward}
      iconColor={CONNECTION_TONE_STYLE[tone].fg}
      trailing={counterparties.length > 0 ? <UserAvatarStack users={counterparties.map(asAvatar)} size={20} max={3} /> : null}
    >
      <TitleLink href={dep.href} onNavigate={onNavigate}>
        <RefTag value={dep.ref} />
        {dep.title}
      </TitleLink>
      <Meta>
        <span>{dep.direction === 'INBOUND' ? 'Waiting on' : 'Others wait on this'}</span>
        {neededBy && <span>· Needed by {neededBy}</span>}
        <MiniBadge tone={tone}>{dependencyStatusLabel(dep)}</MiniBadge>
      </Meta>
    </RowShell>
  )
}

export function ConnectionDecisionRow({ decision, onNavigate }: { decision: ConnectionDecision; onNavigate?: () => void }) {
  if (decision.redacted) return <PrivateConnectionRow type="DECISION" />
  const status = connectionStatusDisplay(decision.status)
  const neededBy = formatShortDate(decision.neededBy)
  return (
    <RowShell
      icon={Scale}
      iconColor={decision.overdue ? 'var(--ap-danger)' : 'var(--ap-accent)'}
      trailing={decision.decider ? <UserAvatar user={asAvatar(decision.decider)} size={20} tooltipDetail="Decider" /> : null}
    >
      <TitleLink href={decision.href} onNavigate={onNavigate}>
        <RefTag value={decision.ref} />
        {decision.title}
      </TitleLink>
      <Meta>
        {neededBy && <span>Needed by {neededBy}</span>}
        {decision.batch && <span>· {decision.batch}</span>}
        {decision.overdue ? (
          <MiniBadge tone="danger">Overdue</MiniBadge>
        ) : (
          status && <MiniBadge tone={status.tone}>{status.label}</MiniBadge>
        )}
      </Meta>
    </RowShell>
  )
}

/** Renders the rows of one CON-2 group. */
export function ConnectionGroupRows({ group, onNavigate, showFinal }: {
  group: ConnectionGroup
  onNavigate?: () => void
  showFinal?: boolean
}) {
  if (group.kind === 'dependencies') {
    return <>{group.items.map((dep) => <ConnectionDependencyRow key={dep.id} dep={dep} onNavigate={onNavigate} />)}</>
  }
  if (group.kind === 'decisions') {
    return <>{group.items.map((d) => <ConnectionDecisionRow key={d.id} decision={d} onNavigate={onNavigate} />)}</>
  }
  return (
    <>
      {group.items.map((item) => (
        <ConnectionItemRow
          key={`${item.type}:${item.id}`}
          item={item}
          onNavigate={onNavigate}
          showFinal={showFinal ?? (group.key === 'predecessors' || group.key === 'successors')}
        />
      ))}
    </>
  )
}
