'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Target, User, Calendar, Building2, Eye, EyeOff } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'
import { ObjectiveLevel } from '@/types'
import ParentObjectiveSelector from '@/components/objectives/ParentObjectiveSelector'

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
}

export default function CreateGoalModal({
  isOpen,
  onClose,
  onGoalCreated,
  defaultOwnerId,
  defaultLevel
}: CreateGoalModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [timeframes, setTimeframes] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [labels, setLabels] = useState<any[]>([])
  const [parentObjectives, setParentObjectives] = useState<any[]>([])
  const router = useRouter()
  const { data: session } = useSession()

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors }
  } = useForm<FormData>({
    defaultValues: {
      level: defaultLevel || 'INDIVIDUAL',
      ownerId: defaultOwnerId || '',
      isPrivate: false,
      goalStatus: 'ON_TRACK',
      labels: []
    }
  })

  const selectedLevel = watch('level')
  const selectedTimeframe = watch('timeframeId')

  useEffect(() => {
    if (isOpen) {
      fetchFormData()
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
        labels: []
      })
    }
  }, [isOpen, defaultLevel, defaultOwnerId, session?.user?.id, reset])

  useEffect(() => {
    if (selectedLevel && selectedTimeframe) {
      fetchParentObjectives(selectedLevel, selectedTimeframe)
    }
  }, [selectedLevel, selectedTimeframe])

  const fetchFormData = async () => {
    try {
      const [usersRes, timeframesRes, departmentsRes, labelsRes] = await Promise.all([
        fetch('/api/users/for-selection'),
        fetch('/api/timeframes'),
        fetch('/api/departments'),
        fetch('/api/labels'),
      ])

      const [usersData, timeframesData, departmentsData, labelsData] = await Promise.all([
        usersRes.json().catch(() => ({ success: false, users: [] })),
        timeframesRes.json().catch(() => ({ success: false, data: [] })),
        departmentsRes.json().catch(() => ({ success: false, data: [] })),
        labelsRes.json().catch(() => ({ success: false, data: [] }))
      ])

      if (usersData.success) setUsers(usersData.users || [])
      if (timeframesData.success) setTimeframes(timeframesData.data || [])
      if (departmentsData.success) setDepartments(departmentsData.data || [])
      if (labelsData.success) setLabels(labelsData.data || [])
    } catch (error) {
      console.error('Error fetching form data:', error)
    }
  }

  const fetchParentObjectives = async (level: ObjectiveLevel, timeframeId: string) => {
    try {
      if (level === 'DEPARTMENT' && timeframeId) {
        const response = await fetch(`/api/objectives?level=COMPANY&timeframeId=${timeframeId}&status=ACTIVE`)
        const data = await response.json()
        if (data.success) {
          setParentObjectives(data.data)
        }
      } else if (level === 'INDIVIDUAL' && timeframeId) {
        const [companyResponse, departmentResponse] = await Promise.all([
          fetch(`/api/objectives?level=COMPANY&timeframeId=${timeframeId}&status=ACTIVE`),
          fetch(`/api/objectives?level=DEPARTMENT&timeframeId=${timeframeId}&status=ACTIVE`)
        ])
        const [companyData, departmentData] = await Promise.all([
          companyResponse.json(),
          departmentResponse.json()
        ])
        const allParentObjectives = [
          ...(companyData.success ? companyData.data.map((obj: any) => ({ ...obj, level: 'COMPANY' })) : []),
          ...(departmentData.success ? departmentData.data.map((obj: any) => ({ ...obj, level: 'DEPARTMENT' })) : [])
        ]
        setParentObjectives(allParentObjectives)
      } else {
        setParentObjectives([])
      }
    } catch (error) {
      console.error('Error fetching parent objectives:', error)
    }
  }

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
        isPrivate: Boolean(data.isPrivate), // Ensure it's a boolean
        goalStatus: data.goalStatus,
        startDate: data.startDate || null,
        endDate: data.endDate || null
      }

      const response = await fetch('/api/objectives', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to create goal:', errorData)
        toast.error(errorData.error || `Failed to create goal (${response.status})`)
        return
      }

      const result = await response.json()

      // Add labels if any selected
      if (data.labels && data.labels.length > 0 && result.data?.id) {
        try {
          await Promise.all(
            data.labels.map((labelId: string) =>
              fetch('/api/objectives/' + result.data.id + '/labels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ labelId })
              }).catch(err => {
                console.error('Error adding label:', err)
                // Continue even if label addition fails
              })
            )
          )
        } catch (labelError) {
          console.error('Error adding labels:', labelError)
          // Continue - goal was created successfully
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center">
              <Target className="h-6 w-6 text-primary-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Create New Goal</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
            {/* Owner(s) - Multi-select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Owner(s) *
              </label>
              <select
                {...register('ownerId', { required: 'Owner is required' })}
                className="input"
              >
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
              {errors.ownerId && (
                <p className="mt-1 text-sm text-red-600">{errors.ownerId.message}</p>
              )}
            </div>

            {/* Type - Button toggles */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type *
              </label>
              <div className="flex flex-wrap gap-2">
                {['INDIVIDUAL', 'DEPARTMENT', 'COMPANY'].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setValue('level', level as ObjectiveLevel)}
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
              {errors.level && (
                <p className="mt-1 text-sm text-red-600">{errors.level.message}</p>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                {...register('title', { required: 'Title is required' })}
                type="text"
                className="input"
                placeholder="Enter goal title"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                {...register('description')}
                rows={3}
                className="input"
                placeholder="Enter goal description"
              />
            </div>

            {/* Timeframe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timeframe *
              </label>
              <select
                {...register('timeframeId', { required: 'Timeframe is required' })}
                className="input"
              >
                <option value="">Select timeframe</option>
                {timeframes.map((timeframe) => (
                  <option key={timeframe.id} value={timeframe.id}>
                    {timeframe.name}
                  </option>
                ))}
              </select>
              {errors.timeframeId && (
                <p className="mt-1 text-sm text-red-600">{errors.timeframeId.message}</p>
              )}
            </div>

            {/* Department (if Department level) */}
            {selectedLevel === 'DEPARTMENT' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <p className="mt-1 text-sm text-red-600">{errors.departmentId.message}</p>
                )}
              </div>
            )}

            {/* Parent Goal */}
            {(selectedLevel === 'DEPARTMENT' || selectedLevel === 'INDIVIDUAL') && selectedTimeframe && (
              <ParentObjectiveSelector
                selectedParentId={watch('parentObjectiveId') || null}
                onSelectParent={(parentId) => setValue('parentObjectiveId', parentId || '')}
                currentTimeframeId={selectedTimeframe}
                currentObjectiveLevel={selectedLevel}
                userDepartmentId={selectedLevel === 'INDIVIDUAL' ? undefined : watch('departmentId')}
                className="mb-4"
              />
            )}

            {/* Start/End Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  {...register('startDate')}
                  type="date"
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  {...register('endDate')}
                  type="date"
                  className="input"
                />
              </div>
            </div>

            {/* Labels */}
            {labels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Labels
                </label>
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
                        (watch('labels') || []).includes(label.id)
                          ? 'border-2'
                          : 'border border-gray-300'
                      }`}
                      style={{
                        backgroundColor: (watch('labels') || []).includes(label.id) ? `${label.color}20` : 'transparent',
                        color: label.color,
                        borderColor: label.color
                      }}
                    >
                      {label.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Visibility */}
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
                Private goals will show as "[Private Goal]" to other users, but progress percentage will remain visible.
              </p>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                {...register('goalStatus')}
                className="input"
              >
                <option value="ON_TRACK">On Track</option>
                <option value="AT_RISK">At Risk</option>
                <option value="OFF_TRACK">Off Track</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>

            {/* Actions */}
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
                    Creating...
                  </div>
                ) : (
                  'Create Goal'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

