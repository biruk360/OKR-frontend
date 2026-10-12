'use client'

/**
 * KR detail page sections fed by `GET /api/connections?type=KEY_RESULT&id=`:
 *
 *   - CON-7 "Lands in" — every KR and objective that CONTRIBUTES_TO this KR, with
 *     owner and progress (the "KR Ownership Matrix", generated live). Always shown
 *     for a company KR (with an empty state); for other KRs only when something
 *     contributes to them.
 *   - CON-3 "Project milestones" — milestones whose `keyResultId` is this KR.
 *
 * Items the viewer may not see render as "Private item" (CON-8). A redacted or
 * not-visible KR renders nothing; load failures are left to the rail panel's retry.
 */
import Link from 'next/link'
import { Flag, Layers } from 'lucide-react'
import { EmptyState, SectionHeading } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { Progress } from '@/components/ui/progress'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { UserAvatar } from '@/components/shared/UserAvatar'
import {
  CONNECTION_ITEM_ICONS,
  CONNECTION_ITEM_TYPE_LABELS,
  ConnectionItemRow,
  PrivateConnectionRow,
  connectionStatusDisplay,
  formatPercent,
  useConnections,
} from '@/components/shared/connections'
import type { ConnectionItem } from '@/lib/connections/types'
import { progressWidth, sortMilestones, summarizeLandsIn } from './kr-connections'

function Card({ title, right, children, id }: { title: string; right?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section
      id={id}
      aria-label={title}
      className="overflow-hidden rounded-[var(--ap-radius-md)] border bg-card"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <SectionHeading title={title} as="h2" right={right} />
      <div className="px-4 py-2">{children}</div>
    </section>
  )
}

function LandsInRow({ item }: { item: ConnectionItem }) {
  if (item.redacted) return <PrivateConnectionRow type={item.type} detail="Contributes to this key result" />
  const Icon = CONNECTION_ITEM_ICONS[item.type]
  const status = connectionStatusDisplay(item.status)
  const pct = formatPercent(item.progress)
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_180px_200px]"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--ap-accent)' }} aria-hidden />
        <div className="min-w-0">
          <Link href={item.href} className="line-clamp-2 break-words text-xs font-medium hover:underline" style={{ color: 'var(--ap-fg)' }}>
            {item.ref && (
              <span className="mr-1 font-mono text-micro" style={{ color: 'var(--ap-fg-subtle)' }}>
                {item.ref}
              </span>
            )}
            {item.title}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-micro" style={{ color: 'var(--ap-fg-subtle)' }}>
            <span>{CONNECTION_ITEM_TYPE_LABELS[item.type]}</span>
            {item.parentLabel && <span className="truncate">· {item.parentLabel}</span>}
            {item.timeframe?.name && <span>· {item.timeframe.name}</span>}
            {item.isPrimary && <span>· Primary</span>}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 justify-self-end md:justify-self-start">
        {item.owner ? (
          <>
            <UserAvatar user={{ id: item.owner.id, name: item.owner.name ?? 'Unknown', avatar: item.owner.avatar }} size={20} tooltip={false} />
            <span className="truncate text-xs" style={{ color: 'var(--ap-fg-muted)' }}>{item.owner.name ?? 'Unknown'}</span>
          </>
        ) : (
          <span className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>Unassigned</span>
        )}
      </div>
      <div className="col-span-2 flex items-center gap-2 md:col-span-1">
        <Progress
          className="flex-1"
          height={4}
          value={progressWidth(item.progress)}
          fill="var(--ap-accent)"
          track="var(--ap-kr-bar-bg)"
          aria-label="Progress"
        />
        <span className="w-9 text-right text-micro tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>{pct ?? '—'}</span>
        {status && <MiniBadge tone={status.tone}>{status.label}</MiniBadge>}
      </div>
    </div>
  )
}

export interface KrContributionSectionsProps {
  keyResultId: string
  /** The KR's objective is COMPANY level: always show "Lands in" (CON-7). */
  isCompany?: boolean
}

export default function KrContributionSections({ keyResultId, isCompany = false }: KrContributionSectionsProps) {
  const { data, isLoading } = useConnections('KEY_RESULT', keyResultId)

  if (isLoading) {
    return isCompany ? (
      <Card title="Lands in">
        <div className="space-y-2 py-2" aria-busy="true" aria-label="Loading contributing items">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
    ) : null
  }
  if (!data || data.subject.redacted) return null

  const landsIn = summarizeLandsIn(data.supportedBy)
  const milestones = sortMilestones(data.milestones)
  const showLandsIn = isCompany || landsIn.rows.length > 0
  if (!showLandsIn && milestones.length === 0) return null

  const avg = formatPercent(landsIn.averageProgress)
  const landsInSummary = [
    `${landsIn.rows.length} ${landsIn.rows.length === 1 ? 'item' : 'items'}`,
    landsIn.ownerCount > 0 ? `${landsIn.ownerCount} ${landsIn.ownerCount === 1 ? 'owner' : 'owners'}` : null,
    avg ? `avg ${avg}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-4">
      {showLandsIn && (
        <Card
          title="Lands in"
          id={`kr-lands-in-${keyResultId}`}
          right={
            landsIn.rows.length > 0 ? (
              <span className="text-caption tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>{landsInSummary}</span>
            ) : undefined
          }
        >
          {landsIn.rows.length === 0 ? (
            <EmptyState
              bare
              className="py-6"
              icon={Layers}
              title="Nothing lands in this key result yet"
              description="Team and individual key results or objectives that contribute to this company KR appear here with their owner and progress."
            />
          ) : (
            <>
              <p className="pb-1 text-caption" style={{ color: 'var(--ap-fg-subtle)' }}>
                Key results and objectives that contribute to this one.
              </p>
              <div>
                {landsIn.rows.map((item) => (
                  <LandsInRow key={`${item.type}:${item.id}`} item={item} />
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {milestones.length > 0 && (
        <Card
          title="Project milestones"
          id={`kr-milestones-${keyResultId}`}
          right={
            <span className="inline-flex items-center gap-1 text-caption tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>
              <Flag className="size-3" aria-hidden /> {milestones.length}
            </span>
          }
        >
          {milestones.map((item) => (
            <ConnectionItemRow key={`${item.type}:${item.id}`} item={item} showVia={false} />
          ))}
        </Card>
      )}
    </div>
  )
}
