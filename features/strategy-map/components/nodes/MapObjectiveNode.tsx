'use client'

import { Handle, Position } from 'reactflow'
import { Target } from 'lucide-react'

interface Data {
  title: string
  level: string
  progress: number
  confidence?: string
}

const TONE: Record<string, string> = {
  ON_TRACK: '#10b981', AT_RISK: '#f59e0b', OFF_TRACK: '#ef4444',
}

export function MapObjectiveNode({ data }: { data: Data }) {
  const tone = TONE[data.confidence ?? ''] ?? '#9ca3af'
  return (
    <div
      className="min-w-[200px] max-w-[220px] rounded-md p-2"
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="mb-1 flex items-center gap-1.5">
        <Target className="size-3 shrink-0" style={{ color: tone }} />
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">{data.level}</span>
        <span
          className="ml-auto size-1.5 rounded-full"
          style={{ background: tone }}
          title={data.confidence ?? 'Pending'}
        />
      </div>
      <p className="line-clamp-2 text-[12px] font-medium leading-snug text-gray-900">{data.title}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full" style={{ width: `${data.progress}%`, background: tone }} />
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-gray-600">{data.progress}%</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
