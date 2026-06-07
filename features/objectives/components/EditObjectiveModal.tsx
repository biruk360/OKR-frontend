'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Target } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { ObjectiveLevel } from '@/types'
import ParentObjectiveSelector from './ParentObjectiveSelector'
import { CHECK_IN_CADENCES, CHECK_IN_CADENCE_LABELS, normalizeCadence, type CheckInCadence } from '@/lib/check-in-cadence'
import { Modal } from '@/components/ui'
import { useReferenceData } from '@/hooks'
import ContributorsPicker from './ContributorsPicker'

interface EditObjectiveModalProps {
  isOpen: boolean
  onClose: () => void
  objective: any
}

interface FormData {
  title: string
  description: string
  ownerId: string
  timeframeId: string
  departmentId?: string
  parentObjectiveId?: string
  isPrivate?: boolean
  alignmentType: 'LOOSE' | 'STRICT_DEPENDENCY'
  rollupCalculation: 'NONE' | 'AVERAGE' | 'SUM'
  checkInCadence: CheckInCadence
  contributorIds?: string[]
}

export default function EditObjectiveModal({ isOpen, onClose, objective }: EditObjectiveModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const { users, timeframes, departments } = useReferenceData({ enabled: isOpen })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>()

  useEffect(() => {
    if (isOpen && objective) {
      const existingContributorIds: string[] = Array.isArray((objective as any).contributors)
        ? (objective as any).contributors.map((c: any) => c?.user?.id ?? c?.userId).filter(Boolean)
        : []
      reset({
        title: objective.title || '',
        description: objective.description || '',
        ownerId: objective.ownerId || '',
        timeframeId: objective.timeframeId || '',
        departmentId: objective.departmentId || '',
        parentObjectiveId: objective.parentObjectiveId || '',
        isPrivate: objective.isPrivate || false,
        alignmentType:
          objective.alignmentType === 'STRICT_DEPENDENCY' ? 'STRICT_DEPENDENCY' : 'LOOSE',
        rollupCalculation:
          objective.rollupCalculation === 'AVERAGE' || objective.rollupCalculation === 'SUM'
            ? objective.rollupCalculation
            : 'NONE',
        checkInCadence: normalizeCadence(objective.checkInCadence),
        contributorIds: existingContributorIds,
      })
    }
  }, [isOpen, objective, reset])

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)

    try {
      const response = await fetch(`/api/objectives/${objective.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          alignmentType: data.alignmentType,
          rollupCalculation:
            data.alignmentType === 'LOOSE' ? 'NONE' : data.rollupCalculation,
          checkInCadence: normalizeCadence(data.checkInCadence),
          contributorIds: (data.contributorIds ?? []).filter(
            (id) => id && id !== data.ownerId,
          ),
        }),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Objective updated successfully.')
        onClose()
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to update objective')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!objective) return null

  return (
    <Modal open={isOpen} onClose={onClose} title="Edit Objective" icon={Target} iconClassName="text-primary-600" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-muted-foreground mb-1">
            Objective Title *
          </label>
          <input
            {...register('title', { required: 'Objective Title cannot be empty.' })}
            type="text"
            className="input"
            placeholder="Enter objective title"
          />
          {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-muted-foreground mb-1">
            Description
          </label>
          <textarea
            {...register('description')}
            rows={3}
            className="input"
            placeholder="Enter objective description"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ownerId" className="block text-sm font-medium text-muted-foreground mb-1">
              Owner *
            </label>
            <select
              {...register('ownerId', { required: 'An owner must be assigned.' })}
              className="input"
            >
              <option value="">Select owner</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
            {errors.ownerId && <p className="mt-1 text-sm text-red-600">{errors.ownerId.message}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-muted-foreground mb-1">Contributors</label>
            <ContributorsPicker
              users={users}
              ownerId={watch('ownerId') || ''}
              value={watch('contributorIds') ?? []}
              onChange={(ids) => setValue('contributorIds', ids)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Teammates collaborating on this objective. Saved separately from the owner.
            </p>
          </div>

          <div>
            <label htmlFor="timeframeId" className="block text-sm font-medium text-muted-foreground mb-1">
              Timeframe *
            </label>
            <select
              {...register('timeframeId', { required: 'A timeframe is required.' })}
              className="input"
            >
              <option value="">Select timeframe</option>
              {timeframes.map((timeframe) => {
                const typeLabel =
                  timeframe.type === 'MONTHLY' ? 'Monthly' :
                  timeframe.type === 'QUARTERLY' ? 'Quarterly' :
                  timeframe.type === 'SIX_MONTH' ? '6-Month' :
                  timeframe.type === 'YEARLY' ? 'Yearly' : 'Quarterly'
                return (
                  <option key={timeframe.id} value={timeframe.id}>
                    {timeframe.name} ({typeLabel})
                  </option>
                )
              })}
            </select>
            {errors.timeframeId && (
              <p className="mt-1 text-sm text-red-600">{errors.timeframeId.message}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="departmentId" className="block text-sm font-medium text-muted-foreground mb-1">
            Department {objective.level === 'DEPARTMENT' ? '*' : <span className="font-normal text-muted-foreground/70">{objective.level === 'COMPANY' ? '(not applicable)' : '(optional)'}</span>}
          </label>
          {objective.level === 'COMPANY' ? (
            <input
              type="text"
              value="— Company OKRs are not assigned to a department —"
              disabled
              className="input bg-muted/40 text-muted-foreground cursor-not-allowed"
            />
          ) : (
            <>
              <select
                {...register('departmentId', objective.level === 'DEPARTMENT' ? { required: 'Department is required.' } : {})}
                className="input"
              >
                <option value="">
                  {objective.level === 'DEPARTMENT'
                    ? 'Select department'
                    : '— Inherit from owner’s primary department —'}
                </option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              {errors.departmentId && (
                <p className="mt-1 text-sm text-red-600">{errors.departmentId.message}</p>
              )}
              {objective.level === 'INDIVIDUAL' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Clear to re-inherit from the owner&apos;s primary department.
                </p>
              )}
            </>
          )}
        </div>

        {(objective.level === 'DEPARTMENT' || objective.level === 'INDIVIDUAL') && (
          <ParentObjectiveSelector
            selectedParentId={watch('parentObjectiveId') || null}
            onSelectParent={(parentId) => setValue('parentObjectiveId', parentId || '')}
            currentTimeframeId={watch('timeframeId')}
            currentObjectiveId={objective.id}
            currentObjectiveLevel={objective.level}
            knownParent={
              objective.parentObjective
                ? {
                    id: objective.parentObjective.id,
                    title: objective.parentObjective.title,
                    level: objective.parentObjective.level,
                    timeframeName: objective.timeframe?.name,
                  }
                : null
            }
            className="mb-4"
          />
        )}

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">Check-in cadence *</label>
          <select {...register('checkInCadence', { required: true })} className="input">
            {CHECK_IN_CADENCES.map((c) => (
              <option key={c} value={c}>
                {CHECK_IN_CADENCE_LABELS[c]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Owner gets a reminder on the dashboard and via the Monday email digest.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/80 p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Progress roll-up (aligned children)</p>
          <p className="text-xs text-muted-foreground">
            When <strong>Strict</strong> is on and you choose average or sum, this objective&apos;s
            progress is derived from its active child objectives (not from key results) as long as it
            has at least one child. Otherwise progress follows key results as usual.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Alignment mode</label>
              <select {...register('alignmentType')} className="input text-sm">
                <option value="LOOSE">Loose (visual link only)</option>
                <option value="STRICT_DEPENDENCY">Strict (roll up from children)</option>
              </select>
              {watch('alignmentType') === 'LOOSE' ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Visual alignment only — progress does not roll up to parent.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Progress rolls up to parent using the configured rollup calculation.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Roll-up calculation</label>
              <select
                {...register('rollupCalculation')}
                className="input text-sm"
                disabled={watch('alignmentType') === 'LOOSE'}
              >
                <option value="NONE">None</option>
                <option value="AVERAGE">Average of child %</option>
                <option value="SUM">Sum of child % (capped at 100%)</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              {...register('isPrivate')}
              className="h-4 w-4 text-blue-600 focus:ring-ring border-border rounded"
            />
            <span className="ml-2 text-sm text-muted-foreground">Make this objective private</span>
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Private objectives will show as &quot;[Private Objective]&quot; to other users, but progress percentage will remain visible.
          </p>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-6 border-t border-border">
          <button type="button" onClick={onClose} className="btn-outline" disabled={isLoading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Saving...
              </div>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
