'use client'

/**
 * DecideModal: record a decision (DEC-2) or change a recorded one (DEC-4).
 *
 * Recording requires the decision text and stamps the decision date (today by
 * default). Linked dependencies of type DECISION are marked done unless the
 * decider unticks the box. Changing a recorded decision only edits its text.
 * Callers open it only when the decision's `access.canDecide` is true; the
 * server enforces the rule again.
 */
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Gavel } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useDecideDecision, useUpdateDecision } from '../hooks/queries'
import { DECISION_TEXT_MAX } from '../services/schemas'
import { zodFormResolver } from '../services/zod-resolver'
import type { DecisionDTO } from '../types'
import { DecisionStatusBadge, DecisionTextBlock, formatDecisionDate } from './DecisionBits'

const formSchema = z.object({
  decisionText: z
    .string()
    .trim()
    .min(1, 'Write down what was decided')
    .max(DECISION_TEXT_MAX, `Keep it under ${DECISION_TEXT_MAX} characters`),
  decidedAt: z.string(),
  closeDependencies: z.boolean(),
})
type FormValues = z.infer<typeof formSchema>

const resolver = zodFormResolver(formSchema)

function todayInput(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
      {message}
    </p>
  )
}

export interface DecideModalProps {
  open: boolean
  onClose: () => void
  decision: DecisionDTO | null
  onDone?: () => void
}

export function DecideModal({ open, onClose, decision, onDone }: DecideModalProps) {
  const decide = useDecideDecision()
  const update = useUpdateDecision()
  const saving = decide.isPending || update.isPending
  const isChange = decision?.status === 'DECIDED'

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver,
    defaultValues: { decisionText: '', decidedAt: todayInput(), closeDependencies: true },
  })

  useEffect(() => {
    if (open) {
      reset({
        decisionText: decision?.decisionText ?? '',
        decidedAt: decision?.decidedAt ? decision.decidedAt.slice(0, 10) : todayInput(),
        closeDependencies: true,
      })
    }
    // Reset only when the dialog opens or the decision changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, decision?.id])

  if (!decision) return null

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isChange) {
        await update.mutateAsync({ id: decision.id, body: { decisionText: values.decisionText.trim() } })
      } else {
        await decide.mutateAsync({
          id: decision.id,
          body: {
            decisionText: values.decisionText.trim(),
            decidedAt: values.decidedAt || null,
            closeDependencies: values.closeDependencies,
          },
        })
      }
      onDone?.()
      onClose()
    } catch {
      // The mutation hook shows the error; keep the dialog open with the text.
    }
  })

  const neededBy = formatDecisionDate(decision.neededBy)
  const hasDependencyLinks = decision.links.some((l) => l.entityType === 'DEPENDENCY')

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={isChange ? 'Change decision' : 'Record decision'}
      icon={Gavel}
      size="md"
      closeOnBackdrop={!isDirty}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-[var(--ap-fg-subtle)]">
            {isChange
              ? 'The change is logged and the old text kept in the activity log.'
              : 'The requester and everyone linked are notified.'}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="decide-decision-form" disabled={saving}>
              {saving ? 'Saving…' : isChange ? 'Save decision' : 'Record decision'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="decide-decision-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            {decision.externalRef && (
              <span className="text-caption font-semibold text-[var(--ap-fg-subtle)]">{decision.externalRef}</span>
            )}
            <DecisionStatusBadge status={decision.status} />
            {neededBy && <span className="text-caption text-[var(--ap-fg-subtle)]">Needed by {neededBy}</span>}
          </div>
          <p className="mt-1 text-body font-medium text-[var(--ap-fg)]">{decision.title}</p>
          <DecisionTextBlock label="Options / recommendation" text={decision.optionsText} className="mt-2" />
          <DecisionTextBlock label="Unblocks" text={decision.unblocksText} className="mt-2" />
        </div>

        <div>
          <Label htmlFor="decide-text">Decision</Label>
          <Textarea
            id="decide-text"
            rows={5}
            className="mt-1"
            placeholder="What was decided, and anything people need to act on it."
            aria-invalid={!!errors.decisionText}
            {...register('decisionText')}
          />
          <FieldError message={errors.decisionText?.message} />
        </div>

        {!isChange && (
          <>
            <div className="max-w-[12rem]">
              <Label htmlFor="decide-date">Decided on</Label>
              <Input id="decide-date" type="date" className="mt-1" max={todayInput()} {...register('decidedAt')} />
            </div>
            <Controller
              control={control}
              name="closeDependencies"
              render={({ field }) => (
                <label className="flex items-start gap-2 text-body-sm text-[var(--ap-fg)]">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Mark dependencies waiting on this decision as done
                    <span className="block text-caption text-[var(--ap-fg-subtle)]">
                      {hasDependencyLinks
                        ? 'Linked dependencies of type Decision are closed; they can be reopened later.'
                        : 'Applies to any dependency of type Decision that points at this decision.'}
                    </span>
                  </span>
                </label>
              )}
            />
          </>
        )}
      </form>
    </Modal>
  )
}
