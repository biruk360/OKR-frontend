'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { ConfirmDialog, Checkbox, Label, Textarea } from '@/components/ui'

interface ReopenFormData {
  reason: string
  reopenKeyResults: boolean
}

interface OkrReopenDialogProps {
  open: boolean
  onClose: () => void
  entity: any
  entityType: 'objective' | 'keyResult'
  onReopened?: () => void
}

export default function OkrReopenDialog({
  open,
  onClose,
  entity,
  entityType,
  onReopened,
}: OkrReopenDialogProps) {
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<ReopenFormData>({
    defaultValues: { reason: '', reopenKeyResults: false },
  })

  useEffect(() => {
    if (open) reset({ reason: '', reopenKeyResults: false })
  }, [open, reset])

  const reason = watch('reason') || ''
  const reopenKeyResults = watch('reopenKeyResults')
  const isObjective = entityType === 'objective'
  const hasRolledForwardCopy = Array.isArray(entity?.rolledTo)
    ? entity.rolledTo.length > 0
    : Boolean(entity?.rolledToId || entity?._count?.rolledTo)

  const submit = handleSubmit(async (values) => {
    try {
      const path = isObjective ? 'objectives' : 'keyresults'
      const response = await fetch(`/api/${path}/${entity.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: values.reason.trim(),
          ...(isObjective ? { reopenKeyResults: values.reopenKeyResults } : {}),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Failed to reopen ${isObjective ? 'Objective' : 'Key Result'}`)
      }
      toast.success(`${isObjective ? 'Objective' : 'Key Result'} reopened. The audit scar remains visible.`)
      onClose()
      onReopened?.()
    } catch (error: any) {
      toast.error(error.message || 'Reopen failed')
    }
  }, (validationErrors) => {
    if (validationErrors.reason?.message) toast.error(validationErrors.reason.message)
  })

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={submit}
      title={`Reopen ${isObjective ? 'Objective' : 'Key Result'}`}
      message="Reopening restores editing, but does not erase the close history."
      description="The reason, person, and time will remain permanently visible in the audit trail."
      variant="warning"
      icon={RotateCcw}
      confirmLabel="Reopen"
      loadingLabel="Reopening..."
      isLoading={isSubmitting}
      disabled={reason.trim().length < 20}
      bullets={[
        'The item becomes editable again.',
        'Its close snapshot and retrospective remain available.',
        ...(hasRolledForwardCopy ? ['A rolled-forward copy already exists and will not be changed.'] : []),
      ]}
      bulletsTitle="Before you reopen:"
      extraContent={
        <div className="space-y-4">
          <div>
            <Label htmlFor={`reopen-reason-${entity?.id}`}>Reason for reopening</Label>
            <Textarea
              id={`reopen-reason-${entity?.id}`}
              className="mt-2 min-h-24"
              placeholder="Explain what changed and why this item needs to be reopened."
              {...register('reason', {
                required: 'A reopen reason is required.',
                validate: (value) => value.trim().length >= 20 || 'Use at least 20 characters so the audit record is meaningful.',
              })}
            />
            <div className="mt-1 flex justify-between gap-3 text-xs">
              <span className="text-destructive">{errors.reason?.message}</span>
              <span className="ml-auto text-muted-foreground">{reason.trim().length}/20 minimum</span>
            </div>
          </div>

          {isObjective && (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <Checkbox
                id={`reopen-krs-${entity?.id}`}
                checked={reopenKeyResults}
                onCheckedChange={(checked) => setValue('reopenKeyResults', checked === true)}
              />
              <div>
                <Label htmlFor={`reopen-krs-${entity?.id}`}>Also reopen closed Key Results</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Off by default. Each reopened Key Result receives its own permanent audit scar.
                </p>
              </div>
            </div>
          )}
        </div>
      }
    />
  )
}
