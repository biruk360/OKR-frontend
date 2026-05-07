'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCreateOrOpenPlan, usePlans } from '../hooks/queries'
import { StatusBadge } from './StatusBadge'
import { useRouter } from 'next/navigation'
import { formatEthiopian } from '@/lib/dtp/ec-calendar'

/**
 * Index page for an employee — shows their recent plans and a CTA to create
 * (or open) a plan for tomorrow. Mirrors spec §9.1 A.
 */
export function TravelHome() {
  const router = useRouter()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const tomorrow = useMemo(() => {
    const d = new Date(); d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  }, [])
  const [date, setDate] = useState(tomorrow)
  const create = useCreateOrOpenPlan()
  const myPlans = usePlans({})

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" /> Plan a trip day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Trip date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            </div>
            <Button
              onClick={async () => {
                const plan = await create.mutateAsync({ tripDate: date })
                router.push(`/dashboard/travel/plans/${plan.id}`)
              }}
              disabled={create.isPending}
            >
              <Plus className="mr-2 h-4 w-4" /> Open / create plan
            </Button>
            <span className="text-xs text-muted-foreground">
              {date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : formatEthiopian(new Date(`${date}T00:00:00Z`))}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Your recent plans</CardTitle></CardHeader>
        <CardContent>
          {myPlans.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (myPlans.data ?? []).length === 0 ? (
            <EmptyState title="No plans yet" description="Create your first trip plan above." />
          ) : (
            <ul className="divide-y divide-border">
              {(myPlans.data ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link href={`/dashboard/travel/plans/${p.id}`} className="text-sm font-medium hover:underline">
                      {p.tripDate.slice(0, 10)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{formatEthiopian(new Date(p.tripDate))} · {p.priority}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
