'use client'

import { Handle, Position } from 'reactflow'
import { Crown } from 'lucide-react'

interface Data {
  name: string
  email: string
  role: string
  isHead?: boolean
  okrCount: number
}

export function PersonNode({ data }: { data: Data }) {
  return (
    <div
      className="flex min-w-[170px] items-center gap-2 rounded-lg px-2.5 py-1.5"
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ background: data.isHead ? 'rgba(245,158,11,0.18)' : 'rgba(37,99,235,0.12)',
                 color: data.isHead ? '#b45309' : '#1d4ed8' }}
      >
        {(data.name ?? '?').charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-[12px] font-medium text-gray-900">
          {data.name}
          {data.isHead && <Crown className="size-2.5 shrink-0 text-amber-600" />}
        </p>
        <p className="truncate text-[10px] text-gray-500">{data.role.toLowerCase().replace('_', ' ')}</p>
      </div>
      {data.okrCount > 0 && (
        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 tabular-nums">
          {data.okrCount}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
