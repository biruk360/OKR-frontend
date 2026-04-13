'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui'

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
          isActive: true,
        }),
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

  return (
    <Modal open={isOpen} onClose={onClose} title="Create Team" icon={Building2} iconClassName="text-blue-600" size="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Team Name *</label>
          <input
            {...register('name', { required: 'Team name is required' })}
            type="text"
            className="input"
            placeholder="Enter team name"
          />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            {...register('description')}
            rows={3}
            className="input"
            placeholder="Enter team description (optional)"
          />
        </div>

        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="btn-outline" disabled={isLoading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create Team'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
