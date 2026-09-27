'use client'

/**
 * Code-split entry point for the Trello-style card modal.
 *
 * `TodoCardModal` pulls in the card body, its sub-components and the Tiptap
 * `MentionEditor` (~150 KB). It used to be imported statically by the
 * dashboard layout (via `GlobalInitiativeDetail`), so every dashboard page paid
 * for it on first load even though most sessions never open a card. Rendering
 * this wrapper only when a card is actually open means the chunk is fetched on
 * first open and cached thereafter.
 *
 * Same props and behaviour as `TodoCardModal`; nothing renders while the chunk
 * loads (the modal paints its own loading state as soon as it mounts).
 */

import dynamic from 'next/dynamic'

export const LazyTodoCardModal = dynamic(
  () => import('./TodoCardModal').then((m) => m.TodoCardModal),
  { ssr: false, loading: () => null },
)
