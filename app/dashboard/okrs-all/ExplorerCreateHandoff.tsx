'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CreateObjectiveModal } from '@/features/objectives'
import { useCreateIntentStore } from '@/lib/stores/create-intent-store'

/**
 * Opens "Create objective" on the OKR Explorer for the two hand-offs that used
 * to land on the retired /dashboard/objectives page (CreateObjectiveButton):
 *  - the Cmd-K "Create objective" intent, and
 *  - `?createUnder=<objectiveId>` (the map's "Add aligned objective"), with that
 *    objective pre-filled as the parent.
 * Renders no button — the List view keeps its own role-aware Create menu.
 */
export default function ExplorerCreateHandoff() {
  const [open, setOpen] = useState(false)
  const [parentId, setParentId] = useState<string | undefined>(undefined)
  const intent = useCreateIntentStore((s) => s.intent)
  const nonce = useCreateIntentStore((s) => s.nonce)
  const clear = useCreateIntentStore((s) => s.clear)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const createUnder = searchParams?.get('createUnder') ?? null

  useEffect(() => {
    if (intent === 'objective') {
      setParentId(undefined)
      setOpen(true)
      clear()
    }
  }, [intent, nonce, clear])

  useEffect(() => {
    if (!createUnder) return
    setParentId(createUnder)
    setOpen(true)
  }, [createUnder])

  const close = () => {
    setOpen(false)
    setParentId(undefined)
    if (createUnder) {
      // Drop the one-shot param so a refresh doesn't reopen the modal.
      const next = new URLSearchParams(searchParams?.toString() ?? '')
      next.delete('createUnder')
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }
  }

  return (
    <CreateObjectiveModal
      isOpen={open}
      onClose={close}
      defaultParentObjectiveId={parentId}
      onObjectiveCreated={() => router.refresh()}
    />
  )
}
