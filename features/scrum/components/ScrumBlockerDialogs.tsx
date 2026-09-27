'use client'

import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button, FilterSelect, Label, Modal, Textarea } from '@/components/ui'
import { useUsersForSelection } from '@/hooks'
import { useScrumBlockerAction } from '../hooks/queries'

interface BlockerDialogProps {
  updateId: string
  open: boolean
  onClose: () => void
}

/** Resolve a blocker — resolution note required (spec S5.1). Access is re-checked by the route. */
export function ScrumResolveBlockerDialog({ updateId, open, onClose }: BlockerDialogProps) {
  const action = useScrumBlockerAction()
  const { register, handleSubmit, reset, formState } = useForm<{ resolutionNote: string }>({ defaultValues: { resolutionNote: '' } })
  useEffect(() => { if (open) reset({ resolutionNote: '' }) }, [open, reset])

  function submit(values: { resolutionNote: string }) {
    action.mutate({ updateId, action: 'resolve', resolutionNote: values.resolutionNote.trim() }, { onSuccess: onClose })
  }

  return (
    <Modal open={open} onClose={onClose} title="Resolve blocker" icon={CheckCircle2} size="md">
      <form onSubmit={handleSubmit(submit)} className="space-y-3">
        <div>
          <Label htmlFor={`resolve-${updateId}`}>Resolution note</Label>
          <Textarea
            id={`resolve-${updateId}`}
            rows={4}
            placeholder="What unblocked it?"
            aria-invalid={!!formState.errors.resolutionNote}
            {...register('resolutionNote', {
              validate: (value) => value.trim().length >= 5 || 'Add at least 5 characters so the team knows what changed',
            })}
          />
          {formState.errors.resolutionNote && (
            <p className="mt-1 text-body-sm text-danger-700">{formState.errors.resolutionNote.message}</p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={action.isPending}>Resolve</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Escalate a blocker, optionally to a named person. Can create a RAID issue on the linked project. */
export function ScrumEscalateBlockerDialog({ updateId, open, onClose }: BlockerDialogProps) {
  const action = useScrumBlockerAction()
  const users = useUsersForSelection({ enabled: open })
  const { control, handleSubmit, reset } = useForm<{ escalatedToUserId?: string }>({ defaultValues: {} })
  useEffect(() => { if (open) reset({}) }, [open, reset])
  const options = useMemo(
    () => users.users.map((user) => ({ value: user.id, label: user.name || user.email })),
    [users.users],
  )

  function submit(values: { escalatedToUserId?: string }) {
    action.mutate({ updateId, action: 'escalate', escalatedToUserId: values.escalatedToUserId || null }, { onSuccess: onClose })
  }

  return (
    <Modal open={open} onClose={onClose} title="Escalate blocker" icon={AlertTriangle} size="md">
      <form onSubmit={handleSubmit(submit)} className="space-y-3">
        <p className="text-body-sm text-ink-secondary">
          The manager is notified. If the update is linked to a project, a RAID issue is opened and the activity is flagged as blocked.
        </p>
        <Controller
          control={control}
          name="escalatedToUserId"
          render={({ field }) => (
            <FilterSelect
              label="Escalate to (optional)"
              placeholder={users.isLoading ? 'Loading people…' : 'Manager only'}
              value={field.value}
              onValueChange={field.onChange}
              options={options}
              menuWidth={280}
              className="w-full"
            />
          )}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="destructive" disabled={action.isPending}>Escalate</Button>
        </div>
      </form>
    </Modal>
  )
}
