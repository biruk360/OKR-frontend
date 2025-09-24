'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Edit3 } from 'lucide-react'
import EditTodoModal from './EditTodoModal'

interface EditTodoButtonProps {
  todo: any
  onSave: (title: string, description: string) => void
  className?: string
}

export default function EditTodoButton({ todo, onSave, className = '' }: EditTodoButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Check if user can edit todos (key result owner, objective owner, admin, or assignee)
  const canEditTodo = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.id === todo.keyResult?.ownerId ||
    session.user.id === todo.keyResult?.objective?.ownerId ||
    session.user.id === todo.assigneeId ||
    session.user.id === todo.creatorId
  )

  if (!canEditTodo) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded ${className}`}
        title="Edit to-do"
      >
        <Edit3 className="h-4 w-4" />
      </button>

      <EditTodoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        todo={todo}
        onSave={onSave}
      />
    </>
  )
}






