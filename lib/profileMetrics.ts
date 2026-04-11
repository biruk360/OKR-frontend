/**
 * Aggregates for person / team profile headers and minimap (aligned with OKRHierarchy).
 */

export type KrLikeForProfile = {
  progress?: number | null
  confidence?: string | null
  todos?: { status: string }[]
}

export interface ProfilePlanMetrics {
  avgKrProgress: number
  initiativeDone: number
  initiativeTotal: number
  ncsScore: number
}

const CONFIDENCE_NCS_WEIGHT: Record<string, number> = {
  ON_TRACK: 78,
  AT_RISK: 52,
  OFF_TRACK: 28,
}

export function avgNcsFromKeyResults(krs: KrLikeForProfile[]): number {
  if (!krs.length) return 0
  const sum = krs.reduce(
    (s, kr) => s + (CONFIDENCE_NCS_WEIGHT[kr.confidence as string] ?? 55),
    0
  )
  return Math.round(sum / krs.length)
}

export function computeProfilePlanMetrics(
  krs: KrLikeForProfile[],
  fallbackProgress?: number | null
): ProfilePlanMetrics {
  const avgKrProgress = krs.length
    ? Math.round(
        krs.reduce((s, kr) => s + (kr.progress ?? 0), 0) / krs.length
      )
    : Math.round(fallbackProgress ?? 0)

  let initiativeDone = 0
  let initiativeTotal = 0
  for (const kr of krs) {
    const todos = kr.todos ?? []
    initiativeTotal += todos.length
    initiativeDone += todos.filter((t) => t.status === 'COMPLETED').length
  }

  return {
    avgKrProgress,
    initiativeDone,
    initiativeTotal,
    ncsScore: avgNcsFromKeyResults(krs),
  }
}

/** Match ObjectiveNode value formatting for list rows. */
export function formatKrValueLabel(value: number, unit: string): string {
  const u = unit || '%'
  if (u === '%') return `${Math.round(value)}%`
  if (u === 'NPS') return `${Math.round(value)} NPS`
  if (['Revenue', 'Sales', '$', 'ETB'].some((x) => u.includes(x) || u === x)) {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${u}`
  }
  return `${value % 1 === 0 ? Math.round(value) : value.toFixed(1)} ${u}`.trim()
}
