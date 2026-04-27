'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { buildChartRows, formatAxisValue } from '@/lib/keyResultChart'
import { Modal } from '@/components/ui'

type TimeframeLike = {
  startDate: string | Date
  endDate: string | Date
  name?: string
} | null

type CheckInRow = {
  id: string
  asOfDate: string
  value: number
  confidence: string
}

interface CreateCheckInModalProps {
  isOpen: boolean
  onClose: () => void
  keyResult: any
  objectiveTimeframe: TimeframeLike
  /** Optional explicit code shown in the header pill, e.g. "CO-04". Falls back to a code derived from the objective level + id slice. */
  objectiveCode?: string
  /** Optional KR label like "KR4" (1-based sibling index). Falls back to the last 4 of the KR id. */
  krLabel?: string
  onSuccess?: () => void
}

export default function CreateCheckInModal({
  isOpen,
  onClose,
  keyResult,
  objectiveTimeframe,
  objectiveCode,
  krLabel,
  onSuccess,
}: CreateCheckInModalProps) {
  const [asOfDate, setAsOfDate] = useState('')
  const [progressInput, setProgressInput] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [checkIns, setCheckIns] = useState<CheckInRow[]>([])
  const [saving, setSaving] = useState(false)

  const kr = keyResult
  const tf: TimeframeLike =
    objectiveTimeframe ?? (kr?.objective?.timeframe ?? null)

  const loadCheckIns = useCallback(async () => {
    if (!kr?.id) return
    try {
      const res = await fetch(`/api/keyresults/${kr.id}/check-ins`)
      if (res.ok) {
        const d = await res.json()
        setCheckIns(d.data ?? [])
      } else {
        setCheckIns([])
      }
    } catch {
      setCheckIns([])
    }
  }, [kr?.id])

  useEffect(() => {
    if (!isOpen || !kr) return
    setAsOfDate(format(new Date(), 'yyyy-MM-dd'))
    setProgressInput(String(kr.currentValue ?? 0))
    setAnalysis('')
    void loadCheckIns()
  }, [isOpen, kr, loadCheckIns])

  // ─── Computed values ─────────────────────────────────────────────────────
  const startV = Number(kr?.startValue) || 0
  const targetV = Number(kr?.targetValue) || 0

  const enteredValue = useMemo(() => {
    const raw = progressInput.trim()
    if (!raw) return Number(kr?.currentValue) || 0
    if (raw.startsWith('+')) {
      const delta = Number(raw.slice(1))
      const cur = Number(kr?.currentValue) || 0
      return Number.isFinite(delta) ? cur + delta : cur
    }
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }, [progressInput, kr?.currentValue])

  const actualPct = useMemo(() => {
    const span = targetV - startV
    if (span <= 0) return 0
    return Math.min(Math.max(((enteredValue - startV) / span) * 100, 0), 100)
  }, [enteredValue, startV, targetV])

  const expectedPct = useMemo(() => {
    if (!tf) return 0
    const t0 = new Date(tf.startDate).getTime()
    const t1 = new Date(tf.endDate).getTime()
    const now = asOfDate ? new Date(`${asOfDate}T12:00:00`).getTime() : Date.now()
    const span = Math.max(t1 - t0, 1)
    const r = (now - t0) / span
    return Math.round(Math.min(Math.max(r, 0), 1) * 100)
  }, [tf, asOfDate])

  const pacePts = Math.round(actualPct - expectedPct)
  const status: 'On track' | 'At risk' | 'Off track' =
    pacePts >= -5 ? 'On track' : pacePts >= -15 ? 'At risk' : 'Off track'
  const statusColor =
    status === 'On track'
      ? 'var(--ap-green)'
      : status === 'At risk'
      ? 'var(--ap-orange)'
      : 'var(--ap-red)'

  // Confidence auto: 50 at pace 0, +1 per pace point, clamped 0..100.
  const confidenceScore = Math.max(0, Math.min(100, 50 + pacePts))

  const lastCheckIn = checkIns.length > 0 ? checkIns[checkIns.length - 1] : null
  const deltaSinceLast = lastCheckIn ? enteredValue - Number(lastCheckIn.value) : 0
  const deltaPctSinceLast = useMemo(() => {
    const span = targetV - startV
    if (span <= 0 || !lastCheckIn) return 0
    return Math.round((deltaSinceLast / span) * 100)
  }, [deltaSinceLast, lastCheckIn, startV, targetV])

  // ─── Trajectory chart points ─────────────────────────────────────────────
  const chart = useMemo(() => {
    if (!tf) return null
    const rows = buildChartRows(
      { startValue: startV, targetValue: targetV, currentValue: enteredValue },
      checkIns.map((c) => ({ asOfDate: c.asOfDate, value: c.value })),
      tf
    )
    const span = targetV - startV
    if (span <= 0) return null
    const w = 280
    const h = 100
    const pad = 6
    const t0 = rows.t0
    const t1 = rows.t1
    const xs = (t: number) =>
      pad + ((t - t0) / Math.max(t1 - t0, 1)) * (w - 2 * pad)
    const ys = (v: number) => {
      const pct = ((v - startV) / span) * 100
      const clamped = Math.min(Math.max(pct, 0), 100)
      return h - pad - (clamped / 100) * (h - 2 * pad)
    }
    const expectedPath = rows.combined
      .map((r, i) => `${i === 0 ? 'M' : 'L'} ${xs(r.t).toFixed(1)} ${ys(r.expected).toFixed(1)}`)
      .join(' ')
    const actualPath = rows.combined
      .map((r, i) => `${i === 0 ? 'M' : 'L'} ${xs(r.t).toFixed(1)} ${ys(r.actual).toFixed(1)}`)
      .join(' ')
    // Confidence line: project a straight line from start to a synthetic
    // "confidence-based projected end" so users see how confidence trends.
    const confidenceEndPct = confidenceScore
    const confEndV = startV + (span * confidenceEndPct) / 100
    const confidencePath = `M ${xs(t0).toFixed(1)} ${ys(startV).toFixed(1)} L ${xs(t1).toFixed(1)} ${ys(confEndV).toFixed(1)}`
    return { w, h, expectedPath, actualPath, confidencePath }
  }, [tf, checkIns, enteredValue, startV, targetV, confidenceScore])

  // ─── Header pill ─────────────────────────────────────────────────────────
  const objCodePill = useMemo(() => {
    if (objectiveCode) return objectiveCode
    const obj = kr?.objective
    if (!obj) return ''
    const prefix = obj.level === 'COMPANY' ? 'CO' : obj.level === 'DEPARTMENT' ? 'DE' : 'IN'
    const suffix = String((obj as any).code ?? '').padStart(2, '0') ||
      String(obj.id ?? '').slice(-4).toUpperCase()
    return `${prefix}-${suffix}`
  }, [objectiveCode, kr?.objective])

  const krPill = krLabel ?? `KR-${String(kr?.id ?? '').slice(-4).toUpperCase()}`
  const headerTitle = objCodePill ? `Check in · ${objCodePill}-${krPill}` : 'Check in'

  // ─── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kr?.id) return
    setSaving(true)
    try {
      const iso = asOfDate ? new Date(`${asOfDate}T12:00:00`).toISOString() : ''
      const res = await fetch(`/api/keyresults/${kr.id}/check-ins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asOfDate: iso,
          progress: progressInput,
          confidenceScore,
          analysis,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not save check-in')
        return
      }
      toast.success('Check-in saved')
      onSuccess?.()
      onClose()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (!kr) return null

  const unit = kr.unit || ''
  const tfLabel = tf?.name ?? ''

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={headerTitle}
      size="2xl"
      scrollBehavior="internal"
      stickyHeader
      className="ap-modal-enter"
    >
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Left column ── */}
          <div className="space-y-5">
            {/* KR summary card */}
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
            >
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="inline-flex items-center rounded px-1.5 py-0.5"
                  style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}>
                  KEY RESULT
                </span>
                {tfLabel && (
                  <>
                    <span>·</span>
                    <span>TARGET {tfLabel}</span>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-[14px] font-medium leading-snug text-foreground line-clamp-3">
                {kr.title}
              </p>
            </div>

            {/* Date */}
            <div>
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Date
              </label>
              <input
                type="date"
                required
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-full max-w-[180px] px-3 py-1.5 border border-border rounded-md text-sm focus:ring-2 focus:ring-ring focus:border-blue-500"
              />
            </div>

            {/* Current value */}
            <div>
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Current value
              </label>
              <div className="flex items-baseline gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={progressInput}
                  onChange={(e) => setProgressInput(e.target.value)}
                  className="w-32 px-3 py-1.5 border border-border rounded-md text-sm font-mono focus:ring-2 focus:ring-ring focus:border-blue-500"
                  placeholder="0"
                />
                <span className="text-[13px] text-muted-foreground">of</span>
                <span className="text-[15px] font-semibold tabular-nums">
                  {formatAxisValue(targetV)}
                  {unit ? ` ${unit}` : ''}
                </span>
              </div>

              {/* Actual vs expected bar */}
              <div className="mt-2.5">
                <div
                  className="relative h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--ap-bg-sunken)' }}
                >
                  <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{ width: `${actualPct}%`, background: statusColor }}
                  />
                  <div
                    className="absolute top-[-2px] h-[10px] w-[2px]"
                    style={{
                      left: `calc(${expectedPct}% - 1px)`,
                      background: 'var(--ap-fg-muted)',
                    }}
                    title={`Expected ${expectedPct}%`}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    Actual <span className="font-semibold tabular-nums text-foreground">{Math.round(actualPct)}%</span>
                  </span>
                  <span className="text-muted-foreground">
                    Expected <span className="font-semibold tabular-nums text-foreground">{expectedPct}%</span>
                  </span>
                  <span className="font-semibold tabular-nums" style={{ color: statusColor }}>
                    {pacePts > 0 ? '+' : ''}{pacePts} pt
                  </span>
                </div>
              </div>

              <p className="mt-2 text-[11px] text-muted-foreground">
                Enter the cumulative total, or type <kbd className="px-1 bg-muted rounded border">+</kbd> to add (e.g. <code>+25000</code>).
              </p>
            </div>

            {/* Confidence (auto) */}
            <div>
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Confidence
              </label>
              <div
                className="relative h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--ap-bg-sunken)' }}
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{ width: `${confidenceScore}%`, background: statusColor }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <div className="flex items-baseline gap-3 text-[11px] text-muted-foreground tabular-nums">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[20px] font-semibold tabular-nums" style={{ color: statusColor, letterSpacing: '-0.02em' }}>
                    {confidenceScore}
                    <span className="text-[12px] font-normal text-muted-foreground">/100</span>
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: 'var(--ap-bg-sunken)', color: statusColor }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: statusColor }} />
                    {status}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Calculated automatically from pace vs plan.
              </p>
            </div>

            {/* Analysis */}
            <div>
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Analysis
              </label>
              <textarea
                value={analysis}
                onChange={(e) => setAnalysis(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 text-[13px] text-foreground bg-card border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-blue-500 resize-y min-h-[120px]"
                placeholder={`How did you get to where you are today?\nIs there anything you need to do differently?\nAny ask for the team?`}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                What changed? What&apos;s the plan? Any blockers?
              </p>
            </div>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-3">
            {/* Trajectory preview */}
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Trajectory preview
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {tfLabel ? `${tfLabel} →` : ''} today
                </span>
              </div>
              {chart ? (
                <svg
                  viewBox={`0 0 ${chart.w} ${chart.h}`}
                  className="w-full h-[100px]"
                  preserveAspectRatio="none"
                >
                  <path d={chart.expectedPath} stroke="var(--ap-fg-muted)" strokeWidth="1" strokeDasharray="3 3" fill="none" />
                  <path d={chart.confidencePath} stroke="var(--ap-orange)" strokeWidth="1.5" fill="none" />
                  <path d={chart.actualPath} stroke="var(--ap-accent)" strokeWidth="1.5" fill="none" />
                </svg>
              ) : (
                <div className="h-[100px] flex items-center justify-center text-[11px] text-muted-foreground">
                  No timeframe set
                </div>
              )}
              <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-[2px]" style={{ background: 'var(--ap-accent)' }} />
                  Actual
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-[2px]" style={{ background: 'var(--ap-orange)' }} />
                  Confidence
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-[2px] border-t border-dashed" style={{ borderColor: 'var(--ap-fg-muted)' }} />
                  Expected
                </span>
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Pace vs plan" value={`${pacePts > 0 ? '+' : ''}${pacePts} pt`} tone={statusColor} />
              <StatCard label="Status (auto)" value={status} tone={statusColor} dot />
              <StatCard
                label="Δ Since last"
                value={lastCheckIn ? `${deltaPctSinceLast > 0 ? '+' : ''}${deltaPctSinceLast}%` : '—'}
                tone={deltaSinceLast >= 0 ? 'var(--ap-green)' : 'var(--ap-red)'}
              />
              <StatCard label="Confidence" value={`${confidenceScore}/100`} tone={statusColor} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50"
            disabled={saving}
          >
            <Send className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save check-in'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function StatCard({
  label,
  value,
  tone,
  dot = false,
}: {
  label: string
  value: string
  tone: string
  dot?: boolean
}) {
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
    >
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums"
        style={{ color: tone }}
      >
        {dot && <span className="size-1.5 rounded-full" style={{ background: tone }} />}
        {value}
      </div>
    </div>
  )
}
