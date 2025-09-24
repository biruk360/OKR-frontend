'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { X, Target, User, Calendar, Building2, Link } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { CreateObjectiveForm, ObjectiveLevel } from '@/types'
import ParentObjectiveSelector from './ParentObjectiveSelector'

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
  level: ObjectiveLevel
  ownerId: string
  timeframeId: string
  departmentId?: string
  parentObjectiveId?: string
}

export default function CreateObjectiveModal({ isOpen, onClose, defaultLevel, title, defaultOwnerId, onObjectiveCreated, userDepartments = [] }: CreateObjectiveModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [timeframes, setTimeframes] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
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
      level: defaultLevel || '',
      title: title || '',
      ownerId: defaultOwnerId || ''
    }
  })

  const selectedLevel = watch('level')
  const selectedTimeframe = watch('timeframeId')

  useEffect(() => {
    if (isOpen) {
      fetchFormData()
      // Reset form when modal opens
      reset({
        level: defaultLevel || 'INDIVIDUAL', // Default to INDIVIDUAL for My OKRs
        title: '',
        description: '',
        ownerId: defaultOwnerId || session?.user?.id || '',
        timeframeId: '',
        departmentId: '',
        parentObjectiveId: ''
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

  const fetchParentObjectives = async (level: ObjectiveLevel, timeframeId: string) => {
    try {
      if (level === 'DEPARTMENT' && timeframeId) {
        // For department objectives, show company objectives
        const response = await fetch(`/api/objectives?level=COMPANY&timeframeId=${timeframeId}&status=ACTIVE`)
        const data = await response.json()
        
        if (data.success) {
          setParentObjectives(data.data)
        }
      } else if (level === 'INDIVIDUAL' && timeframeId) {
        // For individual objectives, show both company and department objectives
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
      }

      const response = await fetch('/api/objectives', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (response.ok) {
        const successMessage = selectedLevel === 'COMPANY' 
          ? 'Company objective created successfully.'
          : selectedLevel === 'DEPARTMENT'
          ? 'Department objective created successfully.'
          : selectedLevel === 'INDIVIDUAL'
          ? 'Individual objective created successfully.'
          : 'Objective created successfully!'
        toast.success(successMessage)
        reset()
        onClose()
        onObjectiveCreated?.() // Call the callback to refresh the parent component
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center">
              <Target className="h-6 w-6 text-primary-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">
                {title || (defaultLevel === 'COMPANY' ? 'Add Company Objective' : defaultLevel === 'DEPARTMENT' ? 'Add Department Objective' : defaultLevel === 'INDIVIDUAL' ? 'Add My Objective' : 'Create New Objective')}
              </h2>
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
                {...register('title', { required: 'Objective Title is required.' })}
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
                <label htmlFor="level" className="block text-sm font-medium text-gray-700 mb-1">
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
                {errors.level && (
                  <p className="mt-1 text-sm text-red-600">{errors.level.message}</p>
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
            </div>

            <div>
              <label htmlFor="ownerId" className="block text-sm font-medium text-gray-700 mb-1">
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
              {errors.ownerId && (
                <p className="mt-1 text-sm text-red-600">{errors.ownerId.message}</p>
              )}
              {defaultOwnerId && (
                <p className="mt-1 text-sm text-gray-500">
                  Owner is automatically set to you for individual objectives
                </p>
              )}
            </div>

            {selectedLevel === 'DEPARTMENT' && (
              <div>
                <label htmlFor="departmentId" className="block text-sm font-medium text-gray-700 mb-1">
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
                userDepartmentId={selectedLevel === 'INDIVIDUAL' ? userDepartments[0]?.id : watch('departmentId')}
                className="mb-4"
              />
            )}

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
                  'Create Objective'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
