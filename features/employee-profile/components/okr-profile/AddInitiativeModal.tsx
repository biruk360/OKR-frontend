'use client'

/**
 * PRF-11 "Add a milestone or task" under a KR. A milestone is a dated one-time
 * deliverable proving progress on the KR (Todo kind=MILESTONE); a task is a step
 * planned in sprints (kind=TASK). Posts to /api/users/[id]/okr-profile/initiatives,
 * which applies the KR initiative-create rules (lock guard, KR edit permission).
 */
import { useEffect } from 'react'
import { Controller, useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { CheckSquare, Flag } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { cn } from '@/lib/utils'
import { useCreateProfileInitiative } from './okr-profile-api'
import {
  PROFILE_INITIATIVE_KINDS,
  profileInitiativeFormSchema,
  type ProfileInitiativeFormValues,
  type ProfileInitiativeKind,
} from './schemas'
import type { OkrProfileKeyResult, OkrProfilePerson } from './types'

const UNASSIGNED = '__unassigned__'

/** Zod → react-hook-form bridge (no @hookform/resolvers in this repo). */
const resolver: Resolver<ProfileInitiativeFormValues> = async (values) => {
  const result = profileInitiativeFormSchema.safeParse(values)
  if (result.success) return { values: result.data, errors: {} }
  const errors: FieldErrors<ProfileInitiativeFormValues> = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ProfileInitiativeFormValues | undefined
    if (key && !errors[key]) (errors as Record<string, unknown>)[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors }
}

const KIND_META: Record<ProfileInitiativeKind, { label: string; hint: string; icon: typeof Flag }> = {
  MILESTONE: { label: 'Milestone', hint: 'A dated, one-time deliverable that proves progress on the KR.', icon: Flag },
  TASK: { label: 'Task', hint: 'A step of the work, planned in two-week sprints.', icon: CheckSquare },
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
      {message}
    </p>
  )
}

export interface AddInitiativeModalProps {
  /** Profile person (default assignee). */
  subject: OkrProfilePerson
  target: { keyResult: OkrProfileKeyResult; kind: ProfileInitiativeKind } | null
  onClose: () => void
}

export function AddInitiativeModal({ subject, target, onClose }: AddInitiativeModalProps) {
  const create = useCreateProfileInitiative(subject.id)
  const users = useUsersForSelection({ enabled: !!target })
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProfileInitiativeFormValues>({
    resolver,
    defaultValues: { kind: 'MILESTONE', title: '', dueDate: '', assigneeId: subject.id },
  })

  useEffect(() => {
    if (target) reset({ kind: target.kind, title: '', dueDate: '', assigneeId: subject.id })
  }, [target, subject.id, reset])

  const kind = watch('kind')
  const kr = target?.keyResult

  const onSubmit = handleSubmit(async (values) => {
    if (!kr) return
    try {
      await create.mutateAsync({
        keyResultId: kr.id,
        kind: values.kind,
        title: values.title.trim(),
        dueDate: values.dueDate || null,
        assigneeId: values.assigneeId === UNASSIGNED ? null : values.assigneeId,
      })
      onClose()
    } catch {
      // Toast shown by the mutation; keep the form open.
    }
  })

  const userOptions = users.users.map((u) => ({ id: u.id, name: u.name ?? u.email }))
  if (!userOptions.some((u) => u.id === subject.id)) userOptions.unshift({ id: subject.id, name: subject.name ?? 'This person' })

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={`Add ${KIND_META[kind ?? 'MILESTONE'].label.toLowerCase()}`}
      icon={KIND_META[kind ?? 'MILESTONE'].icon}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={create.isPending || !kr}>
            {create.isPending ? 'Adding…' : `Add ${KIND_META[kind ?? 'MILESTONE'].label.toLowerCase()}`}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {kr && (
          <p className="text-body-sm text-[var(--ap-fg-secondary)]">
            Under{' '}
            <span className="font-semibold text-[var(--ap-fg)]">
              {kr.ref ? `${kr.ref} · ` : ''}
              {kr.title}
            </span>
          </p>
        )}

        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <div role="radiogroup" aria-label="Kind" className="grid grid-cols-2 gap-2">
              {PROFILE_INITIATIVE_KINDS.map((k) => {
                const meta = KIND_META[k]
                const Icon = meta.icon
                const selected = field.value === k
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => field.onChange(k)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-[var(--ap-radius-sm)] border p-2.5 text-left ap-focus-ring',
                      selected
                        ? 'border-[var(--ap-accent)] bg-[var(--ap-accent-soft)]'
                        : 'border-[var(--ap-border)] bg-[var(--ap-bg-raised)] hover:bg-[var(--ap-bg-hover)]',
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-[var(--ap-fg)]">
                      <Icon className="size-3.5" aria-hidden />
                      {meta.label}
                    </span>
                    <span className="text-caption text-[var(--ap-fg-muted)]">{meta.hint}</span>
                  </button>
                )
              })}
            </div>
          )}
        />

        <div>
          <Label htmlFor="okr-profile-initiative-title">Title</Label>
          <Input
            id="okr-profile-initiative-title"
            autoFocus
            placeholder={kind === 'MILESTONE' ? 'e.g. Pricing model signed off' : 'e.g. Draft the pricing options memo'}
            {...register('title')}
            aria-invalid={!!errors.title}
          />
          <FieldError message={errors.title?.message} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="okr-profile-initiative-due">Due date</Label>
            <Input id="okr-profile-initiative-due" type="date" {...register('dueDate')} aria-invalid={!!errors.dueDate} />
            <FieldError message={errors.dueDate?.message} />
          </div>
          <div>
            <Label htmlFor="okr-profile-initiative-assignee">Assignee</Label>
            <Controller
              control={control}
              name="assigneeId"
              render={({ field }) => (
                <Select value={field.value || UNASSIGNED} onValueChange={field.onChange}>
                  <SelectTrigger id="okr-profile-initiative-assignee" className="h-9 w-full" aria-label="Assignee">
                    <SelectValue placeholder="Choose a person" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {userOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.assigneeId?.message} />
          </div>
        </div>
      </form>
    </Modal>
  )
}
