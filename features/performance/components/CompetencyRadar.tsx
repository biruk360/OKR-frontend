'use client'

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'

// Apple Pro chart tokens (see components/dashboard/AppleAnalytics.tsx)
const CHART_PRIMARY = 'var(--ap-accent)'
const AXIS = 'var(--ap-fg-subtle)'
const GRID = 'var(--ap-border)'

export type CompetencyRadarItem = { name: string; score: number; maxPoints: number }

type TierBreakdownLike = Array<{
  name: string
  maxPoints: number
  subtotal: number
  criteria: Array<{ title: string; maxPoints: number; consolidated: number | null }>
}>

/**
 * Derives radar axes from a report tierBreakdown: tier-level when there are
 * at least 3 tiers, otherwise falls back to criterion-level axes.
 */
export function radarItemsFromTierBreakdown(tierBreakdown: TierBreakdownLike | undefined): CompetencyRadarItem[] {
  if (!tierBreakdown || tierBreakdown.length === 0) return []
  if (tierBreakdown.length >= 3) {
    return tierBreakdown.map((tier) => ({ name: tier.name, score: tier.subtotal, maxPoints: tier.maxPoints }))
  }
  return tierBreakdown.flatMap((tier) => tier.criteria.map((criterion) => ({
    name: criterion.title,
    score: criterion.consolidated ?? 0,
    maxPoints: criterion.maxPoints,
  })))
}

/**
 * Single-series competency radar. Values are rendered as % of each axis max,
 * so tiers with different point budgets remain comparable.
 */
export function CompetencyRadar({ items, height = 280 }: { items: CompetencyRadarItem[]; height?: number }) {
  const data = items
    .filter((item) => item.maxPoints > 0)
    .map((item) => ({
      name: item.name,
      pct: Math.round(((item.score / item.maxPoints) * 100 + Number.EPSILON) * 10) / 10,
    }))
  if (data.length < 3) {
    return <p className="text-sm text-muted-foreground">Not enough competency areas to draw a radar chart.</p>
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke={GRID} />
          <PolarAngleAxis dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fill: AXIS, fontSize: 10 }} tickCount={5} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--ap-bg-raised)',
              border: '1px solid var(--ap-border)',
              borderRadius: '10px',
              boxShadow: '0 4px 8px -2px rgba(0,0,0,0.18)',
              fontSize: '12px',
            }}
            labelStyle={{ color: 'var(--ap-fg)', fontWeight: 600 }}
            itemStyle={{ color: 'var(--ap-fg-muted)' }}
            formatter={(value: number) => [`${value}% of max`, 'Consolidated']}
          />
          <Radar
            dataKey="pct"
            stroke={CHART_PRIMARY}
            strokeWidth={2}
            fill={CHART_PRIMARY}
            fillOpacity={0.2}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
