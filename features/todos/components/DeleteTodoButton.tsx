'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Trash2 } from 'lucide-react'
import DeleteTodoModal from './DeleteTodoModal'

interface DeleteTodoButtonProps {
  todo: any
  onDelete: () => void
  className?: string
}

export default function DeleteTodoButton({ todo, onDelete, className = '' }: DeleteTodoButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Check if user can delete todos (key result owner, objective owner, admin, or creator)
  const canDeleteTodo = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.id === todo.keyResult?.ownerId ||
    session.user.id === todo.keyResult?.objective?.ownerId ||
    session.user.id === todo.creatorId
  )

  if (!canDeleteTodo) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded ${className}`}
        title="Delete initiative"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <DeleteTodoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        todo={todo}
        onConfirm={onDelete}
      />
    </>
  )
}