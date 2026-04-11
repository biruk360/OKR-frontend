'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Target, User, Calendar, Building2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { ObjectiveLevel } from '@/types'
import ParentObjectiveSelector from './ParentObjectiveSelector'

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
}

export default function EditObjectiveModal({ isOpen, onClose, objective }: EditObjectiveModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [timeframes, setTimeframes] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const router = useRouter()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm<FormData>()

  useEffect(() => {
    if (isOpen && objective) {
      // Pre-populate form with existing objective data
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
      })
      fetchFormData()
    }
  }, [isOpen, objective, reset])

  const fetchFormData = async () => {
    try {
      const [usersRes, timeframesRes, departmentsRes] = await Promise.all([
        fetch('/api/users/for-selection'),
        fetch('/api/timeframes'),
        fetch('/api/departments')
      ])

      const [usersData, timeframesData, departmentsData] = await Promise.all([
        usersRes.json(),
        timeframesRes.json(),
        departmentsRes.json()
      ])

      if (usersData.success) setUsers(usersData.users)
      if (timeframesData.success) setTimeframes(timeframesData.data)
      if (departmentsData.success) setDepartments(departmentsData.data)
    } catch (error) {
      console.error('Error fetching form data:', error)
    }
  }

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)

    try {
      const response = await fetch(`/api/objectives/${objective.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          alignmentType: data.alignmentType,
          rollupCalculation:
            data.alignmentType === 'LOOSE' ? 'NONE' : data.rollupCalculation,
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

  if (!isOpen || !objective) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center">
              <Target className="h-6 w-6 text-primary-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Edit Objective</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                Objective Title *
              </label>
              <input
                {...register('title', { required: 'Objective Title cannot be empty.' })}
                type="text"
                className="input"
                placeholder="Enter objective title"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
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
                <label htmlFor="ownerId" className="block text-sm font-medium text-gray-700 mb-1">
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
                {errors.ownerId && (
                  <p className="mt-1 text-sm text-red-600">{errors.ownerId.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="timeframeId" className="block text-sm font-medium text-gray-700 mb-1">
                  Timeframe *
                </label>
                <select
                  {...register('timeframeId', { required: 'A timeframe is required.' })}
                  className="input"
                >
                  <option value="">Select timeframe</option>
                  {timeframes.map((timeframe) => {
                    const typeLabel = timeframe.type === 'MONTHLY' ? 'Monthly' :
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

            {objective.level === 'DEPARTMENT' && (
              <div>
                <label htmlFor="departmentId" className="block text-sm font-medium text-gray-700 mb-1">
                  Department *
                </label>
                <select
                  {...register('departmentId', { required: 'Department is required.' })}
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
                  <p className="mt-1 text-sm text-red-600">{errors.departmentId.message}</p>
                )}
              </div>
            )}

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

            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-800">Progress roll-up (aligned children)</p>
              <p className="text-xs text-gray-600">
                When <strong>Strict</strong> is on and you choose average or sum, this objective&apos;s
                progress is derived from its active child objectives (not from key results) as long as it
                has at least one child. Otherwise progress follows key results as usual.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Alignment mode</label>
                  <select
                    {...register('alignmentType')}
                    className="input text-sm"
                  >
                    <option value="LOOSE">Loose (visual link only)</option>
                    <option value="STRICT_DEPENDENCY">Strict (roll up from children)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Roll-up calculation</label>
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
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Make this objective private</span>
              </label>
              <p className="mt-1 text-xs text-gray-500">
                Private objectives will show as "[Private Objective]" to other users, but progress percentage will remain visible.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="btn-outline"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </div>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
