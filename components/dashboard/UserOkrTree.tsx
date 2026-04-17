'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronDown, Target, Link2, Plus, CheckCircle2, AlertTriangle, TrendingDown } from 'lucide-react'
import type { TopSummaryData } from './TopSummaryBoxes'

export interface OkrTreeObjective {
  id: string
  title: string
  level: string
  progress: number
  goalStatus: string
  keyResults: OkrTreeKeyResult[]
}

export interface OkrTreeKeyResult {
  id: string
  title: string
  progress: number
  confidence: string
  initiativeCount: number
}

interface Props {
  objectives: OkrTreeObjective[]
  confidenceData?: TopSummaryData
}

const STATUS_COLORS: Record<string, string> = {
  ON_TRACK: '#059669',
  AT_RISK: '#d97706',
  OFF_TRACK: '#dc2626',
}

export default function UserOkrTree({ objectives, confidenceData }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }))
  }

  const scoreColor = confidenceData
    ? confidenceData.confidenceScore >= 65 ? '#059669' : confidenceData.confidenceScore >= 35 ? '#d97706' : '#dc2626'
    : '#059669'
  const total = confidenceData ? confidenceData.onTrack + confidenceData.atRisk + confidenceData.offTrack : 0

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">My Active Objectives</h3>
      </header>

      {/* Confidence tracker strip */}
      {confidenceData && total > 0 && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Confidence Tracker</div>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: scoreColor }}>
              {confidenceData.confidenceScore}
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Overall confidence score</p>
              <div className="mt-1 flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="size-3" /> {confidenceData.onTrack} on track
                </span>
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="size-3" /> {confidenceData.atRisk} at risk
                </span>
                <span className="inline-flex items-center gap-1 text-red-600">
                  <TrendingDown className="size-3" /> {confidenceData.offTrack} off track
                </span>
              </div>
            </div>
          </div>
          {/* Stacked bar */}
          <div className="flex h-2 rounded-full overflow-hidden mt-2">
            {confidenceData.onTrack > 0 && (
              <div className="bg-emerald-500" style={{ width: `${(confidenceData.onTrack / total) * 100}%` }} />
            )}
            {confidenceData.atRisk > 0 && (
              <div className="bg-amber-500" style={{ width: `${(confidenceData.atRisk / total) * 100}%` }} />
            )}
            {confidenceData.offTrack > 0 && (
              <div className="bg-red-500" style={{ width: `${(confidenceData.offTrack / total) * 100}%` }} />
            )}
          </div>
        </div>
      )}

      {/* Objectives tree */}
      {objectives.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          <Target className="mx-auto size-6 mb-2 text-muted-foreground" />
          No objectives assigned to you in the current cycle.
        </div>
      ) : (
        <div className="py-1">
          {objectives.map((obj) => {
            const isOpen = expanded[obj.id] ?? false
            return (
              <div key={obj.id}>
                <button
                  type="button"
                  onClick={() => toggle(obj.id)}
                  className="group w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted transition text-left"
                >
                  {isOpen
                    ? <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  }
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ background: STATUS_COLORS[obj.goalStatus] || '#c1c7d0' }}
                  />
                  <span className="text-sm font-medium truncate flex-1">{obj.title}</span>
                  <span className="text-xs text-muted-foreground tabular-nums font-medium">
                    {Math.round(obj.progress)}%
                  </span>
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden ml-1">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(obj.progress, 100)}%`, background: STATUS_COLORS[obj.goalStatus] || '#c1c7d0' }}
                    />
                  </div>
                </button>

                {isOpen && (
                  <div className="ml-7 border-l-2 border-border">
                    {obj.keyResults.map((kr) => (
                      <Link
                        key={kr.id}
                        href={`/dashboard/key-results/${kr.id}`}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-muted transition"
                      >
                        <Link2 className="size-3 text-muted-foreground shrink-0" />
                        <span
                          className="size-1.5 rounded-full shrink-0"
                          style={{ background: STATUS_COLORS[kr.confidence] || '#c1c7d0' }}
                        />
                        <span className="text-xs truncate flex-1">{kr.title}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {Math.round(kr.progress)}%
                        </span>
                        {kr.initiativeCount > 0 && (
                          <span className="text-[10px] text-muted-foreground bg-muted rounded px-1">
                            {kr.initiativeCount} todo{kr.initiativeCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </Link>
                    ))}
                    <div className="flex items-center gap-2 px-4 py-1.5">
                      <Link
                        href={`/dashboard/objectives/${obj.id}`}
                        className="text-[11px] text-primary-500 hover:underline inline-flex items-center gap-1"
                      >
                        <Plus className="size-3" /> Add initiative
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
