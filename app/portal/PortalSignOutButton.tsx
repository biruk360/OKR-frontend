'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

/**
 * Signs out of the client-portal NextAuth instance (/api/portal/auth, its own
 * cookie — an internal session in the same browser is untouched).
 */
export default function PortalSignOutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const signOut = async () => {
    setBusy(true)
    try {
      const csrf = await fetch('/api/portal/auth/csrf').then((res) => res.json())
      await fetch('/api/portal/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: '/portal/signin', json: 'true' }),
      })
    } finally {
      router.replace('/portal/signin')
      router.refresh()
    }
  }

  return (
    <button type="button" onClick={() => void signOut()} disabled={busy} className="btn btn-outline btn-sm">
      <LogOut className="mr-1 size-3.5" /> {busy ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
