'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

interface AddToDoProps {
  onAddTodo: (title: string) => void
}

export default function AddToDo({ onAddTodo }: AddToDoProps) {
  const [title, setTitle] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) return

    setIsLoading(true)
    try {
      await onAddTodo(title.trim())
      setTitle('') // Clear the input after successful addition
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-7 items-center gap-1.5 rounded-sm px-1 hover:bg-[color:var(--notion-hover)]">
      <Plus className="h-3.5 w-3.5 text-[color:var(--notion-text-tertiary)]" />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Add an initiative…"
        className="flex-1 bg-transparent text-[13px] text-[color:var(--notion-text)] placeholder:text-[color:var(--notion-text-tertiary)] focus:outline-none"
        disabled={isLoading}
      />
      {title.trim() && (
        <button
          type="submit"
          disabled={isLoading}
          className="notion-button notion-button-primary h-6 px-2 text-[12px]"
        >
          {isLoading ? '…' : 'Add'}
        </button>
      )}
    </form>
  )
}






