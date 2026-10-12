import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowRightLeft, BookOpen, CalendarClock, Gauge, Package, Scale, ShieldAlert, Target } from 'lucide-react'
import { DashboardCard } from '@/components/ui/dashboard/DashboardCard'
import { InsightTile } from '@/components/ui/dashboard/InsightTile'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { PACKAGE_STATUS_LABELS, type ProfileTab } from '@/types/package'
import type { DutiesProfileSummary } from '@/features/duties/types'
import type { KpisProfileSummary } from '@/features/kpis'
import type { DevelopmentProfileSummary } from '@/features/development-plan'
import type { DependenciesProfileSummary } from '@/features/dependencies'
import type { DecisionsProfileSummary } from '@/features/decisions'
import type { PackageProfileSummary } from '@/features/operating-package'
import type { OkrProfileSummary } from '@/features/employee-profile/components/okr-profile/okr-profile.server'

/**
 * Overview "Package summary" card (PRF-2): one tile per area for the selected
 * timeframe, each deep-linking to its tab. Tiles whose summary is null (no
 * access, module off) are left out; the card hides when nothing is left.
 */
export interface ProfileSummaries {
  pkg: PackageProfileSummary | null
  okr: OkrProfileSummary | null
  kpis: KpisProfileSummary | null
  duties: DutiesProfileSummary | null
  development: DevelopmentProfileSummary | null
  dependencies: DependenciesProfileSummary | null
  decisions: DecisionsProfileSummary | null
}

interface Props {
  summaries: ProfileSummaries
  timeframeName: string | null
  /** Link for a tab, keeping the selected timeframe. */
  hrefFor: (tab: ProfileTab) => string
}

const TINT = {
  accent: 'var(--ap-accent)',
  ok: 'var(--ap-ok)',
  warn: 'var(--ap-warn-fg)',
  danger: 'var(--ap-danger)',
  muted: 'var(--ap-fg-secondary)',
} as const

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function TileLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      className="block rounded-[var(--ap-radius-md)] transition-shadow duration-[180ms] ease-apple hover:shadow-card ap-focus-ring"
    >
      {children}
    </Link>
  )
}

interface TileSpec {
  key: string
  tab: ProfileTab
  icon: LucideIcon
  label: string
  value: string | number
  detail: string
  tint: string
  trailing?: ReactNode
}

function buildTiles(s: ProfileSummaries): TileSpec[] {
  const tiles: TileSpec[] = []

  if (s.pkg) {
    const status = s.pkg.status ? PACKAGE_STATUS_LABELS[s.pkg.status] : 'No package'
    tiles.push({
      key: 'package',
      tab: 'overview',
      icon: Package,
      label: 'Package',
      value: status,
      detail: s.pkg.status
        ? [
            s.pkg.version ? `Version ${s.pkg.version}` : null,
            `${s.pkg.reviewed} of ${s.pkg.total} reviewed`,
            s.pkg.disputesOpen > 0 ? plural(s.pkg.disputesOpen, 'dispute') + ' open' : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : 'No package for this timeframe yet',
      tint: s.pkg.disputesOpen > 0 ? TINT.warn : s.pkg.status === 'APPROVED' ? TINT.ok : TINT.accent,
    })
  }

  if (s.okr) {
    const next = s.okr.nextCheckpoint
    const nextDate = shortDate(next?.dueDate)
    tiles.push({
      key: 'okr',
      tab: 'okrs',
      icon: Target,
      label: 'OKR progress',
      value: s.okr.averageProgress == null ? '—' : `${Math.round(s.okr.averageProgress)}%`,
      detail: [
        plural(s.okr.objectives, 'objective'),
        plural(s.okr.keyResults, 'KR'),
        next && nextDate ? `next checkpoint ${nextDate}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      tint: TINT.accent,
    })
  }

  if (s.kpis) {
    const k = s.kpis
    tiles.push({
      key: 'kpis',
      tab: 'kpis',
      icon: Gauge,
      label: 'KPI health',
      value: k.total === 0 ? '—' : `${k.green}/${k.amber}/${k.red}`,
      detail:
        k.total === 0
          ? 'No KPIs defined'
          : [
              'Green / amber / red',
              k.notScored > 0 ? `${k.notScored} not scored` : null,
              k.overdueReadings > 0 ? plural(k.overdueReadings, 'overdue reading') : null,
            ]
              .filter(Boolean)
              .join(' · '),
      tint: k.red > 0 ? TINT.danger : k.amber > 0 ? TINT.warn : k.total > 0 ? TINT.ok : TINT.muted,
      trailing:
        k.total > 0 ? (
          <span className="flex flex-wrap gap-1">
            <MiniBadge tone="ok" mono>{k.green} G</MiniBadge>
            <MiniBadge tone="warn" mono>{k.amber} A</MiniBadge>
            <MiniBadge tone="danger" mono>{k.red} R</MiniBadge>
          </span>
        ) : undefined,
    })
  }

  if (s.duties) {
    const d = s.duties
    tiles.push({
      key: 'duties',
      tab: 'role',
      icon: CalendarClock,
      label: 'Duties this week',
      value: d.dueThisWeek === 0 ? '—' : `${d.doneThisWeek}/${d.dueThisWeek}`,
      detail: [
        d.dueThisWeek === 0 ? 'Nothing due this week' : 'done of due',
        d.adherence30d == null ? null : `${d.adherence30d}% adherence (30 days)`,
        plural(d.activeCount, 'active duty', 'active duties'),
      ]
        .filter(Boolean)
        .join(' · '),
      tint: d.adherence30d != null && d.adherence30d < 70 ? TINT.warn : TINT.accent,
    })
  }

  if (s.development) {
    const v = s.development
    tiles.push({
      key: 'development',
      tab: 'development',
      icon: BookOpen,
      label: 'Development',
      value: `${v.itemsDone}/${v.itemsRequired}`,
      detail: [
        'items done of required',
        `${Math.round(v.hoursLogged)} of ${v.hoursRequired} h`,
        v.overdue > 0 ? `${v.overdue} overdue` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      tint: v.overdue > 0 ? TINT.danger : v.rulesMet ? TINT.ok : TINT.accent,
    })
  }

  if (s.dependencies) {
    const dep = s.dependencies
    tiles.push({
      key: 'inbound',
      tab: 'links',
      icon: ShieldAlert,
      label: 'Inbound blockers',
      value: dep.inboundLate,
      detail: dep.inboundOpen === 0 ? 'Nothing waiting on others' : `late · ${dep.inboundOpen} open in total`,
      tint: dep.inboundLate > 0 ? TINT.danger : TINT.muted,
      trailing:
        dep.topInbound.length > 0 ? (
          <ul className="space-y-0.5">
            {dep.topInbound.slice(0, 3).map((row) => (
              <li key={row.id} className="truncate text-caption text-muted-foreground">
                {row.ref ? <span className="font-mono">{row.ref} </span> : null}
                {row.title}
                {row.late ? <span className="text-[color:var(--ap-danger-fg)]"> · late</span> : null}
              </li>
            ))}
          </ul>
        ) : undefined,
    })
    tiles.push({
      key: 'outbound',
      tab: 'links',
      icon: ArrowRightLeft,
      label: 'Outbound due in 7 days',
      value: dep.outboundDueSoon,
      detail: dep.outboundOpen === 0 ? 'Nobody is waiting on this person' : `${dep.outboundOpen} owed in total`,
      tint: dep.outboundDueSoon > 0 ? TINT.warn : TINT.muted,
    })
  }

  if (s.decisions) {
    const dec = s.decisions
    tiles.push({
      key: 'decisions',
      tab: 'decisions',
      icon: Scale,
      label: 'Open decisions',
      value: dec.openAffecting,
      detail: [
        'affecting this person',
        dec.affectingOverdue > 0 ? `${dec.affectingOverdue} past needed-by` : null,
        dec.awaitingMyDecision > 0 ? `${dec.awaitingMyDecision} awaiting their decision` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      tint: dec.affectingOverdue > 0 || dec.awaitingOverdue > 0 ? TINT.warn : TINT.accent,
    })
  }

  return tiles
}

export function PackageSummaryCard({ summaries, timeframeName, hrefFor }: Props) {
  const tiles = buildTiles(summaries)
  if (tiles.length === 0) return null
  return (
    <DashboardCard
      title="Package summary"
      right={timeframeName ? <MiniBadge tone="neutral">{timeframeName}</MiniBadge> : undefined}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <TileLink
            key={tile.key}
            href={tile.tab === 'overview' ? `${hrefFor('overview')}#package` : hrefFor(tile.tab)}
            label={`${tile.label}: ${tile.value}. Open ${tile.tab === 'overview' ? 'package' : tile.tab} details`}
          >
            <InsightTile
              icon={tile.icon}
              label={tile.label}
              value={tile.value}
              detail={tile.detail}
              tint={tile.tint}
              trailing={tile.trailing}
            />
          </TileLink>
        ))}
      </div>
    </DashboardCard>
  )
}
