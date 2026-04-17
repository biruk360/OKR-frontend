'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceDot,
} from 'recharts'

interface Snapshot {
  /** ISO date of the check-in. */
  periodStart: string
  /** Average KR progress across the user's owned KRs at/around that check-in (0–100). */
  score: number
}

interface Props {
  snapshots: Snapshot[]
  currentProgress: number
  timeframeStart: string | Date
  timeframeEnd: string | Date
}

/**
 * Person-scoped "Expected vs Actual" progress chart. Mirrors the objective
 * page's timeline component visually but aggregates over a user's KR
 * check-ins so viewers can eyeball pace against the enclosing timeframe.
 */
export default function UserProgressTimeline({
  snapshots,
  currentProgress,
  timeframeStart,
  timeframeEnd,
}: Props) {
  const data = useMemo(() => {
    const start = new Date(timeframeStart).getTime()
    const end = new Date(timeframeEnd).getTime()
    const span = Math.max(end - start, 1)

    const points: Array<{ date: string; t: number; actual: number | null; expected: number }> = []

    points.push({
      date: format(new Date(timeframeStart), 'MMM d'),
      t: start,
      actual: null,
      expected: 0,
    })

    for (const s of snapshots) {
      const t = parseISO(s.periodStart).getTime()
      if (t < start || t > end) continue
      points.push({
        date: format(parseISO(s.periodStart), 'MMM d'),
        t,
        actual: Math.round(s.score),
        expected: Math.round(((t - start) / span) * 100),
      })
    }

    points.push({
      date: format(new Date(timeframeEnd), 'MMM d'),
      t: end,
      actual: null,
      expected: 100,
    })

    const seen = new Set<number>()
    return points
      .sort((a, b) => a.t - b.t)
      .filter((p) => {
        if (seen.has(p.t)) return false
        seen.add(p.t)
        return true
      })
  }, [snapshots, timeframeStart, timeframeEnd])

  const now = Date.now()
  const nowWithin = now >= new Date(timeframeStart).getTime() && now <= new Date(timeframeEnd).getTime()

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Overall Progress Timeline</h2>
        <div className="text-xs text-muted-foreground flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 border-t-2 border-dashed border-gray-400" />
            Expected
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 bg-blue-500 rounded" />
            Actual
          </span>
        </div>
      </div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }} unit="%" />
            <Tooltip formatter={(v: any) => (v == null ? '—' : `${v}%`)} />
            <Legend wrapperStyle={{ display: 'none' }} />
            <Line
              type="monotone"
              dataKey="expected"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3, fill: '#3b82f6' }}
              connectNulls
            />
            {nowWithin ? (
              <ReferenceDot
                x={format(new Date(now), 'MMM d')}
                y={Math.round(currentProgress)}
                r={5}
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth={2}
                label={{
                  value: `${Math.round(currentProgress)}% (Current)`,
                  position: 'top',
                  fontSize: 10,
                  fill: '#2563eb',
                }}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
