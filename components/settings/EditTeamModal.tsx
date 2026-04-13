'use client'

import { useState, useEffect } from 'react'
import { Building2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui'

interface EditTeamModalProps {
  isOpen: boolean
  onClose: () => void
  team: any
  onTeamUpdated: () => void
}

interface FormData {
  name: string
  description?: string
  isActive: boolean
}

export default function EditTeamModal({ isOpen, onClose, team, onTeamUpdated }: EditTeamModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>()

  useEffect(() => {
    if (isOpen && team) {
      reset({
        name: team.name || '',
        description: team.description || '',
        isActive: team.isActive !== undefined ? team.isActive : true,
      })
    }
  }, [isOpen, team, reset])

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/departments/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Team updated successfully')
        onClose()
        onTeamUpdated()
      } else {
        toast.error(result.error || 'Failed to update team')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!team) return null

  return (
    <Modal open={isOpen} onClose={onClose} title="Edit Team" icon={Building2} iconClassName="text-blue-600" size="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Team Name *</label>
          <input {...register('name', { required: 'Team name is required' })} type="text" className="input" />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea {...register('description')} rows={3} className="input" />
        </div>

        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              {...register('isActive')}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">Active</span>
          </label>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="btn-outline" disabled={isLoading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Updating...' : 'Update Team'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
