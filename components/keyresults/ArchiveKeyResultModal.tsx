'use client'

import { useState } from 'react'
import { X, Archive, AlertTriangle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface ArchiveKeyResultModalProps {
  isOpen: boolean
  onClose: () => void
  keyResult: any
  onArchived?: () => void
}

export default function ArchiveKeyResultModal({ isOpen, onClose, keyResult, onArchived }: ArchiveKeyResultModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleArchive = async () => {
    setIsLoading(true)

    try {
      const response = await fetch(`/api/keyresults/${keyResult.id}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Key Result archived successfully.')
        onClose()
        if (onArchived) onArchived()
        else window.location.reload()
      } else {
        toast.error(result.error || 'Failed to archive key result')
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
              <Archive className="h-6 w-6 text-orange-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Archive Key Result</h2>
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
              <AlertCircle className="h-6 w-6 text-orange-500 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  This will archive the Key Result. It will be hidden from active views but can be restored later.
                </h3>
                <p className="text-sm text-gray-500">
                  Archiving a key result will not delete it, but it will be excluded from progress calculations and active views.
                </p>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-orange-800 mb-2">
                    What will happen:
                  </h4>
                  <ul className="text-sm text-orange-700 space-y-1">
                    <li>• The key result will be marked as archived</li>
                    <li>• It will be hidden from active key result lists</li>
                    <li>• Progress calculations will exclude this key result</li>
                    <li>• The parent objective's progress will be recalculated</li>
                    <li>• All associated to-dos will remain but be hidden</li>
                    <li>• You can restore it later if needed</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Key Result Details:</h4>
              <p className="text-sm text-gray-700 font-medium">{keyResult.title}</p>
              {keyResult.description && (
                <p className="text-xs text-gray-500 mt-1">{keyResult.description}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Target: {keyResult.targetValue} {keyResult.unit} • Current: {keyResult.currentValue} {keyResult.unit}
              </p>
              <p className="text-xs text-gray-500">
                Progress: {keyResult.progress?.toFixed(1) || 0}% • Owner: {keyResult.owner?.name || 'Unknown'}
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
                onClick={handleArchive}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Archiving...
                  </div>
                ) : (
                  'Archive Key Result'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

