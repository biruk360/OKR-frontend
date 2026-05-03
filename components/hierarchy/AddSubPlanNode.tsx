'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Plus } from 'lucide-react'

export interface AddSubPlanNodeData {
  parentObjectiveId: string
  parentTitle?: string
  parentLevel?: string
  /** Set by OKRHierarchy — opens the AddAlignedObjectiveModal with this parent context. */
  onAdd?: (args: { parentObjectiveId: string; parentTitle?: string; parentLevel?: string }) => void
}

const AddSubPlanNode = memo(({ data, selected }: NodeProps<AddSubPlanNodeData>) => {
  const handleClick = () => {
    data.onAdd?.({
      parentObjectiveId: data.parentObjectiveId,
      parentTitle: data.parentTitle,
      parentLevel: data.parentLevel,
    })
  }

  return (
    <div
      className={`flex min-h-[120px] min-w-[200px] flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 transition-colors ${
        selected ? 'border-primary-500 bg-primary-50/50' : 'border-border bg-muted/80'
      }`}
    >
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm ring-1 ring-border transition hover:bg-blue-50 hover:text-blue-700 hover:ring-blue-300"
      >
        <Plus className="h-4 w-4" />
        Add aligned objective
      </button>
      <p className="mt-2 max-w-[180px] text-center text-xs text-muted-foreground">
        Pick an existing objective to roll up here, or create a new one.
      </p>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-gray-400" />
    </div>
  )
})

AddSubPlanNode.displayName = 'AddSubPlanNode'

export default AddSubPlanNode
