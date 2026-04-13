'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Target } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'
import { ObjectiveLevel } from '@/types'
import { ParentObjectiveSelector } from '@/features/objectives'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import { CHECK_IN_CADENCES, CHECK_IN_CADENCE_LABELS } from '@/lib/check-in-cadence'
import { Modal } from '@/components/ui'
import { useReferenceData } from '@/hooks'

interface CreateGoalModalProps {
  isOpen: boolean
  onClose: () => void
  onGoalCreated?: () => void
  defaultOwnerId?: string
  defaultLevel?: ObjectiveLevel
}

interface FormData {
  title: string
  description: string
  level: ObjectiveLevel
  ownerId: string
  timeframeId: string
  departmentId?: string
  parentObjectiveId?: string
  isPrivate: boolean
  goalStatus: string
  startDate?: string
  endDate?: string
  labels: string[]
  checkInCadence?: string
}

export default function CreateGoalModal({
  isOpen,
  onClose,
  onGoalCreated,
  defaultOwnerId,
  defaultLevel,
}: CreateGoalModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [labels, setLabels] = useState<any[]>([])
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
      level: defaultLevel || 'INDIVIDUAL',
      ownerId: defaultOwnerId || '',
      isPrivate: false,
      goalStatus: 'ON_TRACK',
      labels: [],
      checkInCadence: 'WEEKLY',
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
        goalStatus: 'ON_TRACK',
        startDate: '',
        endDate: '',
        labels: [],
        checkInCadence: 'WEEKLY',
      })
      // labels aren't in useReferenceData; fetch separately
      fetch('/api/labels')
        .then((r) => r.json().catch(() => ({ success: false, data: [] })))
        .then((d) => {
          if (d.success) setLabels(d.data || [])
        })
        .catch(() => {})
    }
  }, [isOpen, defaultLevel, defaultOwnerId, session?.user?.id, reset])

  // Default timeframe once timeframes load
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
        isPrivate: Boolean(data.isPrivate),
        goalStatus: data.goalStatus,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        checkInCadence: data.checkInCadence || 'WEEKLY',
      }

      const response = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to create goal:', errorData)
        toast.error(errorData.error || `Failed to create goal (${response.status})`)
        return
      }

      const result = await response.json()

      if (data.labels && data.labels.length > 0 && result.data?.id) {
        try {
          await Promise.all(
            data.labels.map((labelId: string) =>
              fetch('/api/objectives/' + result.data.id + '/labels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ labelId }),
              }).catch((err) => {
                console.error('Error adding label:', err)
              })
            )
          )
        } catch (labelError) {
          console.error('Error adding labels:', labelError)
        }
      }

      toast.success('Goal created successfully!')
      reset()
      onClose()
      onGoalCreated?.()
      router.refresh()
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Create New Goal" icon={Target} iconClassName="text-primary-600" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Owner(s) *</label>
          <select {...register('ownerId', { required: 'Owner is required' })} className="input">
            <option value="">Select owner</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
          {session?.user?.id && (
            <button
              type="button"
              onClick={() => setValue('ownerId', session.user.id)}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800"
            >
              Add Myself
            </button>
          )}
          {errors.ownerId && <p className="mt-1 text-sm text-red-600">{errors.ownerId.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
          <div className="flex flex-wrap gap-2">
            {(['INDIVIDUAL', 'DEPARTMENT', 'COMPANY'] as ObjectiveLevel[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setValue('level', level)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedLevel === level
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {level === 'INDIVIDUAL' ? 'Individual' : level === 'DEPARTMENT' ? 'Department' : 'Company'}
              </button>
            ))}
          </div>
          {errors.level && <p className="mt-1 text-sm text-red-600">{errors.level.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input
            {...register('title', { required: 'Title is required' })}
            type="text"
            className="input"
            placeholder="Enter goal title"
          />
          {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea {...register('description')} rows={3} className="input" placeholder="Enter goal description" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timeframe *</label>
          <select {...register('timeframeId', { required: 'Timeframe is required' })} className="input">
            <option value="">Select timeframe</option>
            {timeframes.map((timeframe) => (
              <option key={timeframe.id} value={timeframe.id}>
                {timeframe.name}
              </option>
            ))}
          </select>
          {errors.timeframeId && <p className="mt-1 text-sm text-red-600">{errors.timeframeId.message}</p>}
        </div>

        {selectedLevel === 'DEPARTMENT' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
            <select {...register('departmentId', { required: 'Department is required' })} className="input">
              <option value="">Select department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            {errors.departmentId && <p className="mt-1 text-sm text-red-600">{errors.departmentId.message}</p>}
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input {...register('startDate')} type="date" className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input {...register('endDate')} type="date" className="input" />
          </div>
        </div>

        {labels.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Labels</label>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => {
                    const currentLabels = watch('labels') || []
                    const newLabels = currentLabels.includes(label.id)
                      ? currentLabels.filter((l: string) => l !== label.id)
                      : [...currentLabels, label.id]
                    setValue('labels', newLabels)
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    (watch('labels') || []).includes(label.id) ? 'border-2' : 'border border-gray-300'
                  }`}
                  style={{
                    backgroundColor: (watch('labels') || []).includes(label.id) ? `${label.color}20` : 'transparent',
                    color: label.color,
                    borderColor: label.color,
                  }}
                >
                  {label.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Check-in cadence *</label>
          <select {...register('checkInCadence', { required: 'A check-in cadence is required.' })} className="input">
            {CHECK_IN_CADENCES.map((c) => (
              <option key={c} value={c}>
                {CHECK_IN_CADENCE_LABELS[c]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            We&apos;ll remind the owner on the dashboard and via the Monday email digest.
          </p>
        </div>

        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              {...register('isPrivate')}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">Make this goal private</span>
          </label>
          <p className="mt-1 text-xs text-gray-500">
            Private goals will show as &quot;[Private Goal]&quot; to other users, but progress percentage will remain visible.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select {...register('goalStatus')} className="input">
            <option value="ON_TRACK">On Track</option>
            <option value="AT_RISK">At Risk</option>
            <option value="OFF_TRACK">Off Track</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
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
              'Create Goal'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
