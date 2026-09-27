'use client'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/Skeleton'
import { SettingsSelect } from '@/components/settings/SettingsSelect'
import { useNotificationDefaults } from '@/hooks/useNotificationSettings'
// Client-safe modules — NOT the '@/lib/notifications' barrel (it pulls in Prisma).
import { CATEGORY_LABEL } from '@/lib/notifications/events'
import { CADENCE_LABEL, SELECTABLE_CADENCES, type EmailCadence } from '@/lib/notifications/cadence'

export default function NotificationDefaultsPage() {
  const { rows, loading, saving, update, save } = useNotificationDefaults()

  return (
    <div className="bg-card shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium text-foreground">Organization notification defaults</h3>
        <p className="text-sm text-muted-foreground mt-1">
          These defaults apply to every user who hasn&apos;t customized their own preferences (Admins only).
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
              {loading && rows.length === 0 && Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} aria-hidden="true"><td colSpan={4} className="py-2"><Skeleton className="h-6 w-full" /></td></tr>
              ))}
              {rows.map((r) => (
                <tr key={r.category}>
                  <td className="py-2 pr-4 font-medium text-foreground">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                  <td className="py-2 pr-4">
                    <input type="checkbox" aria-label={`In-app: ${CATEGORY_LABEL[r.category] ?? r.category}`} disabled={r.mandatory} checked={r.inApp} onChange={(e) => update(r.category, { inApp: e.target.checked })} />
                  </td>
                  <td className="py-2 pr-4">
                    <input type="checkbox" aria-label={`Email: ${CATEGORY_LABEL[r.category] ?? r.category}`} disabled={r.mandatory} checked={r.email} onChange={(e) => update(r.category, { email: e.target.checked })} />
                  </td>
                  <td className="py-2 pr-4">
                    <SettingsSelect
                      size="sm"
                      aria-label={`Email cadence for ${CATEGORY_LABEL[r.category] ?? r.category}`}
                      className="w-auto min-w-32"
                      value={r.emailCadence}
                      disabled={r.mandatory || !r.email}
                      onValueChange={(v) => update(r.category, { emailCadence: v as EmailCadence })}
                      options={SELECTABLE_CADENCES.map((c) => ({ value: c, label: CADENCE_LABEL[c] }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save defaults'}
          </Button>
        </div>
      </div>
    </div>
  )
}
