'use client'

import { Handle, Position } from 'reactflow'
import { Crown } from 'lucide-react'

interface Data {
  name: string
  ceoName?: string | null
  companyOkrCount: number
  avgProgress: number
}

export function CompanyNode({ data }: { data: Data }) {
  return (
    <div
      className="flex min-w-[220px] items-center gap-3 rounded-xl px-4 py-3"
      style={{
        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        color: '#fff',
        boxShadow: '0 4px 16px -4px rgba(37,99,235,0.4)',
      }}
    >
      <div className="flex size-10 items-center justify-center rounded-lg bg-white/15">
        <Crown className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Company</p>
        <p className="truncate text-sm font-semibold">{data.name}</p>
        <p className="truncate text-[11px] opacity-80">
          {data.ceoName ? `CEO: ${data.ceoName}` : 'No CEO set'}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[18px] font-bold tabular-nums leading-none">{data.companyOkrCount}</p>
        <p className="text-[9px] uppercase tracking-widest opacity-80">OKRs</p>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
