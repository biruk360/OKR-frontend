'use client'

import { useEffect, useId, useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useApproveRoleDefinition } from '../hooks/queries'
import type { RoleDefinitionDTO } from '../types'

export interface ApproveRoleDefinitionDialogProps {
  definition: RoleDefinitionDTO | null
  /** The subject's current User.designation (ROL-2 offer). */
  currentDesignation: string | null
  onClose: () => void
}

/**
 * ROL-1 / ROL-2 approve confirmation. The previous approved version in the same
 * timeframe becomes Superseded. Copying the seat title onto the job title is
 * offered (pre-ticked only when the person has no job title), never forced.
 */
export function ApproveRoleDefinitionDialog({ definition, currentDesignation, onClose }: ApproveRoleDefinitionDialogProps) {
  const approve = useApproveRoleDefinition()
  const checkboxId = useId()
  const offersDesignation = !!definition && definition.seatTitle !== (currentDesignation ?? '')
  const [updateDesignation, setUpdateDesignation] = useState(false)

  useEffect(() => {
    setUpdateDesignation(!!definition && !currentDesignation?.trim())
  }, [definition, currentDesignation])

  const scope = definition?.timeframeName ? `for ${definition.timeframeName}` : 'with no timeframe'

  return (
    <ConfirmDialog
      open={!!definition}
      onClose={() => !approve.isPending && onClose()}
      onConfirm={async () => {
        if (!definition) return
        try {
          await approve.mutateAsync({ id: definition.id, updateDesignation: offersDesignation && updateDesignation })
          onClose()
        } catch {
          // Toast shown by the hook.
        }
      }}
      variant="info"
      icon={BadgeCheck}
      title="Approve role definition"
      message={`Approve “${definition?.seatTitle ?? ''}” ${scope}?`}
      description="Any previously approved version in the same timeframe becomes Superseded and stays readable in the version history."
      confirmLabel="Approve"
      loadingLabel="Approving…"
      isLoading={approve.isPending}
      extraContent={
        offersDesignation ? (
          <label htmlFor={checkboxId} className="flex cursor-pointer items-start gap-2.5 rounded-[var(--ap-radius-md)] bg-[var(--ap-bg-sunken)] p-3">
            <Checkbox
              id={checkboxId}
              checked={updateDesignation}
              onCheckedChange={(checked) => setUpdateDesignation(checked === true)}
              className="mt-0.5"
            />
            <span className="text-body-sm text-[var(--ap-fg)]">
              Also set the job title to <strong>{definition?.seatTitle}</strong>
              <span className="block text-caption text-[var(--ap-fg-subtle)]">
                {currentDesignation ? `Currently “${currentDesignation}”.` : 'No job title is set today.'}
              </span>
            </span>
          </label>
        ) : null
      }
    />
  )
}
