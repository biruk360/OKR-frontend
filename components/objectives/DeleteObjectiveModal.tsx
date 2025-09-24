'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Trash2, AlertTriangle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface DeleteObjectiveModalProps {
  isOpen: boolean
  onClose: () => void
  objective: any
}

export default function DeleteObjectiveModal({ isOpen, onClose, objective }: DeleteObjectiveModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [confirmationText, setConfirmationText] = useState('')
  const router = useRouter()

  const isConfirmationValid = confirmationText === objective.title

  const handleDelete = async () => {
    if (!isConfirmationValid) {
      toast.error('Please type the objective title exactly to confirm deletion')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`/api/objectives/${objective.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Objective has been permanently deleted.')
        onClose()
        // Redirect to appropriate dashboard based on objective level
        if (objective.level === 'COMPANY') {
          router.push('/dashboard/company-okrs')
        } else if (objective.level === 'DEPARTMENT') {
          router.push('/dashboard/department-okrs')
        } else {
          router.push('/dashboard/my-okrs')
        }
      } else {
        toast.error(result.error || 'Failed to delete objective')
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
              <Trash2 className="h-6 w-6 text-red-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Delete Objective</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6">
            <div className="flex items-start space-x-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  This action is permanent and cannot be undone.
                </h3>
                <p className="text-sm text-gray-500">
                  You are about to permanently delete this objective and all its associated data.
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-red-800 mb-2">
                    What will be deleted:
                  </h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    <li>• The objective itself</li>
                    <li>• All associated key results ({objective._count?.keyResults || 0})</li>
                    <li>• All progress tracking data</li>
                    <li>• All comments and activity history</li>
                  </ul>
                </div>
              </div>
            </div>

            {objective._count?.childObjectives > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800">
                      Child Objectives Will Be Unlinked
                    </h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      This objective has {objective._count.childObjectives} child objective(s) that will become unlinked but will not be deleted.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Objective Details:</h4>
              <p className="text-sm text-gray-700 font-medium">{objective.title}</p>
              <p className="text-xs text-gray-500 mt-1">
                {objective.level} • {objective.owner?.name}
              </p>
            </div>

            <div className="mb-6">
              <label htmlFor="confirmation" className="block text-sm font-medium text-gray-700 mb-2">
                To confirm deletion, type the objective title exactly:
              </label>
              <input
                type="text"
                id="confirmation"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={objective.title}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
              {confirmationText && !isConfirmationValid && (
                <p className="mt-1 text-sm text-red-600">
                  The text must match the objective title exactly
                </p>
              )}
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
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                disabled={isLoading || !isConfirmationValid}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Deleting...
                  </div>
                ) : (
                  'Delete Permanently'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}






