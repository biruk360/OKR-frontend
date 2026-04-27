'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

/* ────────────────────────────────────────────────────────────────────────────
 * Shared AP primitives
 * ──────────────────────────────────────────────────────────────────────── */

function APCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn('rounded-[14px] border bg-card overflow-hidden', className)}
      style={{ borderColor: 'var(--ap-border)' }}
    >
      {children}
    </section>
  )
}

function SectionHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--ap-border)' }}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
      {right}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Segmented control (Link-based, server rendered)
 * ──────────────────────────────────────────────────────────────────────── */

interface SegOption { label: string; value: string }
interface SegProps {
  options: SegOption[]
  current: string
  paramName: string
  basePath: string
  otherParams: Record<string, string | undefined>
}

function Segmented({ options, current, paramName, basePath, otherParams }: SegProps) {
  return (
    <div
      className="inline-flex items-center rounded-[10px] p-0.5 border"
      style={{ background: 'var(--ap-bg-sunken)', borderColor: 'var(--ap-border)' }}
    >
      {options.map((opt) => {
        const params = new URLSearchParams()
        for (const [k, v] of Object.entries(otherParams)) if (v) params.set(k, v)
        if (opt.value) params.set(paramName, opt.value)
        else params.delete(paramName)
        const href = params.toString() ? `${basePath}?${params}` : basePath
        const active = opt.value === current
        return (
          <Link
            key={opt.value || 'all'}
            href={href}
            className={cn(
              'inline-flex items-center h-6 px-2.5 rounded-[8px] text-[11px] font-medium transition',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </Link>
        )
      })}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * KPI cards (4-up)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AnalyticsKpis {
  totalObjectives: number
  avgProgress: number
  expectedProgress: number
  atRiskPct: number
  completionRate: number
}

function KpiStrip({ kpis }: { kpis: AnalyticsKpis }) {
  const pace = Math.round(kpis.avgProgress - kpis.expectedProgress)
  const atRiskColor = kpis.atRiskPct >= 30 ? 'var(--ap-red)' : kpis.atRiskPct >= 15 ? 'var(--ap-orange)' : 'var(--ap-green)'
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        { label: 'Total objectives', value: kpis.totalObjectives.toString(), sub: 'Active in selection' },
        { label: 'Average progress', value: `${kpis.avgProgress}%`, sub: `${pace >= 0 ? '+' : ''}${pace}pt vs expected ${kpis.expectedProgress}%`, color: pace >= 0 ? 'var(--ap-green)' : 'var(--ap-red)' },
        { label: 'At-risk %', value: `${kpis.atRiskPct}%`, sub: 'Of active KRs', color: atRiskColor },
        { label: 'Completion rate', value: `${kpis.completionRate}%`, sub: 'Objectives ≥ 75% progress' },
      ].map((k, i) => (
        <APCard key={i} className="ap-hover-lift">
          <div className="px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p
              className="mt-1.5 text-[28px] font-semibold tabular-nums leading-none"
              style={{ letterSpacing: '-0.02em', color: (k as any).color ?? 'var(--ap-fg)' }}
            >
              {k.value}
            </p>
            <p className="mt-2 text-[12px] text-muted-foreground">{k.sub}</p>
          </div>
        </APCard>
      ))}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Progress Trend (large SVG, burn-up vs expected vs confidence)
 * ──────────────────────────────────────────────────────────────────────── */

export interface TrendPoint { label: string; progress: number; confidence: number }

function ProgressTrend({ points, expectedAtNow }: { points: TrendPoint[]; expectedAtNow: number }) {
  const W = 640
  const H = 220
  const padL = 28, padR = 12, padT = 10, padB = 28

  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = Math.max(2, points.length)
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * innerW
  const y = (v: number) => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * innerH

  const burnup = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.progress).toFixed(1)}`).join(' ')
  const conf   = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.confidence).toFixed(1)}`).join(' ')
  const expected = `M ${x(0).toFixed(1)} ${y(0).toFixed(1)} L ${x(n - 1).toFixed(1)} ${y(expectedAtNow).toFixed(1)}`

  const gridYs = [0, 25, 50, 75, 100]

  return (
    <APCard>
      <SectionHeader
        right={
          <div className="flex items-center gap-1.5">
            <Legend color="var(--ap-accent)" label="Burn-up" />
            <Legend color="var(--ap-orange)" label="Confidence" dashed />
            <Legend color="var(--ap-fg-faint)" label="Expected" dotted />
          </div>
        }
      >
        Progress trend
      </SectionHeader>
      <div className="px-4 pt-3 pb-4">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="overflow-visible">
          {/* Grid */}
          {gridYs.map((g) => (
            <g key={g}>
              <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--ap-border)" strokeWidth={0.5} />
              <text x={4} y={y(g) + 3} fontSize={9} fill="var(--ap-fg-faint)" fontFamily="ui-monospace">{g}</text>
            </g>
          ))}
          {/* X labels (sparse) */}
          {points.map((p, i) =>
            i % Math.ceil(n / 6) === 0 ? (
              <text key={i} x={x(i)} y={H - 8} fontSize={9} fill="var(--ap-fg-faint)" textAnchor="middle">{p.label}</text>
            ) : null
          )}
          {/* Series */}
          <path d={expected} fill="none" stroke="var(--ap-fg-faint)" strokeWidth={1.5} strokeDasharray="2 4" />
          <path d={conf} fill="none" stroke="var(--ap-orange)" strokeWidth={2} strokeDasharray="5 3" strokeLinecap="round" />
          <path d={burnup} fill="none" stroke="var(--ap-accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {points.length > 0 && (
            <circle
              cx={x(n - 1)}
              cy={y(points[points.length - 1].progress)}
              r={4}
              fill="var(--ap-accent)"
              stroke="var(--ap-bg-raised)"
              strokeWidth={2}
            />
          )}
        </svg>
      </div>
    </APCard>
  )
}

function Legend({ color, label, dashed, dotted }: { color: string; label: string; dashed?: boolean; dotted?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
    >
      <span
        className="inline-block w-3 h-[2px] rounded-full"
        style={{
          background: dotted || dashed ? 'transparent' : color,
          borderTop: dashed ? `2px dashed ${color}` : dotted ? `2px dotted ${color}` : undefined,
        }}
      />
      {label}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Distribution donut
 * ──────────────────────────────────────────────────────────────────────── */

export interface DistributionData {
  onTrack: number
  atRisk: number
  offTrack: number
  done: number
}

function Donut({ data }: { data: DistributionData }) {
  const slices = [
    { key: 'onTrack', label: 'On track', value: data.onTrack, color: 'var(--ap-green)' },
    { key: 'atRisk', label: 'At risk', value: data.atRisk, color: 'var(--ap-orange)' },
    { key: 'offTrack', label: 'Off track', value: data.offTrack, color: 'var(--ap-red)' },
    { key: 'done', label: 'Done', value: data.done, color: 'var(--ap-accent)' },
  ]
  const total = Math.max(1, slices.reduce((s, x) => s + x.value, 0))

  const size = 160
  const stroke = 22
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <APCard>
      <SectionHeader>Distribution</SectionHeader>
      <div className="px-4 py-4 flex flex-col sm:flex-row items-center gap-5">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--ap-kr-bar-bg)" strokeWidth={stroke} fill="none" />
            {slices.map((s) => {
              const len = (s.value / total) * c
              const seg = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={s.color}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                />
              )
              offset += len
              return seg
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[24px] font-semibold tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>
              {slices.reduce((s, x) => s + x.value, 0)}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mt-1">Items</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5 w-full">
          {slices.map((s) => {
            const pct = Math.round((s.value / total) * 100)
            return (
              <div key={s.key} className="flex items-center gap-2 text-[12px]">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate">{s.label}</span>
                <span className="font-mono tabular-nums text-muted-foreground w-8 text-right">{s.value}</span>
                <span className="font-mono tabular-nums text-muted-foreground w-10 text-right">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </APCard>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Top contributors + Department performance tables
 * ──────────────────────────────────────────────────────────────────────── */

export interface ContributorRow {
  id: string
  name: string
  avatar?: string | null
  okrCount: number
  avgProgress: number
}
export interface DepartmentRow {
  id: string
  name: string
  objectiveCount: number
  avgProgress: number
}

function ContributorsTable({ rows }: { rows: ContributorRow[] }) {
  return (
    <APCard>
      <SectionHeader>Top contributors</SectionHeader>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-[12px] text-muted-foreground text-center">No contributors yet.</div>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
          {rows.slice(0, 8).map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-5">{(i + 1).toString().padStart(2, '0')}</span>
              {r.avatar ? (
                <img src={r.avatar} alt="" className="size-7 rounded-full object-cover" />
              ) : (
                <span
                  className="flex size-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: 'var(--ap-accent)' }}
                >
                  {r.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{r.name}</p>
                <p className="text-[11px] text-muted-foreground">{r.okrCount} OKR{r.okrCount !== 1 ? 's' : ''}</p>
              </div>
              <span className="text-[12px] font-mono tabular-nums text-muted-foreground">{r.avgProgress}%</span>
              <div className="hidden sm:block h-1.5 w-20 rounded-full overflow-hidden" style={{ background: 'var(--ap-kr-bar-bg)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(r.avgProgress, 100)}%`,
                    background: r.avgProgress >= 75 ? 'var(--ap-green)' : r.avgProgress >= 35 ? 'var(--ap-orange)' : 'var(--ap-red)',
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </APCard>
  )
}

function DepartmentTable({ rows }: { rows: DepartmentRow[] }) {
  return (
    <APCard>
      <SectionHeader>Department performance</SectionHeader>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-[12px] text-muted-foreground text-center">No departments configured.</div>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
          {rows.map((d) => (
            <li key={d.id} className="px-4 py-2.5">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground">{d.objectiveCount} objective{d.objectiveCount !== 1 ? 's' : ''}</p>
                </div>
                <span className="text-[12px] font-mono tabular-nums text-muted-foreground">{d.avgProgress}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--ap-kr-bar-bg)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(d.avgProgress, 100)}%`,
                    background: d.avgProgress >= 75 ? 'var(--ap-green)' : d.avgProgress >= 35 ? 'var(--ap-orange)' : 'var(--ap-red)',
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </APCard>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Filter strip
 * ──────────────────────────────────────────────────────────────────────── */

export interface AnalyticsFilters {
  timeframe: string  // '' = active, or timeframe id
  department: string // '' = all
  level: string      // '' = all, 'COMPANY', 'DEPARTMENT', 'INDIVIDUAL'
}

interface FilterStripProps {
  filters: AnalyticsFilters
  timeframes: Array<{ id: string; name: string }>
  departments: Array<{ id: string; name: string }>
}

function FilterStrip({ filters, timeframes, departments }: FilterStripProps) {
  const others = (exclude: keyof AnalyticsFilters) => {
    const o: Record<string, string | undefined> = {}
    if (exclude !== 'timeframe' && filters.timeframe) o.timeframe = filters.timeframe
    if (exclude !== 'department' && filters.department) o.department = filters.department
    if (exclude !== 'level' && filters.level) o.level = filters.level
    return o
  }
  const tfOpts: SegOption[] = [{ label: 'Active', value: '' }, ...timeframes.map(t => ({ label: t.name, value: t.id }))]
  const deptOpts: SegOption[] = [{ label: 'All', value: '' }, ...departments.map(d => ({ label: d.name, value: d.id }))]
  const lvlOpts: SegOption[] = [
    { label: 'All', value: '' },
    { label: 'Company', value: 'COMPANY' },
    { label: 'Department', value: 'DEPARTMENT' },
    { label: 'Individual', value: 'INDIVIDUAL' },
  ]

  return (
    <APCard>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <FilterGroup label="Timeframe">
          <Segmented options={tfOpts} current={filters.timeframe} paramName="timeframe" basePath="/dashboard/analytics" otherParams={others('timeframe')} />
        </FilterGroup>
        <FilterGroup label="Department">
          <Segmented options={deptOpts.slice(0, 5)} current={filters.department} paramName="department" basePath="/dashboard/analytics" otherParams={others('department')} />
        </FilterGroup>
        <FilterGroup label="Level">
          <Segmented options={lvlOpts} current={filters.level} paramName="level" basePath="/dashboard/analytics" otherParams={others('level')} />
        </FilterGroup>
      </div>
    </APCard>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Top-level
 * ──────────────────────────────────────────────────────────────────────── */

export interface AppleAnalyticsProps {
  filters: AnalyticsFilters
  timeframes: Array<{ id: string; name: string }>
  departments: Array<{ id: string; name: string }>
  kpis: AnalyticsKpis
  trendPoints: TrendPoint[]
  expectedAtNow: number
  distribution: DistributionData
  contributors: ContributorRow[]
  departmentRows: DepartmentRow[]
}

export default function AppleAnalytics(props: AppleAnalyticsProps) {
  return (
    <div className="space-y-3">
      <FilterStrip filters={props.filters} timeframes={props.timeframes} departments={props.departments} />
      <KpiStrip kpis={props.kpis} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProgressTrend points={props.trendPoints} expectedAtNow={props.expectedAtNow} />
        </div>
        <Donut data={props.distribution} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ContributorsTable rows={props.contributors} />
        <DepartmentTable rows={props.departmentRows} />
      </div>
    </div>
  )
}
