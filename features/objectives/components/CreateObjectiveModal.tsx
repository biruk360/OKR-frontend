'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Target } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { CreateObjectiveForm, ObjectiveLevel } from '@/types'
import ParentObjectiveSelector from './ParentObjectiveSelector'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import { CHECK_IN_CADENCES, CHECK_IN_CADENCE_LABELS, normalizeCadence } from '@/lib/check-in-cadence'
import { Modal } from '@/components/ui'
import { useReferenceData } from '@/hooks'
import ContributorsPicker from './ContributorsPicker'

interface CreateObjectiveModalProps {
  isOpen: boolean
  onClose: () => void
  defaultLevel?: ObjectiveLevel
  title?: string
  defaultOwnerId?: string
  onObjectiveCreated?: () => void
  userDepartments?: any[]
}

interface FormData {
  title: string
  description: string
  level: ObjectiveLevel | ''
  ownerId: string
  timeframeId: string
  departmentId?: string
  parentObjectiveId?: string
  isPrivate?: boolean
  checkInCadence?: string
  contributorIds?: string[]
}

export default function CreateObjectiveModal({
  isOpen,
  onClose,
  defaultLevel,
  title,
  defaultOwnerId,
  onObjectiveCreated,
  userDepartments = [],
}: CreateObjectiveModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { data: session } = useSession()

  const { users, timeframes, departments } = useReferenceData({ enabled: isOpen })

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      level: defaultLevel || '',
      title: title || '',
      ownerId: defaultOwnerId || '',
    },
  })

  const selectedLevel = watch('level')
  const selectedTimeframe = watch('timeframeId')

  useEffect(() => {
    if (isOpen) {
      reset({
        level: defaultLevel || 'INDIVIDUAL',
        title: '',
        description: '',
        ownerId: defaultOwnerId || session?.user?.id || '',
        timeframeId: '',
        departmentId: '',
        parentObjectiveId: '',
        isPrivate: false,
        contributorIds: [],
      })
    }
  }, [isOpen, defaultLevel, defaultOwnerId, session?.user?.id, reset])

  // Default to the current timeframe once timeframes have loaded
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

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)

    try {
      const payload = {
        title: data.title,
        description: data.description?.trim() ? data.description.trim() : undefined,
        level: data.level,
        ownerId: data.ownerId,
        timeframeId: data.timeframeId,
        departmentId: data.departmentId || null,
        parentObjectiveId: data.parentObjectiveId || null,
        isPrivate: data.isPrivate || false,
        checkInCadence: normalizeCadence(data.checkInCadence),
        contributorIds: (data.contributorIds ?? []).filter((id) => id && id !== data.ownerId),
      }

      const response = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (response.ok) {
        const successMessage =
          selectedLevel === 'COMPANY'
            ? 'Company objective created successfully.'
            : selectedLevel === 'DEPARTMENT'
            ? 'Department objective created successfully.'
            : selectedLevel === 'INDIVIDUAL'
            ? 'Individual objective created successfully.'
            : 'Objective created successfully!'
        toast.success(successMessage)
        reset()
        onClose()
        onObjectiveCreated?.()
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to create objective')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const modalTitle =
    title ||
    (defaultLevel === 'COMPANY'
      ? 'Add Company Objective'
      : defaultLevel === 'DEPARTMENT'
      ? 'Add Department Objective'
      : defaultLevel === 'INDIVIDUAL'
      ? 'Add My Objective'
      : 'Create New Objective')

  return (
    <Modal open={isOpen} onClose={onClose} title={modalTitle} icon={Target} iconClassName="text-primary-600" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-muted-foreground mb-1">
            Objective Title *
          </label>
          <input
            {...register('title', { required: 'Objective Title is required.' })}
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
            <label htmlFor="level" className="block text-sm font-medium text-muted-foreground mb-1">
              Level *
            </label>
            <select
              {...register('level', { required: 'Level is required' })}
              className="input"
              disabled={!!defaultLevel}
            >
              <option value="">Select level</option>
              <option value="COMPANY">Company</option>
              <option value="DEPARTMENT">Department</option>
              <option value="INDIVIDUAL">Individual</option>
            </select>
            {errors.level && <p className="mt-1 text-sm text-red-600">{errors.level.message}</p>}
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
                  timeframe.type === 'MONTHLY'
                    ? 'Monthly'
                    : timeframe.type === 'QUARTERLY'
                    ? 'Quarterly'
                    : timeframe.type === 'SIX_MONTH'
                    ? '6-Month'
                    : timeframe.type === 'YEARLY'
                    ? 'Yearly'
                    : 'Quarterly'
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
          <label htmlFor="ownerId" className="block text-sm font-medium text-muted-foreground mb-1">
            Owner *
          </label>
          <select
            {...register('ownerId', { required: 'An owner must be assigned.' })}
            className="input"
            disabled={!!defaultOwnerId}
          >
            <option value="">Select owner</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.role})
              </option>
            ))}
          </select>
          {errors.ownerId && <p className="mt-1 text-sm text-red-600">{errors.ownerId.message}</p>}
          {defaultOwnerId && (
            <p className="mt-1 text-sm text-muted-foreground">
              Owner is automatically set to you for individual objectives
            </p>
          )}
        </div>

        {/* Contributors — additional users collaborating on this objective (not the owner) */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Contributors
          </label>
          <ContributorsPicker
            users={users}
            ownerId={watch('ownerId') || ''}
            value={watch('contributorIds') ?? []}
            onChange={(ids) => setValue('contributorIds', ids)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Teammates who help deliver this objective. They&apos;re distinct from the owner.
          </p>
        </div>

        {selectedLevel === 'DEPARTMENT' && (
          <div>
            <label htmlFor="departmentId" className="block text-sm font-medium text-muted-foreground mb-1">
              Department *
            </label>
            <select
              {...register('departmentId', { required: 'Department is required' })}
              className="input"
            >
              <option value="">Select department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            {errors.departmentId && (
              <p className="mt-1 text-sm text-danger-600">{errors.departmentId.message}</p>
            )}
          </div>
        )}

        {(selectedLevel === 'DEPARTMENT' || selectedLevel === 'INDIVIDUAL') && selectedTimeframe && (
          <ParentObjectiveSelector
            selectedParentId={watch('parentObjectiveId') || null}
            onSelectParent={(parentId) => setValue('parentObjectiveId', parentId || '')}
            currentTimeframeId={selectedTimeframe}
            currentObjectiveLevel={selectedLevel}
            className="mb-4"
          />
        )}

        <div>
          <label htmlFor="checkInCadence" className="block text-sm font-medium text-muted-foreground mb-1">
            Check-in cadence *
          </label>
          <select
            {...register('checkInCadence', { required: 'A check-in cadence is required.' })}
            defaultValue="WEEKLY"
            className="input"
          >
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
