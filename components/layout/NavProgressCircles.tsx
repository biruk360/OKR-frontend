'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface NavKeyResult {
  id: string
  title: string
  progress: number
  confidence: string
}

interface NavObjective {
  id: string
  title: string
  progress: number
  goalStatus: string
  level: string
  keyResults: NavKeyResult[]
}

const statusColour: Record<string, string> = {
  ON_TRACK: 'bg-emerald-500',
  AT_RISK: 'bg-amber-500',
  OFF_TRACK: 'bg-red-500',
  CLOSED: 'bg-slate-400',
}

const confidenceColour: Record<string, string> = {
  ON_TRACK: 'text-emerald-600',
  AT_RISK: 'text-amber-600',
  OFF_TRACK: 'text-red-600',
}

/**
 * Compact cascade of tiny coloured circles — one per active objective of the
 * current user. Hovering a circle expands a popover with the objective title,
 * progress, and its KR rollup. Clicking opens the objective detail page.
 */
export default function NavProgressCircles() {
  const [objectives, setObjectives] = useState<NavObjective[]>([])
  const [hovered, setHovered] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch('/api/my/nav-progress')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setObjectives(res.data)
      })
      .catch(() => {})
  }, [])

  if (objectives.length === 0) return null

  const visible = objectives.slice(0, 8)
  const overflow = objectives.length - visible.length

  return (
    <div
      ref={wrapperRef}
      className="relative hidden md:flex items-center"
      onMouseLeave={() => setHovered(null)}
    >
      <div className="flex items-center -space-x-1.5">
        {visible.map((o) => (
          <Link
            key={o.id}
            href={`/dashboard/objectives/${o.id}`}
            onMouseEnter={() => setHovered(o.id)}
            onFocus={() => setHovered(o.id)}
            className={`relative block h-5 w-5 rounded-full border-2 border-white ring-1 ring-black/5 transition-transform hover:scale-110 ${statusColour[o.goalStatus] ?? 'bg-slate-400'}`}
            aria-label={`${o.title} — ${Math.round(o.progress)}%`}
          >
            <span className="sr-only">{o.title}</span>
          </Link>
        ))}
        {overflow > 0 && (
          <span className="relative h-5 min-w-5 px-1 rounded-full border-2 border-white bg-slate-200 text-[10px] font-semibold text-slate-600 flex items-center justify-center ring-1 ring-black/5">
            +{overflow}
          </span>
        )}
      </div>

      {hovered && (() => {
        const obj = objectives.find((o) => o.id === hovered)
        if (!obj) return null
        return (
          <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg z-50 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <Link
                href={`/dashboard/objectives/${obj.id}`}
                className="text-sm font-semibold text-gray-900 hover:text-blue-600 line-clamp-2"
              >
                {obj.title}
              </Link>
              <span className="text-xs font-medium text-gray-700 tabular-nums shrink-0">
                {Math.round(obj.progress)}%
              </span>
            </div>
            <div className="flex items-center gap-2 mb-2 text-[11px] uppercase tracking-wide text-gray-500">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColour[obj.goalStatus] ?? 'bg-slate-400'}`} />
              {obj.goalStatus.replace(/_/g, ' ')}
              <span className="ml-auto">{obj.level}</span>
            </div>
            {obj.keyResults.length === 0 ? (
              <p className="text-xs text-gray-500">No key results yet.</p>
            ) : (
              <ul className="space-y-1">
                {obj.keyResults.slice(0, 5).map((kr) => (
                  <li key={kr.id} className="flex items-center gap-2 text-xs">
                    <Link
                      href={`/dashboard/key-results/${kr.id}`}
                      className="flex-1 min-w-0 truncate text-gray-700 hover:text-blue-600"
                    >
                      {kr.title}
                    </Link>
                    <span className="tabular-nums text-gray-500">{Math.round(kr.progress)}%</span>
                    <span className={`text-[10px] ${confidenceColour[kr.confidence] ?? 'text-gray-500'}`}>
                      {kr.confidence.replace(/_/g, ' ')}
                    </span>
                  </li>
                ))}
                {obj.keyResults.length > 5 && (
                  <li className="text-[11px] text-gray-500 pt-1">
                    +{obj.keyResults.length - 5} more key results
                  </li>
                )}
              </ul>
            )}
          </div>
        )
      })()}
    </div>
  )
}
