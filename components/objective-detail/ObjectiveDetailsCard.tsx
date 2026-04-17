'use client'

import { User, Users, Calendar, Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface Contributor {
  id: string
  name: string
  avatar: string | null
  email?: string | null
}

interface Props {
  owner: { id: string; name: string; avatar?: string | null; email?: string | null }
  contributors: Contributor[]
  timeframe: { name: string; type: string }
  department?: { name: string } | null
  collaborators: Contributor[]
  unassignedKrCount: number
}

export default function ObjectiveDetailsCard({ owner, contributors, timeframe, department, collaborators, unassignedKrCount }: Props) {
  const initials = (name: string) =>
    name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  const timeframeTypeLabel = (type: string) => {
    switch (type) {
      case 'QUARTERLY': return 'Quarterly'
      case 'SIX_MONTH': return 'Bi-annual'
      case 'YEARLY': return 'Yearly'
      case 'MONTHLY': return 'Monthly'
      default: return type
    }
  }

  return (
    <div className="space-y-4">
      {/* Objective Details */}
      <section className="rounded-xl border border-border bg-card">
        <header className="px-4 py-3 border-b border-border">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Objective Details</h3>
        </header>
        <div className="px-4 py-4 space-y-5">
          {/* Owner */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
              <User className="size-3" /> Owner
            </p>
            <div className="flex items-center gap-3">
              {owner.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={owner.avatar} alt={owner.name} className="size-9 rounded-full object-cover" />
              ) : (
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary-600">
                  {initials(owner.name)}
                </span>
              )}
              <div>
                <p className="text-sm font-medium">{owner.name}</p>
                {owner.email && <p className="text-xs text-muted-foreground">{owner.email}</p>}
              </div>
            </div>
          </div>

          <Separator />

          {/* Contributors */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
              <Users className="size-3" /> Contributors
            </p>
            {contributors.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">None — add via Edit Objective</p>
            ) : (
              <div className="space-y-2">
                {contributors.map(c => (
                  <div key={c.id} className="flex items-center gap-2">
                    {c.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatar} alt={c.name} className="size-6 rounded-full object-cover" />
                    ) : (
                      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">{initials(c.name)}</span>
                    )}
                    <span className="text-sm">{c.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Timeframe */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
              <Calendar className="size-3" /> Timeframe
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{timeframe.name}</span>
              <Badge variant="secondary" className="text-[10px]">{timeframeTypeLabel(timeframe.type)}</Badge>
            </div>
          </div>

          {/* Department */}
          {department && (
            <>
              <Separator />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
                  <Building2 className="size-3" /> Department
                </p>
                <span className="text-sm">{department.name}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Collaborators */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Users className="size-3" /> Collaborators
          </h3>
          <span className="text-xs text-muted-foreground">{collaborators.length + 1} total</span>
        </header>
        <div className="px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {/* Owner always first */}
            {owner.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={owner.avatar} alt={owner.name} title={owner.name} className="size-9 rounded-full object-cover border-2 border-card" />
            ) : (
              <span title={owner.name} className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary-600 border-2 border-card">
                {initials(owner.name)}
              </span>
            )}
            {collaborators.map(c => (
              c.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={c.id} src={c.avatar} alt={c.name} title={c.name} className="size-9 rounded-full object-cover border-2 border-card" />
              ) : (
                <span key={c.id} title={c.name} className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-semibold border-2 border-card">
                  {initials(c.name)}
                </span>
              )
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Union of Contributors and Key Result owners.</p>
          {unassignedKrCount > 0 && (
            <p className="text-xs text-red-600 mt-1">{unassignedKrCount} KR{unassignedKrCount > 1 ? 's' : ''} still need an owner.</p>
          )}
        </div>
      </section>
    </div>
  )
}
