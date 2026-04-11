'use client'

import { useState, useEffect } from 'react'
import { CheckSquare, Square, ChevronDown, ChevronRight, User, Calendar } from 'lucide-react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import AddToDo from './AddToDo'
import AssignUserButton from './AssignUserButton'
import SetDueDateButton from './SetDueDateButton'
import EditTodoButton from './EditTodoButton'
import DeleteTodoButton from './DeleteTodoButton'

interface ToDoListProps {
  keyResultId: string
  keyResult: any
  users: any[]
  /** When false (default), initiatives / to-dos are hidden until the row is expanded. */
  defaultExpanded?: boolean
  /** Use `embedded` inside the key-result detail card to avoid a nested gray panel. */
  variant?: 'card' | 'embedded'
}

interface Todo {
  id: string
  title: string
  description?: string
  status: string
  dueDate?: string | null
  completedAt?: string | null
  assigneeId: string
  creatorId: string
  keyResultId: string
  createdAt: string
  updatedAt: string
  assignee: {
    id: string
    name: string
    avatar?: string
  }
  creator: {
    id: string
    name: string
    avatar?: string
  }
}

export default function ToDoList({
  keyResultId,
  keyResult: _keyResult,
  users,
  defaultExpanded = false,
  variant = 'card',
}: ToDoListProps) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const { data: session } = useSession()

  // Fetch todos for this key result
  useEffect(() => {
    const fetchTodos = async () => {
      try {
        const response = await fetch(`/api/keyresults/${keyResultId}/todos`)
        if (response.ok) {
          const data = await response.json()
          setTodos(data.todos || [])
        }
      } catch (error) {
        console.error('Error fetching todos:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (keyResultId) {
      fetchTodos()
    }
  }, [keyResultId])

  // Add new todo
  const handleAddTodo = async (title: string) => {
    if (!session?.user) return

    try {
      const response = await fetch(`/api/keyresults/${keyResultId}/todos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          assigneeId: session.user.id,
          creatorId: session.user.id
        }),
      })

      if (response.ok) {
        const newTodo = await response.json()
        setTodos(prev => [...prev, newTodo.todo])
        toast.success('Initiative added successfully')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to add initiative')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    }
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
        setTodos(prev => prev.map(todo => 
          todo.id === todoId 
            ? { 
                ...todo, 
                status: newStatus,
                completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : null
              }
            : todo
        ))
        toast.success(newStatus === 'COMPLETED' ? 'Initiative completed!' : 'Initiative marked as pending')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update initiative')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    }
  }

  // Delete todo
  const handleDeleteTodo = async (todoId: string) => {
    if (!confirm('Are you sure you want to delete this initiative?')) return

    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setTodos(prev => prev.filter(todo => todo.id !== todoId))
        toast.success('Initiative deleted successfully')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete initiative')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    }
  }

  // Assign todo to user
  const handleAssignTodo = async (todoId: string, userId: string) => {
    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assigneeId: userId || null
        }),
      })

      if (response.ok) {
        const updatedTodo = await response.json()
        setTodos(prev => prev.map(todo => 
          todo.id === todoId 
            ? { ...todo, assigneeId: userId, assignee: updatedTodo.todo.assignee }
            : todo
        ))
        toast.success(userId ? 'Initiative assigned successfully' : 'Initiative unassigned successfully')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to assign initiative')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    }
  }

  // Set due date for todo
  const handleSetDueDate = async (todoId: string, dueDate: string | null) => {
    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dueDate: dueDate
        }),
      })

      if (response.ok) {
        setTodos(prev => prev.map(todo => 
          todo.id === todoId 
            ? { ...todo, dueDate: dueDate }
            : todo
        ))
        toast.success(dueDate ? 'Due date set successfully' : 'Due date removed successfully')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to set due date')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    }
  }

  // Edit todo details
  const handleEditTodo = async (todoId: string, title: string, description: string) => {
    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title,
          description: description
        }),
      })

      if (response.ok) {
        setTodos(prev => prev.map(todo => 
          todo.id === todoId 
            ? { ...todo, title: title, description: description }
            : todo
        ))
        toast.success('Initiative updated successfully')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update initiative')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    }
  }

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

  // Calculate completion stats
  const completedTodos = todos.filter(todo => todo.status === 'COMPLETED').length
  const totalTodos = todos.length
  const completionPercentage = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0

  const shellClass = cn(
    variant === 'card' && 'mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200',
    variant === 'embedded' && 'mt-0'
  )

  const summaryRight = isLoading ? (
    <span className="text-sm text-gray-400">Loading…</span>
  ) : totalTodos > 0 ? (
    <span className="text-sm text-gray-600">
      {completedTodos} of {totalTodos} completed
      <span className="ml-2 text-blue-600 font-medium">({completionPercentage}%)</span>
    </span>
  ) : (
    <span className="text-sm text-gray-500">No initiatives yet</span>
  )

  const toggleRow = (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      className={cn(
        'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2.5 text-left transition-colors',
        variant === 'card' && 'hover:bg-gray-100/80',
        variant === 'embedded' && 'hover:bg-gray-50'
      )}
      aria-expanded={expanded}
    >
      {expanded ? (
        <ChevronDown className="h-5 w-5 shrink-0 text-gray-500" />
      ) : (
        <ChevronRight className="h-5 w-5 shrink-0 text-gray-500" />
      )}
      <span className="text-base font-semibold text-gray-900">Initiatives</span>
      <span className="ml-auto min-w-0 shrink truncate">{summaryRight}</span>
    </button>
  )

  const listBody =
    isLoading && expanded ? (
      <div className="animate-pulse pt-2">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    ) : (
      <>
        <AddToDo onAddTodo={handleAddTodo} />

        {todos.length > 0 ? (
          <div className="mt-4 space-y-2">
            {todos.map((todo) => (
              <div
                key={todo.id}
                className={`flex items-center space-x-3 p-3 bg-white rounded-md border ${
                  todo.status === 'COMPLETED'
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200'
                }`}
              >
                <button
                  onClick={() => handleToggleTodo(todo.id, todo.status)}
                  className={`flex-shrink-0 ${
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
                  <p
                    className={`text-sm ${
                      todo.status === 'COMPLETED' ? 'text-gray-500 line-through' : 'text-gray-900'
                    }`}
                  >
                    {todo.title}
                  </p>
                  {todo.description && (
                    <p
                      className={`text-xs mt-1 ${
                        todo.status === 'COMPLETED' ? 'text-gray-400 line-through' : 'text-gray-600'
                      }`}
                    >
                      {todo.description}
                    </p>
                  )}
                  <div className="flex items-center space-x-2 mt-1">
                    <div className="flex items-center space-x-1">
                      <User className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {todo.assignee ? `Assigned to: ${todo.assignee.name}` : 'Unassigned'}
                      </span>
                    </div>
                    {todo.dueDate && (
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3 text-gray-400" />
                        <span
                          className={`text-xs font-medium ${
                            getDueDateStatus(todo.dueDate) === 'overdue'
                              ? 'text-red-600'
                              : getDueDateStatus(todo.dueDate) === 'due-today'
                                ? 'text-yellow-600'
                                : getDueDateStatus(todo.dueDate) === 'due-tomorrow'
                                  ? 'text-orange-600'
                                  : 'text-green-600'
                          }`}
                        >
                          Due:{' '}
                          {new Date(todo.dueDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                    {todo.completedAt && (
                      <span className="text-xs text-green-600">
                        Completed: {new Date(todo.completedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <EditTodoButton
                    todo={todo}
                    onSave={(title, description) => handleEditTodo(todo.id, title, description)}
                  />
                  <SetDueDateButton
                    todo={todo}
                    onSetDueDate={(dueDate) => handleSetDueDate(todo.id, dueDate)}
                  />
                  <AssignUserButton
                    todo={todo}
                    users={users}
                    onAssign={(userId) => handleAssignTodo(todo.id, userId)}
                  />

                  <DeleteTodoButton todo={todo} onDelete={() => handleDeleteTodo(todo.id)} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 text-center py-6">
            <p className="text-gray-500 text-sm">No initiatives yet. Add one above to get started!</p>
          </div>
        )}

        {totalTodos > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>Progress</span>
              <span>{completionPercentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        )}
      </>
    )

  return (
    <div className={shellClass}>
      {toggleRow}
      {expanded && <div className={cn(variant === 'card' && 'pt-1')}>{listBody}</div>}
    </div>
  )
}
