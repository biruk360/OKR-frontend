'use client'

/**
 * Account actions for /dashboard/settings/account — moved out of the page so
 * it only composes UI. Same endpoints (POST /api/auth/change-password,
 * GET /api/me/export), same toasts, same error messages.
 */

import { useState } from 'react'
import { toast } from 'react-hot-toast'

export type ChangePasswordResult = { ok: true } | { ok: false; error: string }

export function useAccountActions() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  /** Resolves with the error to show on the current-password field, or ok. */
  const changePassword = async (values: {
    currentPassword: string
    newPassword: string
  }): Promise<ChangePasswordResult> => {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        return { ok: false, error: data?.error || 'Could not change password' }
      }
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not reach the server' }
    } finally {
      setIsSubmitting(false)
    }
  }

  const exportData = async () => {
    setIsExporting(true)
    try {
      const res = await fetch('/api/me/export')
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      // Read the server-chosen filename rather than duplicating the naming rule.
      const disposition = res.headers.get('content-disposition') || ''
      const match = /filename="([^"]+)"/.exec(disposition)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = match?.[1] || 'okr-export.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    } catch {
      toast.error('Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return { isSubmitting, isExporting, changePassword, exportData }
}
