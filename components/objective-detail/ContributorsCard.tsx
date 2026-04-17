'use client'

import { UserPlus } from 'lucide-react'

interface Contributor {
  id: string
  name: string
  avatar: string | null
  source?: string
}

interface Props {
  owner: { id: string; name: string; avatar?: string | null }
  collaborators: Contributor[]
  unassignedKrCount: number
}

export default function ContributorsCard({ owner, collaborators, unassignedKrCount }: Props) {
  const all = [
    { id: owner.id, name: owner.name, avatar: owner.avatar ?? null, isOwner: true },
    ...collaborators.map(c => ({ ...c, isOwner: false })),
  ]

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Contributors</h3>
        <span className="text-xs text-muted-foreground">{all.length}</span>
      </header>

      <div className="px-4 py-3">
        {/* Avatar stack */}
        <div className="flex -space-x-2">
          {all.slice(0, 8).map((person) => {
            const initials = person.name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
            return person.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={person.id}
                src={person.avatar}
                alt={person.name}
                title={person.name}
                className="size-7 rounded-full border-2 border-card object-cover"
              />
            ) : (
              <span
                key={person.id}
                title={person.name}
                className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary/10 text-[10px] font-semibold text-primary-600"
              >
                {initials}
              </span>
            )
          })}
          {all.length > 8 && (
            <span className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-medium text-muted-foreground">
              +{all.length - 8}
            </span>
          )}
        </div>

        {/* Names list */}
        <div className="mt-3 space-y-1.5">
          {all.map((person) => (
            <div key={person.id} className="flex items-center gap-2 text-sm">
              <span className="truncate">{person.name}</span>
              {person.isOwner && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded px-1">Owner</span>
              )}
            </div>
          ))}
        </div>

        {unassignedKrCount > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
            <UserPlus className="size-3.5" />
            {unassignedKrCount} KR{unassignedKrCount > 1 ? 's' : ''} need an owner
          </div>
        )}
      </div>
    </section>
  )
}
