'use client'

import { useState } from 'react'
import { CheckSquare, Square, Target, User, Calendar, Building, Clock } from 'lucide-react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'

interface MyTasksListProps {
  assignedTodos: any[]
  completedTodos: any[]
}

export default function MyTasksList({ assignedTodos, completedTodos }: MyTasksListProps) {
  const [showCompleted, setShowCompleted] = useState(false)
  const { data: session } = useSession()

  // Helper function to get due date status
  const getDueDateStatus = (dueDate: string) => {
    if (!dueDate) return 'none'
    
    const due = new Date(dueDate)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    // Reset time to compare only dates
    due.setHours(0, 0, 0, 0)
    today.setHours(0, 0, 0, 0)
    tomorrow.setHours(0, 0, 0, 0)
    
    if (due < today) return 'overdue'
    if (due.getTime() === today.getTime()) return 'due-today'
    if (due.getTime() === tomorrow.getTime()) return 'due-tomorrow'
    return 'future'
  }

  // Toggle todo completion
  const handleToggleTodo = async (todoId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    
    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
          completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : null
        }),
      })

      if (response.ok) {
        toast.success(newStatus === 'COMPLETED' ? 'Initiative completed!' : 'Initiative marked as pending')
        // Refresh the page to show updated data
        window.location.reload()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update initiative')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    }
  }

  // Calculate stats
  const totalAssigned = assignedTodos.length
  const completedCount = assignedTodos.filter(todo => todo.status === 'COMPLETED').length
  const pendingCount = assignedTodos.filter(todo => todo.status === 'PENDING').length
  const completionRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Target className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Assigned</p>
              <p className="text-2xl font-semibold text-gray-900">{totalAssigned}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Square className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Pending</p>
              <p className="text-2xl font-semibold text-gray-900">{pendingCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckSquare className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Completed</p>
              <p className="text-2xl font-semibold text-gray-900">{completedCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-sm font-semibold text-blue-600">{completionRate}%</span>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Completion Rate</p>
              <p className="text-2xl font-semibold text-gray-900">{completionRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Assigned Initiatives */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Assigned Initiatives</h2>
          <p className="text-sm text-gray-500">Initiatives currently assigned to you</p>
        </div>

        <div className="p-6">
          {assignedTodos.length > 0 ? (
            <div className="space-y-4">
              {assignedTodos.map((todo) => (
                <div
                  key={todo.id}
                  className={`flex items-start space-x-4 p-4 rounded-lg border ${
                    todo.status === 'COMPLETED' 
                      ? 'border-green-200 bg-green-50' 
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <button
                    onClick={() => handleToggleTodo(todo.id, todo.status)}
                    className={`flex-shrink-0 mt-1 ${
                      todo.status === 'COMPLETED' 
                        ? 'text-green-600 hover:text-green-700' 
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                    title={todo.status === 'COMPLETED' ? 'Mark as pending' : 'Mark as completed'}
                  >
                    {todo.status === 'COMPLETED' ? (
                      <CheckSquare className="h-5 w-5" />
                    ) : (
                      <Square className="h-5 w-5" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className={`text-sm font-medium ${
                          todo.status === 'COMPLETED' 
                            ? 'text-gray-500 line-through' 
                            : 'text-gray-900'
                        }`}>
                          {todo.title}
                        </h3>
                        
                        {todo.description && (
                          <p className={`text-sm mt-1 ${
                            todo.status === 'COMPLETED' 
                              ? 'text-gray-400 line-through' 
                              : 'text-gray-600'
                          }`}>
                            {todo.description}
                          </p>
                        )}

                        <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                          <div className="flex items-center">
                            <Target className="h-3 w-3 mr-1" />
                            <span>Key Result: {todo.keyResult.title}</span>
                          </div>
                          <div className="flex items-center">
                            <Building className="h-3 w-3 mr-1" />
                            <span>Objective: {todo.keyResult.objective.title}</span>
                          </div>
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            <span>
                              Timeframe: {todo.keyResult.objective.timeframe.name}
                              {todo.keyResult.objective.timeframe.type && (
                                <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1 rounded">
                                  {todo.keyResult.objective.timeframe.type === 'MONTHLY' ? 'Monthly' :
                                   todo.keyResult.objective.timeframe.type === 'QUARTERLY' ? 'Quarterly' :
                                   todo.keyResult.objective.timeframe.type === 'SIX_MONTH' ? '6-Month' :
                                   todo.keyResult.objective.timeframe.type === 'YEARLY' ? 'Yearly' : ''}
                                </span>
                              )}
                            </span>
                          </div>
                          {todo.dueDate && (
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              <span className={`font-medium ${
                                getDueDateStatus(todo.dueDate) === 'overdue' ? 'text-red-600' :
                                getDueDateStatus(todo.dueDate) === 'due-today' ? 'text-yellow-600' :
                                getDueDateStatus(todo.dueDate) === 'due-tomorrow' ? 'text-orange-600' :
                                'text-green-600'
                              }`}>
                                Due: {new Date(todo.dueDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Target className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No assigned initiatives</h3>
              <p className="mt-1 text-sm text-gray-500">
                You don&apos;t have any initiatives assigned to you at the moment.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Completed Tasks */}
      {completedTodos.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Recently Completed</h2>
                <p className="text-sm text-gray-500">Initiatives completed in the last 30 days</p>
              </div>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {showCompleted ? 'Hide' : 'Show'} ({completedTodos.length})
              </button>
            </div>
          </div>

          {showCompleted && (
            <div className="p-6">
              <div className="space-y-4">
                {completedTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-start space-x-4 p-4 rounded-lg border border-green-200 bg-green-50"
                  >
                    <div className="flex-shrink-0 mt-1 text-green-600">
                      <CheckSquare className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-500 line-through">
                        {todo.title}
                      </h3>
                      
                      {todo.description && (
                        <p className="text-sm mt-1 text-gray-400 line-through">
                          {todo.description}
                        </p>
                      )}

                      <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                        <div className="flex items-center">
                          <Target className="h-3 w-3 mr-1" />
                          <span>Key Result: {todo.keyResult.title}</span>
                        </div>
                        <div className="flex items-center">
                          <Building className="h-3 w-3 mr-1" />
                          <span>Objective: {todo.keyResult.objective.title}</span>
                        </div>
                        <div className="flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          <span>Completed: {new Date(todo.completedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
