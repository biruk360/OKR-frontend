'use client'

import { Printer, Navigation, CheckCircle2, AlertCircle, Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useRunSheet, useSetLegStatus } from '../hooks/queries'
import { formatEthiopian } from '@/lib/dtp/ec-calendar'

interface Props {
  driverId: string
  date: string // YYYY-MM-DD
  /** When true, show driver-side action buttons (Confirm pickup/drop-off). */
  driverMode?: boolean
}

const LEG_TYPE_STYLES: Record<string, string> = {
  DROPOFF: 'bg-primary-50 text-primary-700 border border-primary-200',
  RETURN_PICKUP: 'bg-[color:var(--ap-ahead-bg)] text-[color:var(--ap-ahead-fg)] border border-[color:var(--ap-ahead-bg)]',
}

export function RunSheetView({ driverId, date, driverMode }: Props) {
  const q = useRunSheet(driverId, date)
  const setStatus = useSetLegStatus()
  const sheet = q.data
  const dateObj = new Date(`${date}T00:00:00Z`)

  if (q.isLoading) return <SheetSkeleton />
  if (q.isError) return <div className="p-6 text-sm text-danger-700">Failed to load run sheet.</div>
  if (!sheet) {
    return (
      <EmptyState
        icon={Route}
        title="No run sheet"
        description="No run sheet found for this driver and date."
      />
    )
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <PageHeader
        className="mb-0"
        title="Daily Run Sheet"
        description={`${sheet.driverName} · ${sheet.vehiclePlate ?? "— no vehicle —"} · ${date} · ${formatEthiopian(dateObj)}`}
        actions={
          <Button onClick={() => window.print()} className="print:hidden">
            <Printer className="mr-2 h-4 w-4" /> Print / PDF
          </Button>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-card print:border-0">
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
                  <span className={'inline-flex items-center rounded-pill px-2 py-0.5 text-caption font-medium ' + (LEG_TYPE_STYLES[l.legType] ?? 'bg-muted text-muted-foreground border border-border')}>
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
                    <span className="inline-flex items-center gap-1 text-success-700"><CheckCircle2 className="h-3.5 w-3.5" /> Done</span>
                  ) : l.status === 'EN_ROUTE' ? (
                    <span className="inline-flex items-center gap-1 text-primary-700"><Navigation className="h-3.5 w-3.5" /> En route</span>
                  ) : l.status === 'SKIPPED' ? (
                    <span className="inline-flex items-center gap-1 text-warning-700"><AlertCircle className="h-3.5 w-3.5" /> Skipped</span>
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

      {/* Map placeholder. `print:hidden` on purpose: an empty dashed box is noise
          on the sheet handed to a driver, and the raw "TODO:" string this used to
          render was going out on that printout. Drops out entirely until a Static
          Maps key exists and a real polyline can be drawn here. */}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 h-64 flex items-center justify-center text-sm text-muted-foreground print:hidden">
        Route map not available yet
      </div>
    </div>
  )
}

function SheetSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading sheet">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
