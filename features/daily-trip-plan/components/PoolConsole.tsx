'use client'

import { useMemo, useState, useId } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
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
  const uid = useId()
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
            <Label htmlFor={`${uid}-date`} className="text-xs text-muted-foreground">Date</Label>
            <Input id={`${uid}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
            <Button variant="ghost" size="sm" onClick={() => plans.refetch()}>Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          {plans.isLoading ? <div className="space-y-2" aria-busy="true" aria-label="Loading">{Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}</div> :
           (plans.data?.length ?? 0) === 0 ? <EmptyState title="Nothing to assign" description="No plans waiting for assignment on this date." /> : (
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
        <FilterSelect
          label="Driver"
          placeholder="Pick driver…"
          value={driverId || undefined}
          onValueChange={(next) => {
            setDriverId(next ?? '')
            const d = drivers.find((x) => x.id === next)
            if (d?.defaultVehicle) setVehicleId(d.defaultVehicle.id)
          }}
          options={drivers.map((d) => ({ value: d.id, label: d.fullName }))}
        />
        <FilterSelect
          label="Vehicle"
          placeholder="Pick vehicle…"
          value={vehicleId || undefined}
          onValueChange={(next) => setVehicleId(next ?? '')}
          options={vehicles.map((v) => ({ value: v.id, label: `${v.plate} (${v.capacity})` }))}
        />
        <Button size="sm" onClick={() => driverId && onAssign(driverId, vehicleId || undefined)} disabled={!driverId || busy}>
          Assign
        </Button>
      </div>
    </li>
  )
}
