'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui'

interface DeleteTodoModalProps {
  isOpen: boolean
  onClose: () => void
  todo: any
  onConfirm: () => void | Promise<void>
}

export default function DeleteTodoModal({ isOpen, onClose, todo, onConfirm }: DeleteTodoModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  if (!todo) return null

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ConfirmDialog
      open={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Delete To-Do"
      icon={AlertTriangle}
      message="Are you sure you want to permanently delete this initiative? This action cannot be undone."
      variant="danger"
      confirmLabel="Delete To-Do"
      loadingLabel="Deleting..."
      isLoading={isLoading}
      details={
        <>
          <h3 className="font-medium text-foreground mb-2">To-Do Details:</h3>
          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>Title:</strong> {todo.title}</p>
            {todo.description && (
              <p><strong>Description:</strong> {todo.description}</p>
            )}
            {todo.assignee && (
              <p><strong>Assigned to:</strong> {todo.assignee.name}</p>
            )}
            {todo.dueDate && (
              <p><strong>Due Date:</strong> {new Date(todo.dueDate).toLocaleDateString()}</p>
            )}
            <p><strong>Status:</strong> {todo.status}</p>
          </div>
        </>
      }
      extraContent={
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <AlertTriangle className="h-4 w-4 text-red-600 mr-2" />
            <p className="text-sm text-red-700">
              <strong>Warning:</strong> This will permanently delete the initiative and cannot be undone.
            </p>
          </div>
        </div>
      }
    />
  )
}
