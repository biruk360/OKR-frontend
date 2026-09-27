'use client'

/**
 * Single mounted instance of the Trello-style TodoCardModal. Listens to
 * `useInitiativeDetailStore` for the currently open todo id and renders
 * the new card modal. All existing `useInitiativeDetailStore.getState().open(id)`
 * call sites work unchanged.
 *
 * Mounted by the dashboard layout on every page, so the modal itself is
 * code-split: `LazyTodoCardModal` is only rendered — and its chunk (card body +
 * Tiptap editor) only fetched — once a card is first opened. Until then this
 * component renders nothing and costs nothing.
 */

import { useSession } from 'next-auth/react'
import { LazyTodoCardModal } from '@/components/todos/LazyTodoCardModal'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'

export default function GlobalInitiativeDetail() {
  const { openId, close, markChanged } = useInitiativeDetailStore()
  const { data: session } = useSession()

  if (!openId || !session?.user?.id) return null

  return (
    <LazyTodoCardModal
      todoId={openId}
      currentUserId={session.user.id}
      onClose={close}
      onUpdated={markChanged}
    />
  )
}
