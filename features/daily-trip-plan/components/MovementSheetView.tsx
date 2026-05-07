'use client'

import { Printer, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMovementSheet } from '../hooks/queries'
import { formatEthiopian } from '@/lib/dtp/ec-calendar'
import { StatusBadge } from './StatusBadge'

interface Props {
  deptId: string
  date: string // YYYY-MM-DD
}

/**
 * Daily Movement Sheet — office view (FR-12, AC-15). Prints via the browser's
 * native print dialog against a print-styled stylesheet (`media print`); a
 * server-rendered PDF can be added later by piping this same component through
 * puppeteer. The required columns + map snapshot + signature block are all
 * here.
 */
export function MovementSheetView({ deptId, date }: Props) {
  const q = useMovementSheet(deptId, date)
  const sheet = q.data
  const dateObj = new Date(`${date}T00:00:00Z`)

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  if (q.isError || !sheet) return <div className="p-6 text-sm text-danger-700">Failed to load movement sheet.</div>

  return (
    <div className="space-y-4 print:space-y-2">
      <header className="flex items-start justify-between gap-3 print:flex-col print:gap-0">
        <div>
          <h1 className="text-2xl font-semibold">Daily Movement Sheet</h1>
          <p className="text-sm text-muted-foreground">
            {sheet.departmentName ?? 'All departments'} · {date} · {formatEthiopian(dateObj)}
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
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Destination</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Dwell</th>
              <th className="px-3 py-2">Round/One-way</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Flex</th>
              <th className="px-3 py-2">Joiners</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2 print:hidden">Status</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 && (
              <tr><td colSpan={13} className="px-3 py-6 text-center text-muted-foreground">No approved or submitted plans for this date.</td></tr>
            )}
            {sheet.rows.map((r, i) => (
              <tr key={r.stopId} className="border-t border-border align-top">
                <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2">{r.employeeName}</td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.plannedStart} – {r.plannedEnd}</td>
                <td className="px-3 py-2">
                  <div className="font-medium flex items-center gap-1">
                    {r.destinationName}
                    {r.trafficFlagged && <AlertTriangle className="h-3.5 w-3.5 text-warning-600" aria-label="Heavy traffic likely" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.destinationAddress}</div>
                </td>
                <td className="px-3 py-2 text-xs">{r.purposeCode}</td>
                <td className="px-3 py-2 tabular-nums">{r.dwellMinutes >= 60 ? `${Math.floor(r.dwellMinutes / 60)}h ${r.dwellMinutes % 60 ? `${r.dwellMinutes % 60}m` : ''}` : `${r.dwellMinutes}m`}</td>
                <td className="px-3 py-2">{r.tripMode === 'ROUND_TRIP' ? 'Round' : 'One-way'}</td>
                <td className="px-3 py-2">{r.reason}</td>
                <td className="px-3 py-2 text-xs">{r.flexibility}</td>
                <td className="px-3 py-2 text-xs">{r.joiners.map((j) => j.name).join(', ')}</td>
                <td className="px-3 py-2 text-xs">{r.modeOfMovement}</td>
                <td className="px-3 py-2 text-xs"></td>
                <td className="px-3 py-2 print:hidden"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Map placeholder — wired to a real Google Maps render in a follow-up. */}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 h-64 flex items-center justify-center text-sm text-muted-foreground print:h-40">
        Map snapshot (TODO: render Google Static Maps with one numbered pin per row)
      </div>

      <footer className="flex flex-col gap-6 sm:flex-row sm:gap-12 pt-6 print:pt-2">
        <SignatureBlock label="Travel Coordinator" />
        <SignatureBlock label="Operations Manager" />
      </footer>
    </div>
  )
}

function SignatureBlock({ label }: { label: string }) {
  return (
    <div>
      <div className="border-b border-border w-64 h-8" />
      <div className="text-xs text-muted-foreground mt-1">{label} — signature & date</div>
    </div>
  )
}
