'use client'

import { useState } from 'react'
import { X, Building2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

interface CreateTeamModalProps {
  isOpen: boolean
  onClose: () => void
  onTeamCreated: () => void
}

interface FormData {
  name: string
  description?: string
}

export default function CreateTeamModal({ isOpen, onClose, onTeamCreated }: CreateTeamModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>()

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
          isActive: true
        })
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Team created successfully')
        reset()
        onClose()
        onTeamCreated()
      } else {
        toast.error(result.error || 'Failed to create team')
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
              <Building2 className="h-6 w-6 text-blue-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Create Team</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team Name *
              </label>
              <input
                {...register('name', { required: 'Team name is required' })}
                type="text"
                className="input"
                placeholder="Enter team name"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                {...register('description')}
                rows={3}
                className="input"
                placeholder="Enter team description (optional)"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
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
                {isLoading ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

