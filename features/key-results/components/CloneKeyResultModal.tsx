'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Copy, Target, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui'

interface CloneKeyResultModalProps {
  isOpen: boolean
  onClose: () => void
  keyResult: any
  users: any[]
  onSuccess?: () => void
}

interface KeyResultFormData {
  title: string
  description: string
  ownerId: string
  startValue: number
  targetValue: number
  unit: string
}

export default function CloneKeyResultModal({
  isOpen,
  onClose,
  keyResult,
  users,
  onSuccess,
}: CloneKeyResultModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<KeyResultFormData>({
    defaultValues: {
      title: '',
      description: '',
      ownerId: '',
      startValue: 0,
      targetValue: 100,
      unit: '%',
    },
  })

  const startValue = watch('startValue')
  const targetValue = watch('targetValue')

  useEffect(() => {
    if (isOpen && keyResult) {
      reset({
        title: `Copy of ${keyResult.title}`,
        description: keyResult.description || '',
        ownerId: keyResult.ownerId || '',
        startValue: keyResult.startValue || 0,
        targetValue: keyResult.targetValue || 100,
        unit: keyResult.unit || '%',
      })
    }
  }, [isOpen, keyResult, reset])

  const onSubmit = async (data: KeyResultFormData) => {
    if (data.startValue >= data.targetValue) {
      toast.error('Target Value must be greater than Start Value.')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`/api/keyresults/${keyResult.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, objectiveId: keyResult.objectiveId }),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Key Result cloned successfully.')
        onClose()
        if (onSuccess) onSuccess()
        else window.location.reload()
      } else {
        toast.error(result.error || 'Failed to clone key result')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!keyResult) return null

  return (
    <Modal open={isOpen} onClose={onClose} title="Clone Key Result" icon={Copy} iconClassName="text-blue-600" size="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
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
          {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
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
          {errors.ownerId && <p className="mt-1 text-sm text-red-600">{errors.ownerId.message}</p>}
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
                min: { value: 0, message: 'Start value must be 0 or greater' },
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0"
            />
            {errors.startValue && <p className="mt-1 text-sm text-red-600">{errors.startValue.message}</p>}
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
                min: { value: 0.01, message: 'Target value must be greater than 0' },
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="100"
            />
            {errors.targetValue && <p className="mt-1 text-sm text-red-600">{errors.targetValue.message}</p>}
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
            <option value="%">% (percent)</option>
            <option value="pcs">pcs (pieces)</option>
            <option value="qty">qty (quantity)</option>
            <option value="ETB">ETB (birr)</option>
            <option value="time">time (hours)</option>
            <option value="other">other</option>
          </select>
        </div>

        {startValue >= targetValue && startValue > 0 && targetValue > 0 && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center">
              <TrendingUp className="h-4 w-4 text-red-600 mr-2" />
              <p className="text-sm text-red-700">Target Value must be greater than Start Value.</p>
            </div>
          </div>
        )}

        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center">
            <Target className="h-4 w-4 text-blue-600 mr-2" />
            <p className="text-sm text-blue-700">
              Cloned key result will start with progress at {startValue} {watch('unit')} (start value).
              To-dos and initiatives will not be cloned.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3">
          <button type="button" onClick={onClose} className="btn-outline" disabled={isLoading}>
            Cancel
          </button>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            disabled={isLoading || (startValue >= targetValue && startValue > 0 && targetValue > 0)}
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Cloning...
              </div>
            ) : (
              'Clone Key Result'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
