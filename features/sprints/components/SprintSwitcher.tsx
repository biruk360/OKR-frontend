'use client'

/**
 * SprintSwitcher — modal listing sprints the user can switch to.
 * Reuses the standard Modal primitive and /api/sprints (active by default).
 */

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Columns } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'

interface SprintListItem {
  id: string
  name: string
  state: string
  status: string
  startDate: string | null
  endDate: string | null
  background?: string | null
  owner: { id: string; name: string; avatar: string | null }
}

interface Props {
  open: boolean
  onClose: () => void
  currentSprintId: string
}

export default function SprintSwitcher({ open, onClose, currentSprintId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['sprint-switcher'],
    queryFn: async (): Promise<SprintListItem[]> => {
      const res = await fetch('/api/sprints')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      return json.data ?? []
    },
    enabled: open,
    staleTime: 30_000,
  })

  return (
    <Modal open={open} onClose={onClose} title="Switch boards" size="md">
      <div className="space-y-2">
        {isLoading && (
          <div className="space-y-2" aria-busy="true">
            <span className="sr-only">Loading sprints…</span>
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[62px] w-full rounded-[var(--ap-radius-sm)]" />)}
          </div>
        )}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <EmptyState bare className="py-6" icon={Columns} title="No active sprints" description="Start a sprint to switch between boards here." />
        )}
        {data?.map((s) => {
          const isCurrent = s.id === currentSprintId
          return (
            <Link
              key={s.id}
              href={`/dashboard/sprints/${s.id}`}
              onClick={onClose}
              className="flex items-center gap-3 rounded-[var(--ap-radius-sm)] border bg-card p-3 transition hover:bg-muted"
              style={{ borderColor: 'var(--ap-border)' }}
              aria-current={isCurrent}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]"
                style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}
              >
                <Columns className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-semibold">{s.name}</p>
                <p className="truncate text-caption text-muted-foreground">
                  {s.state} · {s.startDate ? new Date(s.startDate).toLocaleDateString() : '—'}
                  {s.endDate ? ` → ${new Date(s.endDate).toLocaleDateString()}` : ''}
                </p>
              </div>
              {isCurrent && (
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-micro font-semibold text-primary-700">
                  Current
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </Modal>
  )
}
