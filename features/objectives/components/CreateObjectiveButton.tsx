'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import CreateObjectiveModal from './CreateObjectiveModal'
import { useCreateIntentStore } from '@/lib/stores/create-intent-store'

export default function CreateObjectiveButton() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const intent = useCreateIntentStore((s) => s.intent)
  const nonce = useCreateIntentStore((s) => s.nonce)
  const clear = useCreateIntentStore((s) => s.clear)

  useEffect(() => {
    if (intent === 'objective') {
      setIsModalOpen(true)
      clear()
    }
  }, [intent, nonce, clear])

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="btn-primary"
      >
        <Plus className="h-4 w-4 mr-2" />
        Create Objective
      </button>

      <CreateObjectiveModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}
