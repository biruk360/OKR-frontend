'use client'

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { Link as LinkIcon } from 'lucide-react'

const statusLabel: Record<string, string> = {
  ON_TRACK: 'On track',
  AT_RISK: 'At risk',
  OFF_TRACK: 'Off track',
  CLOSED: 'Closed',
}

export default function AlignsToParentBadge({
  parent,
}: {
  parent: { id: string; title: string; progress: number; goalStatus: string }
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center text-sm text-blue-800 bg-blue-50 px-3 py-1.5 rounded-md border border-blue-200 hover:bg-blue-100"
      >
        <span className="mr-1.5 text-blue-600" aria-hidden>
          ↳
        </span>
        <LinkIcon className="h-4 w-4 mr-1 shrink-0" />
        <span>Aligns to: {parent.title}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Parent goal</p>
          <Link
            href={`/dashboard/objectives/${parent.id}`}
            className="mt-1 block text-sm font-semibold text-blue-700 hover:underline line-clamp-2"
          >
            {parent.title}
          </Link>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-gray-600">Progress</span>
            <span className="font-medium tabular-nums">{Math.round(Number(parent.progress) || 0)}%</span>
          </div>
          <div className="mt-1 flex justify-between text-sm">
            <span className="text-gray-600">Status</span>
            <span className="font-medium">{statusLabel[parent.goalStatus] ?? parent.goalStatus}</span>
          </div>
          <Link
            href={`/dashboard/objectives/${parent.id}`}
            className="mt-3 block text-center text-xs text-blue-600 hover:underline"
          >
            Open parent objective
          </Link>
        </div>
      )}
    </div>
  )
}
