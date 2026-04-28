interface Props {
  label: string
  value: number | string
  tint: string
}

/** Smaller stat card — denser than InsightTile, no icon. Use in second-tier KPI rows. */
export function KpiCard({ label, value, tint }: Props) {
  return (
    <div className="rounded-[14px] border bg-card p-4" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-[28px] font-semibold tabular-nums tracking-tight" style={{ color: tint }}>
        {value}
      </div>
    </div>
  )
}
