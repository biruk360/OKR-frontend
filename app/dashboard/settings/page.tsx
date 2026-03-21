'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()
  
  useEffect(() => {
    // Redirect to profile settings by default
    router.replace('/dashboard/settings/profile')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading settings...</p>
      </div>
    </div>
  )
}
