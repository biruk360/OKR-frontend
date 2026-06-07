'use client'

import { useEffect, useRef, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import toast from 'react-hot-toast'

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'] as const

interface UseIdleTimeoutOptions {
  timeoutMs?: number
  warningMs?: number
}

/**
 * Monitors user activity and signs out after `timeoutMs` of inactivity.
 * Shows a warning toast `warningMs` before the deadline with a "Stay signed in" button.
 */
export function useIdleTimeout({
  timeoutMs = 4 * 60 * 60 * 1000,   // 4 hours
  warningMs = 5 * 60 * 1000,         // 5-minute warning
}: UseIdleTimeoutOptions = {}) {
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningToastId = useRef<string | null>(null)

  const clearTimers = useCallback(() => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current)
    if (warningTimer.current) clearTimeout(warningTimer.current)
  }, [])

  const dismissWarning = useCallback(() => {
    if (warningToastId.current) {
      toast.dismiss(warningToastId.current)
      warningToastId.current = null
    }
  }, [])

  const scheduleLogout = useCallback(() => {
    clearTimers()
    dismissWarning()

    warningTimer.current = setTimeout(() => {
      const id = toast(
        (t) => (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            You&apos;ve been inactive. You will be signed out in 5 minutes.
            <button
              onClick={() => {
                toast.dismiss(t.id)
                warningToastId.current = null
                scheduleLogout()
              }}
              style={{
                marginLeft: 8,
                padding: '2px 10px',
                borderRadius: 6,
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Stay signed in
            </button>
          </span>
        ),
        { duration: warningMs, position: 'top-center' }
      )
      warningToastId.current = id
    }, timeoutMs - warningMs)

    logoutTimer.current = setTimeout(() => {
      signOut({ callbackUrl: '/auth/signin' })
    }, timeoutMs)
  }, [timeoutMs, warningMs, clearTimers, dismissWarning])

  const handleActivity = useCallback(() => {
    // Only reschedule if the warning hasn't appeared yet
    if (!warningToastId.current) {
      scheduleLogout()
    }
  }, [scheduleLogout])

  useEffect(() => {
    scheduleLogout()

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    return () => {
      clearTimers()
      dismissWarning()
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity)
      })
    }
  }, [scheduleLogout, handleActivity, clearTimers, dismissWarning])
}
