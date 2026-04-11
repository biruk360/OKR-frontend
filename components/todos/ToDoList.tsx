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

  // Compact / Notion-style design: single-line rows, hover-revealed actions, no per-row card.
  const shellClass = cn(
    'notion-surface',
    variant === 'card' && 'mt-4 rounded-md border border-[color:var(--notion-divider)] bg-white',
    variant === 'embedded' && 'mt-0'
  )

  const summaryRight = isLoading ? (
    <span className="notion-text-tertiary">Loading…</span>
  ) : totalTodos > 0 ? (
    <span className="notion-text-tertiary">
      {completedTodos}/{totalTodos} done · {completionPercentage}%
    </span>
  ) : (
    <span className="notion-text-tertiary">empty</span>
  )

  const toggleRow = (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[color:var(--notion-hover)]"
      aria-expanded={expanded}
    >
      {expanded ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[color:var(--notion-text-tertiary)]" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[color:var(--notion-text-tertiary)]" />
      )}
      <span className="text-[13px] font-semibold text-[color:var(--notion-text)]">Initiatives</span>
      {totalTodos > 0 && (
        <span className="ml-1 inline-flex h-4 min-w-[18px] items-center justify-center rounded-sm bg-[color:var(--notion-hover)] px-1 text-[10px] font-semibold text-[color:var(--notion-text-secondary)]">
          {totalTodos}
        </span>
      )}
      <span className="ml-auto min-w-0 shrink truncate">{summaryRight}</span>
    </button>
  )

  const listBody =
    isLoading && expanded ? (
      <div className="px-2 py-3 animate-pulse">
        <div className="h-3 w-1/3 bg-[color:var(--notion-divider)] rounded mb-2" />
        <div className="h-3 w-3/4 bg-[color:var(--notion-divider)] rounded mb-1" />
        <div className="h-3 w-1/2 bg-[color:var(--notion-divider)] rounded" />
      </div>
    ) : (
      <div className="px-1 pb-1">
        <div className="px-1 py-1">
          <AddToDo onAddTodo={handleAddTodo} />
        </div>

        {todos.length > 0 ? (
          <ul className="">
            {todos.map((todo) => {
              const isDone = todo.status === 'COMPLETED'
              const dueStatus = todo.dueDate ? getDueDateStatus(todo.dueDate) : 'none'
              return (
                <li
                  key={todo.id}
                  className="group flex h-8 items-center gap-2 rounded-sm px-2 hover:bg-[color:var(--notion-hover)]"
                >
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => handleToggleTodo(todo.id, todo.status)}
                    className="notion-checkbox"
                    aria-label={isDone ? 'Mark as pending' : 'Mark as completed'}
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[13px]',
                      isDone
                        ? 'text-[color:var(--notion-text-tertiary)] line-through'
                        : 'text-[color:var(--notion-text)]'
                    )}
                    title={todo.title}
                  >
                    {todo.title}
                  </span>

                  {/* Inline metadata: assignee + due date */}
                  {todo.assignee && (
                    <span className="notion-avatar" title={todo.assignee.name}>
                      {todo.assignee.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={todo.assignee.avatar} alt="" />
                      ) : (
                        todo.assignee.name?.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
                      )}
                    </span>
                  )}
                  {todo.dueDate && (
                    <span
                      className="notion-pill"
                      data-tone={
                        dueStatus === 'overdue' ? 'red' :
                        dueStatus === 'due-today' ? 'yellow' :
                        dueStatus === 'due-tomorrow' ? 'yellow' :
                        'gray'
                      }
                    >
                      {new Date(todo.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}

                  {/* Hover-revealed actions */}
                  <span className="ml-1 hidden items-center gap-0.5 group-hover:flex">
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
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="px-2 py-2 text-[12px] text-[color:var(--notion-text-tertiary)]">
            No initiatives yet — add one above.
          </div>
        )}

        {totalTodos > 0 && (
          <div className="mt-2 px-2 pb-1">
            <div className="notion-progress">
              <div
                className="notion-progress-fill"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        )}
      </div>
    )

  return (
    <div className={shellClass}>
      <div className="px-1 pt-1">{toggleRow}</div>
      {expanded && <div>{listBody}</div>}
    </div>
  )
}
