'use client'

import { useState } from 'react'
import { X, Trash2, AlertTriangle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface DeleteKeyResultModalProps {
  isOpen: boolean
  onClose: () => void
  keyResult: any
}

export default function DeleteKeyResultModal({ isOpen, onClose, keyResult }: DeleteKeyResultModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleDelete = async () => {
    setIsLoading(true)

    try {
      const response = await fetch(`/api/keyresults/${keyResult.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Key Result deleted successfully.')
        onClose()
        // Refresh the page to show the updated key result list
        window.location.reload()
      } else {
        toast.error(result.error || 'Failed to delete key result')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen || !keyResult) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center">
              <Trash2 className="h-6 w-6 text-red-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Delete Key Result</h2>
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
                  This will permanently delete the Key Result and all its to-dos. This action cannot be undone.
                </h3>
                <p className="text-sm text-gray-500">
                  You are about to permanently delete this key result and all associated data.
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
                    <li>• The key result itself</li>
                    <li>• All associated to-dos and initiatives</li>
                    <li>• All progress tracking data</li>
                    <li>• All comments and activity history</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-800">
                    Parent Objective Progress Will Be Recalculated
                  </h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    The parent objective's overall progress will be immediately recalculated based on the remaining key results.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Key Result Details:</h4>
              <p className="text-sm text-gray-700 font-medium">{keyResult.title}</p>
              <p className="text-xs text-gray-500 mt-1">
                Target: {keyResult.targetValue} {keyResult.unit} • Current: {keyResult.currentValue} {keyResult.unit}
              </p>
              <p className="text-xs text-gray-500">
                Owner: {keyResult.owner?.name}
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
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                disabled={isLoading}
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






