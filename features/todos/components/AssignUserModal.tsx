'use client'

import { useState } from 'react'
import { Search, User, UserCheck } from 'lucide-react'
import { Modal } from '@/components/ui'

interface AssignUserModalProps {
  isOpen: boolean
  onClose: () => void
  todo: any
  users: any[]
  onAssign: (userId: string) => void | Promise<void>
}

export default function AssignUserModal({ isOpen, onClose, todo, users, onAssign }: AssignUserModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAssign = async (userId: string) => {
    setIsLoading(true)
    try {
      await onAssign(userId)
      onClose()
    } catch (error) {
      // parent handles errors
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnassign = async () => {
    setIsLoading(true)
    try {
      await onAssign('')
      onClose()
    } catch (error) {
      // parent handles errors
    } finally {
      setIsLoading(false)
    }
  }

  if (!todo) return null

  return (
    <Modal open={isOpen} onClose={onClose} title="Assign User" icon={UserCheck} iconClassName="text-blue-600" size="sm">
      <div>
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">To-Do:</h3>
          <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">{todo.title}</p>
        </div>

        {todo.assignee && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Currently Assigned To:</h3>
            <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-md">
              <div className="flex-shrink-0">
                {todo.assignee.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="h-8 w-8 rounded-full" src={todo.assignee.avatar} alt={todo.assignee.name} />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{todo.assignee.name}</p>
                <p className="text-sm text-gray-500">{todo.assignee.email}</p>
              </div>
              <button
                onClick={handleUnassign}
                disabled={isLoading}
                className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                Unassign
              </button>
            </div>
          </div>
        )}

        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            {todo.assignee ? 'Re-assign to:' : 'Assign to:'}
          </h3>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Search users..."
            />
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto">
          {filteredUsers.length > 0 ? (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleAssign(user.id)}
                  disabled={isLoading || user.id === todo.assigneeId}
                  className={`w-full flex items-center space-x-3 p-3 rounded-md border text-left hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${
                    user.id === todo.assigneeId ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {user.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="h-8 w-8 rounded-full" src={user.avatar} alt={user.name} />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gray-500 flex items-center justify-center">
                        <User className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{user.name}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                  {user.id === todo.assigneeId && (
                    <div className="flex-shrink-0">
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Current</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">No users found</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 mt-4">
          <button onClick={onClose} className="btn-outline" disabled={isLoading}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
