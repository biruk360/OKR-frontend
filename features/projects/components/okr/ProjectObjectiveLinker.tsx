'use client'

import { useState } from 'react'
import { Target, Link2, X } from 'lucide-react'
import { useObjectivesForLink } from '../../hooks/useObjectives'
import { useUpdateProject } from '../../hooks/useProject'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  projectId: string
  objectiveId: string | null
  canEdit: boolean
}

export function ProjectObjectiveLinker({ projectId, objectiveId, canEdit }: Props) {
  const { data: objectives, isLoading } = useObjectivesForLink(canEdit)
  const updateProject = useUpdateProject(projectId)
  const [value, setValue] = useState<string>(objectiveId ?? 'none')

  const handleChange = async (next: string) => {
    setValue(next)
    const payload = next === 'none' ? { objectiveId: null } : { objectiveId: next }
    try {
      await updateProject.mutateAsync(payload)
    } catch {
      setValue(objectiveId ?? 'none')
    }
  }

  const selected = objectives?.find((o) => o.id === objectiveId)

  if (!canEdit) {
    return (
      <div className="flex items-center gap-2 text-body-sm text-ink-secondary">
        <Target className="size-4" />
        {selected ? (
          <span>
            Linked objective: <span className="font-medium text-ink-primary">{selected.title}</span>
          </span>
        ) : (
          <span>No objective linked</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-body-sm text-ink-secondary">
        <Link2 className="size-4" />
        <span>Objective</span>
      </div>
      <Select value={value} onValueChange={handleChange} disabled={isLoading || updateProject.isPending}>
        <SelectTrigger className="w-64" size="sm">
          <SelectValue placeholder="Link to objective…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="flex items-center gap-2">
              <X className="size-3 text-ink-tertiary" /> None
            </span>
          </SelectItem>
          {objectives?.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              <span className="truncate" title={o.title}>
                {o.title}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
