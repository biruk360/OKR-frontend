'use client'

import Link from 'next/link'
import { Calendar, Target, TrendingUp, User as UserIcon, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActivityLogPanel } from '@/components/shared/ActivityLogPanel'
import { formatAxisValue } from '@/lib/keyResultChart'
import CheckInTimeline from './CheckInTimeline'

interface UserLite {
  id?: string
  name?: string | null
  email?: string | null
  avatar?: string | null
}

interface CheckInLite {
  id: string
  asOfDate: string | Date
  value: number
  confidence: string | null
  analysis?: string | null
  createdBy?: { name?: string | null; avatar?: string | null } | null
}

interface Props {
  keyResultId: string
  activityElementId: string
  details: {
    owner?: UserLite | null
    timeframe?: { name?: string; type?: string; startDate?: Date | string; endDate?: Date | string } | null
    parentObjective?: { id: string; title: string } | null
    startValue: number
    targetValue: number
    currentValue: number
    unit: string
    updatedAt: Date | string
    updatedBy?: UserLite | null
    confidenceTrend?: number[]
  }
  checkIns: CheckInLite[]
}

function initialsOf(name?: string | null): string {
  return (name || '?').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function timeframeTypeLabel(type?: string): string {
  switch (type) {
    case 'QUARTERLY': return 'Quarterly'
    case 'SIX_MONTH': return 'Bi-annual'
    case 'YEARLY': return 'Yearly'
    case 'MONTHLY': return 'Monthly'
    default: return type ?? ''
  }
}

export default function KrInspectorTabs({ keyResultId, activityElementId, details, checkIns }: Props) {
  return (
    <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      <Tabs defaultValue="details">
        <TabsList
          className="h-9 w-full justify-start gap-0 p-0 rounded-none border-b bg-transparent"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          {(['details', 'checkins', 'activity', 'risks'] as const).map((v) => (
            <TabsTrigger
              key={v}
              value={v}
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground data-[state=active]:border-[var(--ap-accent)] data-[state=active]:text-[var(--ap-fg)] data-[state=active]:shadow-none data-[state=active]:bg-transparent"
            >
              {v === 'details' ? 'Details' : v === 'checkins' ? 'Check-ins' : v === 'activity' ? 'Activity' : 'Risks'}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="details" className="m-0 p-0">
          <div className="px-4 py-4 space-y-4 max-h-[460px] overflow-auto">
            {details.owner && (
              <Field icon={<UserIcon className="size-3" />} label="Owner">
                <div className="flex items-center gap-2.5">
                  {details.owner.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={details.owner.avatar} alt={details.owner.name ?? ''} className="size-8 rounded-full object-cover" />
                  ) : (
                    <span
                      className="flex size-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: 'var(--ap-accent)' }}
                    >
                      {initialsOf(details.owner.name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate">{details.owner.name ?? 'Unknown'}</p>
                    {details.owner.email && (
                      <p className="text-[11px] text-muted-foreground truncate">{details.owner.email}</p>
                    )}
                  </div>
                </div>
              </Field>
            )}

            {details.timeframe && (
              <Field icon={<Calendar className="size-3" />} label="Timeframe">
                <div className="flex items-center gap-2 flex-wrap">
                  {details.timeframe.name && (
                    <span className="text-[13px] font-medium">{details.timeframe.name}</span>
                  )}
                  {details.timeframe.type && (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
                    >
                      {timeframeTypeLabel(details.timeframe.type)}
                    </span>
                  )}
                </div>
                {details.timeframe.startDate && details.timeframe.endDate && (
                  <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                    {new Date(details.timeframe.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    {' → '}
                    {new Date(details.timeframe.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </p>
                )}
              </Field>
            )}

            {details.parentObjective && (
              <Field icon={<Target className="size-3" />} label="Parent objective">
                <Link
                  href={`/dashboard/objectives/${details.parentObjective.id}`}
                  className="block rounded-[10px] border px-2.5 py-1.5 text-[12px] hover:bg-[var(--ap-bg-hover)]"
                  style={{
                    borderColor: 'var(--ap-border)',
                    background: 'var(--ap-accent-soft)',
                    color: 'var(--ap-accent)',
                  }}
                >
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Target className="size-3" />
                    {details.parentObjective.title}
                  </span>
                </Link>
              </Field>
            )}

            <Field icon={<TrendingUp className="size-3" />} label="Measurement">
              <p className="text-[12px]">
                Start{' '}
                <span className="font-semibold tabular-nums">
                  {formatAxisValue(details.startValue)} {details.unit}
                </span>{' '}
                → Target{' '}
                <span className="font-semibold tabular-nums">
                  {formatAxisValue(details.targetValue)} {details.unit}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                Current{' '}
                <span className="font-semibold text-[var(--ap-fg)]">
                  {formatAxisValue(details.currentValue)} {details.unit}
                </span>
              </p>
            </Field>

            {details.confidenceTrend && details.confidenceTrend.length > 0 && (
              <Field icon={<TrendingUp className="size-3" />} label="Confidence trend">
                <div className="flex items-end gap-1 h-8">
                  {details.confidenceTrend.slice(-4).map((v, i) => {
                    const pct = Math.max(0, Math.min(100, v))
                    const color = pct >= 70 ? 'var(--ap-green)' : pct >= 40 ? 'var(--ap-orange)' : 'var(--ap-red)'
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full rounded-t-[3px]" style={{ height: `${Math.max(6, pct * 0.28)}px`, background: color }} />
                        <span className="text-[9px] text-muted-foreground tabular-nums">{Math.round(pct)}</span>
                      </div>
                    )
                  })}
                </div>
              </Field>
            )}

            <Field icon={<Clock className="size-3" />} label="Last updated">
              <p className="text-[12px] tabular-nums">
                {format(new Date(details.updatedAt), 'PP p')}
              </p>
              {details.updatedBy?.name && (
                <p className="text-[11px] text-muted-foreground mt-0.5">by {details.updatedBy.name}</p>
              )}
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="checkins" className="m-0 p-0">
          <div className="px-4 py-4 max-h-[460px] overflow-auto">
            {checkIns.length === 0 ? (
              <p className="text-[12px] text-muted-foreground italic">No check-ins yet.</p>
            ) : (
              <CheckInTimeline checkIns={checkIns} unit={details.unit} />
            )}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="m-0 p-0">
          <div id={activityElementId} className="px-3 py-3 max-h-[460px] overflow-auto">
            <ActivityLogPanel entityType="key-result" entityId={keyResultId} embedded />
          </div>
        </TabsContent>

        <TabsContent value="risks" className="m-0 p-0">
          <div className="px-4 py-6 text-[12px] text-muted-foreground">No risks logged.</div>
        </TabsContent>
      </Tabs>
    </section>
  )
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-1.5">
        {icon} {label}
      </p>
      {children}
    </div>
  )
}
