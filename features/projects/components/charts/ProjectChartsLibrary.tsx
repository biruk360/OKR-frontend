'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import type { ActivityNode, ProjectDetail } from '../../hooks/useProject'
import { ChartWrapper, HeatmapGrid, chartColors, chartTooltip } from './ChartWrapper'

interface ProjectChartsLibraryProps {
  project: ProjectDetail
}

interface FlatActivity {
  id: string
  title: string
  phase: string
  status: string
  percentComplete: number
  slipDays: number
  estimatedHours: number | null
  actualHours: number | null
  risk: string | null
}

export function ProjectChartsLibrary({ project }: ProjectChartsLibraryProps) {
  const data = useMemo(() => buildChartData(project), [project])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <C1 data={data} />
        <C24 data={data} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <C2 data={data} />
        <C3 data={data} />
        <C4 data={data} />
        <C5 data={data} />
        <C6 data={data} />
        <C7 data={data} />
        <C8 data={data} />
        <C9 data={data} />
        <C10 data={data} />
        <C11 data={data} />
        <C12 data={data} />
        <C13 data={data} />
        <C14 data={data} />
        <C15 data={data} />
        <C16 data={data} />
        <C17 data={data} />
        <C18 data={data} />
        <C19 data={data} />
        <C20 data={data} />
        <C21 data={data} />
        <C22 data={data} />
        <C23 data={data} />
      </div>
    </div>
  )
}

function C1({ data }: { data: ChartData }) {
  const cards = [
    { label: data.project.name, rag: data.project.ragStatus, pct: data.project.percentComplete, spi: data.project.spi ?? 0, slip: data.totalSlipDays },
  ]
  return (
    <ChartWrapper id="C1" title="Portfolio RAG Wall" description="RAG, percent, SPI, and slip days.">
      <div className="grid h-full content-start gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <div key={card.label} className={cn('rounded-md border p-3', ragBg(card.rag))}>
            <div className="truncate text-body-sm font-semibold text-ink-primary">{card.label}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-body-xs">
              <Metric label="RAG" value={card.rag} />
              <Metric label="Complete" value={`${Math.round(card.pct)}%`} />
              <Metric label="Slip" value={`${card.slip}d`} />
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(100, card.pct)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </ChartWrapper>
  )
}

function C2({ data }: { data: ChartData }) {
  return (
    <ChartWrapper id="C2" title="Project Gantt" description="Custom Epic D timeline surface." height={220}>
      <div className="h-full space-y-2 overflow-auto">
        {data.ganttRows.map((row) => (
          <div key={row.name} className="grid grid-cols-[120px_1fr] items-center gap-2">
            <div className="truncate text-body-xs text-ink-secondary">{row.name}</div>
            <div className="relative h-5 rounded bg-surface-muted">
              <div className="absolute top-1 h-3 rounded bg-primary-500" style={{ left: `${row.start}%`, width: `${row.width}%` }} />
            </div>
          </div>
        ))}
      </div>
    </ChartWrapper>
  )
}

function C3({ data }: { data: ChartData }) {
  return <LineCard id="C3" title="SPI/CPI Trend" data={data.trend} lines={[['spi', chartColors.blue], ['cpi', chartColors.green]]} reference={1} />
}

function C4({ data }: { data: ChartData }) {
  return (
    <ChartWrapper id="C4" title="Planned vs Actual S-Curve" description="Cumulative baseline plan vs actual completion.">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.trend} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} vertical={false} />
          <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltip} />
          <Area dataKey="planned" stroke={chartColors.muted} fill="rgba(142,142,147,0.18)" name="Planned" />
          <Area dataKey="actual" stroke={chartColors.blue} fill="rgba(0,122,255,0.16)" name="Actual" />
          <ReferenceLine x="W4" stroke={chartColors.red} strokeDasharray="3 3" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function C5({ data }: { data: ChartData }) {
  return <BarCard id="C5" title="Milestone Completion" data={data.phaseCompletion} dataKey="complete" layout="vertical" />;
}

function C6({ data }: { data: ChartData }) {
  return <BarCard id="C6" title="Delay Days by Owner" data={data.delayOwners} dataKey="days" />;
}

function C7({ data }: { data: ChartData }) {
  return <DonutCard id="C7" title="Delay Reason Breakdown" data={data.delayReasons} />;
}

function C8({ data }: { data: ChartData }) {
  return <LineCard id="C8" title="Individual Performance Trend" data={data.peopleTrend} lines={[['completion', chartColors.blue], ['accuracy', chartColors.green], ['idle', chartColors.orange]]} />;
}

function C9({ data }: { data: ChartData }) {
  return <GaugeCard id="C9" title="Client Health Score" value={data.clientHealth} />;
}

function C10({ data }: { data: ChartData }) {
  return (
    <ChartWrapper id="C10" title="Sprint Velocity" description="Committed vs completed, with velocity line.">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data.sprints} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} vertical={false} />
          <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltip} />
          <Bar dataKey="committed" fill={chartColors.muted} />
          <Bar dataKey="completed" fill={chartColors.green} />
          <Line dataKey="velocity" stroke={chartColors.blue} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function C11({ data }: { data: ChartData }) {
  return <HeatCard id="C11" title="Resource Capacity Heatmap" x={data.weeks} y={data.people} value={(y, x) => data.capacity[y]?.[x] ?? 0} />;
}

function C12({ data }: { data: ChartData }) {
  return (
    <ChartWrapper id="C12" title="Estimate Accuracy Scatter" description="45-degree line marks perfect estimates.">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} />
          <XAxis dataKey="estimate" name="Estimate" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis dataKey="actual" name="Actual" tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltip} />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 40, y: 40 }]} stroke={chartColors.muted} strokeDasharray="4 4" />
          <Scatter data={data.estimateScatter} fill={chartColors.blue} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function C13({ data }: { data: ChartData }) {
  return <HeatCard id="C13" title="Idle Days Heatmap" x={data.days} y={data.people} value={(y, x) => data.idle[y]?.[x] ?? 0} />;
}

function C14({ data }: { data: ChartData }) {
  return <LineCard id="C14" title="Sprint Burndown" data={data.burndown} lines={[['remaining', chartColors.red], ['ideal', chartColors.muted]]} />;
}

function C15({ data }: { data: ChartData }) {
  return <BarCard id="C15" title="Team Completion Distribution" data={data.teamCompletion} dataKey="complete" layout="vertical" />;
}

function C16({ data }: { data: ChartData }) {
  return <HeatCard id="C16" title="Scrum Attendance Heatmap" x={data.days} y={data.people} value={(y, x) => data.attendance[y]?.[x] ?? 0} />;
}

function C17({ data }: { data: ChartData }) {
  return (
    <ChartWrapper id="C17" title="Portfolio Bubble" description="X=SPI, Y=CPI, size=value, color=RAG.">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} />
          <XAxis dataKey="spi" tick={axisTick} axisLine={false} tickLine={false} domain={[0.7, 1.2]} />
          <YAxis dataKey="cpi" tick={axisTick} axisLine={false} tickLine={false} domain={[0.7, 1.2]} />
          <ZAxis dataKey="value" range={[80, 600]} />
          <Tooltip contentStyle={chartTooltip} />
          <Scatter data={data.bubbles}>
            {data.bubbles.map((entry) => <Cell key={entry.name} fill={ragColor(entry.rag)} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function C18({ data }: { data: ChartData }) {
  return (
    <ChartWrapper id="C18" title="Root Cause Pareto" description="Ranked reason days with cumulative percentage.">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data.pareto} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} vertical={false} />
          <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltip} />
          <Bar yAxisId="left" dataKey="days" fill={chartColors.orange} />
          <Line yAxisId="right" dataKey="cumulative" stroke={chartColors.blue} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function C19({ data }: { data: ChartData }) {
  return <BarCard id="C19" title="Estimator Bias" data={data.estimatorBias} dataKey="bias" />;
}

function C20({ data }: { data: ChartData }) {
  return (
    <ChartWrapper id="C20" title="Bench Forecast" description="12-week capacity forecast.">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.capacityForecast} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} vertical={false} />
          <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltip} />
          <Area dataKey="allocated" stackId="1" stroke={chartColors.blue} fill="rgba(0,122,255,0.22)" />
          <Area dataKey="bench" stackId="1" stroke={chartColors.green} fill="rgba(52,199,89,0.20)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function C21({ data }: { data: ChartData }) {
  return <LineCard id="C21" title="Approval Latency Trend" data={data.latency} lines={[['days', chartColors.orange]]} />;
}

function C22({ data }: { data: ChartData }) {
  return <LineCard id="C22" title="Scope Volatility" data={data.scope} lines={[['count', chartColors.blue], ['impact', chartColors.red]]} />;
}

function C23({ data }: { data: ChartData }) {
  return <BarCard id="C23" title="Cycle Time Distribution" data={data.cycleHistogram} dataKey="count" />;
}

function C24({ data }: { data: ChartData }) {
  const delta = Math.round(data.project.percentComplete - data.project.percentPlanned)
  return (
    <ChartWrapper id="C24" title="Project Completion Ring" description="Image 9 parity ring and six KPI tiles." height={340}>
      <div className="grid h-full gap-4 md:grid-cols-[260px_1fr]">
        <div className="rounded-md border border-border p-4">
          <div className="text-body-xs font-semibold uppercase text-ink-secondary">Project Completion</div>
          <div className="mt-5 flex justify-center">
            <div className="relative flex size-40 items-center justify-center rounded-full" style={{ background: `conic-gradient(${chartColors.blue} ${data.project.percentComplete * 3.6}deg, var(--ap-bg-sunken) 0)` }}>
              <div className="flex size-28 flex-col items-center justify-center rounded-full bg-surface-card">
                <span className="text-[30px] font-semibold text-ink-primary">{data.project.percentComplete.toFixed(1)}%</span>
              </div>
            </div>
          </div>
          <div className="mt-4 text-center text-body-sm font-medium text-warning-700">{data.project.ragStatus === 'GREEN' ? 'ON TRACK' : 'AT RISK'}</div>
          <div className="mt-1 text-center text-body-xs text-ink-tertiary">{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% {delta >= 0 ? 'ahead' : 'behind'}</div>
          <div className="text-center text-body-xs text-ink-tertiary">— Expected {data.project.percentPlanned.toFixed(1)}%</div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.kpis.map((kpi) => <KpiTile key={kpi.label} {...kpi} />)}
        </div>
      </div>
    </ChartWrapper>
  )
}

function LineCard({ id, title, data, lines, reference }: { id: string; title: string; data: any[]; lines: Array<[string, string]>; reference?: number }) {
  return (
    <ChartWrapper id={id} title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} vertical={false} />
          <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltip} />
          {reference != null && <ReferenceLine y={reference} stroke={chartColors.red} strokeDasharray="4 4" />}
          {lines.map(([key, color]) => <Line key={key} dataKey={key} stroke={color} strokeWidth={2} dot={false} />)}
          <Legend />
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function BarCard({ id, title, data, dataKey, layout }: { id: string; title: string; data: any[]; dataKey: string; layout?: 'vertical' }) {
  const vertical = layout === 'vertical'
  return (
    <ChartWrapper id={id} title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={layout} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} horizontal={!vertical} vertical={vertical} />
          {vertical ? <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} /> : <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />}
          {vertical ? <YAxis dataKey="name" type="category" tick={axisTick} axisLine={false} tickLine={false} width={96} /> : <YAxis tick={axisTick} axisLine={false} tickLine={false} />}
          <Tooltip contentStyle={chartTooltip} />
          <Bar dataKey={dataKey} fill={chartColors.blue} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function DonutCard({ id, title, data }: { id: string; title: string; data: Array<{ name: string; value: number }> }) {
  const colors = [chartColors.blue, chartColors.orange, chartColors.green, chartColors.red, chartColors.purple]
  return (
    <ChartWrapper id={id} title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2}>
            {data.map((entry, i) => <Cell key={entry.name} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip contentStyle={chartTooltip} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function GaugeCard({ id, title, value }: { id: string; title: string; value: number }) {
  return (
    <ChartWrapper id={id} title={title}>
      <div className="flex h-full items-center justify-center">
        <div className="relative flex size-44 items-center justify-center rounded-full" style={{ background: `conic-gradient(${value >= 80 ? chartColors.green : value >= 60 ? chartColors.orange : chartColors.red} ${value * 3.6}deg, var(--ap-bg-sunken) 0)` }}>
          <div className="flex size-32 flex-col items-center justify-center rounded-full bg-surface-card">
            <div className="text-[32px] font-semibold text-ink-primary">{value}</div>
            <div className="text-body-xs text-ink-tertiary">Health</div>
          </div>
        </div>
      </div>
    </ChartWrapper>
  )
}

function HeatCard({ id, title, x, y, value }: { id: string; title: string; x: string[]; y: string[]; value: (yIndex: number, xIndex: number) => number }) {
  return (
    <ChartWrapper id={id} title={title}>
      <HeatmapGrid xLabels={x} yLabels={y} value={value} />
    </ChartWrapper>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><div className="text-ink-tertiary">{label}</div><div className="font-semibold text-ink-primary">{value}</div></div>
}

function KpiTile({ label, value, helper, tone }: { label: string; value: number | string; helper: string; tone: 'blue' | 'green' | 'orange' | 'red' | 'muted' }) {
  return (
    <div className="rounded-md border border-border bg-surface-hover p-3">
      <div className="text-body-xs font-semibold uppercase text-ink-secondary">{label}</div>
      <div className="mt-2 text-[28px] font-semibold" style={{ color: toneColor(tone) }}>{value}</div>
      <div className="text-body-xs text-ink-tertiary">{helper}</div>
    </div>
  )
}

interface ChartData {
  project: ProjectDetail
  activities: FlatActivity[]
  totalSlipDays: number
  trend: any[]
  phaseCompletion: any[]
  delayOwners: any[]
  delayReasons: any[]
  peopleTrend: any[]
  clientHealth: number
  sprints: any[]
  weeks: string[]
  days: string[]
  people: string[]
  capacity: number[][]
  idle: number[][]
  attendance: number[][]
  estimateScatter: any[]
  burndown: any[]
  teamCompletion: any[]
  bubbles: any[]
  pareto: any[]
  estimatorBias: any[]
  capacityForecast: any[]
  latency: any[]
  scope: any[]
  cycleHistogram: any[]
  ganttRows: any[]
  kpis: Array<{ label: string; value: number | string; helper: string; tone: 'blue' | 'green' | 'orange' | 'red' | 'muted' }>
}

function buildChartData(project: ProjectDetail): ChartData {
  const activities = flatten(project)
  const todo = activities.filter((a) => a.status === 'NOT_STARTED').length
  const inProgress = activities.filter((a) => a.status === 'STARTED' || a.status === 'APPROVAL_REQUESTED').length
  const done = activities.filter((a) => a.status === 'FINISHED' || a.status === 'APPROVED').length
  const blocked = activities.filter((a) => a.risk === 'HIGH').length
  const delayed = activities.filter((a) => a.slipDays > 0).length
  const totalSlipDays = activities.reduce((sum, a) => sum + a.slipDays, 0)
  const people = ['Biruk', 'Meklit', 'Dawit', 'Eyob']
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6']
  const trend = weeks.map((name, i) => ({
    name,
    planned: Math.min(100, project.percentPlanned * (i + 1) / weeks.length),
    actual: Math.min(100, project.percentComplete * (i + 1) / weeks.length),
    spi: 0.88 + i * 0.03,
    cpi: 0.96 + (i % 3) * 0.02,
  }))
  const reasons = [
    { name: 'Client', days: Math.max(4, Math.round(totalSlipDays * 0.45)) },
    { name: 'Scope', days: Math.max(3, Math.round(totalSlipDays * 0.25)) },
    { name: 'Tech', days: Math.max(2, Math.round(totalSlipDays * 0.18)) },
    { name: 'Vendor', days: Math.max(1, Math.round(totalSlipDays * 0.12)) },
  ].sort((a, b) => b.days - a.days)
  let cumulative = 0
  const totalReasonDays = reasons.reduce((sum, row) => sum + row.days, 0) || 1
  return {
    project,
    activities,
    totalSlipDays,
    trend,
    phaseCompletion: project.phases.map((p) => ({ name: p.name, complete: Math.round(p.percentComplete) })),
    delayOwners: [{ name: 'Client', days: Math.round(totalSlipDays * 0.5) }, { name: '360G', days: Math.round(totalSlipDays * 0.3) }, { name: 'Shared', days: Math.round(totalSlipDays * 0.2) }],
    delayReasons: reasons.map((r) => ({ name: r.name, value: r.days })),
    peopleTrend: weeks.map((name, i) => ({ name, completion: 50 + i * 7, accuracy: 80 - i * 2, idle: Math.max(0, 18 - i * 3) })),
    clientHealth: Math.max(0, Math.min(100, 100 - totalSlipDays)),
    sprints: weeks.slice(0, 4).map((name, i) => ({ name, committed: 24 + i * 4, completed: 20 + i * 5, velocity: 20 + i * 4 })),
    weeks,
    days,
    people,
    capacity: matrix(people.length, weeks.length, (y, x) => 45 + y * 14 + x * 7),
    idle: matrix(people.length, days.length, (y, x) => (x + y) % 4 === 0 ? 100 : (x + y) % 3 === 0 ? 70 : 0),
    attendance: matrix(people.length, days.length, (y, x) => (x + y) % 5 === 0 ? 0 : (x + y) % 4 === 0 ? 70 : 100),
    estimateScatter: activities.slice(0, 12).map((a, i) => ({ estimate: a.estimatedHours ?? 4 + i * 2, actual: a.actualHours ?? 5 + i * 2.4 })),
    burndown: days.map((name, i) => ({ name, remaining: Math.max(0, 40 - i * 7), ideal: Math.max(0, 40 - i * 8) })),
    teamCompletion: people.map((name, i) => ({ name, complete: 55 + i * 11 })),
    bubbles: [{ name: project.name, spi: project.spi ?? 0.94, cpi: project.cpi ?? 1, value: project.contractValue ?? 100, rag: project.ragStatus }],
    pareto: reasons.map((row) => { cumulative += row.days; return { name: row.name, days: row.days, cumulative: Math.round((cumulative / totalReasonDays) * 100) } }),
    estimatorBias: people.map((name, i) => ({ name, bias: [1.4, 0.9, 1.1, 1.25][i] })),
    capacityForecast: Array.from({ length: 12 }, (_, i) => ({ name: `W${i + 1}`, allocated: 60 + (i % 4) * 8, bench: 40 - (i % 4) * 5 })),
    latency: weeks.map((name, i) => ({ name, days: 2 + (i % 4) })),
    scope: weeks.map((name, i) => ({ name, count: i + 1, impact: (i + 1) * 3 })),
    cycleHistogram: ['0-2', '3-5', '6-8', '9-12', '13+'].map((name, i) => ({ name, count: [4, 9, 6, 3, 1][i] })),
    ganttRows: project.phases.slice(0, 8).map((p, i) => ({ name: p.name, start: 5 + i * 7, width: Math.max(12, Math.min(45, p.percentComplete / 2)) })),
    kpis: [
      { label: 'To-Do', value: todo, helper: 'Backlog', tone: 'muted' },
      { label: 'In-Prog', value: inProgress, helper: 'Active', tone: 'orange' },
      { label: 'Done', value: done, helper: 'Completed', tone: 'green' },
      { label: 'Delayed', value: delayed, helper: 'Monitor', tone: delayed ? 'red' : 'muted' },
      { label: 'Blocked', value: blocked, helper: 'Critical', tone: blocked ? 'red' : 'muted' },
      { label: 'Confid', value: Math.round(project.confidence), helper: 'High Conf', tone: project.confidence >= 75 ? 'green' : 'orange' },
    ],
  }
}

function flatten(project: ProjectDetail): FlatActivity[] {
  const rows: FlatActivity[] = []
  for (const phase of project.phases) {
    for (const milestone of phase.milestones) {
      for (const activity of milestone.activities) push(rows, activity, phase.name)
    }
  }
  return rows
}

function push(rows: FlatActivity[], activity: ActivityNode, phase: string) {
  rows.push({ id: activity.id, title: activity.title, phase, status: activity.status, percentComplete: activity.percentComplete, slipDays: activity.slipDays, estimatedHours: activity.estimatedHours, actualHours: activity.actualHours, risk: activity.risk })
}

function matrix(rows: number, cols: number, fn: (row: number, col: number) => number) {
  return Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => fn(y, x)))
}

function ragColor(rag: string) {
  if (rag === 'GREEN') return chartColors.green
  if (rag === 'RED') return chartColors.red
  return chartColors.orange
}

function ragBg(rag: string) {
  if (rag === 'GREEN') return 'border-success-500/30 bg-success-50'
  if (rag === 'RED') return 'border-danger-500/30 bg-danger-50'
  return 'border-warning-500/30 bg-warning-50'
}

function toneColor(tone: 'blue' | 'green' | 'orange' | 'red' | 'muted') {
  if (tone === 'green') return chartColors.green
  if (tone === 'orange') return chartColors.orange
  if (tone === 'red') return chartColors.red
  if (tone === 'muted') return chartColors.text
  return chartColors.blue
}

const chartMargin = { top: 10, right: 12, left: -12, bottom: 0 }
const axisTick = { fontSize: 11, fill: chartColors.text }
