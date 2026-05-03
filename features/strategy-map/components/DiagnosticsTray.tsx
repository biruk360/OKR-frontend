'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface Diagnostics {
  usersWithoutDepartment: number
  departmentsWithoutHead: number
  departmentObjectivesMissingDepartment: number
  individualObjectivesUnaligned: number
}

export function DiagnosticsTray() {
  const [data, setData] = useState<Diagnostics | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    fetch('/api/org/diagnostics')
      .then((r) => r.json())
      .then((j) => { if (j?.success) setData(j.data) })
      .catch(() => {})
  }, [])

  if (hidden || !data) return null
  const total =
    data.usersWithoutDepartment +
    data.departmentsWithoutHead +
    data.departmentObjectivesMissingDepartment +
    data.individualObjectivesUnaligned
  if (total === 0) return null

  return (
    <div
      className="flex items-center gap-2 border-t px-3 py-1.5 text-[11px]"
      style={{ borderColor: '#fde68a', background: 'rgba(252,211,77,0.12)' }}
    >
      <AlertTriangle className="size-3.5 shrink-0" style={{ color: '#b45309' }} />
      <span className="font-medium" style={{ color: '#92400e' }}>Diagnostics:</span>
      <Pills d={data} />
      <button
        type="button"
        onClick={() => setHidden(true)}
        className="ml-auto rounded p-0.5 hover:bg-black/5"
        title="Dismiss"
      >
        <X className="size-3" style={{ color: '#92400e' }} />
      </button>
    </div>
  )
}

function Pills({ d }: { d: Diagnostics }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {d.usersWithoutDepartment > 0 && (
        <Pill>{d.usersWithoutDepartment} users without dept</Pill>
      )}
      {d.departmentsWithoutHead > 0 && (
        <Pill>{d.departmentsWithoutHead} depts without head</Pill>
      )}
      {d.departmentObjectivesMissingDepartment > 0 && (
        <Pill>{d.departmentObjectivesMissingDepartment} dept OKRs missing dept</Pill>
      )}
      {d.individualObjectivesUnaligned > 0 && (
        <Pill>{d.individualObjectivesUnaligned} individual OKRs unaligned</Pill>
      )}
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: 'rgba(180,83,9,0.10)', color: '#92400e' }}
    >
      {children}
    </span>
  )
}
