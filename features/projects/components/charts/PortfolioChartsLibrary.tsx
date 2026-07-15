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
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import type { PortfolioDashboardData, PortfolioProjectRow } from '@/lib/projects/portfolio-dashboard'
import { ChartWrapper, chartColors, chartTooltip } from './ChartWrapper'

interface Props {
  data: PortfolioDashboardData
}

const chartMargin = { top: 10, right: 12, left: -12, bottom: 0 }
const axisTick = { fontSize: 11, fill: chartColors.text }

export function PortfolioChartsLibrary({ data }: Props) {
  const bubbles = useMemo(
    () =>
      data.projects.map((p) => ({
        name: p.code,
        spi: p.spi ?? 0,
        cpi: p.cpi ?? 0,
        value: p.contractValue ?? 1,
        rag: p.ragStatus,
      })),
    [data.projects],
  )

  return (
    <div className="space-y-4">
      <PortfolioRagWall projects={data.projects} totalSlipDays={data.summary.totalDelayDays} />

      <div className="grid gap-4 xl:grid-cols-2">
        <PortfolioBubbleChart data={bubbles} />
        <PortfolioParetoChart data={data.delayReasons} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <PortfolioDelayByOwner data={data.delayByOwner} />
        <PortfolioClientHealth value={data.clientHealthScore} />
        <PortfolioBenchForecast data={data.capacityForecast} />
      </div>
    </div>
  )
}

function PortfolioRagWall({ projects, totalSlipDays }: { projects: PortfolioProjectRow[]; totalSlipDays: number }) {
  return (
    <ChartWrapper id="C1" title="Portfolio RAG Wall" description="RAG, percent, SPI, and slip days.">
      <div className="grid h-full content-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <div key={p.id} className={cn('rounded-md border p-3', ragBg(p.ragStatus))}>
            <div className="truncate text-body-sm font-semibold text-ink-primary">{p.code}</div>
            <div className="truncate text-body-xs text-ink-secondary">{p.name}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-body-xs">
              <Metric label="RAG" value={p.ragStatus} />
              <Metric label="Complete" value={`${Math.round(p.percentComplete)}%`} />
              <Metric label="Slip" value={`${p.totalSlipDays}d`} />
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(100, p.percentComplete)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </ChartWrapper>
  )
}

function PortfolioDelayByOwner({ data }: { data: PortfolioDashboardData['delayByOwner'] }) {
  return (
    <ChartWrapper id="C6" title="Delay Days by Owner">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} vertical={false} />
          <XAxis dataKey="owner" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltip} />
          <Bar dataKey="days" fill={chartColors.orange} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function PortfolioClientHealth({ value }: { value: number }) {
  return (
    <ChartWrapper id="C9" title="Client Health Score">
      <div className="flex h-full items-center justify-center">
        <div
          className="relative flex size-44 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${value >= 80 ? chartColors.green : value >= 60 ? chartColors.orange : chartColors.red} ${value * 3.6}deg, var(--ap-bg-sunken) 0)` }}
        >
          <div className="flex size-32 flex-col items-center justify-center rounded-full bg-surface-card">
            <div className="text-[32px] font-semibold text-ink-primary">{value}</div>
            <div className="text-body-xs text-ink-tertiary">Health</div>
          </div>
        </div>
      </div>
    </ChartWrapper>
  )
}

function PortfolioBubbleChart({ data }: { data: Array<{ name: string; spi: number; cpi: number; value: number; rag: string }> }) {
  return (
    <ChartWrapper id="C17" title="Portfolio Bubble" description="X=SPI, Y=CPI, size=value, color=RAG.">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} />
          <XAxis dataKey="spi" tick={axisTick} axisLine={false} tickLine={false} domain={[0.7, 1.2]} />
          <YAxis dataKey="cpi" tick={axisTick} axisLine={false} tickLine={false} domain={[0.7, 1.2]} />
          <ZAxis dataKey="value" range={[80, 600]} />
          <Tooltip contentStyle={chartTooltip} />
          <Scatter data={data}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={ragColor(entry.rag)} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function PortfolioParetoChart({ data }: { data: PortfolioDashboardData['delayReasons'] }) {
  return (
    <ChartWrapper id="C18" title="Root Cause Pareto" description="Ranked reason days with cumulative percentage.">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} vertical={false} />
          <XAxis dataKey="reason" tick={axisTick} axisLine={false} tickLine={false} />
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

function PortfolioBenchForecast({ data }: { data: PortfolioDashboardData['capacityForecast'] }) {
  return (
    <ChartWrapper id="C20" title="Bench Forecast" description="12-week capacity forecast.">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={chartMargin}>
          <CartesianGrid stroke={chartColors.border} vertical={false} />
          <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={chartTooltip} />
          <Area dataKey="allocated" stackId="1" stroke={chartColors.blue} fill="rgba(0,122,255,0.22)" />
          <Area dataKey="bench" stackId="1" stroke={chartColors.green} fill="rgba(52,199,89,0.20)" />
          <Legend />
        </AreaChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-ink-tertiary">{label}</div>
      <div className="font-semibold text-ink-primary">{value}</div>
    </div>
  )
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
