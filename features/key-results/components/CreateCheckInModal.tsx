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
  const [confidence, setConfidence] = useState<'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'>('ON_TRACK')
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
    setConfidence(
      conf === 'AT_RISK' || conf === 'OFF_TRACK' || conf === 'ON_TRACK' ? conf : 'ON_TRACK'
    )
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
          confidence,
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
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Progress
                  </label>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-600">{unit}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={progressInput}
                      onChange={(e) => setProgressInput(e.target.value)}
                      className="w-40 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0"
                    />
                    {kr.description ? (
                      <span className="text-sm text-gray-500 line-clamp-2">{kr.description}</span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    Enter the total cumulative value, or type <kbd className="px-1 bg-gray-100 rounded border">+</kbd>{' '}
                    first to add to the current value (e.g. <code className="text-gray-700">+25000</code>).
                  </p>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Confidence
                  </span>
                  <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                    {(
                      [
                        ['ON_TRACK', 'On track'],
                        ['AT_RISK', 'At risk'],
                        ['OFF_TRACK', 'Off track'],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setConfidence(val)}
                        className={`px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                          confidence === val
                            ? val === 'AT_RISK'
                              ? 'bg-amber-100 text-amber-900'
                              : val === 'OFF_TRACK'
                                ? 'bg-red-50 text-red-800'
                                : 'bg-white text-gray-900 ring-1 ring-inset ring-gray-300'
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Analysis
                  </span>
                  <div className="rounded-md border border-gray-200 bg-gray-50 overflow-hidden">
                    <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-gray-200 bg-white text-gray-400 text-xs">
                      <span className="px-2 py-0.5 rounded border border-dashed border-gray-200">Bold</span>
                      <span className="px-2 py-0.5 rounded border border-dashed border-gray-200">Italic</span>
                      <span className="px-2 py-0.5 rounded border border-dashed border-gray-200">List</span>
                      <span className="px-2 py-0.5 rounded border border-dashed border-gray-200">Link</span>
                    </div>
                    <textarea
                      value={analysis}
                      onChange={(e) => setAnalysis(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 text-sm text-gray-800 bg-white border-0 focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-y min-h-[140px]"
                      placeholder={`Write better updates by answering these questions:
- How did you get to where you are today?
- Is there anything you need to do differently?
- Do you have an ask for the team?`}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4">
                  <div className="h-[240px] w-full" aria-busy={loading}>
                    {loading ? (
                      <div className="h-full flex items-center justify-center text-sm text-gray-500">
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
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">
                        {unit} {formatAxisValue(Number(kr.currentValue) || 0)}
                      </span>{' '}
                      <span className="text-gray-500">{kr.title}</span>
                    </p>
                    <span className="text-sm font-semibold text-gray-900 shrink-0">{Math.round(pct)}%</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {unit} {formatAxisValue(Number(kr.startValue) || 0)} → {unit}{' '}
                    {formatAxisValue(Number(kr.targetValue) || 0)} target
                  </p>
                </div>

                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setInitiativesOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 text-left"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Related initiatives
                    </span>
                    {initiativesOpen ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                  {initiativesOpen && (
                    <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/50">
                      <div className="flex flex-wrap gap-2 pt-3">
                        <span className="text-xs text-gray-500">Add or manage tasks on the key result card below.</span>
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white opacity-60 cursor-not-allowed"
                          title="Coming soon"
                        >
                          <Sparkles className="h-3 w-3" />
                          Generate via AI
                        </span>
                      </div>
                      {todos.length > 0 && (
                        <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
                          {todos.slice(0, 8).map((t) => (
                            <li key={t.id} className="flex items-center gap-2">
                              <span
                                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                  t.status === 'COMPLETED' ? 'bg-green-500' : 'bg-blue-500'
                                }`}
                              />
                              <span className={t.status === 'COMPLETED' ? 'line-through text-gray-400' : ''}>
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

        <div className="mt-8 flex justify-end gap-3 border-t border-gray-200 pt-6">
          <button type="button" onClick={onClose} className="btn-outline" disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save check-in'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
