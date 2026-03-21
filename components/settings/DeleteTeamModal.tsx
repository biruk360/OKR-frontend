'use client'

import { useState } from 'react'
import { X, AlertTriangle, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface DeleteTeamModalProps {
  isOpen: boolean
  onClose: () => void
  team: any
  onTeamDeleted: () => void
}

export default function DeleteTeamModal({ isOpen, onClose, team, onTeamDeleted }: DeleteTeamModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/departments/${team.id}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Team deleted successfully')
        onClose()
        onTeamDeleted()
      } else {
        toast.error(result.error || 'Failed to delete team')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen || !team) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center">
              <AlertTriangle className="h-6 w-6 text-red-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Delete Team</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6">
            <p className="text-sm text-gray-700 mb-4">
              Are you sure you want to delete the team <strong>{team.name}</strong>? This action cannot be undone.
            </p>
            {team._count?.memberships > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  This team has {team._count.memberships} member(s). They will be removed from this team.
                </p>
              </div>
            )}
            {team._count?.objectives > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  This team has {team._count.objectives} objective(s) associated with it.
                </p>
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
                type="button"
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                disabled={isLoading}
              >
                {isLoading ? 'Deleting...' : 'Delete Team'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

