'use client'

import { useState } from 'react'
import { X, Calendar, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface SetDueDateModalProps {
  isOpen: boolean
  onClose: () => void
  todo: any
  onSetDueDate: (date: string | null) => void
}

export default function SetDueDateModal({ 
  isOpen, 
  onClose, 
  todo, 
  onSetDueDate 
}: SetDueDateModalProps) {
  const [selectedDate, setSelectedDate] = useState(
    todo.dueDate ? new Date(todo.dueDate).toISOString().split('T')[0] : ''
  )
  const [isLoading, setIsLoading] = useState(false)

  const handleSave = async () => {
    setIsLoading(true)
    try {
      await onSetDueDate(selectedDate || null)
      onClose()
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemove = async () => {
    setIsLoading(true)
    try {
      await onSetDueDate(null)
      onClose()
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsLoading(false)
    }
  }

  const getDateStatus = (dateString: string) => {
    if (!dateString) return 'none'
    
    const selectedDate = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    // Reset time to compare only dates
    selectedDate.setHours(0, 0, 0, 0)
    today.setHours(0, 0, 0, 0)
    tomorrow.setHours(0, 0, 0, 0)
    
    if (selectedDate < today) return 'overdue'
    if (selectedDate.getTime() === today.getTime()) return 'due-today'
    if (selectedDate.getTime() === tomorrow.getTime()) return 'due-tomorrow'
    return 'future'
  }

  const dateStatus = getDateStatus(selectedDate)

  if (!isOpen || !todo) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center">
              <Calendar className="h-6 w-6 text-blue-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Set Due Date</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">To-Do:</h3>
              <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">
                {todo.title}
              </p>
            </div>

            {/* Current Due Date */}
            {todo.dueDate && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Current Due Date:</h3>
                <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-md">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-gray-900">
                    {new Date(todo.dueDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              </div>
            )}

            {/* Date Picker */}
            <div className="mb-4">
              <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-2">
                Select Due Date:
              </label>
              <input
                type="date"
                id="dueDate"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Date Status Indicator */}
            {selectedDate && (
              <div className="mb-4">
                <div className={`p-3 rounded-md ${
                  dateStatus === 'overdue' ? 'bg-red-50 border border-red-200' :
                  dateStatus === 'due-today' ? 'bg-yellow-50 border border-yellow-200' :
                  dateStatus === 'due-tomorrow' ? 'bg-orange-50 border border-orange-200' :
                  'bg-green-50 border border-green-200'
                }`}>
                  <div className="flex items-center">
                    <Calendar className={`h-4 w-4 mr-2 ${
                      dateStatus === 'overdue' ? 'text-red-600' :
                      dateStatus === 'due-today' ? 'text-yellow-600' :
                      dateStatus === 'due-tomorrow' ? 'text-orange-600' :
                      'text-green-600'
                    }`} />
                    <span className={`text-sm font-medium ${
                      dateStatus === 'overdue' ? 'text-red-800' :
                      dateStatus === 'due-today' ? 'text-yellow-800' :
                      dateStatus === 'due-tomorrow' ? 'text-orange-800' :
                      'text-green-800'
                    }`}>
                      {dateStatus === 'overdue' && 'Overdue - This date has passed'}
                      {dateStatus === 'due-today' && 'Due Today - High Priority'}
                      {dateStatus === 'due-tomorrow' && 'Due Tomorrow - Urgent'}
                      {dateStatus === 'future' && 'Future Date - On Track'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Preview */}
            {selectedDate && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Preview:</h3>
                <div className="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">
                  Due: {new Date(selectedDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-6 border-t border-gray-200">
            <div>
              {todo.dueDate && (
                <button
                  onClick={handleRemove}
                  disabled={isLoading}
                  className="inline-flex items-center px-3 py-2 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove Due Date
                </button>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="btn-outline"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </div>
                ) : (
                  'Set Due Date'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}






