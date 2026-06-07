'use client'

import toast from 'react-hot-toast'

/**
 * Returns a function that toggles a todo's status between PENDING and COMPLETED
 * via PUT /api/todos/[id].
 *
 * @param onSuccess - called with (todoId, newStatus) after a successful response.
 *                    Use this to update local state or trigger a page reload.
 */
export function useTodoStatusToggle(
  onSuccess: (todoId: string, newStatus: string) => void,
) {
  return async function toggleTodoStatus(todoId: string, currentStatus: string) {
    const newStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED'

    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : null,
        }),
      })

      if (response.ok) {
        toast.success(
          newStatus === 'COMPLETED' ? 'Initiative completed!' : 'Initiative marked as pending',
        )
        onSuccess(todoId, newStatus)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update initiative')
      }
    } catch {
      toast.error('An error occurred. Please try again.')
    }
  }
}
