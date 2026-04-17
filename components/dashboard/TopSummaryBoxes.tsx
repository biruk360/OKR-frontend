'use client'

import { TrendingUp, Shield, AlertOctagon, CalendarClock, Activity } from 'lucide-react'

export interface TopSummaryData {
  avgProgress: number
  confidenceScore: number
  onTrack: number
  atRisk: number
  offTrack: number
  totalKRs: number
  overallHealth: number
  healthLabel: string
  blockedCount: number
  dueThisWeekCount: number
}

interface Props {
  data: TopSummaryData
}

export default function TopSummaryBoxes({ data }: Props) {
  const scoreColor = data.confidenceScore >= 65 ? 'text-emerald-600' : data.confidenceScore >= 35 ? 'text-amber-600' : 'text-red-600'
  const healthColor = data.overallHealth >= 70 ? 'text-emerald-600' : data.overallHealth >= 40 ? 'text-amber-600' : 'text-red-600'
  const healthBg = data.overallHealth >= 70 ? 'bg-emerald-100' : data.overallHealth >= 40 ? 'bg-amber-100' : 'bg-red-100'

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {/* Average Progress */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-blue-100">
            <TrendingUp className="size-4 text-blue-600" />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg Progress</span>
        </div>
        <div className="text-2xl font-bold tabular-nums">{data.avgProgress}%</div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(data.avgProgress, 100)}%` }} />
        </div>
      </div>

      {/* Confidence Score */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-emerald-100">
            <Activity className="size-4 text-emerald-600" />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Confidence</span>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{data.confidenceScore}</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="text-emerald-600">{data.onTrack} on track</span>
          <span className="text-amber-600">{data.atRisk} at risk</span>
          <span className="text-red-600">{data.offTrack} off</span>
        </div>
      </div>

      {/* Overall Health */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`flex size-8 items-center justify-center rounded-md ${healthBg}`}>
            <Shield className={`size-4 ${healthColor}`} />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Overall Health</span>
        </div>
        <div className={`text-2xl font-bold ${healthColor}`}>{data.healthLabel}</div>
        <p className="text-[11px] text-muted-foreground mt-1">{data.overallHealth}% of KRs on track</p>
      </div>

      {/* Blocked */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-red-100">
            <AlertOctagon className="size-4 text-red-600" />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Blocked</span>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${data.blockedCount > 0 ? 'text-red-600' : 'text-foreground'}`}>
          {data.blockedCount}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">Off-track key results</p>
      </div>

      {/* Due This Week */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-purple-100">
            <CalendarClock className="size-4 text-purple-600" />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Due This Week</span>
        </div>
        <div className="text-2xl font-bold tabular-nums">{data.dueThisWeekCount}</div>
        <p className="text-[11px] text-muted-foreground mt-1">Initiatives due in 7 days</p>
      </div>
    </div>
  )
}
