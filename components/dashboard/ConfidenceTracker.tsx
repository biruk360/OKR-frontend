import Link from 'next/link'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Target } from 'lucide-react'

export interface ConfidenceTrackerData {
  overallScore: number
  onTrack: number
  atRisk: number
  offTrack: number
  recommendations: string[]
  recentChanges: Array<{
    krId: string
    krTitle: string
    from: string
    to: string
  }>
}

interface Props {
  data: ConfidenceTrackerData
}

const CONF_COLORS: Record<string, string> = {
  ON_TRACK: '#059669',
  AT_RISK: '#d97706',
  OFF_TRACK: '#dc2626',
}

export default function ConfidenceTracker({ data }: Props) {
  const scoreColor = data.overallScore >= 65 ? '#059669' : data.overallScore >= 35 ? '#d97706' : '#dc2626'
  const total = data.onTrack + data.atRisk + data.offTrack

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="px-3 py-2 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Confidence tracker</h3>
      </header>
      <div className="px-3 py-3 space-y-3">
        {/* Score gauge */}
        <div className="flex items-center gap-3">
          <div
            className="text-[28px] font-bold leading-none tabular-nums"
            style={{ color: scoreColor }}
          >
            {data.overallScore}
          </div>
          <div className="flex-1">
            <div className="text-[12px] text-muted-foreground">Overall confidence score</div>
            <div className="mt-1 flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                {data.onTrack} on track
              </span>
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                {data.atRisk} at risk
              </span>
              <span className="inline-flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-destructive" />
                {data.offTrack} off track
              </span>
            </div>
          </div>
        </div>

        {/* Stacked bar */}
        {total > 0 && (
          <div className="flex h-2 rounded-sm overflow-hidden">
            {data.onTrack > 0 && (
              <div style={{ width: `${(data.onTrack / total) * 100}%`, background: '#059669' }} />
            )}
            {data.atRisk > 0 && (
              <div style={{ width: `${(data.atRisk / total) * 100}%`, background: '#d97706' }} />
            )}
            {data.offTrack > 0 && (
              <div style={{ width: `${(data.offTrack / total) * 100}%`, background: '#dc2626' }} />
            )}
          </div>
        )}

        {/* Recent confidence changes */}
        {data.recentChanges.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Recent changes</div>
            <ul className="space-y-1">
              {data.recentChanges.slice(0, 5).map((change, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[12px]">
                  {change.to === 'OFF_TRACK' || change.to === 'AT_RISK' ? (
                    <TrendingDown className="h-3 w-3 flex-shrink-0" style={{ color: CONF_COLORS[change.to] }} />
                  ) : (
                    <TrendingUp className="h-3 w-3 flex-shrink-0" style={{ color: CONF_COLORS[change.to] }} />
                  )}
                  <Link href={`/dashboard/key-results/${change.krId}`} className="text-sm text-primary-500 hover:underline truncate flex-1">
                    {change.krTitle}
                  </Link>
                  <span className="text-[10px] text-muted-foreground">
                    {change.from.replace('_', ' ').toLowerCase()} → {change.to.replace('_', ' ').toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations */}
        {data.recommendations.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Focus areas</div>
            <ul className="space-y-1">
              {data.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-foreground">
                  <Target className="h-3 w-3 flex-shrink-0 mt-0.5 text-primary-500" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
