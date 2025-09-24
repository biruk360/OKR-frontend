'use client'

import { useState } from 'react'
import { X, Trash2, AlertTriangle } from 'lucide-react'

interface DeleteTodoModalProps {
  isOpen: boolean
  onClose: () => void
  todo: any
  onConfirm: () => void
}

export default function DeleteTodoModal({ 
  isOpen, 
  onClose, 
  todo, 
  onConfirm 
}: DeleteTodoModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  if (!isOpen || !todo) return null

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center">
              <AlertTriangle className="h-6 w-6 text-red-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Delete To-Do</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={isLoading}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6">
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-4">
                Are you sure you want to permanently delete this to-do? This action cannot be undone.
              </p>
              
              {/* Todo Details */}
              <div className="bg-gray-50 p-4 rounded-md border">
                <h3 className="font-medium text-gray-900 mb-2">To-Do Details:</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>Title:</strong> {todo.title}</p>
                  {todo.description && (
                    <p><strong>Description:</strong> {todo.description}</p>
                  )}
                  {todo.assignee && (
                    <p><strong>Assigned to:</strong> {todo.assignee.name}</p>
                  )}
                  {todo.dueDate && (
                    <p><strong>Due Date:</strong> {new Date(todo.dueDate).toLocaleDateString()}</p>
                  )}
                  <p><strong>Status:</strong> {todo.status}</p>
                </div>
              </div>
            </div>

            {/* Warning Message */}
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <AlertTriangle className="h-4 w-4 text-red-600 mr-2" />
                <p className="text-sm text-red-700">
                  <strong>Warning:</strong> This will permanently delete the to-do and cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Deleting...
                </div>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete To-Do
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}