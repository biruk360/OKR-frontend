'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { X, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'

interface CloneObjectiveModalProps {
  isOpen: boolean
  onClose: () => void
  objective: any
  timeframes: any[]
}

interface CloneFormData {
  title: string
  timeframeId: string
  includeKeyResults: boolean
}

export default function CloneObjectiveModal({ isOpen, onClose, objective, timeframes }: CloneObjectiveModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CloneFormData>({
    defaultValues: {
      title: `Copy of ${objective?.title || ''}`,
      timeframeId: '',
      includeKeyResults: true
    }
  })

  const includeKeyResults = watch('includeKeyResults')

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && objective) {
      setValue('title', `Copy of ${objective.title}`)
      setValue('includeKeyResults', true)
      setValue('timeframeId', '')
    }
  }, [isOpen, objective, setValue])

  const onSubmit = async (data: CloneFormData) => {
    setIsLoading(true)

    try {
      const response = await fetch(`/api/objectives/${objective.id}/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: data.title,
          timeframeId: data.timeframeId,
          includeKeyResults: data.includeKeyResults
        }),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Objective cloned successfully.')
        onClose()
        // Redirect to the new objective's detail page
        router.push(`/dashboard/objectives/${result.objective.id}`)
      } else {
        toast.error(result.error || 'Failed to clone objective')
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
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center">
              <Copy className="h-6 w-6 text-blue-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Clone Objective</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6">
            <div className="mb-6">
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Objective Title
              </label>
              <input
                type="text"
                id="title"
                {...register('title', { required: 'Title is required' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter objective title"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="timeframe" className="block text-sm font-medium text-gray-700 mb-2">
                Timeframe <span className="text-red-500">*</span>
              </label>
              <select
                id="timeframe"
                {...register('timeframeId', { required: 'Timeframe is required' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a timeframe</option>
                {timeframes.map((timeframe) => {
                  const typeLabel = timeframe.type === 'MONTHLY' ? 'Monthly' :
                                   timeframe.type === 'QUARTERLY' ? 'Quarterly' :
                                   timeframe.type === 'SIX_MONTH' ? '6-Month' :
                                   timeframe.type === 'YEARLY' ? 'Yearly' : 'Quarterly'
                  return (
                    <option key={timeframe.id} value={timeframe.id}>
                      {timeframe.name} ({typeLabel}) - {new Date(timeframe.startDate).toLocaleDateString()} to {new Date(timeframe.endDate).toLocaleDateString()}
                    </option>
                  )
                })}
              </select>
              {errors.timeframeId && (
                <p className="mt-1 text-sm text-red-600">{errors.timeframeId.message}</p>
              )}
            </div>

            <div className="mb-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="includeKeyResults"
                  {...register('includeKeyResults')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="includeKeyResults" className="ml-2 block text-sm text-gray-700">
                  Include Key Results
                </label>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {includeKeyResults 
                  ? `Will clone ${objective._count?.keyResults || 0} key result(s) with progress reset to 0`
                  : 'Will create objective without key results'
                }
              </p>
            </div>

            {includeKeyResults && objective._count?.keyResults > 0 && (
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-800 mb-2">
                  Key Results to Clone:
                </h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  {objective.keyResults?.map((kr: any) => (
                    <li key={kr.id} className="flex items-center">
                      <Check className="h-3 w-3 mr-2" />
                      {kr.title} (Progress will be reset to 0)
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Cloning...
                  </div>
                ) : (
                  'Create Clone'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}






