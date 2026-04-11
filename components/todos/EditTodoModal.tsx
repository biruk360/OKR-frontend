'use client'

import { useState, useEffect } from 'react'
import { X, Edit3, Save, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'

interface EditTodoModalProps {
  isOpen: boolean
  onClose: () => void
  todo: any
  onSave: (title: string, description: string) => void
}

export default function EditTodoModal({ 
  isOpen, 
  onClose, 
  todo, 
  onSave 
}: EditTodoModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Reset form when modal opens with todo data
  useEffect(() => {
    if (isOpen && todo) {
      setTitle(todo.title || '')
      setDescription(todo.description || '')
      setHasChanges(false)
    }
  }, [isOpen, todo])

  // Track changes
  useEffect(() => {
    if (todo) {
      const titleChanged = title !== (todo.title || '')
      const descriptionChanged = description !== (todo.description || '')
      setHasChanges(titleChanged || descriptionChanged)
    }
  }, [title, description, todo])

  const handleSave = async () => {
    // Validate title is not empty
    if (!title.trim()) {
      toast.error('Title cannot be empty')
      return
    }

    setIsLoading(true)
    try {
      await onSave(title.trim(), description.trim())
      onClose()
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        onClose()
      }
    } else {
      onClose()
    }
  }

  const handleReset = () => {
    if (todo) {
      setTitle(todo.title || '')
      setDescription(todo.description || '')
      setHasChanges(false)
    }
  }

  if (!isOpen || !todo) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={handleCancel} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center">
              <Edit3 className="h-6 w-6 text-blue-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Edit To-Do</h2>
            </div>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6">
            <div className="mb-4">
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter initiative title"
                disabled={isLoading}
              />
              {!title.trim() && (
                <p className="mt-1 text-sm text-red-600">Title is required</p>
              )}
            </div>

            <div className="mb-4">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter initiative description (optional)"
                disabled={isLoading}
              />
            </div>

            {/* Current Values Display */}
            <div className="mb-4 p-3 bg-gray-50 rounded-md">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Current Values:</h3>
              <div className="text-sm text-gray-600">
                <p><strong>Title:</strong> {todo.title || 'No title'}</p>
                <p><strong>Description:</strong> {todo.description || 'No description'}</p>
              </div>
            </div>

            {/* Changes Indicator */}
            {hasChanges && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-center">
                  <Edit3 className="h-4 w-4 text-blue-600 mr-2" />
                  <p className="text-sm text-blue-700">
                    You have unsaved changes. Click "Save Changes" to apply them.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-6 border-t border-gray-200">
            <div>
              {hasChanges && (
                <button
                  onClick={handleReset}
                  disabled={isLoading}
                  className="inline-flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-700 disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </button>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleCancel}
                className="btn-outline"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                disabled={isLoading || !title.trim()}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </div>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}






