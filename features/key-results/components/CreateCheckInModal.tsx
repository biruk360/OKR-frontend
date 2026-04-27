'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { formatAxisValue } from '@/lib/keyResultChart'
import KeyResultProgressChart from './KeyResultProgressChart'
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
  analysis: string | null
  createdBy: { id: string; name: string; avatar?: string | null }
}

type TodoRow = {
  id: string
  title: string
  status: string
}

interface CreateCheckInModalProps {
  isOpen: boolean
  onClose: () => void
  keyResult: any
  objectiveTimeframe: TimeframeLike
  onSuccess?: () => void
}

export default function CreateCheckInModal({
  isOpen,
  onClose,
  keyResult,
  objectiveTimeframe,
  onSuccess,
}: CreateCheckInModalProps) {
  const [asOfDate, setAsOfDate] = useState('')
  const [progressInput, setProgressInput] = useState('')
  const [confidenceScore, setConfidenceScore] = useState<number>(85)
  const [analysis, setAnalysis] = useState('')
  const [checkIns, setCheckIns] = useState<CheckInRow[]>([])
  const [todos, setTodos] = useState<TodoRow[]>([])
  const [initiativesOpen, setInitiativesOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const kr = keyResult

  const loadData = useCallback(async () => {
    if (!kr?.id) return
    setLoading(true)
    try {
      const [ciRes, tdRes] = await Promise.all([
        fetch(`/api/keyresults/${kr.id}/check-ins`),
        fetch(`/api/keyresults/${kr.id}/todos`),
      ])
      if (ciRes.ok) {
        const d = await ciRes.json()
        setCheckIns(d.data ?? [])
      } else {
        setCheckIns([])
      }
      if (tdRes.ok) {
        const d = await tdRes.json()
        setTodos((d.data ?? []).map((t: any) => ({ id: t.id, title: t.title, status: t.status })))
      } else {
        setTodos([])
      }
    } catch {
      setCheckIns([])
      setTodos([])
    } finally {
      setLoading(false)
    }
  }, [kr?.id])

  useEffect(() => {
    if (!isOpen || !kr) return
    const today = format(new Date(), 'yyyy-MM-dd')
    setAsOfDate(today)
    setProgressInput(String(kr.currentValue ?? 0))
    const conf = kr.confidence
    const fromTier =
      conf === 'ON_TRACK' ? 85 : conf === 'AT_RISK' ? 55 : conf === 'OFF_TRACK' ? 25 : 50
    setConfidenceScore(typeof kr.confidenceScore === 'number' ? kr.confidenceScore : fromTier)
    setAnalysis('')
    void loadData()
  }, [isOpen, kr, loadData])

  const pct = useMemo(() => {
    const t = Number(kr?.targetValue)
    const c = Number(kr?.currentValue)
    if (!t || t <= 0) return 0
    return Math.min(Math.max((c / t) * 100, 0), 100)
  }, [kr?.currentValue, kr?.targetValue])

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

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={kr.title}
      size="2xl"
      scrollBehavior="internal"
      stickyHeader
    >
      <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="w-full max-w-xs px-3 py-2 border border-border rounded-md text-sm focus:ring-2 focus:ring-ring focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Progress
                  </label>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-muted-foreground">{unit}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={progressInput}
                      onChange={(e) => setProgressInput(e.target.value)}
                      className="w-40 px-3 py-2 border border-border rounded-md text-sm font-mono focus:ring-2 focus:ring-ring focus:border-blue-500"
                      placeholder="0"
                    />
                    {kr.description ? (
                      <span className="text-sm text-muted-foreground line-clamp-2">{kr.description}</span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Enter the total cumulative value, or type <kbd className="px-1 bg-muted rounded border">+</kbd>{' '}
                    first to add to the current value (e.g. <code className="text-muted-foreground">+25000</code>).
                  </p>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Confidence
                  </span>
                  <ConfidenceSlider value={confidenceScore} onChange={setConfidenceScore} />
                </div>

                <div>
                  <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Analysis
                  </span>
                  <div className="rounded-md border border-border bg-muted overflow-hidden">
                    <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-border bg-card text-muted-foreground text-xs">
                      <span className="px-2 py-0.5 rounded border border-dashed border-border">Bold</span>
                      <span className="px-2 py-0.5 rounded border border-dashed border-border">Italic</span>
                      <span className="px-2 py-0.5 rounded border border-dashed border-border">List</span>
                      <span className="px-2 py-0.5 rounded border border-dashed border-border">Link</span>
                    </div>
                    <textarea
                      value={analysis}
                      onChange={(e) => setAnalysis(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 text-sm text-foreground bg-card border-0 focus:ring-2 focus:ring-inset focus:ring-ring resize-y min-h-[140px]"
                      placeholder={`Write better updates by answering these questions:
- How did you get to where you are today?
- Is there anything you need to do differently?
- Do you have an ask for the team?`}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/80 p-4">
                  <div className="h-[240px] w-full" aria-busy={loading}>
                    {loading ? (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        Loading chart…
                      </div>
                    ) : (
                      <KeyResultProgressChart
                        keyResult={kr}
                        checkIns={checkIns}
                        timeframe={objectiveTimeframe}
                        height={240}
                        showTodayMarker
                      />
                    )}
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">
                        {unit} {formatAxisValue(Number(kr.currentValue) || 0)}
                      </span>{' '}
                      <span className="text-muted-foreground">{kr.title}</span>
                    </p>
                    <span className="text-sm font-semibold text-foreground shrink-0">{Math.round(pct)}%</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {unit} {formatAxisValue(Number(kr.startValue) || 0)} → {unit}{' '}
                    {formatAxisValue(Number(kr.targetValue) || 0)} target
                  </p>
                </div>

                <div className="rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setInitiativesOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-muted text-left"
                  >
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Related initiatives
                    </span>
                    {initiativesOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {initiativesOpen && (
                    <div className="px-4 pb-4 border-t border-border bg-muted/50">
                      <div className="flex flex-wrap gap-2 pt-3">
                        <span className="text-xs text-muted-foreground">Add or manage tasks on the key result card below.</span>
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white opacity-60 cursor-not-allowed"
                          title="Coming soon"
                        >
                          <Sparkles className="h-3 w-3" />
                          Generate via AI
                        </span>
                      </div>
                      {todos.length > 0 && (
                        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                          {todos.slice(0, 8).map((t) => (
                            <li key={t.id} className="flex items-center gap-2">
                              <span
                                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                  t.status === 'COMPLETED' ? 'bg-green-500' : 'bg-blue-500'
                                }`}
                              />
                              <span className={t.status === 'COMPLETED' ? 'line-through text-muted-foreground' : ''}>
                                {t.title}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

        <div className="mt-8 flex justify-end gap-3 border-t border-border pt-6">
          <button type="button" onClick={onClose} className="btn-outline" disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save check-in'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ConfidenceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const v = Math.max(0, Math.min(100, value))
  const fill = v >= 70 ? 'var(--ap-green)' : v >= 40 ? 'var(--ap-orange)' : 'var(--ap-red)'
  const tier = v >= 70 ? 'On track' : v >= 40 ? 'At risk' : 'Off track'
  return (
    <div className="w-full max-w-md">
      <div className="flex items-baseline justify-between mb-2">
        <span
          className="text-[20px] font-semibold tabular-nums leading-none"
          style={{ letterSpacing: '-0.02em', color: fill }}
        >
          {v}
          <span className="text-[12px] text-muted-foreground font-normal">/100</span>
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: 'var(--ap-bg-sunken)', color: fill }}
        >
          <span className="size-1.5 rounded-full" style={{ background: fill }} />
          {tier}
        </span>
      </div>
      <div className="relative h-4 flex items-center">
        <div
          className="absolute left-0 right-0 h-1.5 rounded-full"
          style={{ background: 'var(--ap-kr-bar-bg, #e5e7eb)' }}
        />
        <div
          className="absolute left-0 h-1.5 rounded-full"
          style={{ width: `${v}%`, background: fill }}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[var(--ap-border)]
            [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[var(--ap-border)]"
          aria-label="Confidence"
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>0</span><span>50</span><span>100</span>
      </div>
    </div>
  )
}
