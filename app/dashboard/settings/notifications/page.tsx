'use client'

import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

type Category = 'ACCOUNT' | 'OBJECTIVE' | 'KEY_RESULT' | 'CHECK_IN' | 'TODO' | 'TIMEFRAME' | 'ALIGNMENT' | 'COMMENT' | 'ADMIN'
type Cadence = 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'DISABLED'

interface PrefRow {
  category: Category
  mandatory: boolean
  inApp: boolean
  email: boolean
  emailCadence: Cadence
  source: 'user' | 'org' | 'hardcoded'
}

const CATEGORY_LABEL: Record<Category, string> = {
  ACCOUNT: 'Account & security',
  OBJECTIVE: 'Objectives',
  KEY_RESULT: 'Key results',
  CHECK_IN: 'Check-ins',
  TODO: 'To-dos / initiatives',
  TIMEFRAME: 'Timeframes',
  ALIGNMENT: 'Alignment',
  COMMENT: 'Comments & mentions',
  ADMIN: 'Admin & system',
}

export default function NotificationsSettingsPage() {
  const [rows, setRows] = useState<PrefRow[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then((r) => r.json())
      .then((res) => { if (res.success) setRows(res.data) })
      .catch(() => toast.error('Failed to load preferences'))
  }, [])

  function update(cat: Category, patch: Partial<PrefRow>) {
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

  return (
    <div className="space-y-4">
      <div className="bg-card shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-foreground">Notification preferences</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Control which events reach you in-app and by email. Account &amp; security emails are always delivered.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">In-app</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Email cadence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.category}>
                    <td className="py-2 pr-4">
                      <div className="font-medium text-foreground">{CATEGORY_LABEL[r.category]}</div>
                      {r.mandatory && <div className="text-xs text-muted-foreground">Always on</div>}
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="checkbox"
                        disabled={r.mandatory}
                        checked={r.inApp}
                        onChange={(e) => update(r.category, { inApp: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="checkbox"
                        disabled={r.mandatory}
                        checked={r.email}
                        onChange={(e) => update(r.category, { email: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        disabled={r.mandatory || !r.email}
                        className="border rounded px-2 py-1 text-sm"
                        value={r.emailCadence}
                        onChange={(e) => update(r.category, { emailCadence: e.target.value as Cadence })}
                      >
                        <option value="IMMEDIATE">Immediate</option>
                        <option value="DAILY">Daily digest</option>
                        <option value="WEEKLY">Weekly digest</option>
                        <option value="DISABLED">Disabled</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              className="rounded bg-blue-600 text-white px-4 py-2 text-sm disabled:opacity-50"
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save preferences'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
