'use client'

/**
 * Data hooks for the two notification settings pages — moved out of
 * app/dashboard/settings/{notifications,notification-defaults}/page.tsx so the
 * pages only compose UI. Same endpoints, same toasts, same save payloads.
 */

import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
// Client-safe modules — NOT the '@/lib/notifications' barrel (it pulls in Prisma).
import type { EventCategory } from '@/lib/notifications/events'
import type { EmailCadence } from '@/lib/notifications/cadence'

// ─── /dashboard/settings/notifications (the user's own preferences) ───

export interface NotificationPrefRow {
  category: EventCategory
  mandatory: boolean
  inApp: boolean
  email: boolean
  emailCadence: EmailCadence
  source: 'user' | 'org' | 'hardcoded'
}

export function useNotificationPreferences() {
  const [rows, setRows] = useState<NotificationPrefRow[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then((r) => r.json())
      .then((res) => { if (res.success) setRows(res.data) })
      .catch(() => toast.error('Failed to load preferences'))
      .finally(() => setLoading(false))
  }, [])

  function update(cat: EventCategory, patch: Partial<NotificationPrefRow>) {
    setRows((prev) => prev.map((r) => r.category === cat ? { ...r, ...patch, source: 'user' } : r))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: rows.filter((r) => !r.mandatory).map((r) => ({
            category: r.category, inApp: r.inApp, email: r.email, emailCadence: r.emailCadence,
          })),
        }),
      })
      const json = await res.json()
      if (json.success) toast.success('Preferences saved')
      else toast.error(json.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return { rows, loading, saving, update, save }
}

// ─── /dashboard/settings/notification-defaults (org defaults, admins only) ───

export interface NotificationDefaultRow {
  category: EventCategory
  mandatory?: boolean
  inApp: boolean
  email: boolean
  emailCadence: EmailCadence
}

export function useNotificationDefaults() {
  const [rows, setRows] = useState<NotificationDefaultRow[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/settings/notification-defaults')
      .then((r) => r.json())
      .then((res) => { if (res.success) setRows(res.data) })
      .catch(() => toast.error('Failed to load defaults — admins only'))
      .finally(() => setLoading(false))
  }, [])

  function update(cat: EventCategory, patch: Partial<NotificationDefaultRow>) {
    setRows((prev) => prev.map((r) => r.category === cat ? { ...r, ...patch } : r))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/notification-defaults', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaults: rows }),
      })
      const json = await res.json()
      if (json.success) toast.success('Defaults saved')
      else toast.error(json.error || 'Save failed')
    } finally { setSaving(false) }
  }

  return { rows, loading, saving, update, save }
}
