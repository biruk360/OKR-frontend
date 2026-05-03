'use client'

import { Handle, Position } from 'reactflow'
import { Building2, Crown } from 'lucide-react'

interface Data {
  name: string
  headName?: string | null
  memberCount: number
  okrCount: number
  avgProgress: number
}

export function DepartmentNode({ data }: { data: Data }) {
  const tone = data.avgProgress >= 70 ? '#10b981' : data.avgProgress >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div
      className="min-w-[200px] rounded-lg p-3"
      style={{
        background: '#fff',
        border: '1px solid #d1d5db',
        boxShadow: '0 2px 8px -2px rgba(0,0,0,0.08)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="mb-2 flex items-center gap-2">
        <Building2 className="size-4 shrink-0 text-blue-600" />
        <p className="flex-1 truncate text-[13px] font-semibold text-gray-900">{data.name}</p>
        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 tabular-nums">
          {data.memberCount}
        </span>
      </div>
      {data.headName ? (
        <div className="mb-2 flex items-center gap-1.5 rounded bg-amber-50 px-1.5 py-1">
          <Crown className="size-3 shrink-0 text-amber-700" />
          <span className="truncate text-[11px] font-medium text-gray-800">{data.headName}</span>
        </div>
      ) : (
        <p className="mb-2 rounded bg-amber-50 px-1.5 py-1 text-[10px] font-medium text-amber-800">
          No head
        </p>
      )}
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full transition-all" style={{ width: `${data.avgProgress}%`, background: tone }} />
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-gray-600">{data.avgProgress}%</span>
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
          {data.okrCount} OKR
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
