'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAssignDriver, useDrivers, usePlans, useVehicles } from '../hooks/queries'
import { StatusBadge } from './StatusBadge'

/**
 * Pool Coordinator console (FR-09 / 9.3 E). Lists every Approved or Driver-
 * assigned plan for a date and lets the coordinator pick a driver + vehicle.
 *
 * Drag-and-drop is the spec's nice-to-have; this Phase-1 version uses an
 * inline select + Assign button (functionally identical, much less code).
 */
export function PoolConsole() {
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const plans = usePlans({ status: 'APPROVED,DRIVER_ASSIGNED', date })
  const drivers = useDrivers()
  const vehicles = useVehicles()
  const assign = useAssignDriver()

  const driverOptions = useMemo(() => drivers.data ?? [], [drivers.data])
  const vehicleOptions = useMemo(() => vehicles.data ?? [], [vehicles.data])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Pool assignments</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
            <Button variant="ghost" size="sm" onClick={() => plans.refetch()}>Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          {plans.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
           (plans.data?.length ?? 0) === 0 ? <div className="text-sm text-muted-foreground">No plans waiting for assignment on this date.</div> : (
            <ul className="divide-y divide-border">
              {plans.data!.map((p) => (
                <PlanAssignRow
                  key={p.id}
                  planId={p.id}
                  status={p.status}
                  drivers={driverOptions}
                  vehicles={vehicleOptions}
                  onAssign={(driverId, vehicleId) => assign.mutate({ planId: p.id, driverId, vehicleId })}
                  busy={assign.isPending}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface RowProps {
  planId: string
  status: string
  drivers: { id: string; fullName: string; defaultVehicle?: { id: string; plate: string } | null }[]
  vehicles: { id: string; plate: string; capacity: number }[]
  onAssign: (driverId: string, vehicleId: string | undefined) => void
  busy?: boolean
}

function PlanAssignRow({ planId, status, drivers, vehicles, onAssign, busy }: RowProps) {
  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Link href={`/dashboard/travel/plans/${planId}`} className="text-sm font-medium hover:underline">
        {planId.slice(0, 8)}
      </Link>
      <StatusBadge status={status} />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={driverId} onChange={(e) => {
          setDriverId(e.target.value)
          const d = drivers.find((x) => x.id === e.target.value)
          if (d?.defaultVehicle) setVehicleId(d.defaultVehicle.id)
        }}>
          <option value="">Pick driver…</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">Pick vehicle…</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} ({v.capacity})</option>)}
        </select>
        <Button size="sm" onClick={() => driverId && onAssign(driverId, vehicleId || undefined)} disabled={!driverId || busy}>
          Assign
        </Button>
      </div>
    </li>
  )
}
