'use client'

import { useState } from 'react'
import { dueTone, DUE_TONE_STYLE } from '@/lib/todos/due-tone'
import { Calendar, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui'

interface SetDueDateModalProps {
  isOpen: boolean
  onClose: () => void
  todo: any
  onSetDueDate: (date: string | null) => void | Promise<void>
}

export default function SetDueDateModal({ isOpen, onClose, todo, onSetDueDate }: SetDueDateModalProps) {
  const [selectedDate, setSelectedDate] = useState(
    todo?.dueDate ? new Date(todo.dueDate).toISOString().split('T')[0] : ''
  )
  const [isLoading, setIsLoading] = useState(false)

  const handleSave = async () => {
    setIsLoading(true)
    try {
      await onSetDueDate(selectedDate || null)
      onClose()
    } catch (error) {
      // parent handles errors
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemove = async () => {
    setIsLoading(true)
    try {
      await onSetDueDate(null)
      onClose()
    } catch (error) {
      // parent handles errors
    } finally {
      setIsLoading(false)
    }
  }


  const tone = dueTone({ dueDate: selectedDate || null })

  if (!todo) return null

  return (
    <Modal open={isOpen} onClose={onClose} title="Set Due Date" icon={Calendar} iconClassName="text-blue-600" size="sm">
      <div>
        <div className="mb-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">To-Do:</h3>
          <p className="text-sm text-foreground bg-muted p-3 rounded-md">{todo.title}</p>
        </div>

        {todo.dueDate && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Current Due Date:</h3>
            <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-md">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-foreground">
                {new Date(todo.dueDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="dueDate" className="block text-sm font-medium text-muted-foreground mb-2">
            Select Due Date:
          </label>
          <input
            type="date"
            id="dueDate"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-blue-500"
          />
        </div>

        {selectedDate && (
          <div className="mb-4">
            {/* Tone and copy both come from the shared vocabulary. This block
                used to paint any future date GREEN and label it "On Track",
                which asserts something a due date cannot tell you — a task is
                not on track merely because it is scheduled. */}
            <div
              className="rounded-md border p-3"
              style={{
                background: DUE_TONE_STYLE[tone].background,
                borderColor: 'var(--ap-border)',
              }}
            >
              <div className="flex items-center">
                <Calendar className="mr-2 h-4 w-4" style={{ color: DUE_TONE_STYLE[tone].color }} />
                <span className="text-sm font-medium" style={{ color: DUE_TONE_STYLE[tone].color }}>
                  {tone === 'overdue' && 'Overdue — this date has passed'}
                  {tone === 'today' && 'Due today'}
                  {tone === 'soon' && 'Due soon'}
                  {tone === 'upcoming' && 'Scheduled'}
                  {tone === 'done' && 'Completed'}
                  {tone === 'none' && 'No due date'}
                </span>
              </div>
            </div>
          </div>
        )}

        {selectedDate && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Preview:</h3>
            <div className="text-sm text-foreground bg-muted p-3 rounded-md">
              Due:{' '}
              {new Date(selectedDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div>
            {todo.dueDate && (
              <button
                onClick={handleRemove}
                disabled={isLoading}
                className="inline-flex items-center px-3 py-2 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove Due Date
              </button>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={onClose} className="btn-outline" disabled={isLoading}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Saving...
                </div>
              ) : (
                'Set Due Date'
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
