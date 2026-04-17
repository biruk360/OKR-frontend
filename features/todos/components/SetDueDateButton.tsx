'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Calendar, CalendarDays } from 'lucide-react'
import SetDueDateModal from './SetDueDateModal'

interface SetDueDateButtonProps {
  todo: any
  onSetDueDate: (date: string | null) => void
  className?: string
}

export default function SetDueDateButton({ todo, onSetDueDate, className = '' }: SetDueDateButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Check if user can set due dates (key result owner, objective owner, or admin)
  const canSetDueDate = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.id === todo.keyResult?.ownerId ||
    session.user.id === todo.keyResult?.objective?.ownerId ||
    session.user.id === todo.assigneeId
  )

  if (!canSetDueDate) {
    return null
  }

  const getDateStatus = (dateString: string) => {
    if (!dateString) return 'none'
    
    const dueDate = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    // Reset time to compare only dates
    dueDate.setHours(0, 0, 0, 0)
    today.setHours(0, 0, 0, 0)
    tomorrow.setHours(0, 0, 0, 0)
    
    if (dueDate < today) return 'overdue'
    if (dueDate.getTime() === today.getTime()) return 'due-today'
    if (dueDate.getTime() === tomorrow.getTime()) return 'due-tomorrow'
    return 'future'
  }

  const dateStatus = getDateStatus(todo.dueDate)

  const getButtonColor = () => {
    switch (dateStatus) {
      case 'overdue':
        return 'text-red-600 hover:text-red-700 hover:bg-red-50'
      case 'due-today':
        return 'text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50'
      case 'due-tomorrow':
        return 'text-orange-600 hover:text-orange-700 hover:bg-orange-50'
      case 'future':
        return 'text-green-600 hover:text-green-700 hover:bg-green-50'
      default:
        return 'text-muted-foreground hover:text-muted-foreground hover:bg-muted'
    }
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm rounded ${getButtonColor()} ${className}`}
        title={todo.dueDate ? 'Change due date' : 'Set due date'}
      >
        {todo.dueDate ? (
          <CalendarDays className="h-4 w-4" />
        ) : (
          <Calendar className="h-4 w-4" />
        )}
      </button>

      <SetDueDateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        todo={todo}
        onSetDueDate={onSetDueDate}
      />
    </>
  )
}






