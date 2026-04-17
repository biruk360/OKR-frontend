'use client'

/**
 * Single mounted instance of the rich initiative modal/sidebar. Listens to
 * `useInitiativeDetailStore` for the currently open initiative id, fetches
 * its full record, and renders the existing `TodoDetailPanel` (the same
 * component the dedicated /dashboard/todos page uses).
 *
 * Mounted once at the dashboard layout level so any initiative card anywhere
 * in the app can open this view via `useInitiativeDetailStore.getState().open(id)`.
 */

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import TodoDetailPanel from '@/components/todos-page/TodoDetailPanel'
import type { TodoRow } from '@/components/todos-page/TodosPageClient'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'
import { useUserPrefsStore } from '@/lib/stores/user-prefs-store'

export default function GlobalInitiativeDetail() {
  const { openId, close, markChanged } = useInitiativeDetailStore()
  const { data: session } = useSession()
  const { todoViewMode, load: loadPrefs, setTodoViewMode } = useUserPrefsStore()
  const [todo, setTodo] = useState<TodoRow | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadPrefs() }, [loadPrefs])

  useEffect(() => {
    if (!openId) { setTodo(null); return }
    setLoading(true)
    fetch(`/api/todos/${openId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || 'Could not load')
        setTodo(data.data as TodoRow)
      })
      .catch((err) => {
        toast.error(err.message || 'Could not load initiative')
        close()
      })
      .finally(() => setLoading(false))
  }, [openId, close])

  if (!openId || !session?.user?.id) return null
  if (loading || !todo) {
    // Light placeholder so users see immediate feedback while the fetch resolves.
    return (
      <div
        className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center"
        onClick={close}
      >
        <div className="bg-card rounded-lg px-6 py-4 text-sm text-muted-foreground shadow">Loading initiative…</div>
      </div>
    )
  }

  return (
    <TodoDetailPanel
      todo={todo}
      mode={todoViewMode}
      users={[]}
      keyResults={[]}
      objectives={[]}
      currentUserId={session.user.id}
      onClose={close}
      onUpdate={(patch) => {
        setTodo((cur) => (cur ? ({ ...cur, ...patch } as TodoRow) : cur))
        markChanged()
      }}
      onDelete={async () => {
        try {
          const res = await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' })
          const json = await res.json()
          if (!res.ok || !json.success) throw new Error(json.error || 'Delete failed')
          toast.success('Initiative deleted')
          markChanged()
          close()
        } catch (err: any) {
          toast.error(err.message || 'Delete failed')
        }
      }}
      onToggleMode={() => setTodoViewMode(todoViewMode === 'modal' ? 'sidebar' : 'modal')}
    />
  )
}
