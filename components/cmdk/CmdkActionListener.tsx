'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useCreateIntentStore } from '@/lib/stores/create-intent-store'

/**
 * Listens for `cmdk:action` CustomEvents emitted by CommandPalette and routes
 * each Quick Action to the right place:
 *
 *  - create-objective → /dashboard/objectives, then trigger the existing CreateObjectiveButton modal via createIntent store.
 *  - create-todo      → /dashboard/todos, then trigger TodosPageClient's create modal via createIntent store.
 *  - create-sprint    → /dashboard/sprints, then trigger SprintsListClient's inline create form.
 *  - check-in         → /dashboard/my-okrs (no global "check-in" modal yet).
 *
 * Each create-* path: navigate first if not already there, then publish the
 * intent. The target page picks it up on mount.
 */
export default function CmdkActionListener() {
  const router = useRouter()
  const pathname = usePathname()
  const request = useCreateIntentStore((s) => s.request)

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { action?: string; id?: string } | undefined
      const action = detail?.action ?? detail?.id
      if (!action) return

      switch (action) {
        case 'create-objective': {
          if (pathname !== '/dashboard/objectives') router.push('/dashboard/objectives')
          // Defer the intent so the target page mounts first.
          setTimeout(() => request('objective'), 50)
          return
        }
        case 'create-todo': {
          if (pathname !== '/dashboard/todos') router.push('/dashboard/todos')
          setTimeout(() => request('todo'), 50)
          return
        }
        case 'create-sprint': {
          if (pathname !== '/dashboard/sprints') router.push('/dashboard/sprints')
          setTimeout(() => request('sprint'), 50)
          return
        }
        case 'check-in': {
          router.push('/dashboard/my-okrs')
          return
        }
      }
    }
    window.addEventListener('cmdk:action', handler as EventListener)
    return () => window.removeEventListener('cmdk:action', handler as EventListener)
  }, [router, pathname, request])

  return null
}
