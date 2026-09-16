'use client'

/**
 * LiveAnnouncer — the app's single aria-live region.
 *
 * Before this there was no aria-live region and no role="status" anywhere in
 * the codebase, so screen-reader users got no feedback for changes that happen
 * without a focus change: kanban card moves, optimistic saves, bulk actions.
 *
 * Usage from anywhere (no prop drilling, no context):
 *
 *   import { announce } from '@/components/shared/LiveAnnouncer'
 *   announce('Card "Bid proposal" moved to In Progress, position 2 of 7')
 *   announce('Could not save', 'assertive')
 *
 * Mounted once in app/layout.tsx.
 *
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md A11Y-3.
 */

import { useEffect, useState } from 'react'

type Priority = 'polite' | 'assertive'

interface Announcement {
  message: string
  /** Bumped on every call so identical consecutive messages still re-announce. */
  nonce: number
}

type Listener = (priority: Priority, announcement: Announcement) => void

const listeners = new Set<Listener>()
let nonce = 0

/**
 * Announce a message to assistive technology.
 *
 * `polite` (default) waits for a pause in speech — correct for status updates.
 * `assertive` interrupts — reserve it for errors the user must hear now.
 *
 * Safe to call before the announcer mounts; the message is simply dropped
 * rather than throwing, which keeps callers free of null checks.
 */
export function announce(message: string, priority: Priority = 'polite'): void {
  const trimmed = message.trim()
  if (!trimmed) return
  nonce += 1
  const payload: Announcement = { message: trimmed, nonce }
  listeners.forEach((listener) => listener(priority, payload))
}

export default function LiveAnnouncer() {
  const [polite, setPolite] = useState<Announcement>({ message: '', nonce: 0 })
  const [assertive, setAssertive] = useState<Announcement>({ message: '', nonce: 0 })

  useEffect(() => {
    const listener: Listener = (priority, announcement) => {
      if (priority === 'assertive') setAssertive(announcement)
      else setPolite(announcement)
    }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  return (
    <>
      {/* Two separate regions: a single region switching its aria-live value
          is unreliable across screen readers. */}
      <div
        key={`polite-${polite.nonce}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {polite.message}
      </div>
      <div
        key={`assertive-${assertive.nonce}`}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertive.message}
      </div>
    </>
  )
}
