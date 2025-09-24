'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { UserPlus, User } from 'lucide-react'
import AssignUserModal from './AssignUserModal'

interface AssignUserButtonProps {
  todo: any
  users: any[]
  onAssign: (userId: string) => void
  className?: string
}

export default function AssignUserButton({ todo, users, onAssign, className = '' }: AssignUserButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: session } = useSession()

  // Check if user can assign todos (key result owner, objective owner, or admin)
  const canAssignTodo = session?.user && (
    session.user.role === 'ADMIN' || 
    session.user.id === todo.keyResult?.ownerId ||
    session.user.id === todo.keyResult?.objective?.ownerId
  )

  if (!canAssignTodo) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center px-2 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded ${className}`}
        title={todo.assignee ? 'Re-assign user' : 'Assign user'}
      >
        {todo.assignee ? (
          <User className="h-4 w-4" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
      </button>

      <AssignUserModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        todo={todo}
        users={users}
        onAssign={onAssign}
      />
    </>
  )
}






