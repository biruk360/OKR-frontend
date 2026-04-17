'use client'

import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

type Cadence = 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'DISABLED'
interface Row { category: string; inApp: boolean; email: boolean; emailCadence: Cadence }

const LABELS: Record<string, string> = {
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

export default function NotificationDefaultsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings/notification-defaults')
      .then((r) => r.json())
      .then((res) => { if (res.success) setRows(res.data) })
      .catch(() => toast.error('Failed to load defaults — admins only'))
  }, [])

  function update(cat: string, patch: Partial<Row>) {
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

  return (
    <div className="bg-card shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium text-foreground">Organization notification defaults</h3>
        <p className="text-sm text-muted-foreground mt-1">
          These defaults apply to every user who hasn't customized their own preferences (Admins only).
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
                  <td className="py-2 pr-4 font-medium text-foreground">{LABELS[r.category] ?? r.category}</td>
                  <td className="py-2 pr-4">
                    <input type="checkbox" checked={r.inApp} onChange={(e) => update(r.category, { inApp: e.target.checked })} />
                  </td>
                  <td className="py-2 pr-4">
                    <input type="checkbox" checked={r.email} onChange={(e) => update(r.category, { email: e.target.checked })} />
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={r.emailCadence}
                      disabled={!r.email}
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
          <button className="rounded bg-blue-600 text-white px-4 py-2 text-sm disabled:opacity-50" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save defaults'}
          </button>
        </div>
      </div>
    </div>
  )
}
