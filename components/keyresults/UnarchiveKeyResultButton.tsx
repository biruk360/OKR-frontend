'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'

interface UnarchiveKeyResultButtonProps {
  keyResult: any
  className?: string
  canUnarchive: boolean
  onDone?: () => void
}

export default function UnarchiveKeyResultButton({
  keyResult,
  className = '',
  canUnarchive,
  onDone,
}: UnarchiveKeyResultButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { data: session } = useSession()
  const router = useRouter()

  if (!session?.user || !canUnarchive || keyResult.status !== 'ARCHIVED') {
    return null
  }

  const handleUnarchive = async () => {
    setIsLoading(true)

    try {
      const response = await fetch(`/api/keyresults/${keyResult.id}/unarchive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Key Result restored.')
        onDone?.()
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to restore key result')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleUnarchive}
      className={`inline-flex items-center px-2 py-1 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 rounded ${className}`}
      title="Restore key result"
      disabled={isLoading}
    >
      {isLoading ? (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
      ) : (
        <RotateCcw className="h-4 w-4" />
      )}
    </button>
  )
}






