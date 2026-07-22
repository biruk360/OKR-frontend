'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { buildProjectOverviewReport } from '@/lib/projects/project-overview'
import type { ActivityStatus } from '../../types'
import type { ProjectDetail } from '../../hooks/useProject'
import { ChartWrapper, chartColors, chartTooltip } from './ChartWrapper'

interface ProjectChartsLibraryProps {
  project: ProjectDetail
}

const STATUS_COLORS: Record<ActivityStatus, string> = {
  NOT_STARTED: '#a1a1aa',
  STARTED: chartColors.blue,
  FINISHED: '#38bdf8',
  APPROVAL_REQUESTED: chartColors.orange,
  APPROVED: chartColors.green,
  REJECTED: chartColors.red,
}

export function ProjectChartsLibrary({ project }: ProjectChartsLibraryProps) {
  const data = useMemo(() => buildProjectOverviewReport(project), [project])

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <ChartWrapper id="activity-status" title="Activity status distribution" description="Current number of activities in each workflow status." height={220}>
        <ChartEmptyGuard empty={!data.statusDistribution.length} message="No activities are available.">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.statusDistribution} dataKey="value" nameKey="name" innerRadius={48} outerRadius={76} paddingAngle={2}>
                {data.statusDistribution.map((entry) => <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />)}
              </Pie>
              <Tooltip contentStyle={chartTooltip} />
              <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartEmptyGuard>
      </ChartWrapper>

      <ChartWrapper id="phase-completion" title="Phase completion" description="Weighted completion stored for each project phase." height={220}>
        <HorizontalBarChart data={data.phaseCompletion} dataKey="completion" unit="%" />
      </ChartWrapper>

      <ChartWrapper id="schedule-delay-owner" title="Schedule delay by responsible party" description="Total baseline slip days for delayed activities, grouped by responsible party." height={220}>
        <ChartEmptyGuard empty={!data.delayByOwner.length} message="No baseline schedule delays are recorded.">
          <VerticalBarChart data={data.delayByOwner} bars={[['days', 'Slip days', chartColors.red]]} />
        </ChartEmptyGuard>
      </ChartWrapper>

      <ChartWrapper id="hours-by-phase" title="Estimated and actual hours by phase" description="Only activities with entered hour values are included." height={220}>
        <ChartEmptyGuard empty={!data.hoursByPhase.length} message="No estimated or actual hours have been entered.">
          <VerticalBarChart data={data.hoursByPhase} bars={[
            ['estimated', 'Estimated hours', chartColors.muted],
            ['actual', 'Actual hours', chartColors.blue],
          ]} />
        </ChartEmptyGuard>
      </ChartWrapper>

      <ChartWrapper id="section-completion" title="Section completion" description="Weighted completion for each project section." height={Math.max(220, Math.min(360, data.sectionCompletion.length * 30 + 54))}>
        <HorizontalBarChart data={data.sectionCompletion} dataKey="completion" unit="%" />
      </ChartWrapper>

      <ChartWrapper id="risk-and-priority" title="Activity risk and priority profile" description="Counts use the current risk and priority values entered on activities." height={220}>
        <ChartEmptyGuard empty={!data.riskPriority.length} message="No risk or priority values have been entered.">
          <VerticalBarChart data={data.riskPriority} bars={[
            ['risk', 'Risk', chartColors.red],
            ['priority', 'Priority', chartColors.orange],
          ]} />
        </ChartEmptyGuard>
      </ChartWrapper>

      {data.costByPhase.length > 0 && (
        <ChartWrapper id="cost-by-phase" title="Estimated and actual cost by phase" description={`Entered project costs in ${project.currency}.`} height={220}>
          <VerticalBarChart data={data.costByPhase} bars={[
            ['estimated', 'Estimated cost', chartColors.muted],
            ['actual', 'Actual cost', chartColors.green],
          ]} />
        </ChartWrapper>
      )}

      {data.estimateAccuracy.length > 0 && (
        <ChartWrapper id="estimate-accuracy" title="Estimated hours compared with actual hours" description="Each point is an activity containing both estimated and actual hours." height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={chartMargin}>
              <CartesianGrid stroke={chartColors.border} />
              <XAxis dataKey="estimated" name="Estimated hours" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis dataKey="actual" name="Actual hours" tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartTooltip} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={data.estimateAccuracy} fill={chartColors.blue} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartWrapper>
      )}
    </div>
  )
}

function HorizontalBarChart({ data, dataKey, unit }: { data: Array<Record<string, string | number>>; dataKey: string; unit?: string }) {
  return (
    <ChartEmptyGuard empty={!data.length} message="No report data is available.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 22, left: 16, bottom: 0 }}>
          <CartesianGrid stroke={chartColors.border} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} unit={unit} />
          <YAxis dataKey="name" type="category" width={138} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltip} formatter={(value: number) => `${value}${unit ?? ''}`} />
          <Bar dataKey={dataKey} fill={chartColors.blue} radius={[0, 4, 4, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </ChartEmptyGuard>
  )
}

function VerticalBarChart({ data, bars }: { data: Array<Record<string, string | number>>; bars: Array<[string, string, string]> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={chartMargin}>
        <CartesianGrid stroke={chartColors.border} vertical={false} />
        <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} interval={0} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={chartTooltip} />
        <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
        {bars.map(([key, name, color]) => <Bar key={key} dataKey={key} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={30} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}

function ChartEmptyGuard({ empty, message, children }: { empty: boolean; message: string; children: React.ReactNode }) {
  if (!empty) return <>{children}</>
  return <div className="flex h-full items-center justify-center text-center text-body-sm text-ink-tertiary">{message}</div>
}

const chartMargin = { top: 6, right: 12, left: -10, bottom: 0 }
const axisTick = { fontSize: 10, fill: chartColors.text }
