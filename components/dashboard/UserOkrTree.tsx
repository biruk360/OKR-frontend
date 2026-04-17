'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronDown, Target, Link2, Plus } from 'lucide-react'

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
}

const STATUS_COLORS: Record<string, string> = {
  ON_TRACK: '#059669',
  AT_RISK: '#d97706',
  OFF_TRACK: '#dc2626',
}

export default function UserOkrTree({ objectives }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }))
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">My Active Objectives</h3>
        <Link href="/dashboard/goals" className="text-xs text-primary-500 hover:underline">
          View all
        </Link>
      </header>

      {objectives.length === 0 ? (
        <div className="p-8 text-center">
          <Target className="mx-auto size-8 mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No objectives assigned to you in the current cycle.</p>
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
                  className="group w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition text-left"
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
                  <span className="text-xs text-muted-foreground tabular-nums font-medium ml-2">
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
                            {kr.initiativeCount}
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
