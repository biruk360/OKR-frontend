'use client'

import { Printer, Navigation, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRunSheet, useSetLegStatus } from '../hooks/queries'
import { formatEthiopian } from '@/lib/dtp/ec-calendar'

interface Props {
  driverId: string
  date: string // YYYY-MM-DD
  /** When true, show driver-side action buttons (Confirm pickup/drop-off). */
  driverMode?: boolean
}

const LEG_TYPE_STYLES: Record<string, string> = {
  DROPOFF: 'bg-blue-100 text-blue-800',
  RETURN_PICKUP: 'bg-purple-100 text-purple-800',
}

export function RunSheetView({ driverId, date, driverMode }: Props) {
  const q = useRunSheet(driverId, date)
  const setStatus = useSetLegStatus()
  const sheet = q.data
  const dateObj = new Date(`${date}T00:00:00Z`)

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  if (q.isError) return <div className="p-6 text-sm text-red-700">Failed to load run sheet.</div>
  if (!sheet) return <div className="p-6 text-sm text-muted-foreground">No run sheet found for this driver and date.</div>

  return (
    <div className="space-y-4 print:space-y-2">
      <header className="flex items-start justify-between gap-3 print:flex-col">
        <div>
          <h1 className="text-2xl font-semibold">Daily Run Sheet</h1>
          <p className="text-sm text-muted-foreground">
            {sheet.driverName} · {sheet.vehiclePlate ?? '— no vehicle —'} · {date} · {formatEthiopian(dateObj)}
          </p>
        </div>
        <Button onClick={() => window.print()} className="print:hidden">
          <Printer className="mr-2 h-4 w-4" /> Print / PDF
        </Button>
      </header>

      <div className="rounded-lg border border-border bg-card overflow-hidden print:border-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 w-10">#</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Leg</th>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">To</th>
              <th className="px-3 py-2">Passenger(s)</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Dwell</th>
              <th className="px-3 py-2">Status</th>
              {driverMode && <th className="px-3 py-2 print:hidden">Action</th>}
            </tr>
          </thead>
          <tbody>
            {sheet.legs.length === 0 && (
              <tr><td colSpan={driverMode ? 10 : 9} className="px-3 py-6 text-center text-muted-foreground">No legs assigned.</td></tr>
            )}
            {sheet.legs.map((l, i) => (
              <tr key={l.legId} className="border-t border-border align-top">
                <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">{l.scheduledTime}</td>
                <td className="px-3 py-2">
                  <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' + (LEG_TYPE_STYLES[l.legType] ?? 'bg-gray-100')}>
                    {l.legType === 'DROPOFF' ? 'Drop-off' : 'Return pickup'}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{l.fromLabel}</td>
                <td className="px-3 py-2 text-xs">{l.toLabel}</td>
                <td className="px-3 py-2 text-xs">{l.passengers.map((p) => p.name).join(', ')}</td>
                <td className="px-3 py-2 text-xs">{l.passengers.map((p) => p.phone).filter(Boolean).join(', ') || '—'}</td>
                <td className="px-3 py-2 tabular-nums">{l.dwellWindowMin ? `${Math.floor(l.dwellWindowMin / 60)}h ${l.dwellWindowMin % 60}m` : '—'}</td>
                <td className="px-3 py-2 text-xs">
                  {l.status === 'COMPLETED' ? (
                    <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Done</span>
                  ) : l.status === 'EN_ROUTE' ? (
                    <span className="inline-flex items-center gap-1 text-blue-700"><Navigation className="h-3.5 w-3.5" /> En route</span>
                  ) : l.status === 'SKIPPED' ? (
                    <span className="inline-flex items-center gap-1 text-amber-700"><AlertCircle className="h-3.5 w-3.5" /> Skipped</span>
                  ) : (
                    <span className="text-muted-foreground">Scheduled</span>
                  )}
                </td>
                {driverMode && (
                  <td className="px-3 py-2 print:hidden">
                    <div className="flex flex-wrap gap-1">
                      {l.status === 'SCHEDULED' && (
                        <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ legId: l.legId, body: { status: 'EN_ROUTE' } })}>
                          Start
                        </Button>
                      )}
                      {(l.status === 'SCHEDULED' || l.status === 'EN_ROUTE') && (
                        <Button size="sm" onClick={() => setStatus.mutate({ legId: l.legId, body: { status: 'COMPLETED' } })}>
                          Confirm {l.legType === 'DROPOFF' ? 'drop-off' : 'pickup'}
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Map placeholder */}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 h-64 flex items-center justify-center text-sm text-muted-foreground print:h-40">
        Route map (TODO: render Google Static Maps polyline through all leg waypoints)
      </div>
    </div>
  )
}
