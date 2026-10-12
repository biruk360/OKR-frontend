'use client'

/**
 * Dependency Map table (DEP-6). One row per dependency, already sorted by the
 * API (late → due soon → open → done). Summary rows (§8 titles + status) show
 * dashes for parties and links. Clicking a row opens the quick view.
 */
import { format } from 'date-fns'
import { Lock } from 'lucide-react'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { UserAvatarStack } from '@/components/shared/UserAvatar'
import { DependencyStatusBadge, type DependencyPerson, type DependencyRow } from '@/features/dependencies'
import { cn } from '@/lib/utils'
import { DEPENDENCY_TYPE_LABELS } from '@/types/package'

export interface DependencyMapTableProps {
  rows: DependencyRow[]
  focusId: string | null
  onOpen: (id: string) => void
}

function formatDay(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : format(date, 'd MMM yyyy')
}

function People({ people, label }: { people: DependencyPerson[]; label: string }) {
  if (people.length === 0) return <span className="text-[var(--ap-fg-faint)]">—</span>
  return (
    <UserAvatarStack
      users={people.map((p) => ({ id: p.id, name: p.name ?? 'Unknown', avatar: p.avatar }))}
      size={22}
      max={3}
      showNames={people.length === 1}
      detail={() => label}
    />
  )
}

const TH = 'px-3 py-2 text-left text-micro font-semibold uppercase tracking-wide text-[var(--ap-fg-subtle)]'

export function DependencyMapTable({ rows, focusId, onOpen }: DependencyMapTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse text-body-sm">
        <thead className="border-b border-[var(--ap-border)] bg-[var(--ap-bg-sunken)]">
          <tr>
            <th scope="col" className={cn(TH, 'w-[90px]')}>Ref</th>
            <th scope="col" className={TH}>Dependency</th>
            <th scope="col" className={cn(TH, 'w-[110px]')}>Type</th>
            <th scope="col" className={cn(TH, 'w-[150px]')}>Provider</th>
            <th scope="col" className={cn(TH, 'w-[150px]')}>Needer</th>
            <th scope="col" className={cn(TH, 'w-[120px]')}>Needed by</th>
            <th scope="col" className={cn(TH, 'w-[150px]')}>Status</th>
            <th scope="col" className={cn(TH, 'w-[90px]')}>Linked</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ap-border)]">
          {rows.map((row) => {
            const neededBy = formatDay(row.neededByDate)
            const focused = row.id === focusId
            return (
              <tr
                key={row.id}
                aria-selected={focused}
                className={cn(
                  'cursor-pointer align-top transition-colors hover:bg-[var(--ap-bg-hover)]',
                  focused && 'bg-[var(--ap-accent-soft)]',
                  !row.open && 'opacity-75',
                )}
                onClick={() => onOpen(row.id)}
              >
                <td className={cn('px-3 py-2.5', row.late && 'border-l-2 border-l-[var(--ap-danger-fg)]')}>
                  {row.ref ? <MiniBadge mono>{row.ref}</MiniBadge> : <span className="text-[var(--ap-fg-faint)]">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    className="text-left font-medium text-[var(--ap-fg)] hover:underline ap-focus-ring"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen(row.id)
                    }}
                  >
                    {row.title}
                  </button>
                  {row.detail && row.unblocksText && (
                    <p className="mt-0.5 line-clamp-1 text-caption text-[var(--ap-fg-subtle)]">Unblocks: {row.unblocksText}</p>
                  )}
                  {row.timeframe && <p className="mt-0.5 text-micro text-[var(--ap-fg-faint)]">{row.timeframe.name}</p>}
                </td>
                <td className="px-3 py-2.5 text-caption text-[var(--ap-fg-subtle)]">{DEPENDENCY_TYPE_LABELS[row.depType]}</td>
                <td className="px-3 py-2.5">
                  {row.detail ? (
                    <People people={row.providers} label="Provider" />
                  ) : (
                    <Lock className="size-3.5 text-[var(--ap-fg-faint)]" aria-label="Not visible to you" />
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {row.detail ? (
                    <People people={row.needers} label="Needer" />
                  ) : (
                    <Lock className="size-3.5 text-[var(--ap-fg-faint)]" aria-label="Not visible to you" />
                  )}
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-caption tabular-nums',
                    row.late ? 'font-medium text-[var(--ap-danger-fg)]' : row.dueSoon ? 'text-[var(--ap-warn-fg)]' : 'text-[var(--ap-fg-subtle)]',
                  )}
                >
                  {neededBy ?? '—'}
                </td>
                <td className="px-3 py-2.5">
                  <DependencyStatusBadge status={row.status} late={row.late} dueSoon={row.dueSoon} />
                </td>
                <td className="px-3 py-2.5 text-caption text-[var(--ap-fg-subtle)]">
                  {row.detail ? (row.links.length > 0 ? `${row.links.length} item${row.links.length === 1 ? '' : 's'}` : '—') : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
