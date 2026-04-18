'use client'

import { CheckCircle2, AlertTriangle, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export interface HeroStatsData {
  avgProgress: number
  expectedProgress: number
  activeOkrCount: number
  confidenceScore: number
  onTrack: number
  atRisk: number
  offTrack: number
  totalKRs: number
  timeframeName: string | null
  weekLabel: string | null
  momentumData?: Array<{ date: string; progress: number }>
}

interface Props {
  data: HeroStatsData
}

const CHART_PRIMARY = '#0052cc'
const AXIS = '#6b778c'

export default function HeroStats({ data }: Props) {
  const total = data.onTrack + data.atRisk + data.offTrack
  const delta = data.avgProgress - data.expectedProgress
  const aheadOfPace = delta >= 0

  const scoreColor =
    data.confidenceScore >= 65 ? 'text-emerald-700' :
    data.confidenceScore >= 35 ? 'text-amber-700' :
    'text-red-700'

  const progressColor = aheadOfPace ? 'text-emerald-600' : 'text-red-600'

  // Momentum from real snaps or fall back to a flat line at current progress
  const momentumData = (data.momentumData && data.momentumData.length >= 2)
    ? data.momentumData
    : null

  const latestProgress = momentumData ? momentumData[momentumData.length - 1].progress : data.avgProgress
  const prevProgress    = momentumData ? momentumData[momentumData.length - 2].progress : data.avgProgress
  const momentumDelta   = latestProgress - prevProgress
  const momentumTrend   = momentumDelta > 5 ? 'up' : momentumDelta < -5 ? 'down' : 'stable'

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* ── 1. Your Performance ── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            Your performance
            {data.timeframeName && (
              <span className="font-normal text-muted-foreground"> · {data.timeframeName}</span>
            )}
          </h3>
          {data.weekLabel && (
            <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {data.weekLabel}
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-4xl font-bold tabular-nums tracking-tight">
            {data.avgProgress}%
          </span>
          <span className={`inline-flex items-center gap-1 text-sm font-medium ${progressColor}`}>
            {aheadOfPace ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {aheadOfPace ? '+' : ''}{delta}pt vs expected
          </span>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Average progress across your {data.activeOkrCount} active OKR{data.activeOkrCount !== 1 ? 's' : ''}
        </p>

        <div className="relative">
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(data.avgProgress, 100)}%` }}
            />
          </div>
          <div
            className="absolute top-0 h-2.5 w-0.5 bg-foreground/60 rounded-full"
            style={{ left: `${Math.min(data.expectedProgress, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
          <span>Actual {data.avgProgress}%</span>
          <span className={progressColor}>
            {aheadOfPace ? 'Ahead of pace' : 'Behind pace'} (expected {data.expectedProgress}%)
          </span>
        </div>
      </div>

      {/* ── 2. Confidence Tracker ── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Confidence tracker</h3>
        </div>

        <div className="flex items-start gap-6">
          <div className="text-center">
            <div className={`text-4xl font-bold tabular-nums tracking-tight ${scoreColor}`}>
              {data.confidenceScore}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Overall score</p>
          </div>

          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span className="font-medium">{data.onTrack}</span>
              <span className="text-muted-foreground">on track</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 text-amber-600" />
              <span className="font-medium">{data.atRisk}</span>
              <span className="text-muted-foreground">at risk</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingDown className="size-4 text-red-600" />
              <span className="font-medium">{data.offTrack}</span>
              <span className="text-muted-foreground">off track</span>
            </div>
          </div>
        </div>

        {total > 0 && (
          <div className="flex h-3 rounded-full overflow-hidden mt-4">
            {data.onTrack > 0 && (
              <div className="bg-emerald-500 transition-all" style={{ width: `${(data.onTrack / total) * 100}%` }} />
            )}
            {data.atRisk > 0 && (
              <div className="bg-amber-500 transition-all" style={{ width: `${(data.atRisk / total) * 100}%` }} />
            )}
            {data.offTrack > 0 && (
              <div className="bg-red-500 transition-all" style={{ width: `${(data.offTrack / total) * 100}%` }} />
            )}
          </div>
        )}
      </div>

      {/* ── 3. Momentum ── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">Momentum</h3>
          <div className="flex items-center gap-1">
            {momentumTrend === 'up'     && <TrendingUp   className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2} />}
            {momentumTrend === 'down'   && <TrendingDown className="h-3.5 w-3.5 text-destructive"  strokeWidth={2} />}
            {momentumTrend === 'stable' && <Minus        className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />}
            <span className={`text-xs font-medium ${
              momentumTrend === 'up' ? 'text-emerald-600' :
              momentumTrend === 'down' ? 'text-destructive' :
              'text-muted-foreground'
            }`}>
              {momentumDelta > 0 ? '+' : ''}{momentumDelta.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-4xl font-bold tabular-nums tracking-tight">
            {latestProgress.toFixed(1)}%
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">Progress trend over time</p>

        {momentumData ? (
          <div className="h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={momentumData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  stroke={AXIS}
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis
                  stroke={AXIS}
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: '#172b4d', fontWeight: 600 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, 'Progress']}
                  labelFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                />
                <Line
                  type="monotone"
                  dataKey="progress"
                  stroke={CHART_PRIMARY}
                  strokeWidth={2}
                  dot={{ fill: CHART_PRIMARY, strokeWidth: 0, r: 2 }}
                  activeDot={{ r: 4, stroke: CHART_PRIMARY, strokeWidth: 2, fill: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[100px] flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Not enough history yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
