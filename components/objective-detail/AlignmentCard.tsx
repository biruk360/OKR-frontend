'use client'

import Link from 'next/link'
import { ArrowUpRight, Target } from 'lucide-react'
import { fromDbStatus, statusDotColor } from '@/lib/okr/status'
import { cn } from '@/lib/utils'

interface AlignedObjective {
  id: string
  title: string
  level: string
  goalStatus?: string
  progress?: number
}

interface Props {
  parentObjective: AlignedObjective | null
  childObjectives: AlignedObjective[]
}

export default function AlignmentCard({ parentObjective, childObjectives }: Props) {
  if (!parentObjective && childObjectives.length === 0) return null

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Alignment</h3>
      </header>
      <div className="divide-y divide-border">
        {parentObjective && (
          <Link
            href={`/dashboard/objectives/${parentObjective.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
          >
            <ArrowUpRight className="size-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Parent</p>
              <p className="text-sm font-medium truncate">{parentObjective.title}</p>
            </div>
            {parentObjective.progress !== undefined && (
              <span className="text-xs text-muted-foreground tabular-nums">{Math.round(parentObjective.progress)}%</span>
            )}
          </Link>
        )}
        {childObjectives.map((child) => {
          const status = fromDbStatus(child.goalStatus)
          return (
            <Link
              key={child.id}
              href={`/dashboard/objectives/${child.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors"
            >
              <span className={cn('size-2 rounded-full shrink-0', statusDotColor(status))} />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{child.title}</p>
              </div>
              {child.progress !== undefined && (
                <span className="text-xs text-muted-foreground tabular-nums">{Math.round(child.progress)}%</span>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
