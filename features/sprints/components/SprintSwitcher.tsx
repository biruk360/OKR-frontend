'use client'

/**
 * SprintSwitcher — modal listing sprints the user can switch to.
 * Reuses the standard Modal primitive and /api/sprints (active by default).
 */

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Columns } from 'lucide-react'
import Modal from '@/components/ui/Modal'

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
          <p className="py-6 text-center text-[12px] text-muted-foreground">Loading…</p>
        )}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="py-6 text-center text-[12px] text-muted-foreground">No active sprints found.</p>
        )}
        {data?.map((s) => {
          const isCurrent = s.id === currentSprintId
          return (
            <Link
              key={s.id}
              href={`/dashboard/sprints/${s.id}`}
              onClick={onClose}
              className="flex items-center gap-3 rounded-[10px] border bg-card p-3 transition hover:bg-muted"
              style={{ borderColor: 'var(--ap-border)' }}
              aria-current={isCurrent}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-white"
                style={{ background: 'var(--ap-accent)' }}
              >
                <Columns className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{s.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {s.state} · {s.startDate ? new Date(s.startDate).toLocaleDateString() : '—'}
                  {s.endDate ? ` → ${new Date(s.endDate).toLocaleDateString()}` : ''}
                </p>
              </div>
              {isCurrent && (
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700">
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
