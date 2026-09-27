'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import CreateObjectiveModal from './CreateObjectiveModal'
import { useCreateIntentStore } from '@/lib/stores/create-intent-store'

/**
 * Primary "Create Objective" button. Also opens the modal for:
 *  - the Cmd-K create intent, and
 *  - `?createUnder=<objectiveId>` (the OKR map's "Add aligned objective" hand-off),
 *    with that objective pre-filled as the parent.
 */
export default function CreateObjectiveButton() {
  const [isModalOpen, setIsModalOpen] = useState(false)
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
      setIsModalOpen(true)
      clear()
    }
  }, [intent, nonce, clear])

  useEffect(() => {
    if (!createUnder) return
    setParentId(createUnder)
    setIsModalOpen(true)
  }, [createUnder])

  const close = () => {
    setIsModalOpen(false)
    if (createUnder) {
      // Drop the one-shot param so a refresh doesn't reopen the modal.
      const next = new URLSearchParams(searchParams?.toString() ?? '')
      next.delete('createUnder')
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    }
    setParentId(undefined)
  }

  return (
    <>
      <button
        onClick={() => {
          setParentId(undefined)
          setIsModalOpen(true)
        }}
        className="btn-primary"
      >
        <Plus className="h-4 w-4 mr-2" />
        Create Objective
      </button>

      <CreateObjectiveModal
        isOpen={isModalOpen}
        onClose={close}
        defaultParentObjectiveId={parentId}
      />
    </>
  )
}
