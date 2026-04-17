'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Building2 } from 'lucide-react'

export interface CompanyRootNodeData {
  label: string
  planCount: number
  timeframeName?: string
}

const CompanyRootNode = memo(({ data, selected }: NodeProps<CompanyRootNodeData>) => {
  const { label, planCount, timeframeName } = data
  return (
    <div
      className={`flex min-w-[140px] max-w-[220px] flex-col items-center rounded-xl border bg-card px-4 py-3 shadow-md ${
        selected ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-border'
      }`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
        <Building2 className="h-5 w-5" />
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Company
      </p>
      <h3 className="mt-0.5 text-center text-sm font-bold leading-tight text-foreground">{label}</h3>
      {timeframeName ? (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">{timeframeName}</p>
      ) : null}
      <p className="mt-2 text-center text-[10px] tabular-nums text-muted-foreground">
        {planCount} top-level {planCount === 1 ? 'plan' : 'plans'}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-0 !bg-violet-400"
      />
    </div>
  )
})

CompanyRootNode.displayName = 'CompanyRootNode'

export default CompanyRootNode
