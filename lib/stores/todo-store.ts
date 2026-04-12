import { create } from 'zustand'
import toast from 'react-hot-toast'

export interface TodoItem {
  id: string
  title: string
  description: string | null
  status: string
  dueDate: string | null
  completedAt: string | null
  assignee: { id: string; name: string; avatar: string | null }
  creator: { id: string; name: string; avatar: string | null }
  keyResultId: string | null
  keyResult: {
    id: string
    title: string
    objective: { id: string; title: string; level: string; timeframeName: string }
  } | null
  objectiveId: string | null
  objective: { id: string; title: string; level: string; timeframeName: string } | null
  createdAt: string
  updatedAt: string
}

interface TodoState {
  todos: TodoItem[]
  loading: boolean
  initialized: boolean

  // Actions
  setTodos: (todos: TodoItem[]) => void
  fetchTodos: () => Promise<void>
  toggleComplete: (id: string) => Promise<void>
  changeStatus: (id: string, status: string) => Promise<void>
  changeAssignee: (id: string, assigneeId: string, assignee: TodoItem['assignee']) => Promise<void>
  changeDueDate: (id: string, dueDate: string | null) => Promise<void>
  updateTodo: (id: string, patch: Partial<TodoItem>) => void
  deleteTodo: (id: string) => Promise<void>
  addTodo: (todo: TodoItem) => void
}

export const useTodoStore = create<TodoState>((set, get) => ({
  todos: [],
  loading: false,
  initialized: false,

  setTodos: (todos) => set({ todos, initialized: true }),

  fetchTodos: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const res = await fetch('/api/todos?mine=all')
      const data = await res.json()
      if (data.success) set({ todos: data.todos, initialized: true })
    } catch {
      toast.error('Failed to load to-dos')
    } finally {
      set({ loading: false })
    }
  },

  toggleComplete: async (id) => {
    const { todos } = get()
    const todo = todos.find((t) => t.id === id)
    if (!todo) return
    const nextStatus = todo.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    const snapshot = todos

    set({
      todos: todos.map((t) =>
        t.id === id
          ? { ...t, status: nextStatus, completedAt: nextStatus === 'COMPLETED' ? new Date().toISOString() : null }
          : t
      ),
    })

    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          completedAt: nextStatus === 'COMPLETED' ? new Date().toISOString() : null,
        }),
      })
      if (!res.ok) throw new Error()
    } catch {
      set({ todos: snapshot })
      toast.error('Failed to update')
    }
  },

  changeStatus: async (id, status) => {
    const snapshot = get().todos
    set({
      todos: snapshot.map((t) =>
        t.id === id
          ? { ...t, status, completedAt: status === 'COMPLETED' ? new Date().toISOString() : null }
          : t
      ),
    })
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, completedAt: status === 'COMPLETED' ? new Date().toISOString() : null }),
      })
      if (!res.ok) throw new Error()
    } catch {
      set({ todos: snapshot })
      toast.error('Failed to update status')
    }
  },

  changeAssignee: async (id, assigneeId, assignee) => {
    const snapshot = get().todos
    set({ todos: snapshot.map((t) => (t.id === id ? { ...t, assignee } : t)) })
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId }),
      })
      if (!res.ok) throw new Error()
    } catch {
      set({ todos: snapshot })
      toast.error('Failed to change assignee')
    }
  },

  changeDueDate: async (id, dueDate) => {
    const snapshot = get().todos
    set({ todos: snapshot.map((t) => (t.id === id ? { ...t, dueDate } : t)) })
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: dueDate || null }),
      })
      if (!res.ok) throw new Error()
    } catch {
      set({ todos: snapshot })
      toast.error('Failed to update date')
    }
  },

  updateTodo: (id, patch) => {
    set({ todos: get().todos.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
  },

  deleteTodo: async (id) => {
    const snapshot = get().todos
    set({ todos: snapshot.filter((t) => t.id !== id) })
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } catch {
      set({ todos: snapshot })
      toast.error('Failed to delete')
    }
  },

  addTodo: (todo) => {
    set({ todos: [todo, ...get().todos] })
  },
}))
