'use client'

/**
 * CEO super-dashboard section of /dashboard/reports: insight tiles, trajectory
 * and status-mix charts, recommendations, progress distribution and the three
 * ranking cards. Split out of ReportDashboardClient.tsx (2026-09-25).
 */
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  Lightbulb,
  ListChecks,
  Target,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { KrDisplayStatus } from '@/lib/reportDashboard'
import { chartAlpha, chartAxisTick, chartColors, chartTooltipStyle } from '@/lib/chart-colors'
import {
  DashboardCard,
  InsightTile,
  MiniBadge,
  Sparkline,
} from '@/components/ui/dashboard'
import {
  STATUS_COLORS,
  clampPct,
  type DashboardMode,
  type DepartmentRow,
  type OwnerRow,
  type PlanRow,
  type Recommendation,
  type SuperMetrics,
} from './report-dashboard-utils'

interface Props {
  mode: DashboardMode
  metrics: SuperMetrics
  statusChartData: Array<{ name: string; value: number; key: KrDisplayStatus }>
  progressBands: Array<{ name: string; objectives: number; krs: number }>
  burnupData: Array<{ name: string; progress: number; risk: number; target: number }>
  departmentRows: DepartmentRow[]
  ownerRows: OwnerRow[]
  planRows: PlanRow[]
  recommendations: Recommendation[]
  /** Optional series passed to the four hero InsightTiles. Each is a flat array of values. */
  sparklines?: {
    progress?: number[]
    risk?: number[]
    krs?: number[]
    initiatives?: number[]
  }
}

export function ReportSuperDashboard({
  mode,
  metrics,
  statusChartData,
  progressBands,
  burnupData,
  departmentRows,
  ownerRows,
  planRows,
  recommendations,
  sparklines,
}: Props) {
  const topDepartments = departmentRows.slice(0, 6)
  const topOwners = ownerRows.slice(0, 6)
  const healthLabel = metrics.riskRate >= 35 ? 'Critical' : metrics.riskRate >= 18 ? 'Watch' : 'Healthy'
  const healthColor = metrics.riskRate >= 35 ? 'var(--ap-red)' : metrics.riskRate >= 18 ? 'var(--ap-orange)' : 'var(--ap-green)'

  return (
    <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InsightTile
          icon={Target}
          label="OKR scope"
          value={`${metrics.objectiveCount} / ${metrics.krCount}`}
          detail={`${metrics.ownerCount} owners · ${metrics.initiativeCount} initiatives`}
          tint="var(--ap-accent)"
          trailing={sparklines?.krs && sparklines.krs.length > 1
            ? <Sparkline data={sparklines.krs} color={chartColors.accent} />
            : undefined}
        />
        <InsightTile
          icon={Gauge}
          label="Progress"
          value={`${metrics.avgKrProgress}%`}
          detail={`${metrics.avgObjectiveProgress}% objective average`}
          tint="var(--ap-green)"
          trailing={sparklines?.progress && sparklines.progress.length > 1
            ? <Sparkline data={sparklines.progress} color={chartColors.success} />
            : undefined}
        />
        <InsightTile
          icon={AlertTriangle}
          label="Risk rate"
          value={`${metrics.riskRate}%`}
          detail={`${metrics.noCheckInCount} KRs without check-ins`}
          tint={healthColor}
          trailing={sparklines?.risk && sparklines.risk.length > 1
            ? <Sparkline data={sparklines.risk} color={metrics.riskRate >= 35 ? chartColors.danger : chartColors.warning} />
            : undefined}
        />
        <InsightTile
          icon={ListChecks}
          label="Initiatives"
          value={metrics.openTodos}
          detail={`${metrics.overdueTodos} overdue · ${metrics.soonTodos} due soon · ${metrics.completionRate}% complete`}
          tint="var(--ap-orange)"
          trailing={sparklines?.initiatives && sparklines.initiatives.length > 1
            ? <Sparkline data={sparklines.initiatives} color={chartColors.warning} />
            : undefined}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardCard
          title={mode === 'ceo' ? 'Operating trajectory' : 'Personal outcome trajectory'}
          right={<MiniBadge color={healthColor}>{healthLabel}</MiniBadge>}
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={burnupData} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="reportProgressFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.accent} stopOpacity={0.24} />
                    <stop offset="95%" stopColor={chartColors.accent} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={chartAxisTick} axisLine={false} tickLine={false} />
                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={34} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area type="monotone" dataKey="target" stroke={chartColors.reference} strokeDasharray="4 4" fill="transparent" name="Target" />
                <Area type="monotone" dataKey="progress" stroke={chartColors.accent} fill="url(#reportProgressFill)" strokeWidth={2.5} name="Progress" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>

        <DashboardCard title="Status mix" right={<MiniBadge color="var(--ap-accent)">{metrics.krCount} KRs</MiniBadge>}>
          <div className="grid min-h-[260px] items-center gap-3 md:grid-cols-[180px_1fr]">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusChartData} innerRadius={54} outerRadius={78} paddingAngle={2} dataKey="value">
                    {statusChartData.map((entry) => (
                      <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {statusChartData.length === 0 ? (
                <p className="text-body-sm text-muted-foreground">No key results in this scope.</p>
              ) : statusChartData.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[item.key] }} />
                    {item.name}
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </DashboardCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <DashboardCard title="Recommendation engine" right={<Lightbulb className="h-4 w-4 text-muted-foreground" aria-hidden />}>
          <div className="space-y-2">
            {recommendations.map((item, index) => (
              <RecommendationRow key={`${item.title}-${index}`} item={item} />
            ))}
          </div>
        </DashboardCard>

        <DashboardCard title="Progress distribution" right={<MiniBadge color="var(--ap-green)">{metrics.completedTodos} done</MiniBadge>}>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={progressBands} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={chartAxisTick} axisLine={false} tickLine={false} />
                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} width={34} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="objectives" name="Objectives" fill={chartColors.accent} radius={[4, 4, 0, 0]} />
                <Bar dataKey="krs" name="KRs" fill={chartColors.success} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <DashboardCard title={mode === 'ceo' ? 'Department heatmap' : 'Team context'}>
          <CompactRankTable
            rows={topDepartments.map((row) => ({
              name: row.name,
              primary: `${row.progress}%`,
              secondary: `${row.risk} risk`,
              meter: row.riskRate,
              danger: row.overdue > 0,
            }))}
            empty="No department data"
          />
        </DashboardCard>

        <DashboardCard title={mode === 'ceo' ? 'Owner workload' : 'People linked to your scope'}>
          <CompactRankTable
            rows={topOwners.map((row) => ({
              name: row.name,
              primary: `${row.openTodos} open`,
              secondary: `${row.risk} risk · ${row.progress}%`,
              meter: Math.min(100, row.loadScore * 10),
              danger: row.overdue > 0,
            }))}
            empty="No owner data"
          />
        </DashboardCard>

        <DashboardCard title="Plan health">
          <CompactRankTable
            rows={planRows.slice(0, 6).map((row) => ({
              name: row.name,
              primary: `${row.progress}%`,
              secondary: `${row.krs} KRs · ${row.risk} risk`,
              meter: row.progress,
              danger: row.risk > 0,
            }))}
            empty="No plan data"
          />
        </DashboardCard>
      </div>
    </section>
  )
}

// DashboardCard, InsightTile, MiniBadge, KpiCard live in components/ui/dashboard
// so the main /dashboard page can reuse the same primitives.

function RecommendationRow({ item }: { item: Recommendation }) {
  const toneColor = STATUS_COLORS[item.tone]
  const icon =
    item.tone === 'on_track' ? <CheckCircle2 className="h-4 w-4" aria-hidden /> :
    item.tone === 'pending' || item.tone === 'not_measurable' ? <Clock3 className="h-4 w-4" aria-hidden /> :
    <AlertTriangle className="h-4 w-4" aria-hidden />
  const body = (
    <div className="flex gap-3 rounded-card border p-3 transition hover:bg-muted/40" style={{ borderColor: 'var(--ap-border)' }}>
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ap-radius-sm)]" style={{ background: chartAlpha(toneColor, 12), color: toneColor }}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-body-sm font-semibold text-foreground">{item.title}</div>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.detail}</p>
      </div>
    </div>
  )
  return item.href ? <Link href={item.href}>{body}</Link> : body
}

function CompactRankTable({
  rows,
  empty,
}: {
  rows: Array<{ name: string; primary: string; secondary: string; meter: number; danger?: boolean }>
  empty: string
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-body-sm text-muted-foreground">{empty}</p>
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.name} className="space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-body-sm font-medium text-foreground">{row.name}</p>
              <p className="text-caption text-muted-foreground">{row.secondary}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: row.danger ? 'var(--ap-red)' : 'var(--ap-fg)' }}>
              {row.primary}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--ap-bg-sunken)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${clampPct(row.meter)}%`,
                background: row.danger ? 'var(--ap-red)' : 'var(--ap-accent)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
