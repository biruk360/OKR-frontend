'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { X, Target, User, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'

interface AddKeyResultModalProps {
  isOpen: boolean
  onClose: () => void
  objectiveId: string
  users: any[]
  defaultOwnerId?: string
  onSuccess?: () => void
}

interface KeyResultFormData {
  title: string
  description: string
  ownerId: string
  startValue: number
  targetValue: number
  unit: string
  isPrivate?: boolean
}

export default function AddKeyResultModal({ 
  isOpen, 
  onClose, 
  objectiveId, 
  users, 
  defaultOwnerId,
  onSuccess,
}: AddKeyResultModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<KeyResultFormData>({
    defaultValues: {
      title: '',
      description: '',
      ownerId: defaultOwnerId || '',
      startValue: 0,
      targetValue: 100,
      unit: '%'
    }
  })

  const startValue = watch('startValue')
  const targetValue = watch('targetValue')

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      reset({
        title: '',
        description: '',
        ownerId: defaultOwnerId || '',
        startValue: 0,
        targetValue: 100,
        unit: '%',
        isPrivate: false
      })
    }
  }, [isOpen, defaultOwnerId, reset])

  const onSubmit = async (data: KeyResultFormData) => {
    // Validate target value is greater than start value
    if (data.startValue >= data.targetValue) {
      toast.error('Target Value must be greater than Start Value.')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/keyresults', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          objectiveId,
          currentValue: data.startValue // Set current value to start value
        }),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Key Result added successfully.')
        onClose()
        if (onSuccess) onSuccess()
        else window.location.reload()
      } else {
        toast.error(result.error || 'Failed to add key result')
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
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center">
              <Target className="h-6 w-6 text-blue-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Add Key Result</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6">
            <div className="mb-4">
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                {...register('title', { required: 'Title is required' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter key result title"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div className="mb-4">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                {...register('description')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter key result description (optional)"
              />
            </div>

            <div className="mb-4">
              <label htmlFor="owner" className="block text-sm font-medium text-gray-700 mb-2">
                Owner <span className="text-red-500">*</span>
              </label>
              <select
                id="owner"
                {...register('ownerId', { required: 'Owner is required' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select an owner</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
              {errors.ownerId && (
                <p className="mt-1 text-sm text-red-600">{errors.ownerId.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="startValue" className="block text-sm font-medium text-gray-700 mb-2">
                  Start Value
                </label>
                <input
                  type="number"
                  id="startValue"
                  {...register('startValue', { 
                    required: 'Start value is required',
                    min: { value: 0, message: 'Start value must be 0 or greater' }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0"
                />
                {errors.startValue && (
                  <p className="mt-1 text-sm text-red-600">{errors.startValue.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="targetValue" className="block text-sm font-medium text-gray-700 mb-2">
                  Target Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="targetValue"
                  {...register('targetValue', { 
                    required: 'Target value is required',
                    min: { value: 0.01, message: 'Target value must be greater than 0' }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="100"
                />
                {errors.targetValue && (
                  <p className="mt-1 text-sm text-red-600">{errors.targetValue.message}</p>
                )}
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-2">
                Unit
              </label>
              <select
                id="unit"
                {...register('unit')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="%">%</option>
                <option value="$">$</option>
                <option value="users">users</option>
                <option value="customers">customers</option>
                <option value="revenue">revenue</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
                <option value="count">count</option>
                <option value="other">other</option>
              </select>
            </div>

            {/* Validation warning for target value */}
            {startValue >= targetValue && startValue > 0 && targetValue > 0 && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center">
                  <TrendingUp className="h-4 w-4 text-red-600 mr-2" />
                  <p className="text-sm text-red-700">
                    Target Value must be greater than Start Value.
                  </p>
                </div>
              </div>
            )}

            {/* Progress preview */}
            {startValue > 0 && targetValue > 0 && startValue < targetValue && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center">
                  <Target className="h-4 w-4 text-blue-600 mr-2" />
                  <p className="text-sm text-blue-700">
                    Initial progress: {startValue} / {targetValue} {watch('unit')} ({Math.round((startValue / targetValue) * 100)}%)
                  </p>
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register('isPrivate')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Make this key result private</span>
              </label>
              <p className="mt-1 text-xs text-gray-500">
                Private key results will show as "[Private Key Result]" to other users, but progress percentage will remain visible.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3">
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
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                disabled={isLoading || (startValue >= targetValue && startValue > 0 && targetValue > 0)}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Adding...
                  </div>
                ) : (
                  'Add Key Result'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}






