'use client'

/**
 * The one create-objective form. Every entry point uses it: the Objectives
 * page (incl. `?createUnder=` from "Add aligned objective"), the company /
 * department / "my objective" buttons, and the Goals page + My Team view
 * (via the CreateGoalModal adapter in features/goals).
 *
 * Validation: zod schema in ../services/create-objective-schema.ts, wired into
 * react-hook-form through a small resolver bridge.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Target } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import type { ObjectiveLevel } from '@/types'
import ParentObjectiveSelector from './ParentObjectiveSelector'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import { CHECK_IN_CADENCES, CHECK_IN_CADENCE_LABELS } from '@/lib/check-in-cadence'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui'
import { useReferenceData } from '@/hooks'
import ContributorsPicker from './ContributorsPicker'
import {
  OBJECTIVE_LEVELS,
  buildCreateObjectivePayload,
  childLevelFor,
  createObjectiveResolver,
  createObjectiveSchema,
  type CreateObjectiveValues,
} from '../services/create-objective-schema'

interface CreateObjectiveModalProps {
  isOpen: boolean
  onClose: () => void
  defaultLevel?: ObjectiveLevel
  /** Modal heading. */
  title?: string
  defaultOwnerId?: string
  /** Owner can't be changed (e.g. "Add My Objective"). Defaults to false. */
  lockOwner?: boolean
  /** Level can't be changed. Defaults to true when `defaultLevel` is given. */
  lockLevel?: boolean
  /** Pre-select the parent (aligned-to) objective; its timeframe is adopted. */
  defaultParentObjectiveId?: string
  onObjectiveCreated?: (objectiveId?: string) => void
  /** @deprecated kept for call-site compatibility; departments come from useReferenceData. */
  userDepartments?: unknown[]
}

interface KnownParent {
  id: string
  title: string
  level?: string
  ownerName?: string
  timeframeName?: string
}

const LEVEL_LABEL: Record<ObjectiveLevel, string> = {
  COMPANY: 'Company',
  DEPARTMENT: 'Department',
  INDIVIDUAL: 'Individual',
}

const TIMEFRAME_TYPE_LABEL: Record<string, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  SIX_MONTH: '6-Month',
  YEARLY: 'Yearly',
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-sm text-danger-600" role="alert">
      {message}
    </p>
  )
}

export default function CreateObjectiveModal({
  isOpen,
  onClose,
  defaultLevel,
  title,
  defaultOwnerId,
  lockOwner = false,
  lockLevel,
  defaultParentObjectiveId,
  onObjectiveCreated,
}: CreateObjectiveModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [labels, setLabels] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [knownParent, setKnownParent] = useState<KnownParent | null>(null)
  const router = useRouter()
  const { data: session } = useSession()
  const levelLocked = lockLevel ?? !!defaultLevel

  const { users, timeframes, departments } = useReferenceData({ enabled: isOpen })

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CreateObjectiveValues>({
    resolver: createObjectiveResolver,
    defaultValues: {
      level: defaultLevel || 'INDIVIDUAL',
      ownerId: defaultOwnerId || '',
      checkInCadence: 'WEEKLY',
      goalStatus: 'ON_TRACK',
    },
  })

  const selectedLevel = watch('level')
  const selectedTimeframe = watch('timeframeId')
  const selectedDepartmentId = watch('departmentId')
  const selectedOwnerId = watch('ownerId')
  const selectedLabels = watch('labelIds') ?? []

  // Reset on open + load labels.
  useEffect(() => {
    if (!isOpen) return
    reset({
      level: defaultLevel || 'INDIVIDUAL',
      title: '',
      description: '',
      ownerId: defaultOwnerId || session?.user?.id || '',
      timeframeId: '',
      departmentId: '',
      parentObjectiveId: defaultParentObjectiveId || '',
      isPrivate: false,
      checkInCadence: 'WEEKLY',
      goalStatus: 'ON_TRACK',
      startDate: '',
      endDate: '',
      contributorIds: [],
      labelIds: [],
    })
    setKnownParent(null)
    let cancelled = false
    fetch('/api/labels')
      .then((r) => r.json().catch(() => ({ success: false })))
      .then((d) => {
        if (!cancelled && d?.success) setLabels(d.data || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isOpen, defaultLevel, defaultOwnerId, defaultParentObjectiveId, session?.user?.id, reset])

  // "Add aligned objective": adopt the parent's timeframe and a sensible child level.
  useEffect(() => {
    if (!isOpen || !defaultParentObjectiveId) return
    let cancelled = false
    fetch(`/api/objectives/${defaultParentObjectiveId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success || !j.data) return
        const p = j.data
        setKnownParent({
          id: p.id,
          title: p.title,
          level: p.level,
          ownerName: p.owner?.name,
          timeframeName: p.timeframe?.name,
        })
        if (p.timeframe?.id || p.timeframeId) setValue('timeframeId', p.timeframe?.id ?? p.timeframeId)
        if (!defaultLevel) setValue('level', childLevelFor(p.level))
        setValue('parentObjectiveId', p.id)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isOpen, defaultParentObjectiveId, defaultLevel, setValue])

  // Default to the current timeframe once timeframes have loaded.
  useEffect(() => {
    if (!isOpen || timeframes.length === 0 || selectedTimeframe) return
    const current = pickCurrentTimeframe<{
      id: string
      startDate: string | Date
      endDate: string | Date
      isActive?: boolean
    }>(timeframes as any)
    if (current?.id) setValue('timeframeId', current.id)
  }, [isOpen, timeframes, selectedTimeframe, setValue])

  // Department objectives default their owner to the department head, unless
  // an owner was passed in.
  useEffect(() => {
    if (!isOpen) return
    if (selectedLevel !== 'DEPARTMENT' || !selectedDepartmentId) return
    if (defaultOwnerId || lockOwner) return
    let cancelled = false
    fetch(`/api/departments/${selectedDepartmentId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return
        const head = j.data?.memberships?.find((m: any) => m.role === 'HEAD' && !m.endedAt)
        if (head?.user?.id && head.user.id !== selectedOwnerId) {
          setValue('ownerId', head.user.id, { shouldDirty: false })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isOpen, selectedLevel, selectedDepartmentId, defaultOwnerId, lockOwner, selectedOwnerId, setValue])

  const onSubmit = async (values: CreateObjectiveValues) => {
    setIsLoading(true)
    try {
      const parsed = createObjectiveSchema.parse(values)
      const response = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCreateObjectivePayload(parsed)),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success === false) {
        toast.error(result?.error || `Failed to create objective (${response.status})`)
        return
      }

      const newId: string | undefined = result?.data?.id
      if (newId && parsed.labelIds.length > 0) {
        const labelResults = await Promise.allSettled(
          parsed.labelIds.map((labelId) =>
            fetch(`/api/objectives/${newId}/labels`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ labelId }),
            }).then((r) => {
              if (!r.ok) throw new Error('label')
            }),
          ),
        )
        if (labelResults.some((r) => r.status === 'rejected')) {
          toast.error('Objective created, but some labels could not be added.')
        }
      }

      toast.success(`${LEVEL_LABEL[parsed.level as ObjectiveLevel]} objective created.`)
      reset()
      onClose()
      onObjectiveCreated?.(newId)
      router.refresh()
    } catch {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const modalTitle =
    title ||
    (defaultParentObjectiveId
      ? 'Add Aligned Objective'
      : defaultLevel === 'COMPANY'
      ? 'Add Company Objective'
      : defaultLevel === 'DEPARTMENT'
      ? 'Add Department Objective'
      : defaultLevel === 'INDIVIDUAL'
      ? 'Add My Objective'
      : 'Create New Objective')

  const lockedOwner = lockOwner ? users.find((u) => u.id === selectedOwnerId) : null

  return (
    <Modal open={isOpen} onClose={onClose} title={modalTitle} icon={Target} iconClassName="text-primary-600" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div>
          <label htmlFor="create-objective-title" className="block text-sm font-medium text-muted-foreground mb-1">
            Objective title *
          </label>
          <input
            id="create-objective-title"
            {...register('title')}
            type="text"
            className="input"
            placeholder="Enter objective title"
            autoFocus
          />
          <FieldError message={errors.title?.message} />
        </div>

        <div>
          <label htmlFor="create-objective-description" className="block text-sm font-medium text-muted-foreground mb-1">
            Description
          </label>
          <textarea
            id="create-objective-description"
            {...register('description')}
            rows={3}
            className="input"
            placeholder="Enter objective description"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="block text-sm font-medium text-muted-foreground mb-1">Level *</span>
            <div
              role="radiogroup"
              aria-label="Objective level"
              className="inline-flex flex-wrap gap-1 rounded-[var(--ap-radius-sm)] p-0.5"
              style={{ background: 'var(--ap-bg-sunken)' }}
            >
              {OBJECTIVE_LEVELS.map((level) => {
                const active = selectedLevel === level
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={levelLocked && !active}
                    onClick={() => setValue('level', level, { shouldValidate: true })}
                    className={cn(
                      'px-3 py-1.5 rounded-[8px] text-sm font-medium transition-colors disabled:opacity-40',
                      active ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {LEVEL_LABEL[level]}
                  </button>
                )
              })}
            </div>
            <FieldError message={errors.level?.message} />
          </div>

          <div>
            <label htmlFor="create-objective-timeframe" className="block text-sm font-medium text-muted-foreground mb-1">
              Timeframe *
            </label>
            <select id="create-objective-timeframe" {...register('timeframeId')} className="input">
              <option value="">Select timeframe</option>
              {timeframes.map((timeframe) => (
                <option key={timeframe.id} value={timeframe.id}>
                  {timeframe.name} ({TIMEFRAME_TYPE_LABEL[(timeframe as any).type] ?? 'Quarterly'})
                </option>
              ))}
            </select>
            <FieldError message={errors.timeframeId?.message} />
          </div>
        </div>

        <div>
          <label htmlFor="create-objective-owner" className="block text-sm font-medium text-muted-foreground mb-1">
            Owner *
          </label>
          {lockOwner ? (
            <p id="create-objective-owner" className="input bg-muted/40 text-muted-foreground">
              {lockedOwner?.name ?? (selectedOwnerId === session?.user?.id ? session?.user?.name ?? 'You' : '—')}
            </p>
          ) : (
            <>
              <select id="create-objective-owner" {...register('ownerId')} className="input">
                <option value="">Select owner</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
              {session?.user?.id && selectedOwnerId !== session.user.id && (
                <button
                  type="button"
                  onClick={() => setValue('ownerId', session.user.id, { shouldValidate: true })}
                  className="mt-1 text-sm text-primary-600 hover:text-primary-700"
                >
                  Assign to me
                </button>
              )}
            </>
          )}
          <FieldError message={errors.ownerId?.message} />
        </div>

        <div>
          <span className="block text-sm font-medium text-muted-foreground mb-1">Contributors</span>
          <ContributorsPicker
            users={users}
            ownerId={selectedOwnerId || ''}
            value={watch('contributorIds') ?? []}
            onChange={(ids) => setValue('contributorIds', ids)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Teammates who help deliver this objective. They&apos;re distinct from the owner.
          </p>
        </div>

        <div>
          <label htmlFor="create-objective-department" className="block text-sm font-medium text-muted-foreground mb-1">
            Department{' '}
            {selectedLevel === 'DEPARTMENT' ? (
              '*'
            ) : (
              <span className="font-normal text-muted-foreground/70">
                {selectedLevel === 'COMPANY' ? '(not applicable)' : '(optional)'}
              </span>
            )}
          </label>
          {selectedLevel === 'COMPANY' ? (
            <p className="input bg-muted/40 text-muted-foreground">
              Company objectives are not assigned to a department
            </p>
          ) : (
            <>
              <select id="create-objective-department" {...register('departmentId')} className="input">
                <option value="">
                  {selectedLevel === 'DEPARTMENT' ? 'Select department' : '— Inherit from owner’s primary department —'}
                </option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              <FieldError message={errors.departmentId?.message} />
              {selectedLevel === 'INDIVIDUAL' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Leave blank to auto-derive from the owner&apos;s primary department, or pick one to override.
                </p>
              )}
            </>
          )}
        </div>

        {(selectedLevel === 'DEPARTMENT' || selectedLevel === 'INDIVIDUAL') && selectedTimeframe && (
          <ParentObjectiveSelector
            selectedParentId={watch('parentObjectiveId') || null}
            onSelectParent={(parentId) => setValue('parentObjectiveId', parentId || '')}
            currentTimeframeId={selectedTimeframe}
            currentObjectiveLevel={selectedLevel}
            knownParent={knownParent}
            className="mb-4"
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="create-objective-start" className="block text-sm font-medium text-muted-foreground mb-1">
              Start date <span className="font-normal text-muted-foreground/70">(optional)</span>
            </label>
            <input id="create-objective-start" {...register('startDate')} type="date" className="input" />
            <FieldError message={errors.startDate?.message} />
          </div>
          <div>
            <label htmlFor="create-objective-end" className="block text-sm font-medium text-muted-foreground mb-1">
              End date <span className="font-normal text-muted-foreground/70">(optional)</span>
            </label>
            <input id="create-objective-end" {...register('endDate')} type="date" className="input" />
            <FieldError message={errors.endDate?.message} />
          </div>
        </div>
        <p className="-mt-4 text-xs text-muted-foreground">Leave blank to use the timeframe&apos;s dates.</p>

        {labels.length > 0 && (
          <div>
            <span className="block text-sm font-medium text-muted-foreground mb-2">Labels</span>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => {
                const active = selectedLabels.includes(label.id)
                return (
                  <button
                    key={label.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setValue(
                        'labelIds',
                        active ? selectedLabels.filter((l) => l !== label.id) : [...selectedLabels, label.id],
                      )
                    }
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                      active ? 'border-2' : 'border',
                    )}
                    // Label colours are user data, not design tokens.
                    style={{
                      backgroundColor: active ? `${label.color}20` : 'transparent',
                      color: label.color,
                      borderColor: label.color,
                    }}
                  >
                    {label.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="create-objective-cadence" className="block text-sm font-medium text-muted-foreground mb-1">
              Check-in cadence *
            </label>
            <select id="create-objective-cadence" {...register('checkInCadence')} className="input">
              {CHECK_IN_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {CHECK_IN_CADENCE_LABELS[c]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              We&apos;ll remind the owner on their dashboard and via the Monday email digest.
            </p>
          </div>
          <div>
            <label htmlFor="create-objective-status" className="block text-sm font-medium text-muted-foreground mb-1">
              Initial status
            </label>
            <select id="create-objective-status" {...register('goalStatus')} className="input">
              <option value="ON_TRACK">On track</option>
              <option value="AT_RISK">At risk</option>
              <option value="OFF_TRACK">Off track</option>
            </select>
          </div>
        </div>

        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              {...register('isPrivate')}
              className="h-4 w-4 text-primary-600 focus:ring-ring border-border rounded"
            />
            <span className="ml-2 text-sm text-muted-foreground">Make this objective private</span>
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Private objectives show as &quot;[Private Objective]&quot; to other users, but progress percentage remains visible.
          </p>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-6 border-t border-border">
          <button type="button" onClick={onClose} className="btn-outline" disabled={isLoading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                Creating...
              </div>
            ) : (
              'Create Objective'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
