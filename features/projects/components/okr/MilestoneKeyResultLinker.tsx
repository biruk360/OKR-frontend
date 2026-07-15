'use client'

import { useState } from 'react'
import { Target, Link2, X } from 'lucide-react'
import { useKeyResultsForLink } from '../../hooks/useObjectives'
import { useUpdateMilestone } from '../../hooks/useProject'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  projectId: string
  milestoneId: string
  objectiveId: string | null | undefined
  keyResultId: string | null
  canEdit: boolean
}

export function MilestoneKeyResultLinker({
  projectId,
  milestoneId,
  objectiveId,
  keyResultId,
  canEdit,
}: Props) {
  const { data: keyResults, isLoading } = useKeyResultsForLink(objectiveId, canEdit)
  const updateMilestone = useUpdateMilestone(projectId)
  const [value, setValue] = useState<string>(keyResultId ?? 'none')

  const handleChange = async (next: string) => {
    setValue(next)
    const payload = next === 'none' ? { keyResultId: null } : { keyResultId: next }
    try {
      await updateMilestone.mutateAsync({ milestoneId, ...payload })
    } catch {
      setValue(keyResultId ?? 'none')
    }
  }

  const selected = keyResults?.find((kr) => kr.id === keyResultId)

  if (!canEdit) {
    return (
      <div className="flex items-center gap-2 text-body-sm text-ink-secondary">
        <Target className="size-4" />
        {selected ? (
          <span>
            Linked KR: <span className="font-medium text-ink-primary">{selected.title}</span>
          </span>
        ) : (
          <span>No KR linked</span>
        )}
      </div>
    )
  }

  if (!objectiveId) {
    return (
      <div className="flex items-center gap-2 text-body-sm text-ink-tertiary">
        <Link2 className="size-4" />
        <span>Link project to an objective to enable KR linking</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-body-sm text-ink-secondary">
        <Link2 className="size-4" />
        <span>KR</span>
      </div>
      <Select value={value} onValueChange={handleChange} disabled={isLoading || updateMilestone.isPending}>
        <SelectTrigger className="w-56" size="sm">
          <SelectValue placeholder="Link to KR…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="flex items-center gap-2">
              <X className="size-3 text-ink-tertiary" /> None
            </span>
          </SelectItem>
          {keyResults?.map((kr) => (
            <SelectItem key={kr.id} value={kr.id}>
              <span className="truncate" title={kr.title}>
                {kr.title} ({kr.progress}% {kr.unit})
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
