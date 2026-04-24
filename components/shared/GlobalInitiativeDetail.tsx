'use client'

/**
 * Single mounted instance of the Trello-style TodoCardModal. Listens to
 * `useInitiativeDetailStore` for the currently open todo id and renders
 * the new card modal. All existing `useInitiativeDetailStore.getState().open(id)`
 * call sites work unchanged.
 */

import { useSession } from 'next-auth/react'
import { TodoCardModal } from '@/components/todos/TodoCardModal'
import { useInitiativeDetailStore } from '@/lib/stores/initiative-detail-store'

export default function GlobalInitiativeDetail() {
  const { openId, close, markChanged } = useInitiativeDetailStore()
  const { data: session } = useSession()

  if (!openId || !session?.user?.id) return null

  return (
    <TodoCardModal
      todoId={openId}
      currentUserId={session.user.id}
      onClose={close}
      onUpdated={markChanged}
    />
  )
}
