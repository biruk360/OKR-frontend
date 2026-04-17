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

  if (objectives.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card">
        <header className="px-3 py-2 border-b border-border">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your OKRs</h3>
        </header>
        <div className="p-6 text-center text-xs text-muted-foreground">
          <Target className="mx-auto h-6 w-6 mb-2 text-muted-foreground" />
          No objectives assigned to you in the current cycle.
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="px-3 py-2 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your OKRs</h3>
      </header>
      <div className="py-1">
        {objectives.map((obj) => {
          const isOpen = expanded[obj.id] ?? false
          return (
            <div key={obj.id}>
              <button
                type="button"
                onClick={() => toggle(obj.id)}
                className="group w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition text-left"
              >
                {isOpen
                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                }
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ background: STATUS_COLORS[obj.goalStatus] || '#c1c7d0' }}
                />
                <span className="text-[13px] font-medium text-foreground truncate flex-1">
                  {obj.title}
                </span>
                <span className="text-[12px] text-muted-foreground tabular-nums font-medium">
                  {Math.round(obj.progress)}%
                </span>
                <div className="w-12 h-1 w-full bg-muted rounded-full overflow-hidden ml-1">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all"
                    style={{ width: `${Math.min(obj.progress, 100)}%`, background: STATUS_COLORS[obj.goalStatus] }}
                  />
                </div>
              </button>

              {isOpen && (
                <div className="ml-6 border-l-2 border-border">
                  {obj.keyResults.map((kr) => (
                    <Link
                      key={kr.id}
                      href={`/dashboard/key-results/${kr.id}`}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition"
                    >
                      <Link2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span
                        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                        style={{ background: STATUS_COLORS[kr.confidence] || '#c1c7d0' }}
                      />
                      <span className="text-[12px] text-foreground truncate flex-1">
                        {kr.title}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {Math.round(kr.progress)}%
                      </span>
                    </Link>
                  ))}
                  <div className="flex items-center gap-2 px-3 py-1">
                    <Link
                      href={`/dashboard/objectives/${obj.id}`}
                      className="text-[11px] text-primary-500 hover:underline inline-flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Add initiative
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
