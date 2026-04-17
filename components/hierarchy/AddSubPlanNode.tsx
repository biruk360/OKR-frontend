'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export interface AddSubPlanNodeData {
  parentObjectiveId: string
}

const AddSubPlanNode = memo(({ selected }: NodeProps<AddSubPlanNodeData>) => {
  return (
    <div
      className={`flex min-h-[120px] min-w-[200px] flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 transition-colors ${
        selected ? 'border-primary-500 bg-primary-50/50' : 'border-border bg-muted/80'
      }`}
    >
      <Link
        href="/dashboard/objectives"
        className="inline-flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm ring-1 ring-border transition hover:bg-muted hover:ring-border"
      >
        <Plus className="h-4 w-4 text-muted-foreground" />
        Add aligned objective
      </Link>
      <p className="mt-2 max-w-[180px] text-center text-xs text-muted-foreground">
        Create a child objective under this plan from the Objectives page.
      </p>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-gray-400" />
    </div>
  )
})

AddSubPlanNode.displayName = 'AddSubPlanNode'

export default AddSubPlanNode
