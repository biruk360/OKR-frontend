'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Calendar, CalendarDays } from 'lucide-react'
import SetDueDateModal from './SetDueDateModal'
import { dueTone, DUE_TONE_STYLE } from '@/lib/todos/due-tone'

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


  const tone = dueTone({ dueDate: todo.dueDate, done: todo.status === 'COMPLETED' })



  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center rounded px-2 py-1 text-sm transition-colors hover:bg-[var(--ap-bg-hover)] ${className}`}
        style={{ color: DUE_TONE_STYLE[tone].color }}
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






